import { Resend } from "resend";
import { logger } from "./logger";
import { db, localSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Replit Resend integration — never cache the client; tokens expire
async function getResendClient(): Promise<{ client: Resend; from: string } | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

    if (!hostname || !xReplitToken) {
      return null;
    }

    const data = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      },
    )
      .then((r) => r.json())
      .then((d) => d.items?.[0]);

    if (!data?.settings?.api_key) {
      logger.warn("Resend not connected — skipping email");
      return null;
    }

    const fromEmail: string =
      data.settings.from_email ||
      process.env.EMAIL_FROM ||
      "noreply@union-local-1285.fly.dev";

    return { client: new Resend(data.settings.api_key), from: fromEmail };
  } catch (err) {
    logger.warn({ err }, "Could not initialise Resend client — skipping email");
    return null;
  }
}

async function send(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const resend = await getResendClient();
  if (!resend) return;

  try {
    const { error } = await resend.client.emails.send({
      from: resend.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      logger.error({ error }, "Resend API error sending email");
    } else {
      logger.info({ to: opts.to, subject: opts.subject }, "Email sent via Resend");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send email — continuing without notification");
  }
}

// ─── Helper: resolve admin email from env or local_settings ──────────────────

async function getAdminEmail(): Promise<string | null> {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  try {
    const [row] = await db
      .select({ value: localSettingsTable.value })
      .from(localSettingsTable)
      .where(eq(localSettingsTable.key, "admin_email"));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

// ─── Notification: access request ─────────────────────────────────────────────

export async function sendAccessRequestNotification(opts: {
  requesterName: string;
  requesterUsername: string;
  reason: string | null;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) {
    logger.warn("Admin email not configured — skipping access request email");
    return;
  }

  const portalUrl = process.env.PORTAL_URL ?? "https://union-local-1285.fly.dev";

  await send({
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
          <a href="${portalUrl}/admin"
             style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
            Review in Admin Panel
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Union Local 1285 — Steward Portal</p>
      </div>
    `,
    text: [
      "New Access Request — Union Local 1285",
      "",
      `Name:     ${opts.requesterName}`,
      `Username: @${opts.requesterUsername}`,
      opts.reason ? `Reason:   ${opts.reason}` : "",
      "",
      `Review at: ${portalUrl}/admin`,
    ]
      .filter((l) => l !== undefined)
      .join("\n"),
  });
}

// ─── Notification: grievance filed ────────────────────────────────────────────

export async function sendGrievanceFiledNotification(opts: {
  grievanceId: number;
  grievanceNumber: string;
  title: string;
  memberName: string | null;
  step: number;
  dueDate: string | null;
  isAda: boolean;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return;

  const portalUrl = process.env.PORTAL_URL ?? "https://union-local-1285.fly.dev";
  const stepLabel = opts.step === 5 ? "Step 5 — Arbitration" : `Step ${opts.step}`;
  const adaBadge = opts.isAda
    ? `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-left:8px;">ADA</span>`
    : "";

  await send({
    to: adminEmail,
    subject: `[${opts.grievanceNumber}] New Grievance Filed: ${opts.title}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New Grievance Filed</h2>
        <p style="margin:0 0 20px;color:#888;font-size:13px;">${opts.grievanceNumber}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#888;width:120px;">Title</td>
            <td style="padding:8px 0;font-weight:600;color:#111;">${opts.title} ${adaBadge}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Member</td>
            <td style="padding:8px 0;color:#111;">${opts.memberName ?? "—"}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Step</td>
            <td style="padding:8px 0;color:#111;">${stepLabel}</td>
          </tr>
          ${
            opts.dueDate
              ? `<tr>
            <td style="padding:8px 0;color:#888;">Due</td>
            <td style="padding:8px 0;color:#111;">${new Date(opts.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td>
          </tr>`
              : ""
          }
        </table>
        <div style="margin-top:24px;">
          <a href="${portalUrl}/grievances/${opts.grievanceId}"
             style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
            View Grievance
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Union Local 1285 — Steward Portal</p>
      </div>
    `,
    text: [
      `New Grievance Filed — ${opts.grievanceNumber}`,
      "",
      `Title:  ${opts.title}`,
      `Member: ${opts.memberName ?? "—"}`,
      `Step:   ${stepLabel}`,
      opts.dueDate ? `Due:    ${opts.dueDate}` : "",
      opts.isAda ? "Flags:  ADA / Accommodation Request" : "",
      "",
      `View at: ${portalUrl}/grievances/${opts.grievanceId}`,
    ]
      .filter((l) => l !== undefined)
      .join("\n"),
  });
}

// ─── Notification: grievance status change ─────────────────────────────────────

export async function sendGrievanceStatusNotification(opts: {
  grievanceId: number;
  grievanceNumber: string;
  title: string;
  memberName: string | null;
  oldStatus: string;
  newStatus: string;
  step: number;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return;

  const portalUrl = process.env.PORTAL_URL ?? "https://union-local-1285.fly.dev";
  const stepLabel = opts.step === 5 ? "Arbitration" : `Step ${opts.step}`;
  const statusLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  await send({
    to: adminEmail,
    subject: `[${opts.grievanceNumber}] Status Changed to ${statusLabel(opts.newStatus)}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Grievance Status Update</h2>
        <p style="margin:0 0 20px;color:#888;font-size:13px;">${opts.grievanceNumber}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#888;width:120px;">Title</td>
            <td style="padding:8px 0;font-weight:600;color:#111;">${opts.title}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Member</td>
            <td style="padding:8px 0;color:#111;">${opts.memberName ?? "—"}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Step</td>
            <td style="padding:8px 0;color:#111;">${stepLabel}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Status</td>
            <td style="padding:8px 0;color:#111;">
              <span style="text-decoration:line-through;color:#aaa;">${statusLabel(opts.oldStatus)}</span>
              &rarr; <strong>${statusLabel(opts.newStatus)}</strong>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;">
          <a href="${portalUrl}/grievances/${opts.grievanceId}"
             style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
            View Grievance
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Union Local 1285 — Steward Portal</p>
      </div>
    `,
    text: [
      `Grievance Status Update — ${opts.grievanceNumber}`,
      "",
      `Title:      ${opts.title}`,
      `Member:     ${opts.memberName ?? "—"}`,
      `Step:       ${stepLabel}`,
      `Old Status: ${statusLabel(opts.oldStatus)}`,
      `New Status: ${statusLabel(opts.newStatus)}`,
      "",
      `View at: ${portalUrl}/grievances/${opts.grievanceId}`,
    ].join("\n"),
  });
}
