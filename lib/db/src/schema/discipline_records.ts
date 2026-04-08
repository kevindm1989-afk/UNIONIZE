import { pgTable, serial, integer, text, date, boolean, timestamp } from "drizzle-orm/pg-core";

export const disciplineRecordsTable = pgTable("discipline_records", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull(),
  disciplineType: text("discipline_type", {
    enum: ["verbal_warning", "written_warning", "suspension_paid", "suspension_unpaid", "termination", "other"],
  }).notNull().default("verbal_warning"),
  incidentDate: date("incident_date").notNull(),
  issuedDate: date("issued_date").notNull(),
  description: text("description").notNull(),
  responseFiled: boolean("response_filed").notNull().default(false),
  grievanceId: integer("grievance_id"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DisciplineRecord = typeof disciplineRecordsTable.$inferSelect;
