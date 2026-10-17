/* Tirla Ventures — hands the browser a one-off upload URL for a pitch deck.
 *
 * Why this function exists at all: the apply page is static, so the only key
 * it can hold is the publishable one. That key has NO access to the
 * pitch-decks bucket. Instead the browser asks here, this function picks the
 * storage path itself and signs a single upload for it, and the browser PUTs
 * the bytes to that URL. The service role key never leaves the server.
 *
 * Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected into every
 * edge function by Supabase — you do not need to set them. ALLOWED_ORIGINS is
 * optional (comma-separated); unset means any origin may call.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const BUCKET = "pitch-decks";
const MAX_BYTES = 25 * 1024 * 1024;
const RATE_LIMIT = 5; // signed URLs per IP per hour
const RATE_WINDOW_MINUTES = 60;

/* Extension is the source of truth. Browsers disagree about Office types and
 * routinely report Keynote as octet-stream, so octet-stream is tolerated for
 * .key only — which is a rule the bucket's flat MIME list cannot express. */
const ALLOWED_EXTENSIONS = ["pdf", "ppt", "pptx", "key"];

function corsHeaders(origin: string | null) {
  const allow = ALLOWED_ORIGINS.length === 0
    ? "*"
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

/* The IP is stored as a salted hash, never in the clear: it exists only to
 * count requests, so there is no reason to keep the address itself. */
async function hashIp(ip: string) {
  const data = new TextEncoder().encode(`tirla-deck-rate-limit:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Expected a JSON body." }, 400, origin);
    }

    const fileName = String(payload.fileName ?? "").trim();
    const size = Number(payload.size ?? 0);
    const companyName = String(payload.companyName ?? "").trim();
    const founderEmail = String(payload.founderEmail ?? "").trim();

    /* ---- the application has to look real before we hand out an upload ---- */
    if (!companyName) {
      return json({ error: "A company name is required." }, 400, origin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(founderEmail)) {
      return json({ error: "A valid email address is required." }, 400, origin);
    }

    /* ---- and the file has to be one we can actually read ---- */
    if (!fileName) {
      return json({ error: "A file name is required." }, 400, origin);
    }
    const ext = (fileName.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return json(
        { error: "Only PDF, PPT, PPTX or KEY files are accepted." },
        415,
        origin,
      );
    }
    if (!Number.isFinite(size) || size <= 0) {
      return json({ error: "A valid file size is required." }, 400, origin);
    }
    /* Advisory only — the browser declares this. The bucket's own 25 MB
     * file_size_limit is what actually enforces it during the PUT. */
    if (size > MAX_BYTES) {
      return json({ error: "That file is larger than 25 MB." }, 413, origin);
    }

    /* ---- rate limit: 5 signed URLs per IP per hour ---- */
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown")
      .split(",")[0]
      .trim();
    const ipHash = await hashIp(ip);
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000)
      .toISOString();

    const counted = await rest(
      `deck_upload_attempts?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id`,
      { headers: { Prefer: "count=exact", Range: "0-0" } },
    );

    if (counted.ok) {
      const range = counted.headers.get("content-range") ?? "";
      const total = Number(range.split("/")[1] ?? 0);
      if (Number.isFinite(total) && total >= RATE_LIMIT) {
        return json(
          {
            error:
              "Too many upload attempts from this network. Please try again in an hour, or send the application without a deck.",
          },
          429,
          origin,
        );
      }
    } else {
      /* Table missing or unreachable: log it and let the upload through
       * rather than blocking a genuine founder on our own plumbing. */
      console.error("Rate-limit check failed:", await counted.text());
    }

    await rest("deck_upload_attempts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ip_hash: ipHash }),
    }).catch((e) => console.error("Rate-limit write failed:", e));

    /* Opportunistic cleanup, so this table never becomes a data store. */
    rest(
      `deck_upload_attempts?created_at=lt.${
        new Date(Date.now() - 2 * 60 * 60_000).toISOString()
      }`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    ).catch(() => {});

    /* ---- the path is ours to choose, never the browser's ---- */
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${
      String(now.getUTCMonth() + 1).padStart(2, "0")
    }`;
    const random = crypto.randomUUID().split("-")[0];
    const path = `applications/${month}/${now.getTime()}-${
      slugify(companyName, "company")
    }-${random}.${ext}`;

    const signed = await fetch(
      `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (!signed.ok) {
      console.error("createSignedUploadUrl failed:", await signed.text());
      return json(
        { error: "Could not prepare the upload. Please try again." },
        502,
        origin,
      );
    }

    /* Storage returns { url: "/object/upload/sign/<bucket>/<path>?token=..." } */
    const { url } = await signed.json();
    const signedUrl = `${SUPABASE_URL}/storage/v1${url}`;

    return json({ path, signedUrl }, 200, origin);
  } catch (error) {
    console.error(error);
    return json({ error: "Unexpected error preparing the upload." }, 500, origin);
  }
});
