import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";

export async function logAudit(
  req: Request,
  action: "create" | "update" | "delete",
  entityType: "member" | "grievance",
  entityId: number,
  oldValue?: Record<string, unknown> | null,
  newValue?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: req.session?.userId ?? null,
      action,
      entityType,
      entityId,
      oldValue: (oldValue ?? null) as unknown as Record<string, unknown>,
      newValue: (newValue ?? null) as unknown as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });
  } catch {
    // Never let audit logging failure affect the main request
  }
}
