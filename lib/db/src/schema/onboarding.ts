import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const onboardingChecklistsTable = pgTable("onboarding_checklists", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().unique(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cardSigned: boolean("card_signed").notNull().default(false),
  duesExplained: boolean("dues_explained").notNull().default(false),
  cbaProvided: boolean("cba_provided").notNull().default(false),
  stewardIntroduced: boolean("steward_introduced").notNull().default(false),
  rightsExplained: boolean("rights_explained").notNull().default(false),
  benefitsExplained: boolean("benefits_explained").notNull().default(false),
  completedAt: timestamp("completed_at"),
});

export type OnboardingChecklist = typeof onboardingChecklistsTable.$inferSelect;
