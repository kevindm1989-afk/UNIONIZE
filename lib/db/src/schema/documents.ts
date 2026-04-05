import { pgTable, serial, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  filename: varchar("filename", { length: 255 }).notNull(),
  objectPath: varchar("object_path", { length: 512 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull().default("application/pdf"),
  fileSize: varchar("file_size", { length: 50 }),
  isCurrent: boolean("is_current").notNull().default(true),
  effectiveDate: varchar("effective_date", { length: 20 }),
  expirationDate: varchar("expiration_date", { length: 20 }),
  notes: text("notes"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
