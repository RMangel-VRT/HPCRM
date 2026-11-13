# Canonical-only estimate setup unit checks

2026-11-12 — Estimate Builder Slice 4.11. No publication or production writes.

## Implementation and baseline

- Verified the predecessor in the checkout: the fourteen `ESTIMATE_UNITS`,
  migration 0085's legacy/canonical union, and the awaited DML-only startup relabel.
- Allocated the unused number **0086**. The new migration replaces only
  `estimate_quick_items_unit_v2_check` and
  `estimate_service_categories_unit_v2_check` with their fresh v3 equivalents.
  Matching Drizzle declarations contain exactly the fourteen canonical values.
- The migration locks both applicable tables in deterministic order, using
  `ACCESS EXCLUSIVE` locks held through commit. It checks **all** rows in both
  tables before altering either check. Failure reports table, ID, company,
  label/name and exact offending value in structured exception detail, with an
  authorized-resolution hint. It performs no INSERT, UPDATE or DELETE.
- Missing target tables/columns are noticed and skipped independently, following
  0085's guard convention. Repeat applications are safe. Transaction failure
  retains the original data/checks.
- Defaults, unrelated constraints and historical migrations are unchanged.
  The startup relabel implementation, route-registration await, advisory lock,
  missing-schema guards and frozen-version locking protections are unchanged.
  Dirty setup data intentionally prevents 0086 from running; the retained
  relabel path can still operate **before** tightening in an older environment.
  Startup does not serve as a deferred repair after tightening.
- No Hardscape/Irrigation checks, estimate-line checks, contract-unit changes,
  frozen-snapshot rewrites, data repairs or migration-runner changes.

## Evidence provenance

**User-supplied production observations**, not checks performed by this executor:
November 12 read-only live API inventory reported 89 quick items (including
inactive), all six categories, and irrigation as canonical. One Hardscape item,
EDG-08, retained `case` and was being corrected by the user. This executor did
not edit or independently query that row; it does not block these two checks.

**Executor development observations:** before tightening, quick items had no rows
and categories had 514 rows, all `1,000 SF`. Both installed unit checks were v2.
The strict migration command applied **only 0086** (99 already up to date, zero
baselined). The known pre-existing checksum warning for
`0074_campaign_service_timing.sql` remained; it was not edited/reapplied.
Afterward both v3 checks were validated and both v2 names were absent.

## Verification

| Check | Result |
|---|---|
| New real PostgreSQL canonical-check suite | **12 passed** |
| Existing relabel, unit-boundary and category-initializer suites | **81 passed** |
| `pnpm run typecheck:libs` | Passed; declarations refreshed |
| API typecheck | 695 diagnostics; none in the new test; not a green whole-API check |
| Required extensions / column schema drift | Passed |
| Script syntax / `git diff --check` | Passed |
| API restart / proxied `/api/healthz` | Running / HTTP 200, `{"status":"ok"}` |
| Signed-out screenshot | Working sign-in screen; no authenticated browser test claimed |

The API diagnostic count matches the predecessor handoff's reported baseline;
an independent unchanged-source diagnostic comparison was not performed here.
Restart logs still contain the previously documented QuickBooks fixture-token
warnings. The bounded log capture did not retain the startup relabel's report;
the isolated tests prove the post-tightening no-op independently.

The new suite executes actual historical SQL **0053, 0078, 0079, 0080
publish-check compatibility, and 0085**. It does not approximate historical
checks. Coverage includes every canonical insert into each table; all alias
keys plus noncanonical case/whitespace variants on INSERT and UPDATE; inactive
cross-company refusal for each table independently; errors reporting both
tables; unchanged rows/checks after refusal; reruns; absent tables/columns;
startup normalization before tightening and byte-preserving no-op afterward.
Real independent transactions demonstrate a pre-existing writer makes preflight
wait and then refuse committed legacy data, and a writer starting while the
migration holds both locks waits and then fails the installed v3 check.
The unchanged predecessor suite also retains both draft/send race regressions.

## Generated SQL and limitations

The **live Publish preview is not claimed**: `explainSchemaDiff` was unavailable
in this assigned-task execution environment. No deployment was initiated.

Local compatibility evidence uses PostgreSQL 16.10 and installed Drizzle Kit
0.31.9:

1. Cloned the entire development **schema only** into three disposable local
   databases (136 tables, 166 non-constraint indexes in the introspected snapshot).
   No customer rows were copied. Applied 0086 to one clone.
2. Introspected both databases with Kit's installed introspector and generated
   their **complete** diff. The retained final capture contains **38 statements**:
   the four expected unit-check statements plus **34 unrelated index statements**.
   An earlier run emitted only four; the index churn is not stable.
3. Attempted **every** emitted statement, in order, in a disposable transaction,
   using savepoints to collect failures, then rolled everything back.
   **14 unrelated CREATE INDEX statements failed with 42804**, assigning
   incompatible operator classes (for example `text_ops` to a smallint).
   Therefore the full generated database diff is **not clean or executable**.
   Nothing in those indexes was changed in the application/development database.
4. Executed all four generated unit-check statements separately. Complete
   PostgreSQL catalog comparisons show this replay exactly matches the migrated
   clone: columns/defaults and index definitions unchanged, all non-unit
   constraints unchanged. The unrelated index statements represent local
   introspection/generation churn, not actual index changes caused by 0086.
5. Also generated a **complete source-to-source** diff from the original HEAD
   declarations to the changed declarations. It contains **exactly four**
   statements: two v2 drops and two v3 additions, with no other source changes.
   Executed all four emitted statements successfully in disposable PostgreSQL.
   [Retained source-generated SQL](canonical-estimate-unit-checks-generated.sql).

The local harness exposes Kit's internal introspector **in memory only**;
installed dependencies are not patched. Its source probe deduplicates identical
exported object references because the existing customer-document compatibility
alias otherwise makes Kit report a duplicate index. A direct `pushSchema` probe
also encountered Kit's unbound-parameter error on a composite primary key; it
was not used as passing evidence. Neither workaround changed project schema
declarations, configuration or dependency versions.

This demonstrates the slice's generated SQL compatibility, not an actual
production-to-development preview or permission to apply unrelated generated
SQL. A read-only preview should be checked from the main workspace before any
future publication, including whether the local index issue is relevant there.

Raw schema-only snapshots, complete diffs, per-statement errors, catalog
comparisons, logs and results are in ignored
`generated-artifacts/canonical-unit-checks/`. The local PostgreSQL cluster was
stopped after verification.

## Reproduction

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/canonicalEstimateUnitChecks.integration.test.ts \
  src/lib/normalizeEstimateUnits.integration.test.ts src/lib/estimateUnits.test.ts \
  src/lib/initializeEmptyServiceCategories.integration.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

For generated SQL, start a disposable PostgreSQL 16 cluster with a `/tmp` Unix
socket on port 55447, then run:

```sh
node scripts/src/verify-canonical-unit-checks.mjs /tmp/hp-canonical-units/socket \
  generated-artifacts/canonical-unit-checks/development-schema-before.sql
```

The optional third argument is a **schema-only pre-tightening** dump. Without
it the script reads current development schema and requires installed v2 checks;
it cannot recreate that baseline from an already-tightened development database.
The source proof defaults to the pre-slice `HEAD` used during this task. After
merge, pass a pre-slice Git reference as the fourth argument.
It executes SQL only on its three named local databases. Do not point it at an
application database. Retain historical SQL unchanged.
