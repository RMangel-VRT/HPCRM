import { sql } from "drizzle-orm";
import { pgTable, varchar, text, jsonb, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { companies, customers, users } from "./schema";

export const QBO_REVIEW_KINDS = ["changed_in_qbo", "new_in_qbo", "sub_customer", "qbo_inactive", "qbo_removed", "name_taken", "push_failed"] as const;
export type QboReviewKind = typeof QBO_REVIEW_KINDS[number];
export type QboReviewFields = Record<string, { qbo: unknown; crm: unknown; baseline: unknown; bothChanged: boolean }>;
// Explicit review evidence snapshots, not a second owner of customer billing facts.
export const qboCustomerReviews = pgTable("qbo_customer_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  qboId: text("qbo_id"),
  kind: text("kind").notNull().$type<QboReviewKind>(),
  fields: jsonb("fields").$type<QboReviewFields>(),
  qboSnapshot: jsonb("qbo_snapshot"),
  message: text("message"),
  status: text("status").notNull().default("open").$type<"open" | "resolved" | "dismissed">(),
  resolution: text("resolution"),
  resolvedById: varchar("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  openQbo: uniqueIndex("qbo_customer_reviews_open_qbo").on(t.companyId, t.qboId, t.kind).where(sql`${t.status} = 'open' AND ${t.qboId} IS NOT NULL`),
  openCustomer: uniqueIndex("qbo_customer_reviews_open_customer").on(t.companyId, t.customerId, t.kind).where(sql`${t.status} = 'open' AND ${t.customerId} IS NOT NULL`),
  kind: check("qbo_customer_reviews_kind_check", sql`${t.kind} IN ('changed_in_qbo','new_in_qbo','sub_customer','qbo_inactive','qbo_removed','name_taken','push_failed')`),
  status: check("qbo_customer_reviews_status_check", sql`${t.status} IN ('open','resolved','dismissed')`),
}));
export type QboCustomerReview = typeof qboCustomerReviews.$inferSelect;
