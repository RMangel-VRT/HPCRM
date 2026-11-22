import { sql } from "drizzle-orm";
import { index, integer, json, pgSequence, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// These relations already exist in the managed catalog. These declarations
// describe their shape for parity; ownership stays with their current writers.
export const appliedSqlMigrations = pgTable("_applied_sql_migrations", {
  filename: text("filename").primaryKey(),
  checksum: text("checksum").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chemicalNotificationLegacyCleanup = pgTable("_chem_notif_legacy_cleanup", {
  companyId: varchar("company_id").primaryKey(),
  removedRulesCount: integer("removed_rules_count").notNull().default(0),
  removedTemplatesCount: integer("removed_templates_count").notNull().default(0),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export const migrationAuditLog = pgTable("_migration_audit_log", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  runByUserId: text("run_by_user_id").notNull(),
  runByEmail: text("run_by_email").notNull(),
  filesApplied: text("files_applied").array().notNull().default(sql`'{}'::text[]`),
  filesFailed: text("files_failed").array().notNull().default(sql`'{}'::text[]`),
  filesDrifted: text("files_drifted").array().notNull().default(sql`'{}'::text[]`),
});

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, table => [index("IDX_session_expire").on(table.expire)]);

export const proposalNumberSequence = pgSequence("proposal_number_seq");
