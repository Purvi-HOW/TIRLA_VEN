const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

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