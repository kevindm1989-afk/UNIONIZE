import { pgTable, serial, integer, text, date, timestamp } from "drizzle-orm/pg-core";

export const memberCommunicationLogTable = pgTable("member_communication_log", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull(),
  memberId: integer("member_id"),
  loggedBy: integer("logged_by").notNull(),
  loggedByName: text("logged_by_name"),
  contactMethod: text("contact_method", {
    enum: ["in_person", "phone", "text", "email", "voicemail", "no_answer"],
  }).notNull().default("in_person"),
  summary: text("summary").notNull(),
  contactDate: date("contact_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MemberCommunicationLog = typeof memberCommunicationLogTable.$inferSelect;
