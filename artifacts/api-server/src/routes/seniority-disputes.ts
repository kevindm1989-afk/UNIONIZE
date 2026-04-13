import { Router } from "express";
import { db, membersTable, pool } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";
import { ai } from "../lib/gemini/client";
import { GEMINI_FLASH_LITE_MODEL } from "../lib/anthropic/constants";
import { logger } from "../lib/logger";
// @ts-ignore
import cbaText from "../data/cba.txt";

const router = Router();
router.use(requireSteward);

// ─── Types ────────────────────────────────────────────────────────────────────

const DISPUTE_TYPES = [
  "scheduling",
  "overtime",
  "shift_bid",
  "layoff",
  "recall",
  "promotion",
  "other",
] as const;

type DisputeType = (typeof DISPUTE_TYPES)[number];

const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  scheduling: "Scheduling",
  overtime: "Overtime Distribution",
  shift_bid: "Shift Bid",
  layoff: "Layoff Order",
  recall: "Recall Order",
  promotion: "Promotion",
  other: "Other",
};

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a seniority dispute analysis assistant for Unifor Local 1285 operating under Ontario labor law. When given details of a seniority dispute including the members involved, their seniority rankings, the type of dispute, and what management did, analyze whether the correct seniority order was followed.

Your response MUST be valid JSON with exactly this structure:
{
  "correctSeniorityOrder": [
    { "name": "Member Name", "seniorityDate": "YYYY-MM-DD or null", "seniorityRank": 1, "positionInOrder": 1 }
  ],
  "violationOccurred": true,
  "violationLevel": "No Violation",
  "articleReference": "Article X.X — Title",
  "explanation": "Plain language explanation in 2-4 sentences.",
  "recommendation": "No Action",
  "recommendationRationale": "Why this recommendation was made in 1-2 sentences.",
  "grievanceSummary": "If filing a grievance, a pre-filled summary of the violation for the drafting assistant. Otherwise empty string."
}

violationLevel must be exactly one of: "No Violation", "Minor", "Serious", "Clear Violation"
recommendation must be exactly one of: "No Action", "Raise Informally", "File Grievance"

Rules:
- Base analysis on the seniority dates and ranks provided. If seniorityRank is available, use it as the primary ordering. If not, use seniorityDate (earlier = more senior).
- Always cite the most relevant collective agreement article from the CBA text provided.
- For scheduling: most senior available worker gets scheduling preference.
- For overtime: most senior must be offered overtime first.
- For shift bid: most senior gets their preferred shift.
- For layoff: least senior workers are laid off first (inverse seniority).
- For recall: most senior laid off workers are recalled first.
- For promotion: most senior qualified worker must be considered first.
- Keep the explanation practical and written for a union steward audience.
- Always note that the steward makes the final decision.`;

// ─── Pattern check helper ─────────────────────────────────────────────────────

async function checkPattern(disputeType: string, excludeId?: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int as count FROM seniority_disputes
       WHERE dispute_type = $1
         AND created_at > NOW() - INTERVAL '60 days'
         ${excludeId ? "AND id != $2" : ""}`,
      excludeId ? [disputeType, excludeId] : [disputeType]
    );
    const count = (result.rows[0]?.count ?? 0) as number;
    return count >= 2; // Current dispute would be the 3rd
  } finally {
    client.release();
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/seniority-disputes/analyze — run AI analysis (does NOT save)
router.post("/analyze", asyncHandler(async (req, res) => {
  const { disputeType, occurredAt, memberIds, description, managementAction } = req.body ?? {};

  if (!disputeType || !occurredAt || !memberIds || !description || !managementAction) {
    res.status(422).json({ error: "Missing required fields", code: "VALIDATION_ERROR" }); return;
  }
  if (!DISPUTE_TYPES.includes(disputeType as DisputeType)) {
    res.status(422).json({ error: "Invalid dispute type", code: "VALIDATION_ERROR" }); return;
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    res.status(422).json({ error: "At least one member must be selected", code: "VALIDATION_ERROR" }); return;
  }

  // Fetch members with seniority data
  const members = await db
    .select({
      id: membersTable.id,
      name: membersTable.name,
      department: membersTable.department,
      classification: membersTable.classification,
      seniorityDate: membersTable.seniorityDate,
      seniorityRank: membersTable.seniorityRank,
    })
    .from(membersTable)
    .where(inArray(membersTable.id, memberIds.map(Number)));

  if (members.length === 0) {
    res.status(404).json({ error: "No members found", code: "NOT_FOUND" }); return;
  }

  // Sort by seniority for the context (most senior first)
  const sorted = [...members].sort((a, b) => {
    if (a.seniorityRank !== null && b.seniorityRank !== null) return a.seniorityRank - b.seniorityRank;
    if (a.seniorityRank !== null) return -1;
    if (b.seniorityRank !== null) return 1;
    if (a.seniorityDate && b.seniorityDate) return new Date(a.seniorityDate).getTime() - new Date(b.seniorityDate).getTime();
    return a.name.localeCompare(b.name);
  });

  // Check for pattern (2+ same type in 60 days = this would be 3rd)
  const isPattern = await checkPattern(disputeType);

  // Build user prompt
  const memberList = sorted.map((m, i) => ({
    name: m.name,
    seniorityRank: m.seniorityRank ?? null,
    seniorityDate: m.seniorityDate ?? null,
    department: m.department ?? "Unknown",
    classification: m.classification ?? "Unknown",
  }));

  const userPrompt = `
SENIORITY DISPUTE ANALYSIS REQUEST

Dispute Type: ${DISPUTE_TYPE_LABELS[disputeType as DisputeType]}
Date Occurred: ${occurredAt}

Members Involved (as listed by steward):
${JSON.stringify(memberList, null, 2)}

Steward's Description of the Issue:
${description}

What Management Did:
${managementAction}

Collective Agreement Text (for reference):
${cbaText ? cbaText.slice(0, 8000) : "CBA text not available — apply general Ontario labour law seniority principles."}

Please analyze this seniority dispute and return your analysis as valid JSON following the structure in your instructions.`;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_FLASH_LITE_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 2048,
        temperature: 0.2,
      },
    });

    let raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Strip markdown code fences
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(raw);
    } catch {
      logger.error({ raw }, "Gemini returned non-JSON for seniority dispute");
      res.status(502).json({ error: "AI returned an unreadable response. Please try again.", code: "AI_PARSE_ERROR" }); return;
    }

    res.json({
      analysis,
      members: sorted,
      isPattern,
      patternType: isPattern ? DISPUTE_TYPE_LABELS[disputeType as DisputeType] : null,
    });
  } catch (err) {
    logger.error({ err }, "Gemini seniority dispute analysis failed");
    res.status(502).json({ error: "AI analysis failed. Please try again.", code: "AI_ERROR" }); return;
  }
}));

// GET /api/seniority-disputes — list saved disputes
router.get("/", asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT sd.*, u.display_name as created_by_name
       FROM seniority_disputes sd
       LEFT JOIN users u ON u.id = sd.created_by
       ORDER BY sd.created_at DESC
       LIMIT 100`
    );
    const rows = result.rows ?? [];

    // Check for patterns per type
    const typeCounts: Record<string, number> = {};
    for (const r of rows) {
      typeCounts[r.dispute_type] = (typeCounts[r.dispute_type] ?? 0) + 1;
    }

    res.json(rows.map((r: any) => ({
      id: r.id,
      disputeType: r.dispute_type,
      disputeTypeLabel: DISPUTE_TYPE_LABELS[r.dispute_type as DisputeType] ?? r.dispute_type,
      occurredAt: r.occurred_at,
      memberIds: r.member_ids,
      memberNames: r.member_names,
      description: r.description,
      managementAction: r.management_action,
      analysis: r.analysis,
      violationLevel: r.violation_level,
      recommendation: r.recommendation,
      patternFlag: r.pattern_flag,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
    })));
  } finally {
    client.release();
  }
}));

// POST /api/seniority-disputes — save a dispute + analysis
router.post("/", asyncHandler(async (req, res) => {
  const {
    disputeType, occurredAt, memberIds, memberNames, description,
    managementAction, analysis, violationLevel, recommendation,
  } = req.body ?? {};

  if (!disputeType || !occurredAt || !description || !managementAction) {
    res.status(422).json({ error: "Missing required fields", code: "VALIDATION_ERROR" }); return;
  }

  const isPattern = await checkPattern(disputeType);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO seniority_disputes
        (dispute_type, occurred_at, member_ids, member_names, description, management_action,
         analysis, violation_level, recommendation, pattern_flag, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        disputeType,
        occurredAt,
        JSON.stringify(memberIds ?? []),
        JSON.stringify(memberNames ?? []),
        description,
        managementAction,
        analysis ? JSON.stringify(analysis) : null,
        violationLevel ?? null,
        recommendation ?? null,
        isPattern,
        req.session?.userId ?? null,
      ]
    );
    const row = (result.rows ?? [])[0];
    res.status(201).json({ id: row.id, patternFlag: isPattern });
  } finally {
    client.release();
  }
}));

// GET /api/seniority-disputes/:id — get one dispute
router.get("/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM seniority_disputes WHERE id = $1`,
      [id]
    );
    const row = (result.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: row.id,
      disputeType: row.dispute_type,
      disputeTypeLabel: DISPUTE_TYPE_LABELS[row.dispute_type as DisputeType] ?? row.dispute_type,
      occurredAt: row.occurred_at,
      memberIds: row.member_ids,
      memberNames: row.member_names,
      description: row.description,
      managementAction: row.management_action,
      analysis: row.analysis,
      violationLevel: row.violation_level,
      recommendation: row.recommendation,
      patternFlag: row.pattern_flag,
      createdAt: row.created_at,
    });
  } finally {
    client.release();
  }
}));

// DELETE /api/seniority-disputes/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM seniority_disputes WHERE id = $1`, [id]);
    res.json({ ok: true });
  } finally {
    client.release();
  }
}));

export default router;
