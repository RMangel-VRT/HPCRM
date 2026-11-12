# Estimate Builder Slice 4.8 — restore default service categories

## Scope and predecessor verification

The assigned plan, full attached Slice 4.8 brief, and clarification to preserve
applied migration 0078 govern this work. Inspected the integrated categorized
Services Catalog and search/custom-save implementations and their reports:
`services-catalog.md` and `catalog-search-custom-saves.md`.

Company creation already calls `initializeServiceCategories` within the company
insert transaction and reads `SERVICE_CATEGORY_DEFAULTS`. That path was left
unchanged. The actual startup path awaits `backfillScheduleBy` directly in
`registerRoutes`; the unused startup migration runner is not a viable hook.

No new schema, tables, columns, migrations, UI, dependencies, GET-side seeding,
migration tracking, or migration-runner changes were made. Applied migrations,
including 0078 and both files numbered 0080, remain byte-for-byte unchanged.
No service items were imported or created by the initializer. No unrelated
repairs, direct production changes, or publication were performed.

## Implementation

- `artifacts/api-server/src/lib/initializeEmptyServiceCategories.ts` adds a
  DML-only boot initializer, awaited immediately after `backfillScheduleBy`.
- Uses one explicit READ COMMITTED transaction and dedicated transaction-scoped
  advisory lock **665004** (distinct from scheduling's 664002 / 665003; no prior
  use found in the checkout).
- An `information_schema.columns` preflight checks `public.companies.id` and
  all category columns: id, company_id, name, default_umbrella_key, default_unit,
  sort_order, is_active, created_at and updated_at. Thus both read dependencies
  and written/defaulted columns are covered. Missing tables/columns log the
  exact missing names and a clear skip; return is zero, with no category writes
  and no misleading completion log. Other database errors propagate.
- Eligibility is evaluated **after** obtaining the lock, in a new SQL statement,
  so a waiting instance sees the previous instance's committed inserts.
  `NOT EXISTS` includes every category regardless of name or active state.
- One INSERT SELECT cross joins eligible companies with parameterized values
  from `SERVICE_CATEGORY_DEFAULTS`, with
  `ON CONFLICT (company_id, lower(name)) DO NOTHING`. It never updates existing
  rows or supplies the missing second default for a partial set.
- A data-modifying CTE counts distinct **actually inserted company IDs**, not
  intended companies or category rows. Return value and completion log's
  `seededCompanies` use that count after commit. Repeated startup returns zero.
- New-company initialization stays transactional and unchanged. Historical SQL
  remains self-contained and immutable: a semantic regression executes its
  actual INSERT, the company seed helper, and the boot initializer independently
  against the shared defaults, rather than importing TypeScript into SQL.

Only the initializer, its boot call, focused tests, disposable-database test
helper and this report were added/changed, apart from project memory guidance.

## Migration-by-migration production data audit

Read each complete file; this is a code audit, **not** a production data query.

| Migration | Row initialization / data changes | Production requirement |
|---|---|---|
| `0077_estimate_scope_of_work.sql` | None. Adds nullable `estimate_versions.scope_of_work`. No INSERT/UPDATE/backfill. | Schema publication only; no historical text is manufactured. |
| `0078_estimate_services.sql` | Creates category schema/index and changes item/line constraints; INSERT SELECT seeds General Landscape / Chemical Treatments for companies. No UPDATE. | The category INSERT is the estimate-area data gap addressed here. Boot initializes only wholly empty companies after schema is available. Services themselves are not seeded. |
| `0079_estimate_service_legacy_unit_check.sql` | None. Drops the obsolete automatically named quick-item unit check. | Constraint/schema change only; no production row initialization. |
| `0080_publish_check_compatibility.sql` | None. Replaces quick-item/estimate-line checks and conditionally replaces the legacy service-program check. Catalog queries inside the DO block inspect schema, not business-row initialization. | Constraint/schema changes only; no additional estimate data backfill. |

### Separate Service Calendar migration

`0080_service_calendar.sql` belongs to Service Calendar, not Estimate Builder.
It has **no row INSERT or UPDATE**. It guards and refuses retirement of a
populated `service_programs` table, drops that table only if empty, creates the
new calendar schema/index, and changes the campaign identity constraint.
Its schema/retirement safeguards are not a category-seeding repair. It was
audited separately and not changed or run by this task. No additional
production-required row initialization was found in the requested files; no
repair in another area was proposed or implemented.

## Verification

All new broad-initializer tests run in a uniquely named **disposable database**,
never in the shared company database. The helper creates a new database using
the development connection, supplies an independent pool, and drops it after
the suite; it refuses production mode. CREATE DATABASE permission is required;
missing permission fails explicitly, not by silently skipping tests.
DDL in these test fixtures is not application startup DDL.

| Check | Result |
|---|---|
| New initializer unit tests | **15 passed** |
| New isolated real-PostgreSQL initializer tests | **18 passed** |
| Existing schedule-by unit tests | **2 passed**, unchanged |
| Existing setup/category/company-creation suites | **39 passed**, unchanged, in a separate schema-only cloned disposable database |
| `pnpm run typecheck:libs` | Passed |
| API typecheck with refreshed declarations | **695 existing diagnostics**, no additions or removals against unchanged-source baseline |
| API managed workflow rebuild/restart | Succeeded; current bundle contains the initializer and awaited boot call |
| Proxied `GET /api/healthz` | **200**, `{"status":"ok"}` |
| Existing schema-drift / required-extension workflow | Passed: schema synchronized; required pg_trgm present in development |

New coverage includes first run, exact names/umbrella/unit/order, second-run
row/timestamp preservation, mixed-company isolation, renamed/inactive/custom
single rows, partial default sets, untouched service/line sentinels, missing table,
every missing category column, missing company table/identifier, historical
SQL/default consistency, transactional company-seed rollback, and unrelated
SQL error propagation with full seed rollback.

Concurrency tests use separate real pool connections/transactions. A third
connection holds the advisory lock while both initializers begin. The test
observes **two ungranted advisory locks in pg_locks**, then releases the holder:
the initializers return 2 and 0 for two initially empty companies, leaving two
defaults per company. A second test commits a custom category while both wait
and proves both recheck eligibility and return zero without adding defaults.

The unchanged existing suites exercised actual `storage.createCompany`,
company-creation rollback/duplicates, category API authorization/company scope,
CRUD/defaults/counts and service snapshots:

```sh
# Automatically isolated: safe to invoke against development configuration.
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/initializeEmptyServiceCategories.test.ts \
  src/lib/initializeEmptyServiceCategories.integration.test.ts \
  src/lib/backfillScheduleBy.test.ts --maxWorkers=1 --no-file-parallelism
```

The existing suites were run through the ignored evidence runner
`generated-artifacts/default-service-categories/run-existing-isolated.mjs`,
which copies **schema only** with pg_dump/psql into another disposable database
and sets DATABASE_URL only for the test subprocess:
`estimateSetup.integration.test.ts`, `estimateServices.integration.test.ts`,
and `routes/estimateSetup.test.ts`. Do not run their historical broad migration
seeds against unrelated company data. All disposable databases were dropped.

The initial pre-build typecheck had 881 diagnostics due to stale/missing
library declarations and is not the comparison baseline. After the library
build, an unchanged HEAD source archive with the same declarations produced
695 diagnostics, as did the final tree. Normalized file/location/error-code
comparison, accounting for the two inserted route-file lines, has zero delta.
There are no diagnostics in the new files. API typecheck is **not green** and
was not described as passing or bypassed.

Before restarting the shared development API, a read-only eligibility count
was zero, so this restart could not add category rows to unrelated development
companies. Existing background QuickBooks sync warnings about malformed fixture
tokens were visible in development logs; these are outside this category task
and were not repaired. A signed-out screenshot smoke attempt timed out and
provides no visual evidence; no UI changed and no signed-in browser journey was
claimed. Runtime health, direct integration assertions and the successful
rebuild are the verification for this backend-only change.

Logs, the isolated existing-suite runner and normalized typecheck delta are
retained under ignored `generated-artifacts/default-service-categories/`.
The unchanged-source baseline archive was removed after comparison; no copied
Drizzle configuration or build artifacts were committed.

## Authorized post-publish handoff

This task does **not** publish or perform this production verification.
After Randy publishes the merged code/schema through the normal process:

1. An authorized admin/office user selects each previously empty company.
   Confirm startup did not report a missing-schema skip. The completion
   `seededCompanies` is companies actually seeded; on later instances/restarts,
   zero is expected. Do not expect two rows to be reported as two companies.
2. Open **Estimates → Services Catalog**. Confirm **General Landscape** and
   **Chemical Treatments**, in that order, both active, with default umbrella
   Landscape Labor (`landscape_labor`) and unit `1,000 sq ft`.
3. In that same authenticated company context inspect the network request
   **GET `/api/estimates/service-categories`**, or run this read-only request in
   the app browser console:

   ```js
   const response = await fetch("/api/estimates/service-categories", {
     credentials: "same-origin", cache: "no-store"
   });
   if (!response.ok) throw new Error(`Category check failed: ${response.status}`);
   console.table(await response.json());
   ```

   Expect both category rows with sortOrder 0/1, defaultUmbrellaKey
   `landscape_labor`, defaultUnit `1,000 sq ft`, isActive true and itemCount 0
   unless users have since added services. Check the active company before
   interpreting any response. A 401/403 is an authorization issue, not proof
   the seed failed.
4. Confirm companies that already had any renamed, inactive, custom or lone
   default category retain those exact choices; a partial set intentionally
   stays partial. Subsequent normal startup must not add duplicates or reset
   those choices. Do not delete categories to force a seed.
5. **An empty services list is expected.** This initializes categories only;
   users must add services, or a later approved import must supply them.
   It does not import QuickBooks services or change existing estimate lines.

If an authorized production inspection finds another data gap, report it
separately before proposing or implementing a repair. Do not run development
migrations manually in production, edit migration tracking, add startup DDL,
or repair partially populated category sets as part of this handoff.
