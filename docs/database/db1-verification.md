# DB1 verification and remaining parity work

## Status

The Routes rehearsal, read-only object check and declaration parity passed.
The read-only Publish preview returned **zero SQL statements** and no
structural data loss. The Routes trigger and function are SQL-only and are
not accounted for by that preview. No historical migrations or managed
database schemas were changed, and nothing was published.

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
  The existing `schema-drift` validation now runs this check.
- `replit.md` and `.agents/memory/production-schema-parity.md`: owners'
  SQL-only rollout and Development resync rules.

## Declaration alignment and compatibility

The initial comparison reported 882 catalog diff entries, including both
sides of renamed constraints and backing indexes. After approval to align
the broader definitions in code, the same comparison exited **0 with no
differences**, excluding only the registered SQL-only objects and
extension-owned objects. No managed schema push was used.

- Declared the exact constraint and index names, FK targets and actions,
  defaults, nullability, index predicates and ordering. The deployed
  chemical-product FK stays `ON DELETE SET NULL`. The three historically
  absent `campaign_items` actor FKs stay absent, and `users.email` stays
  nullable. The service-calendar declaration deparses to the exact deployed
  CHECK expression; its acceptance logic did not change.
- Declared the session store, three migration/cleanup bookkeeping tables
  and the standalone bigint `proposal_number_seq` with no column ownership.
  Existing ownership and writers did not change.
- The legacy campaign flag uses a text column mapper to keep boolean API
  values. The deployed nullable communication subject is handled in list,
  search and reply paths. Mailbox access still uses its existing fallback
  policy when the stored policy is `{}`.
- Ticket completion crew and photo arrays are `NOT NULL` with an empty
  default. Direct inserts either provide arrays or use the database
  default, UI completion calls submit arrays, and explicit null is rejected
  at the input boundary rather than clearing existing values. The client
  copy matches those array builders and input validators.

PostgreSQL combines identically defined inline UNIQUE constraints within
one `CREATE TABLE`. Twelve deployed names are secondary copies of
equivalent declarations. The disposable replay applies those matched
definitions separately before dependent foreign keys, using only the names
and definitions emitted by Drizzle. This does not remove duplicates from
either catalog or perform a managed rebuild. Raw `drizzle-kit export` fed
directly to PostgreSQL does not preserve these secondary names on its own.

## Checks

| Check | Result |
|---|---|
| Routes rehearsal | Two clean runs, exact two-object delta, false → true → true readiness, scoped customer deletion passed |
| Migration audit, disposable export replay and column adapter tests | 7 passed |
| API permissions, Routes scheduler, mailbox scope and Conversations | 21 passed; database integration tests ran on a fresh socket-only restore |
| CRM status component tests | 2 passed |
| Development schema, extensions and SQL-only status | Passed; both objects present |
| Library and scripts typecheck | Passed |
| Root typecheck | Still fails on existing workspace errors: 633 diagnostics before and 595 after. The three differently worded diagnostics are the same existing Zod error-member references on the same lines. A separate CRM typecheck also still fails. |
| Development preview | API and web restarted; status endpoint rejects unsigned requests (401), login page serves (200), and the built SQL asset exactly matches the reviewed file |
| Declaration parity | Passed; no remaining logical differences within comparison scope |
| Read-only Publish preview | 0 statements; no structural data loss; not published |

## Owner-only next step

Inspect the Publish preview again when ready. Stop if it proposes any
`DROP`. Follow the reviewed SQL runbook for the owner-only Production
install, then verify both objects in Settings → Database and check for
new route visits after the next overnight fill. DB1 did not do those steps.
