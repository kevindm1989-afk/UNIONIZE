import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

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
}, (table) => ({
  grievanceIdIdx: index("journal_grievance_id_idx").on(table.grievanceId),
  authorIdIdx: index("journal_author_id_idx").on(table.authorId),
  createdAtIdx: index("journal_created_at_idx").on(table.createdAt),
}));

export type CaseJournalEntry = typeof caseJournalTable.$inferSelect;
