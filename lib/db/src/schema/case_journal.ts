import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const caseJournalTable = pgTable("case_journal_entries", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name"),
  entryType: text("entry_type", {
    enum: ["note", "call", "meeting", "email", "management_contact"],
  }).notNull().default("note"),
  content: text("content").notNull(),
  isPrivate: boolean("is_private").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CaseJournalEntry = typeof caseJournalTable.$inferSelect;
