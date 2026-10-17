const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

/* Injected into every edge function by Supabase — nothing to set by hand. */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DECK_BUCKET = "pitch-decks";
const SIGNED_URL_DAYS = 7;
/* Gmail rejects anything over 25 MB and base64 inflates a file by ~33%, so
 * anything above this goes out as a link only. */
const ATTACH_LIMIT_BYTES = 10 * 1024 * 1024;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/* A link that works for seven days, created with the service role key so the
 * bucket itself can stay private. */
async function createDeckDownloadUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${DECK_BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: SIGNED_URL_DAYS * 24 * 60 * 60 }),
      },
    );
    if (!res.ok) {
      console.error("Signed download URL failed:", await res.text());
      return null;
    }
    const { signedURL, signedUrl } = await res.json();
    const relative = signedURL ?? signedUrl;
    return relative ? `${SUPABASE_URL}/storage/v1${relative}` : null;
  } catch (e) {
    console.error("Signed download URL threw:", e);
    return null;
  }
}

/* Pulled through the service role key, then base64'd for Resend. Only called
 * for files under the attachment limit. */
async function fetchDeckBase64(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${DECK_BUCKET}/${path}`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) {
      console.error("Deck download failed:", await res.text());
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  } catch (e) {
    console.error("Deck download threw:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const application = payload.record;

    if (!application) {
      return new Response(
        JSON.stringify({ error: "No application record received" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const founderName = application.founder_name;
    const founderEmail = application.founder_email;
    const companyName = application.company_name;
    const stage = application.stage || "Not specified";
    const location = application.founder_location || "Not specified";
    const amountRaising = application.amount_raising || "Not specified";
    const whatBuilding = application.what_are_you_building || "";

    // 0. Resolve the optional pitch deck
    const deckPath: string | null = application.deck_path || null;
    const deckFileName: string = application.deck_file_name || "deck";
    const deckSize: number = Number(application.deck_size_bytes || 0);

    let deckDownloadUrl: string | null = null;
    let deckAttachment: { filename: string; content: string } | null = null;

    if (deckPath) {
      deckDownloadUrl = await createDeckDownloadUrl(deckPath);

      if (deckSize > 0 && deckSize <= ATTACH_LIMIT_BYTES) {
        const content = await fetchDeckBase64(deckPath);
        if (content) {
          deckAttachment = { filename: deckFileName, content };
        }
      }
    }

    // 1. Email to founder
    const founderEmailResult = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tirla Ventures <founders@tirlaventures.com>",
        to: [founderEmail],
        reply_to: "tirlaventures@gmail.com",
        subject: "We've received your Tirla application",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px">
            <p>Hi ${founderName},</p>

            <p>Thank you for applying to Tirla Ventures.</p>

            <p>We've received your application for <strong>${companyName}</strong>.</p>
${
          deckPath
            ? `
            <p>We've also received your deck: ${escapeHtml(deckFileName)}.</p>
`
            : ""
        }
            <p>Our team will review it carefully. If we believe there may be a fit, we'll reach out directly.</p>

            <p>Until then, keep building.</p>

            <p>
              Tirla Ventures<br>
              <strong>Before consensus.</strong>
            </p>
          </div>
        `,
      }),
    });

    if (!founderEmailResult.ok) {
      throw new Error(
        `Founder email failed: ${await founderEmailResult.text()}`
      );
    }

    // 2. Internal email to Tirla
    const internalEmailResult = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tirla Applications <founders@tirlaventures.com>",
        to: ["tirlaventures@gmail.com"],
        reply_to: founderEmail,
        subject: `New Tirla Application — ${companyName}`,
        ...(deckAttachment ? { attachments: [deckAttachment] } : {}),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:700px">
            <h2>New Tirla Application</h2>

            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Founder:</strong> ${founderName}</p>
            <p><strong>Email:</strong> ${founderEmail}</p>
            <p><strong>Stage:</strong> ${stage}</p>
            <p><strong>Location:</strong> ${location}</p>
            <p><strong>Raising:</strong> ${amountRaising}</p>

            <p><strong>What they're building:</strong></p>
            <p>${whatBuilding}</p>

            <p>Review the complete application in Supabase.</p>

            <h3 style="margin-top:28px">Pitch deck</h3>
${
          !deckPath
            ? `            <p>No deck uploaded.</p>`
            : `            <p><strong>File:</strong> ${
              escapeHtml(deckFileName)
            }${deckSize > 0 ? ` (${formatSize(deckSize)})` : ""}</p>
            <p><strong>Attached to this email:</strong> ${
              deckAttachment
                ? "yes"
                : deckSize > ATTACH_LIMIT_BYTES
                ? "no — over 10 MB, use the link below"
                : "no — download it with the link below"
            }</p>
            ${
              deckDownloadUrl
                ? `<p><a href="${deckDownloadUrl}">Download the deck</a> — link valid for ${SIGNED_URL_DAYS} days.</p>`
                : `<p>The download link could not be generated. The file is at <code>${
                  escapeHtml(deckPath)
                }</code> in the ${DECK_BUCKET} bucket.</p>`
            }`
        }
          </div>
        `,
      }),
    });

    if (!internalEmailResult.ok) {
      throw new Error(
        `Internal email failed: ${await internalEmailResult.text()}`
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});