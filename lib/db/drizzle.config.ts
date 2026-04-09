import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString = process.env.DATABASE_URL || process.env.PG_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
