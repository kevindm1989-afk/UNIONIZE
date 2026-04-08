import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const stewardCoverageTable = pgTable("steward_coverage", {
  id: serial("id").primaryKey(),
  stewardId: integer("steward_id").notNull(),
  department: text("department").notNull(),
  shift: text("shift", {
    enum: ["days", "afternoons", "nights", "rotating"],
  }).notNull().default("days"),
  areaNotes: text("area_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StewardCoverage = typeof stewardCoverageTable.$inferSelect;
