import { pgTable, serial, integer, text, date, timestamp, index } from "drizzle-orm/pg-core";

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
}, (table) => ({
  grievanceIdIdx: index("comms_grievance_id_idx").on(table.grievanceId),
  memberIdIdx: index("comms_member_id_idx").on(table.memberId),
}));

export type MemberCommunicationLog = typeof memberCommunicationLogTable.$inferSelect;
