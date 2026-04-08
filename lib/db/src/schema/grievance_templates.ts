import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const grievanceTemplatesTable = pgTable("grievance_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  violationType: text("violation_type", {
    enum: ["discipline", "scheduling", "seniority_bypass", "harassment", "health_safety", "wages", "benefits", "other"],
  }).notNull().default("other"),
  descriptionTemplate: text("description_template").notNull(),
  contractArticle: text("contract_article"),
  defaultStep: integer("default_step").notNull().default(1),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export type GrievanceTemplate = typeof grievanceTemplatesTable.$inferSelect;
