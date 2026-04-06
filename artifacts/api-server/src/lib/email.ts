import { Resend } from "resend";
import { logger } from "./logger";

let connectionSettings: any;

async function getCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  // In production (Fly.io), use a direct API key env var
  if (process.env.RESEND_API_KEY) {
    return { apiKey: process.env.RESEND_API_KEY, fromEmail };
  }

  // In Replit dev/deploy, use the connector to get the API key at runtime
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error("No Resend API key available (set RESEND_API_KEY or use Replit connector)");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings?.settings?.api_key) {
    throw new Error("Resend not connected via Replit connector");
  }

  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email ?? fromEmail,
  };
}

export async function sendAccessRequestNotification(opts: {
  requesterName: string;
  requesterUsername: string;
  reason: string | null;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    logger.warn("ADMIN_EMAIL not set — skipping access request email notification");
    return;
  }

  try {
    const { apiKey, fromEmail } = await getCredentials();
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `New access request from ${opts.requesterName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">New Access Request</h2>
          <p style="margin:0 0 20px;color:#555;font-size:14px;">
            Someone has requested access to the Union Local 1285 Steward Portal.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:8px 0;color:#888;width:120px;">Name</td>
              <td style="padding:8px 0;font-weight:600;color:#111;">${opts.requesterName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#888;">Username</td>
              <td style="padding:8px 0;font-weight:600;color:#111;font-family:monospace;">@${opts.requesterUsername}</td>
            </tr>
            ${
              opts.reason
                ? `<tr>
              <td style="padding:8px 0;color:#888;vertical-align:top;">Reason</td>
              <td style="padding:8px 0;color:#111;font-style:italic;">${opts.reason}</td>
            </tr>`
                : ""
            }
          </table>
          <div style="margin-top:24px;">
            <a href="https://union-local-1285.fly.dev/admin"
               style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
              Review in Admin Panel
            </a>
          </div>
          <p style="margin-top:24px;font-size:12px;color:#aaa;">
            Union Local 1285 — Steward Portal
          </p>
        </div>
      `,
    });

    logger.info({ to: adminEmail, requester: opts.requesterUsername }, "Access request notification sent");
  } catch (err) {
    logger.error({ err }, "Failed to send access request email — continuing without notification");
  }
}
