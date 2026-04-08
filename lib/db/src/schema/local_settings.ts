import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const localSettingsTable = pgTable("local_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LocalSetting = typeof localSettingsTable.$inferSelect;
