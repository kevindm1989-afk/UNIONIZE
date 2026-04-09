import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.PG_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set.");
}

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export * from "./schema";
