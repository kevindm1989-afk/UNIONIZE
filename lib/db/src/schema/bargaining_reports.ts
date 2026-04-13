import { pgTable, text, serial, timestamp, jsonb, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bargainingReportsTable = pgTable("bargaining_reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  issuesData: jsonb("issues_data"),
  reportData: jsonb("report_data"),
  editedLanguage: jsonb("edited_language"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBargainingReportSchema = createInsertSchema(bargainingReportsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateBargainingReportSchema = insertBargainingReportSchema.partial();

export type InsertBargainingReport = z.infer<typeof insertBargainingReportSchema>;
export type BargainingReport = typeof bargainingReportsTable.$inferSelect;
