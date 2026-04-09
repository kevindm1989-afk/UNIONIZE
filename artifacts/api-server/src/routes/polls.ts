import { Router } from "express";
import { z } from "zod/v4";
import { db, pollsTable, pollResponsesTable, usersTable } from "@workspace/db";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/permissions";
import { sendPushToAll } from "./push";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createPollSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  pollType: z.enum(["yes_no", "multiple_choice"]),
  options: z.array(z.string().min(1)).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  targetRole: z.enum(["all", "member", "steward"]).default("all"),
}).refine(
  (data) => data.pollType !== "multiple_choice" || (data.options && data.options.length >= 2),
  { message: "multiple_choice polls require at least 2 options", path: ["options"] }
);

const updatePollSchema = z.object({
  isActive: z.boolean().optional(),
  endsAt: z.string().datetime().optional(),
  title: z.string().min(1).max(200).optional(),
});

const respondPollSchema = z.object({
  response: z.string().min(1).max(500),
});

// ─────────────────────────────────────────────────────────────────────────────

function fmt(p: typeof pollsTable.$inferSelect) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    pollType: p.pollType,
    options: p.options,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    createdBy: p.createdBy,
    isActive: p.isActive,
    targetRole: p.targetRole,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const role = req.session?.role ?? "member";
  const now = new Date();
  const polls = await db
    .select()
    .from(pollsTable)
    .where(
      and(
        eq(pollsTable.isActive, true),
        lte(pollsTable.startsAt, now),
      )
    )
    .orderBy(pollsTable.endsAt);

  const filtered = polls.filter((p) => {
    if (p.targetRole === "all") return true;
    if (p.targetRole === "member" && role === "member") return true;
    if (p.targetRole === "steward" && role !== "member") return true;
    return false;
  });

  // Attach user's response if any
  const userId = req.session?.userId;
  const withResponse = await Promise.all(filtered.map(async (p) => {
    let userResponse = null;
    if (userId) {
      const [r] = await db.select({ response: pollResponsesTable.response }).from(pollResponsesTable).where(and(eq(pollResponsesTable.pollId, p.id), eq(pollResponsesTable.userId, userId)));
      userResponse = r?.response ?? null;
    }
    return { ...fmt(p), userResponse, isExpired: new Date(p.endsAt) < now };
  }));

  res.json(withResponse);
}));

router.post("/", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  let body: z.infer<typeof createPollSchema>;
  try {
    body = createPollSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }
  const [p] = await db.insert(pollsTable).values({
    title: body.title,
    description: body.description ?? null,
    pollType: body.pollType,
    options: body.options ?? [],
    startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
    endsAt: new Date(body.endsAt),
    createdBy: req.session?.userId ?? null,
    targetRole: body.targetRole,
  }).returning();

  // Push notification to relevant users
  sendPushToAll({
    title: `New Poll: ${p.title}`,
    body: p.description ?? "A new poll is available — tap to vote.",
    url: "/polls",
  }).catch(() => undefined);

  res.status(201).json(fmt(p));
}));

router.post("/:id/respond", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }); return; }

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found", code: "NOT_FOUND" }); return; }
  if (!poll.isActive || new Date(poll.endsAt) < new Date()) {
    res.status(400).json({ error: "Poll is closed", code: "POLL_CLOSED" }); return;
  }

  // Check already voted
  const [existing] = await db.select().from(pollResponsesTable).where(and(eq(pollResponsesTable.pollId, pollId), eq(pollResponsesTable.userId, userId)));
  if (existing) { res.status(409).json({ error: "Already voted", code: "ALREADY_VOTED" }); return; }

  let body: z.infer<typeof respondPollSchema>;
  try {
    body = respondPollSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }

  await db.insert(pollResponsesTable).values({ pollId, userId, response: body.response });
  res.status(201).json({ ok: true });
}));

router.get("/:id/results", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);
  const role = req.session?.role ?? "member";
  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found", code: "NOT_FOUND" }); return; }

  const pollExpired = new Date(poll.endsAt) < new Date();
  if (!pollExpired && role === "member") {
    res.status(403).json({ error: "Results available after poll closes", code: "FORBIDDEN" }); return;
  }

  const responses = await db
    .select({ response: pollResponsesTable.response, count: sql<number>`count(*)::int` })
    .from(pollResponsesTable)
    .where(eq(pollResponsesTable.pollId, pollId))
    .groupBy(pollResponsesTable.response);

  const total = responses.reduce((sum, r) => sum + r.count, 0);
  res.json({ poll: fmt(poll), total, results: responses });
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  let body: z.infer<typeof updatePollSchema>;
  try {
    body = updatePollSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ error: err.message, code: "VALIDATION_ERROR" }); return;
    }
    throw err;
  }
  const updates: Record<string, unknown> = {};
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.endsAt) updates.endsAt = new Date(body.endsAt);
  if (body.title !== undefined) updates.title = body.title;
  const [p] = await db.update(pollsTable).set(updates).where(eq(pollsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  res.json(fmt(p));
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(pollsTable).where(eq(pollsTable.id, id));
  res.json({ ok: true });
}));

export default router;
