import { pgTable, text, serial, timestamp, boolean, integer, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("steward"),
  isActive: boolean("is_active").notNull().default(true),
  linkedMemberId: integer("linked_member_id"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  // Legacy fields (keep for backward compat)
  name: text("name").notNull(),
  username: text("username").notNull(),
  reason: text("reason"),
  // Enhanced fields (nullable for old rows)
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  employeeId: text("employee_id"),
  department: text("department"),
  shift: text("shift"),
  message: text("message"),
  // Role request fields
  requestedRole: text("requested_role"),
  roleJustification: text("role_justification"),
  approvedRole: text("approved_role"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by"),
  // Status + timestamps
  status: text("status").notNull().default("pending"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    granted: boolean("granted").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.role, t.permission] })]
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export const insertAccessRequestSchema = createInsertSchema(accessRequestsTable).omit({
  id: true,
  status: true,
  reviewedAt: true,
  reviewedBy: true,
  rejectionReason: true,
  createdAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AccessRequest = typeof accessRequestsTable.$inferSelect;
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
