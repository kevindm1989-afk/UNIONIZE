import bcrypt from "bcryptjs";
import { db, usersTable, rolePermissionsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Local1285!";
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "Administrator";

export const ALL_PERMISSIONS = [
  "members.view",
  "members.edit",
  "grievances.view",
  "grievances.file",
  "grievances.manage",
  "bulletins.view",
  "bulletins.post",
  "bulletins.manage",
  "documents.view",
  "documents.upload",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const STEWARD_DEFAULT: Permission[] = [
  "members.view",
  "members.edit",
  "grievances.view",
  "grievances.file",
  "bulletins.view",
  "bulletins.post",
  "documents.view",
];

export async function ensureAiTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

export async function ensureSessionTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "sid" VARCHAR NOT NULL COLLATE "default",
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");
    `);
  } finally {
    client.release();
  }
}

export async function seedAdminUser(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, ADMIN_USERNAME))
      .limit(1);

    if (existing) return;

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await db.insert(usersTable).values({
      username: ADMIN_USERNAME,
      passwordHash,
      displayName: ADMIN_DISPLAY_NAME,
      role: "admin",
      isActive: true,
    });

    logger.info(
      { username: ADMIN_USERNAME },
      "Admin user seeded — change the password immediately via ADMIN_PASSWORD env var"
    );
  } catch (err) {
    logger.error({ err }, "seedAdminUser failed");
    throw err;
  }
}

export async function seedDefaultPermissions(): Promise<void> {
  try {
    const chairRows = ALL_PERMISSIONS.map((p) => ({
      role: "chair",
      permission: p,
      granted: true,
    }));
    const stewardRows = ALL_PERMISSIONS.map((p) => ({
      role: "steward",
      permission: p,
      granted: STEWARD_DEFAULT.includes(p as Permission),
    }));

    for (const row of [...chairRows, ...stewardRows]) {
      await db.insert(rolePermissionsTable).values(row).onConflictDoNothing();
    }

    logger.info("Default role permissions seeded");
  } catch (err) {
    logger.error({ err }, "seedDefaultPermissions failed");
  }
}

export async function loadUserPermissions(role: string): Promise<string[]> {
  if (role === "admin") return [...ALL_PERMISSIONS];

  try {
    const rows = await db
      .select({ permission: rolePermissionsTable.permission, granted: rolePermissionsTable.granted })
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.role, role));

    return rows.filter((r) => r.granted).map((r) => r.permission);
  } catch {
    return [];
  }
}
