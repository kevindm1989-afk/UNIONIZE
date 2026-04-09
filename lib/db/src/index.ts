import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || process.env.PG_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable must be set.",
  );
}

const isNeon = connectionString.includes("neon.tech");
const isSupabase = connectionString.includes("supabase.com");

export const pool = new Pool({
  connectionString,
  ssl: (isNeon || isSupabase) ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
