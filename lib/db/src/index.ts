import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.PG_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set.");
}

const neonSql = neon(connectionString);

export const db = drizzle(neonSql, { schema });

export const pool = new Pool({ connectionString });

export * from "./schema";
