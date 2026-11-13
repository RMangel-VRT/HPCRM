# Hardscape category correction

## Integrated boundaries

Reviewed the existing Hardscape operations handoff and unified-estimate-units
handoff against the checkout. The historical creation migration and Drizzle
Hardscape category declaration had **no category default**; create validation
required category. Storage injected lowercase `general`; the dialog also
injected a fixed suggestion list. This change targets those actual boundaries,
not unrelated catalogs or other `general` defaults.

## Behavior

- Built-in default is `General` in new forms, API create validation, server
  insert validation, the frontend insert mirror and the database declaration.
- Explicit empty/whitespace/null category inputs remain invalid. PATCH fields
  have no category default, so omitted categories never reset an existing row.
- A driver-free shared helper merges categories case-insensitively. It sorts
  stored spellings in code-point order before choosing one per lowercase
  identity, making the choice independent of query order or process locale.
  Stored values win over the injected fallback. The General-equivalent entry
  sorts first, regardless of its retained spelling.
- API responses, chips and add/edit suggestions use that policy. No obsolete
  suggestion such as `rock_cobble` is injected. A company that actually stores
  that category can still use it.
- Selecting a chip matches all case variants using a company-scoped lowercase
  comparison. Existing edit fields and item rows keep their original spelling.
  No category rename, normalization or backfill was added.
- Existing authorization, company-binding request headers, no-store responses,
  scoped query keys, cancellation and scope-reset behavior remain intact.

## Migration and release

`0086_hardscape_category_default.sql` was unused when allocated. It is guarded
by table/column existence and can run repeatedly. Its **only schema change** is
`ALTER TABLE public.hardscape_catalog_items ALTER COLUMN category SET DEFAULT
'General'`. There are no row updates, timestamp changes, startup DDL,
migration-runner changes or edits to historical SQL.

The new migration was executed only in disposable PostgreSQL databases in this
task, not against the shared development catalog or production. The normal
strict post-merge migration process must apply it to development. Production
schema promotion remains the normal user-controlled Publish process, with the
default-only difference reviewed there. Nothing was published or mutated in
production.

## Verification

Evidence logs are retained locally under ignored
`generated-artifacts/hardscape-categories/`.

| Check | Result |
| --- | --- |
| Shared category/default/PATCH contract tests | 2 passed |
| New isolated PostgreSQL category/migration tests | 4 passed |
| Actual HTTP catalog and canonical-unit regressions | 37 passed |
| Existing storage and CSV regressions | 39 passed |
| Existing CRM rendered suite plus new category checks | 29 passed |
| Shared library declaration refresh | Passed |
| API typecheck after refreshed declarations | 695 existing diagnostics; no added file/error-code pairs |
| CRM typecheck | 213 existing diagnostics; unchanged file/error-code pairs |
| Managed API and CRM restarts | Both running |
| Proxied Vite Hardscape page transformation | HTTP 200 |
| Anonymous catalog access | HTTP 401 |

Backend total is **82 passing checks** across the final targeted runs; CRM total
is **29 passing checks**. Whole-project typechecks are not green. The initial
API capture included two transient stale-declaration diagnostics while the new
shared helper was introduced; refreshing declarations removed those. No changed
Hardscape source/test file has a final API diagnostic. The final diagnostic
multiset adds nothing to the initial capture.

Database tests execute the actual historical Hardscape creation SQL in an
isolated database. The new migration runs with no table, with a table lacking
category, and twice on the real table. Full row JSON text, including timestamps
with microsecond precision, is identical before/after. Column metadata changes
only for the category default. Both Drizzle and raw SQL omitted-column inserts
return `General`. Storage checks cover empty/all-General companies, stored
lowercase General, deterministic mixed-case merges, inactive categories,
case-insensitive filtering and cross-company exclusion.

Rendered checks exercise actual CRM chips, add/edit input values and datalist
suggestions, category requests with company headers, old-company suggestion
removal, and the existing CRUD/import/export/cancellation regressions. Both
screenshot attempts timed out during capture; no authenticated visual screenshot
or end-to-end browser journey is claimed. Rendered interaction checks plus the
successful proxied module transformation provide the UI evidence.

## Minimal fixture corrections

The pre-correction API suites reproduced **13 failed / 23 passed**, and the CRM
suite **11 failed / 12 passed**, as documented by the unit handoff. Legacy auth
fixtures supplied `activeRole` but omitted the actual gate's `accessRole`.
Fixtures now supply both, including company switches; production role gates
were not loosened. One stale API default-unit expectation now expects canonical
`EA`. Existing storage regressions now run in a disposable database with only
their required company fixture, rather than touching shared companies.

These are the minimal corrections needed to exercise this task's focused
coverage. Broader old Hardscape fixture repair remains separately queued; no
duplicate follow-up or unrelated test-repair project was added.

Reproduce the focused checks:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/hardscapeCategories.test.ts src/lib/hardscapeCategories.integration.test.ts \
  src/lib/hardscapeStorage.integration.test.ts src/lib/csv.test.ts \
  src/routes/catalog.test.ts src/routes/catalogUnits.test.ts \
  --maxWorkers=1 --no-file-parallelism
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/HardscapeCatalog.rendered.test.tsx
```
