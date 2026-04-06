import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const MEMBER_FILE_CATEGORIES = ["general", "discipline", "grievance"] as const;
export type MemberFileCategory = (typeof MEMBER_FILE_CATEGORIES)[number];

export const memberFilesTable = pgTable("member_files", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => membersTable.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  filename: varchar("filename", { length: 255 }).notNull(),
  objectPath: varchar("object_path", { length: 512 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull().default("application/octet-stream"),
  fileSize: integer("file_size"),
  description: text("description"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MemberFile = typeof memberFilesTable.$inferSelect;
