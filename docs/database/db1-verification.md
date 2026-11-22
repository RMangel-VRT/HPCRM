# DB1 verification and remaining parity work

## Status

The Routes SQL rehearsal and read-only object checks passed. Declaration
parity is not complete. The declaration comparison verifies differences
outside DB1's approved names, nullability and missing-declaration scope.
No declarations, historical migrations or managed database structures
were changed in this pass. Production was not accessed directly, and the
read-only Publish preview was unavailable. Do not treat an unavailable
preview as an empty diff.

## Reference and Routes rehearsal

- Verified the direct Development endpoint `ep-square-brook-…` in
  `us-east-2` and its server-reported endpoint in a forced-read-only TLS
  session. The observed public catalog had 140 tables, 1,882 columns,
  627 constraints, 355 indexes and `proposal_number_seq`. Both Routes
  objects were already present.
- Compared the verified Development schema-only export with the retained
  read-only Production export from the resync preflight. Apart from
  platform metadata/physical attribute versions, the logical differences
  were the two agreement columns retired by 0054, the already installed
  Routes pair and the `public` schema comment. Neither the retained
  export nor the current Development catalog came from Drizzle.
- Restored the retained Production application schema into a socket-only
  local cluster. The original Routes readiness function returned `false`.
  Applying the reviewed SQL twice produced no errors. The first catalog
  delta added only `retire_routes_before_customer_delete()` and
  `routes_customer_retirement`; the second produced an identical schema
  dump. The actual `routeSchemaReady()` returned `true` after both runs.
- On that restore, a synthetic physical customer deletion retained the
  route stop and occurrence history, deactivated the deleted customer's
  stop and cancelled only their future `planned` route visit. A past planned
  visit, future completed visit, non-route visit and another customer's
  stop and visit kept their statuses. Normal FK cleanup of the removed
  customer reference still happened. All fixtures were rolled back.

## Shipped in the working changes

- `docs/database/production-sql/`: verbatim, transaction-wrapped migration
  statements and the owner-only runbook.
- `lib/db/src/required-sql-objects.ts`, `scripts/src/check-required-sql-objects.ts`
  and `scripts/src/sql-object-migration-audit.ts`: shared catalog status
  and migration inventory; the existing schema validation now checks both.
  The audit of all migration files found the Routes pair as the only
  surviving SQL-only creations needing registration.
- `artifacts/api-server/src/routes/requiredSqlObjects.ts`,
  `artifacts/highplains-crm/src/components/RequiredSqlObjectsCard.tsx`,
  OpenAPI, build asset copy and Settings integration: admin-only status
  and copy of the exact reviewed SQL for missing objects. The server
  does not accept caller-provided SQL or filenames and does not execute
  remediation SQL. API and frontend permission/state tests cover this.
- `scripts/src/check-declaration-parity.ts` and
  `scripts/src/logical-database-catalog.ts`: repeatable, standalone
  catalog comparison. Only a fresh private local cluster receives the
  offline declaration export. Verified Development is read-only.
  This diagnostic is **not** a required validation gate yet.
- `replit.md` and `.agents/memory/production-schema-parity.md`: owners'
  SQL-only rollout and Development resync rules.

## Declaration differences requiring a decision

The standalone diagnostic compared declarations loaded into newly initialized
local PostgreSQL with the verified live Development catalog. It exited 1
and reported **882 entries**. A renamed constraint or backing index appears
as a missing and an extra name; this number is not a count of proposed
Publish operations. Verified differences beyond name-only work include:

| Object | Verified catalog | Current declarations |
|---|---|---|
| `campaign_items.was_bumped_to_backup` | `text`, default `'false'::text` | `boolean`, default `false`; application code also uses boolean comparisons and writes |
| `settings.default_mailbox_visibility` | Empty JSON object default | A populated shared/personal role policy default |
| `communication_threads.customer_id` and `communication_automation_rules.template_id` | No corresponding FK | `ON DELETE SET NULL` FKs |
| `campaign_items` property/plan indexes | Deployed predicate and plan-category index | One unconditional property index and no matching plan index |
| `proposal_number_seq` | Standalone bigint sequence, increment/start/min/cache 1, max 9223372036854775807, no cycle or column ownership | Missing |

Four public tables are absent from declarations: `_applied_sql_migrations`,
`_chem_notif_legacy_cleanup`, `_migration_audit_log`, and `session`. They are
reported rather than silently excluded. There are also differing defaults,
index ordering/placement, and unique-index versus UNIQUE-constraint
definitions. These findings are separate from the intentionally absent
bootstrap actor FKs and nullable `users.email`, which must stay as deployed.

Resolving all of these requires permission to reconcile the declaration
scope and review affected application paths without changing the live
database. Do not adjust CHECK logic just to make the diagnostic pass.

## Checks

| Check | Result |
|---|---|
| Routes rehearsal | Two clean runs, exact two-object delta, false → true → true readiness, scoped customer deletion passed |
| Registry Node tests | 3 passed |
| API permission and Routes scheduler tests | 6 passed |
| CRM status component tests | 2 passed |
| Development schema and SQL-only status check | Passed; both objects present |
| Scripts typecheck | Passed |
| Root typecheck | Existing failure; 633 diagnostics before and 633 after, no added or removed diagnostics in the baseline comparison |
| Development preview | API and web restarted; status endpoint rejects unsigned requests (401), login page serves (200), and the built SQL asset exactly matches the reviewed file |
| Declaration parity | Expected failure until the scope decision; report above |
| Read-only Publish preview | Unavailable; not published |
