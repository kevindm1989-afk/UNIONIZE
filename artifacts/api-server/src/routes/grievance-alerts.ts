import { Router } from "express";
import { db, grievancesTable, membersTable } from "@workspace/db";
import { notInArray, eq } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";
import { countBusinessDaysUntil } from "../lib/businessDays";
import { logger } from "../lib/logger";
import { ai } from "../lib/gemini/client";
import { GEMINI_MODEL } from "../lib/anthropic/constants";
import { sendPushToAll } from "./push";

const router = Router();

const TERMINAL = ["resolved", "withdrawn"] as const;
const WARNING_BDAYS = 3;

interface AlertGrievance {
  id: number;
  grievanceNumber: string;
  title: string;
  step: number;
  status: string;
  dueDate: string;
  memberId: number | null;
  memberName: string | null;
  urgency: "critical" | "warning";
  businessDaysUntilDue: number;
  aiMessage: string;
}

interface AlertsCache {
  data: { alerts: AlertGrievance[]; counts: { critical: number; warning: number; total: number } };
  ts: number;
}

let cache: AlertsCache | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function generateAiMessages(
  flagged: Omit<AlertGrievance, "aiMessage">[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (flagged.length === 0) return map;

  const list = flagged.map((g) => ({
    id: g.id,
    grievanceNumber: g.grievanceNumber,
    title: g.title,
    step: g.step,
    status: g.status,
    dueDate: g.dueDate,
    businessDaysUntilDue: g.businessDaysUntilDue,
    urgency: g.urgency,
    memberName: g.memberName ?? "the grievor",
  }));

  const prompt = `You are an advisor to a union steward at Unifor Local 1285 (Ontario). The following grievances need urgent attention. For each, write a single plain-language paragraph (2-4 sentences) telling the steward exactly what action to take and why it is time-sensitive. Be specific about the step number and the consequence of inaction (e.g., loss of grievance rights). Never use jargon without explanation. Respond ONLY with a valid JSON array where each object has "id" (number) and "message" (string). No markdown, no code blocks.

Grievances:
${JSON.stringify(list, null, 2)}`;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 2048, temperature: 0.3 },
    });

    const raw = result.text?.trim() ?? "";
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed: { id: number; message: string }[] = JSON.parse(cleaned);

    for (const item of parsed) {
      if (typeof item.id === "number" && typeof item.message === "string") {
        map.set(item.id, item.message);
      }
    }
  } catch (err) {
    logger.warn({ err }, "grievance-alerts: AI message generation failed — using fallback messages");
  }
  return map;
}

function fallbackMessage(g: Omit<AlertGrievance, "aiMessage">): string {
  const stepLabel = g.step >= 5 ? "Arbitration" : `Step ${g.step}`;
  if (g.businessDaysUntilDue <= 0) {
    const days = Math.abs(g.businessDaysUntilDue);
    return `${g.grievanceNumber} is ${days} business day${days !== 1 ? "s" : ""} overdue at ${stepLabel}. Immediate action is required — escalate or respond to management now to protect this grievance.`;
  }
  return `${g.grievanceNumber} at ${stepLabel} is due in ${g.businessDaysUntilDue} business day${g.businessDaysUntilDue !== 1 ? "s" : ""}. Review the file and take action before the deadline.`;
}

async function buildAlerts(force = false): Promise<AlertsCache["data"]> {
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const today = new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      id: grievancesTable.id,
      grievanceNumber: grievancesTable.grievanceNumber,
      title: grievancesTable.title,
      step: grievancesTable.step,
      status: grievancesTable.status,
      dueDate: grievancesTable.dueDate,
      memberId: grievancesTable.memberId,
      memberName: membersTable.name,
    })
    .from(grievancesTable)
    .leftJoin(membersTable, eq(membersTable.id, grievancesTable.memberId))
    .where(notInArray(grievancesTable.status, [...TERMINAL]));

  const flagged: Omit<AlertGrievance, "aiMessage">[] = [];

  for (const row of rows) {
    if (!row.dueDate) continue;
    const bdays = countBusinessDaysUntil(today, row.dueDate);
    if (bdays > WARNING_BDAYS) continue;

    flagged.push({
      id: row.id,
      grievanceNumber: row.grievanceNumber,
      title: row.title,
      step: row.step,
      status: row.status,
      dueDate: row.dueDate,
      memberId: row.memberId ?? null,
      memberName: row.memberName ?? null,
      urgency: bdays <= 0 ? "critical" : "warning",
      businessDaysUntilDue: bdays,
    });
  }

  flagged.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === "critical" ? -1 : 1;
    return a.businessDaysUntilDue - b.businessDaysUntilDue;
  });

  const aiMessages = await generateAiMessages(flagged);

  const alerts: AlertGrievance[] = flagged.map((g) => ({
    ...g,
    aiMessage: aiMessages.get(g.id) ?? fallbackMessage(g),
  }));

  const counts = {
    critical: alerts.filter((a) => a.urgency === "critical").length,
    warning: alerts.filter((a) => a.urgency === "warning").length,
    total: alerts.length,
  };

  const data = { alerts, counts };
  cache = { data, ts: Date.now() };
  return data;
}

export function invalidateAlertsCache() {
  cache = null;
}

export async function runDailyAlertJob() {
  try {
    logger.info("grievance-alerts: running daily deadline check");
    const data = await buildAlerts(true);

    if (data.counts.total === 0) {
      logger.info("grievance-alerts: no deadline alerts, no push sent");
      return;
    }

    const criticals = data.alerts.filter((a) => a.urgency === "critical");
    const warnings = data.alerts.filter((a) => a.urgency === "warning");

    const title =
      criticals.length > 0
        ? `🚨 ${criticals.length} Grievance${criticals.length > 1 ? "s" : ""} Overdue — Action Required`
        : `⏰ ${warnings.length} Grievance Deadline${warnings.length > 1 ? "s" : ""} Approaching`;

    const body =
      criticals.length > 0
        ? criticals
            .slice(0, 2)
            .map((a) => `${a.grievanceNumber}: ${a.title}`)
            .join(" • ")
        : warnings
            .slice(0, 2)
            .map((a) => `${a.grievanceNumber} — ${a.businessDaysUntilDue}d left`)
            .join(" • ");

    sendPushToAll({ title, body, tag: "grievance-deadline-daily", url: "/" }).catch(() => {});
    logger.info({ critical: criticals.length, warning: warnings.length }, "grievance-alerts: daily push sent");
  } catch (err) {
    logger.error({ err }, "grievance-alerts: daily job failed");
  }
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await buildAlerts();
    res.json(data);
  })
);

router.post(
  "/notify",
  asyncHandler(async (req, res) => {
    if (!["admin", "chair", "co_chair"].includes(req.session?.role ?? "")) {
      res.status(403).json({ error: "Admin only" });
      return;
    }

    const data = await buildAlerts(true);

    if (data.counts.total === 0) {
      res.json({ ok: true, sent: 0, message: "No alerts to notify" });
      return;
    }

    const criticals = data.alerts.filter((a) => a.urgency === "critical");
    const warnings = data.alerts.filter((a) => a.urgency === "warning");

    const title =
      criticals.length > 0
        ? `🚨 ${criticals.length} Grievance${criticals.length > 1 ? "s" : ""} Overdue`
        : `⏰ ${warnings.length} Deadline${warnings.length > 1 ? "s" : ""} Approaching`;

    const body =
      criticals.length > 0
        ? criticals
            .slice(0, 2)
            .map((a) => `${a.grievanceNumber}: ${a.title}`)
            .join(" • ")
        : warnings
            .slice(0, 2)
            .map((a) => `${a.grievanceNumber} — ${a.businessDaysUntilDue}d left`)
            .join(" • ");

    sendPushToAll({ title, body, tag: "grievance-deadline-alert", url: "/" }).catch(() => {});

    res.json({ ok: true, sent: data.counts.total });
  })
);

export default router;
