# Publish CHECK compatibility verification

Date: 2026-11-11. No publishing or production mutations were performed.

## Changes

- Renamed the existing widened estimate declarations, without changing their expressions:
  - `estimate_quick_items_kind_check` → `estimate_quick_items_kind_v2_check`
  - `estimate_lines_type_check` → `estimate_lines_type_v2_check`
- Added `.migration-backup/migrations/0080_publish_check_compatibility.sql`.
  It drops the old estimate names with `IF EXISTS`, adds the replacements only
  if absent, and corrects the legacy program check only if that table still exists.
- Replaced the legacy program predicate's outer `COALESCE(predicate, false)` with
  `(predicate) IS TRUE`. Both reject false and NULL; no validity rule was relaxed.
  The browser schema already imports that shared predicate. The two estimate
  CHECK declarations have no separate client mirror.
- Added `.migration-backup/migrations/0081_service_calendar_publish_check.sql`.
  It preserves the installed calendar predicate, enclosing it in `IS TRUE` so
  Publish introspection emits valid inline SQL. It neither creates the calendar
  nor recreates the retired program table, and fails rather than inventing a
  missing calendar constraint.
- Added `scripts/src/verify-publish-checks.mjs`, an isolated, repeatable SQL
  regression proof. It never reads `DATABASE_URL`, uses only a `/tmp` Unix socket
  on its dedicated test port, and copies schema definitions, not production data.

Both migrations were applied to development using the existing strict runner.
No application feature, production data, deploy configuration, or startup DDL
was changed.

## Concurrent SC1 integration

At the first actual Publish preview, the development database still contained
`service_programs`; its generated CREATE TABLE reproduced the reported doubled
`CHECK (CHECK (...)` syntax error.

While this work was underway, SC1 applied `0080_service_calendar.sql` to the
shared development database, retiring `service_programs` and creating
`service_calendar`. SC1's source was not yet in this checkout. The new calendar
had the same leading-COALESCE introspection failure, so it received the separate
0081 compatibility migration. No SC1 source was guessed or overwritten.

The final actual Publish preview contains **no service_programs CREATE TABLE**.
That is correct: the table is retired, not recreated for this fix. Its replacement
calendar CREATE TABLE is now valid and was executed in the isolated test.

SC1 integration must retain 0081. Future schema push operations must preserve
the calendar's round-trip-safe boolean wrapper instead of restoring a leading
`CHECK (COALESCE(...))` shape. Normal migration-based setup applies 0081 after SC1.

## Same-name expression audit

Read-only production catalog inspection confirmed that production's existing
kind/type checks still exclude `service`. Production has the pre-campaign
schema shape: no program/calendar table or estimate service categories.

Reviewed the pending migration range 0074–0079 against production's installed
CHECK names and definitions:

| Migration | CHECK changes | Result |
| --- | --- | --- |
| 0074 | Program validity, campaign identity, visit campaign identity | New constraints, not changed production checks |
| 0075 | None | No same-name expression changes |
| 0076 | None | No same-name expression changes |
| 0077 | None | No same-name expression changes |
| 0078 | Estimate kind, line type, units, category relationship; new service-category table checks | Kind/type needed new names; unit widening already has a different name from production's automatic `default_unit` check; relationship and category checks are new |
| 0079 | Removes historical automatic unit CHECK | Already handled; no expression change |

**No additional same-name expression changes affecting installed production
checks were found in that range.** The separate calendar inline-SQL defect was
found and corrected as described above.

The existing runner also warned that historical migration 0074's checksum
differs from its applied version. This work did not edit or reapply that file,
baseline the warning away, or alter historical migration tracking.

## Generated SQL evidence

These estimate statements are copied from the actual final Publish diff:

```sql
ALTER TABLE "estimate_quick_items" DROP CONSTRAINT "estimate_quick_items_kind_check";
ALTER TABLE "estimate_lines" DROP CONSTRAINT "estimate_lines_type_check";
ALTER TABLE "estimate_quick_items" ADD CONSTRAINT "estimate_quick_items_kind_v2_check" CHECK (kind = ANY (ARRAY['equipment'::text, 'fee'::text, 'service'::text]));
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_type_v2_check" CHECK (line_type = ANY (ARRAY['plant'::text, 'hardscape'::text, 'irrigation'::text, 'labor'::text, 'service'::text, 'equipment'::text, 'fee'::text, 'custom'::text]));
```

The actual replacement calendar CREATE TABLE is preserved in
[publish-check-constraints-generated.sql](publish-check-constraints-generated.sql).
Its validity constraint has a single `CHECK`, with the original COALESCE
predicate followed by `IS TRUE`. The final diff has no doubled CHECK statements.

Raw captures and test output are in the ignored
`generated-artifacts/publish-checks/` directory:
`production-catalog.json`, `publish-before.json`, `publish-after.json`,
`generated-affected.sql`, `results.json`, `test-results.log`, and
`typecheck-libs.log`. These contain schema/test evidence, not customer rows.

## Verification results

An isolated PostgreSQL 16 database was reconstructed from today's read-only
production catalog: **133 tables, 582 constraints**, plus indexes and sequences.
Every reconstructed production CHECK definition matched the captured definition
exactly. No production rows were copied.

- Original malformed program CREATE TABLE: rejected with PostgreSQL `42601`,
  proving the initial reported failure.
- Applied **16 actual final Publish statements** for the four affected tables:
  calendar, estimate service categories, quick items, and estimate lines.
- Service quick item: inserted successfully.
- Service estimate line: inserted successfully.
- Invalid quick-item kind and invalid estimate line type: rejected with `23514`.
- Calendar: accepted two native mow rounds and a recurring native beauty-band
  entry, with independent per-kind positions. Rejected incompatible kinds and
  services, February 29, equal dates, invalid positions, and untrimmed names.
- Historical program predicate: zero result differences in **144 combinations**,
  including NULL inputs, compared with the original COALESCE rule. Valid input
  inserted; invalid keys, sums, array shape, NULL elements, and bounds rejected.
- Both new migrations: safe on repeated execution.
- Missing/retired tables: safely skipped, never recreated.
- Synthetic insert fixtures were rolled back. Foreign-key triggers were
  disabled **only inside the disposable fixture transaction** to test CHECK
  behavior without copying production parent records; CHECKs remained active.
  All generated foreign-key DDL was applied normally beforehand.
- `pnpm run typecheck:libs`: passed.
- `node --check scripts/src/verify-publish-checks.mjs`: passed.
- `git diff --check`: passed.
- Frontend workflow restarted and sign-in page rendered.
- API initially exceeded its startup timeout while processing existing company
  backfills; a restart with a longer wait succeeded and `/api/healthz` returned
  HTTP 200. Existing development integration-test companies also emitted QBO
  token-decode warnings in background jobs; those were not modified by this fix.

This verifies the requested constraint changes, **not every unrelated pending
feature migration**. The Publish preview still warns about adding campaign and
campaign-item composite unique constraints. This work did not truncate anything
or resolve those prompts on the user's behalf.

## Reproduction

Capture production catalog definitions read-only and the actual before/after
Publish schema diffs into the ignored evidence directory. Start an isolated
PostgreSQL cluster with a `/tmp` Unix socket on port 55439, then run:

```sh
node scripts/src/verify-publish-checks.mjs /tmp/hp-publish-checks/socket generated-artifacts/publish-checks
```

The harness drops/recreates **only its named test database in that isolated
cluster**. Never point it at a development or production application database.
