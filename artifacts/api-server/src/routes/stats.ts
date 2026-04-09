import { Router } from "express";
import { db, grievancesTable, membersTable } from "@workspace/db";
import { sql, desc, count, isNotNull, eq, gte, and } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.use(requireSteward);

router.get("/overview", asyncHandler(async (_req, res) => {
  // Q1 — Grievances by status (typed group-by, reshaped below)
  const byStatus = await db
    .select({
      status: grievancesTable.status,
      count: count(),
    })
    .from(grievancesTable)
    .groupBy(grievancesTable.status);

  // Q2 — Grievances by department
  const byDepartment = await db
    .select({
      department: membersTable.department,
      count: count(),
    })
    .from(grievancesTable)
    .leftJoin(membersTable, eq(grievancesTable.memberId, membersTable.id))
    .groupBy(membersTable.department)
    .orderBy(desc(count()));

  // Q3 — Top 5 contract articles
  const byArticle = await db
    .select({
      contractArticle: grievancesTable.contractArticle,
      count: count(),
    })
    .from(grievancesTable)
    .where(isNotNull(grievancesTable.contractArticle))
    .groupBy(grievancesTable.contractArticle)
    .orderBy(desc(count()))
    .limit(5);

  // Avg days to resolution by step (sql helpers for extract/round)
  const avgResolution = await db
    .select({
      step: grievancesTable.step,
      avgDays: sql<number>`round(avg(extract(epoch from (${grievancesTable.resolvedDate}::timestamptz - ${grievancesTable.filedDate}::timestamptz)) / 86400))::int`,
    })
    .from(grievancesTable)
    .where(
      and(
        eq(grievancesTable.status, "resolved"),
        isNotNull(grievancesTable.resolvedDate),
      )
    )
    .orderBy(grievancesTable.step);

  // Q4 — Monthly trend last 12 months (to_char preserves YYYY-MM format)
  const monthlyTrend = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${grievancesTable.filedDate}::timestamptz), 'YYYY-MM')`,
      count: count(),
    })
    .from(grievancesTable)
    .where(gte(grievancesTable.filedDate, sql`(now() - interval '12 months')::date`))
    .groupBy(sql`date_trunc('month', ${grievancesTable.filedDate}::timestamptz)`)
    .orderBy(sql`date_trunc('month', ${grievancesTable.filedDate}::timestamptz)`);

  // Reshape Q1 into the original statusCounts structure (preserves response shape)
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)]));
  const statusCounts = {
    total: byStatus.reduce((sum, r) => sum + Number(r.count), 0),
    open: statusMap["open"] ?? 0,
    pending_response: statusMap["pending_response"] ?? 0,
    pending_hearing: statusMap["pending_hearing"] ?? 0,
    resolved: statusMap["resolved"] ?? 0,
    withdrawn: statusMap["withdrawn"] ?? 0,
  };

  res.json({
    statusCounts,
    byDepartment,
    byContractArticle: byArticle,
    avgDaysToResolution: avgResolution,
    monthlyTrend,
  });
}));

export default router;
