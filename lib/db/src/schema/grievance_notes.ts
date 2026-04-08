import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const grievanceNotesTable = pgTable("grievance_notes", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  userId: integer("user_id"),
  authorName: text("author_name"),
  content: text("content").notNull(),
  noteType: text("note_type").notNull().default("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GrievanceNote = typeof grievanceNotesTable.$inferSelect;
