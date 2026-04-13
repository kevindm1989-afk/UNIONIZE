import { Router } from "express";
import { z } from "zod/v4";
import { db, pollsTable, usersTable, membersTable, pool } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";
import { sendPushToAll } from "./push";
import { logger } from "../lib/logger";

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMAL_VOTE_TYPES = [
  "ratification",
  "strike_vote",
  "officer_election",
  "return_to_work",
  "special_resolution",
] as const;

type FormalVoteType = (typeof FORMAL_VOTE_TYPES)[number];

const VOTE_TYPE_LABELS: Record<FormalVoteType, string> = {
  ratification: "Ratification Vote",
  strike_vote: "Strike Vote",
  officer_election: "Officer Election",
  return_to_work: "Return to Work Vote",
  special_resolution: "Special Resolution",
};

// Default ballot options for yes/no-style formal votes
function defaultOptions(voteType: FormalVoteType): string[] {
  switch (voteType) {
    case "ratification":    return ["Accept", "Reject"];
    case "strike_vote":     return ["Authorize Strike", "Do Not Authorize"];
    case "return_to_work":  return ["Yes, Return to Work", "No"];
    case "special_resolution": return ["In Favour", "Opposed"];
    case "officer_election": return [];
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createElectionSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  formalVoteType: z.enum(FORMAL_VOTE_TYPES),
  options: z.array(z.string().min(1)).nullable().optional(),
  quorumRequired: z.number().int().min(1).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime(),
});

const castBallotSchema = z.object({
  choice: z.string().min(1).max(500),
});

const closeElectionSchema = z.object({
  outcome: z.string().min(1).max(500).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(req: any): boolean {
  return req.session?.role === "admin" || req.session?.role === "chair";
}

function isSteward(req: any): boolean {
  const role = req.session?.role;
  return role === "admin" || role === "chair" || role === "steward";
}

async function getElection(id: number) {
  const [row] = await db
    .select()
    .from(pollsTable)
    .where(and(eq(pollsTable.id, id), eq((pollsTable as any).isFormalVote, true)));
  return row ?? null;
}

async function getTally(pollId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT choice, COUNT(*)::int as count FROM formal_vote_ballots WHERE poll_id = $1 GROUP BY choice ORDER BY count DESC`,
      [pollId]
    );
    const rows: Array<{ choice: string; count: number }> = result.rows ?? [];
    const total = rows.reduce((s, r) => s + r.count, 0);
    return { tally: rows, total };
  } finally {
    client.release();
  }
}

function fmtElection(p: any) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    formalVoteType: p.formalVoteType as FormalVoteType,
    formalVoteTypeLabel: VOTE_TYPE_LABELS[p.formalVoteType as FormalVoteType] ?? p.formalVoteType,
    options: p.options ?? [],
    quorumRequired: p.quorumRequired ?? null,
    quorumMet: p.quorumMet ?? null,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    closedAt: p.closedAt?.toISOString() ?? null,
    outcome: p.outcome ?? null,
    resultsFinal: p.resultsFinal ?? null,
    isActive: p.isActive,
    createdBy: p.createdBy,
    createdAt: p.createdAt?.toISOString() ?? null,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/elections — list all formal votes
router.get("/", asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const role = req.session?.role ?? "member";
    let query: string;
    let params: any[];

    if (isSteward(req)) {
      // Stewards see all formal votes
      query = `
        SELECT * FROM polls
        WHERE is_formal_vote = TRUE
        ORDER BY created_at DESC
      `;
      params = [];
    } else {
      // Members see only active votes that have started
      query = `
        SELECT * FROM polls
        WHERE is_formal_vote = TRUE
          AND is_active = TRUE
          AND starts_at <= NOW()
        ORDER BY ends_at ASC
      `;
      params = [];
    }

    const result = await client.query(query, params);
    const rows = result.rows ?? [];

    // Attach hasCast for the current user
    const userId = req.session?.userId;
    const withCast = await Promise.all(rows.map(async (p: any) => {
      let hasCast = false;
      if (userId) {
        const castResult = await client.query(
          `SELECT 1 FROM formal_vote_cast WHERE poll_id = $1 AND user_id = $2 LIMIT 1`,
          [p.id, userId]
        );
        hasCast = (castResult.rows ?? []).length > 0;
      }
      const isClosed = p.closed_at !== null || new Date(p.ends_at) < new Date();
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        formalVoteType: p.formal_vote_type,
        formalVoteTypeLabel: VOTE_TYPE_LABELS[p.formal_vote_type as FormalVoteType] ?? p.formal_vote_type,
        options: p.options ?? [],
        quorumRequired: p.quorum_required ?? null,
        quorumMet: p.quorum_met ?? null,
        startsAt: p.starts_at,
        endsAt: p.ends_at,
        closedAt: p.closed_at ?? null,
        outcome: p.outcome ?? null,
        resultsFinal: p.results_final ?? null,
        isActive: p.is_active,
        isClosed,
        hasCast,
        createdBy: p.created_by,
        createdAt: p.created_at,
      };
    }));

    res.json(withCast);
  } finally {
    client.release();
  }
}));

// POST /api/elections — create a formal vote (admin/chair only)
router.post("/", asyncHandler(async (req, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }

  let body: z.infer<typeof createElectionSchema>;
  try {
    body = createElectionSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }

  const voteType = body.formalVoteType;
  let options: string[];

  if (voteType === "officer_election") {
    if (!body.options || body.options.length < 1) {
      res.status(422).json({ error: "Officer elections require at least one candidate", code: "VALIDATION_ERROR" }); return;
    }
    options = [...body.options, "Write-in (specify below)"];
  } else {
    options = body.options && body.options.length > 0 ? body.options : defaultOptions(voteType);
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO polls (
        title, description, poll_type, options, starts_at, ends_at,
        created_by, is_active, target_role,
        is_formal_vote, formal_vote_type, quorum_required
      ) VALUES ($1,$2,'multiple_choice',$3,$4,$5,$6,TRUE,'all',TRUE,$7,$8)
      RETURNING *`,
      [
        body.title,
        body.description ?? null,
        JSON.stringify(options),
        body.startsAt ? new Date(body.startsAt) : new Date(),
        new Date(body.endsAt),
        req.session?.userId ?? null,
        voteType,
        body.quorumRequired ?? null,
      ]
    );
    const p = (result.rows ?? [])[0];
    if (!p) { res.status(500).json({ error: "Insert failed" }); return; }

    sendPushToAll({
      title: `New Vote: ${p.title}`,
      body: `A formal ${VOTE_TYPE_LABELS[voteType]} is now open. Tap to cast your ballot.`,
      url: "/elections",
    }).catch(() => undefined);

    res.status(201).json({
      id: p.id,
      title: p.title,
      formalVoteType: p.formal_vote_type,
      formalVoteTypeLabel: VOTE_TYPE_LABELS[voteType],
      options: p.options,
      quorumRequired: p.quorum_required,
      startsAt: p.starts_at,
      endsAt: p.ends_at,
      isActive: p.is_active,
    });
  } finally {
    client.release();
  }
}));

// POST /api/elections/:id/ballot — cast a secret ballot
router.post("/:id/ballot", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }); return; }

  let body: z.infer<typeof castBallotSchema>;
  try {
    body = castBallotSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }

  const client = await pool.connect();
  try {
    // Load the election
    const pollResult = await client.query(
      `SELECT * FROM polls WHERE id = $1 AND is_formal_vote = TRUE`,
      [pollId]
    );
    const poll = (pollResult.rows ?? [])[0];
    if (!poll) { res.status(404).json({ error: "Election not found", code: "NOT_FOUND" }); return; }
    if (!poll.is_active || poll.closed_at !== null || new Date(poll.ends_at) < new Date()) {
      res.status(400).json({ error: "This vote is closed", code: "VOTE_CLOSED" }); return;
    }

    // Check eligibility — members must have a linked member record with current dues
    const linkedMemberId = req.session?.linkedMemberId ?? null;
    const role = req.session?.role ?? "member";

    if (role === "member") {
      if (!linkedMemberId) {
        res.status(403).json({
          error: "Your membership record is not linked. Please contact your steward to verify eligibility.",
          code: "NOT_LINKED",
        }); return;
      }
      // Check dues status
      const memberResult = await client.query(
        `SELECT dues_status FROM members WHERE id = $1`,
        [linkedMemberId]
      );
      const member = (memberResult.rows ?? [])[0];
      if (!member || member.dues_status !== "current") {
        res.status(403).json({
          error: "Only members in good standing (current dues) may vote. Please contact your steward.",
          code: "INELIGIBLE",
        }); return;
      }
    }
    // Stewards/admins are always eligible

    // Check if already voted
    const castResult = await client.query(
      `SELECT 1 FROM formal_vote_cast WHERE poll_id = $1 AND user_id = $2 LIMIT 1`,
      [pollId, userId]
    );
    if ((castResult.rows ?? []).length > 0) {
      res.status(409).json({ error: "You have already cast your ballot", code: "ALREADY_VOTED" }); return;
    }

    // Validate choice is one of the options (or write-in)
    const options: string[] = poll.options ?? [];
    const isWriteIn = options.includes("Write-in (specify below)");
    const choiceIsValid = options.some((o: string) => o === body.choice)
      || (isWriteIn && body.choice.length > 0);
    if (!choiceIsValid) {
      res.status(422).json({ error: "Invalid ballot choice", code: "VALIDATION_ERROR" }); return;
    }

    // Record secret ballot (NO userId stored here)
    await client.query(
      `INSERT INTO formal_vote_ballots (poll_id, choice) VALUES ($1, $2)`,
      [pollId, body.choice]
    );

    // Record that this user has voted (prevents double voting)
    await client.query(
      `INSERT INTO formal_vote_cast (poll_id, user_id) VALUES ($1, $2)`,
      [pollId, userId]
    );

    res.status(201).json({ ok: true, message: "Your ballot has been cast." });
  } finally {
    client.release();
  }
}));

// GET /api/elections/:id/tally — get vote tally
// Members: only after vote closes. Stewards: anytime.
router.get("/:id/tally", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);

  const client = await pool.connect();
  try {
    const pollResult = await client.query(
      `SELECT * FROM polls WHERE id = $1 AND is_formal_vote = TRUE`,
      [pollId]
    );
    const poll = (pollResult.rows ?? [])[0];
    if (!poll) { res.status(404).json({ error: "Election not found", code: "NOT_FOUND" }); return; }

    const isClosed = poll.closed_at !== null || new Date(poll.ends_at) < new Date();
    if (!isClosed && !isSteward(req)) {
      res.status(403).json({ error: "Tally available after vote closes", code: "FORBIDDEN" }); return;
    }

    const tallyResult = await client.query(
      `SELECT choice, COUNT(*)::int as count FROM formal_vote_ballots WHERE poll_id = $1 GROUP BY choice ORDER BY count DESC`,
      [pollId]
    );
    const tally = tallyResult.rows ?? [];
    const total = tally.reduce((s: number, r: any) => s + r.count, 0);

    res.json({
      poll: {
        id: poll.id,
        title: poll.title,
        formalVoteType: poll.formal_vote_type,
        formalVoteTypeLabel: VOTE_TYPE_LABELS[poll.formal_vote_type as FormalVoteType] ?? poll.formal_vote_type,
        quorumRequired: poll.quorum_required,
        quorumMet: poll.quorum_met,
        closedAt: poll.closed_at,
        outcome: poll.outcome,
        endsAt: poll.ends_at,
      },
      tally,
      total,
      quorumRequired: poll.quorum_required,
      quorumMet: poll.quorum_met,
    });
  } finally {
    client.release();
  }
}));

// POST /api/elections/:id/close — admin closes vote and finalizes results
router.post("/:id/close", asyncHandler(async (req, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }

  const pollId = parseInt(req.params.id as string, 10);

  let body: z.infer<typeof closeElectionSchema>;
  try {
    body = closeElectionSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }

  const client = await pool.connect();
  try {
    const pollResult = await client.query(
      `SELECT * FROM polls WHERE id = $1 AND is_formal_vote = TRUE`,
      [pollId]
    );
    const poll = (pollResult.rows ?? [])[0];
    if (!poll) { res.status(404).json({ error: "Election not found", code: "NOT_FOUND" }); return; }
    if (poll.closed_at !== null) { res.status(400).json({ error: "Vote already closed", code: "ALREADY_CLOSED" }); return; }

    // Compute tally
    const tallyResult = await client.query(
      `SELECT choice, COUNT(*)::int as count FROM formal_vote_ballots WHERE poll_id = $1 GROUP BY choice ORDER BY count DESC`,
      [pollId]
    );
    const tally = tallyResult.rows ?? [];
    const total = tally.reduce((s: number, r: any) => s + r.count, 0);

    // Determine quorum
    const quorumRequired = poll.quorum_required ?? 0;
    const quorumMet = quorumRequired > 0 ? total >= quorumRequired : null;

    // Auto-determine outcome if not provided
    let outcome = body.outcome ?? null;
    if (!outcome && tally.length > 0) {
      const voteType = poll.formal_vote_type as FormalVoteType;
      const winner = tally[0] as { choice: string; count: number };
      if (voteType === "officer_election") {
        outcome = quorumMet === false ? `Inquorate — Elected: ${winner.choice}` : `Elected: ${winner.choice}`;
      } else {
        const carried = winner.choice !== "Reject" && winner.choice !== "Do Not Authorize"
          && winner.choice !== "No" && winner.choice !== "Opposed"
          && winner.choice !== "No";
        const passFail = carried ? "Carried" : "Failed";
        outcome = quorumMet === false ? `${passFail} (Inquorate)` : passFail;
      }
    }

    const resultsFinal = { tally, total, closedAt: new Date().toISOString() };

    await client.query(
      `UPDATE polls SET
        is_active = FALSE,
        closed_at = NOW(),
        outcome = $1,
        quorum_met = $2,
        results_final = $3
       WHERE id = $4`,
      [outcome, quorumMet, JSON.stringify(resultsFinal), pollId]
    );

    res.json({ ok: true, outcome, quorumMet, total, tally });
  } finally {
    client.release();
  }
}));

// GET /api/elections/:id/certificate — official results certificate
router.get("/:id/certificate", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);

  const client = await pool.connect();
  try {
    const pollResult = await client.query(
      `SELECT p.*, u.display_name as created_by_name FROM polls p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = $1 AND p.is_formal_vote = TRUE`,
      [pollId]
    );
    const poll = (pollResult.rows ?? [])[0];
    if (!poll) { res.status(404).json({ error: "Election not found", code: "NOT_FOUND" }); return; }

    const isClosed = poll.closed_at !== null || new Date(poll.ends_at) < new Date();
    if (!isClosed && !isSteward(req)) {
      res.status(403).json({ error: "Certificate available after vote closes", code: "FORBIDDEN" }); return;
    }

    const tallyResult = await client.query(
      `SELECT choice, COUNT(*)::int as count FROM formal_vote_ballots WHERE poll_id = $1 GROUP BY choice ORDER BY count DESC`,
      [pollId]
    );
    const tally = tallyResult.rows ?? [];
    const total = tally.reduce((s: number, r: any) => s + r.count, 0);

    res.json({
      organization: "Unifor Local 1285",
      voteId: poll.id,
      title: poll.title,
      description: poll.description,
      formalVoteType: poll.formal_vote_type,
      formalVoteTypeLabel: VOTE_TYPE_LABELS[poll.formal_vote_type as FormalVoteType] ?? poll.formal_vote_type,
      openedAt: poll.starts_at,
      closedAt: poll.closed_at ?? poll.ends_at,
      quorumRequired: poll.quorum_required,
      quorumMet: poll.quorum_met,
      totalBallotsCast: total,
      tally,
      outcome: poll.outcome,
      officialResult: poll.outcome ?? "Pending",
      createdBy: poll.created_by_name ?? "Steward",
      certificateGeneratedAt: new Date().toISOString(),
    });
  } finally {
    client.release();
  }
}));

// PATCH /api/elections/:id — update (admin only, before close)
router.patch("/:id", asyncHandler(async (req, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const pollId = parseInt(req.params.id as string, 10);
  const { title, endsAt, quorumRequired, isActive } = req.body ?? {};

  const client = await pool.connect();
  try {
    const pollResult = await client.query(
      `SELECT * FROM polls WHERE id = $1 AND is_formal_vote = TRUE`,
      [pollId]
    );
    const poll = (pollResult.rows ?? [])[0];
    if (!poll) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
    if (poll.closed_at !== null) { res.status(400).json({ error: "Cannot modify a closed vote", code: "ALREADY_CLOSED" }); return; }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
    if (endsAt !== undefined) { updates.push(`ends_at = $${idx++}`); params.push(new Date(endsAt)); }
    if (quorumRequired !== undefined) { updates.push(`quorum_required = $${idx++}`); params.push(quorumRequired); }
    if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); params.push(isActive); }

    if (updates.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    params.push(pollId);
    await client.query(`UPDATE polls SET ${updates.join(", ")} WHERE id = $${idx}`, params);
    res.json({ ok: true });
  } finally {
    client.release();
  }
}));

// DELETE /api/elections/:id — delete (admin only)
router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const pollId = parseInt(req.params.id as string, 10);
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM formal_vote_ballots WHERE poll_id = $1`, [pollId]);
    await client.query(`DELETE FROM formal_vote_cast WHERE poll_id = $1`, [pollId]);
    await client.query(`DELETE FROM polls WHERE id = $1 AND is_formal_vote = TRUE`, [pollId]);
    res.json({ ok: true });
  } finally {
    client.release();
  }
}));

export default router;
