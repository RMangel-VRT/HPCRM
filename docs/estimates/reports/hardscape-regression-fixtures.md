# Hardscape regression fixture verification

## Scope and integrated baseline

Part 2 only of
`attached_assets/Pasted--Estimates-cleanup-dashboard-Estimates-tile-matches-the_1794525983916.txt`.
Reviewed that complete brief, the unified-estimate-units (4.9) and quick-item-csv
(4.10) reports, and the integrated category correction and its handoff in
`hardscape-category-duplicates.md`. The starting checkout already includes
`5130c055` (Hardscape category correction); no wait or duplicate category
implementation was necessary.

The historical 13 API / 11 rendered failures are **not the starting result of
this task**. The category predecessor already supplied `accessRole` in both
legacy fixtures (including company switches), corrected the API create default
unit to `EA`, and added its focused General/category coverage. Running both
complete old suites unchanged, with their artifact-local launchers, produced:

| Initial check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `routes/catalog.test.ts` | 20 | 0 | 0 |
| `pages/HardscapeCatalog.rendered.test.tsx` | 29 | 0 | 0 |

Initial output is retained in ignored
`generated-artifacts/hardscape-regressions/api-initial.log` and
`rendered-initial.log`. This is an integrated-baseline verification and
fixture/coverage hardening, not a claim to have newly fixed those historical
failures.

## Test-only changes

- API users now retain their membership `activeRole` and derive `accessRole`
  using the same browser-safe projection called by `auth.ts`. In particular,
  an account manager stays `activeRole: account_manager` with
  `accessRole: admin`, without becoming a super-admin. Signed-out requests
  have no `req.user`; signed-in fixtures also supply tags and super-admin state.
- All six endpoint guards still check signed-out users and every denied role,
  with no storage calls. Missing-company and stale-company checks now cover
  admin, office and account manager. The gate and upload middleware are real,
  not mocked or bypassed.
- Allowed list/export coverage includes account managers. List results now
  carry the requested company's ID instead of returning a company-A row for
  a company-B request. Additional allowed-role tests bind create, PATCH,
  deactivate and CSV import storage calls to company B.
- Rendered users share a resolved-context factory, including switches that
  preserve membership identity. Added real `ProtectedRoute` interactions with
  the admin/office allow-list used in `App.tsx`: all three allowed identities,
  all eight denied identities, and signed-out users. Denied/signed-out cases
  assert the actual memory-router redirect and that no fetch occurs.
  This exercises the real guard plus catalog, not a full `App` browser test.
- Added cancel/reopen checks for add and edit, with zero writes. The existing
  deactivate/reactivate test previously stopped after DELETE; it now includes
  inactive rows, supplies stateful responses, clicks Reactivate, checks the
  company-bound PATCH `{ isActive: true }`, and waits for the active-row action.
- Retained every existing rail expectation and added explicit checks for
  board selection, Builder, Plant Library children, Matches and the settled
  Action Center empty state. Its team fixture now returns the correct array
  shape for `/api/companies/users`, rather than a catalog response.
- The nearby canonical-unit rendered fixture now supplies resolved admin
  access, tags and super-admin state as well as membership/company identity.

All focused category tests from the predecessor are unchanged: General
defaults, explicit blank rejection, stored case retention, deterministic
deduplication, suggestions, chip filtering and old-company suggestion removal.
Existing CRUD errors, partial updates, immutable umbrella/server-owned tenant,
duplicate and missing IDs, text/JSON/multipart CSV, row failures, oversize API
uploads, real `apiRequest`, debounced search, canonical-unit handling,
English validation/import copy and Spanish page copy remain covered. Existing
list/export aborts and late import/save suppression after company switches
remain intact.

## Obsolete behavioral assertion ledger

**No existing behavioral assertion was removed, weakened or changed to a
different expected product behavior in this task.** The integrated baseline
already passes against today's layout, so there is no obsolete rail assertion
to rewrite. Added expectations strengthen the existing tests.

For clarity, the inherited correction relevant to the old failures is listed
individually below; it is not part of this task's diff:

| Assertion | Prior expectation | Current intended behavior | Supporting implementation / contract |
| --- | --- | --- | --- |
| API create with omitted unit | Lowercase `ea` | Canonical `EA` reaches storage | `createHardscapeBody` in `api-server/src/lib/hardscapeCsv.ts`, the shared canonical unit contract, and `unified-estimate-units.md`; predecessor changed the expectation |

Other fixture repairs do not redefine behavior:

| Fixture / existing assertion | Prior setup | Current intended behavior / evidence |
| --- | --- | --- |
| Catalog authorization | Historical fixtures omitted resolved access; integrated fixtures assigned role directly to access | `auth.ts` calls `accessRole(activeRole)`; `catalog.ts` permits resolved admin/office only with an active company. This task models that projection rather than altering the gate. |
| Shared Estimates rail | Historical reports describe obsolete assumptions, but integrated tests already expect no Estimate Request/RFP links | `estimatesRailSections` supplies All, Builder, catalog and settings links. `EstimatesBoardPage` and `HardscapeCatalog` each own a `SectionRailLayout`; `App.tsx` recognizes hub paths. Existing absent-link, href and active-page assertions were retained. |
| General/category behavior | Category predecessor supplied General/default and stored-category checks | `hardscape-category-duplicates.md`, shared `mergeHardscapeCategories`, API validation and real catalog dialog support the unchanged focused expectations. No category behavior is reinterpreted here. |
| Deactivation/reactivation | Test title promised both but only asserted DELETE | Existing `toggleActive` issues DELETE for deactivation and PATCH for reactivation. New assertions exercise that existing behavior without replacing any DELETE assertion. |

## Final verification

All runs use the artifact's own `node_modules/.bin/vitest`, sequential files and
one worker. No focused-name filters, skip substitutes, expected failures,
increased timeouts or exclusion changes were introduced.

| Check | Result |
| --- | --- |
| Complete old API suite | **24 passed, 0 failed, 0 skipped** |
| Complete old rendered suite | **43 passed, 0 failed, 0 skipped** |
| API batch: old API suite, canonical HTTP units, category contracts, isolated PostgreSQL category/storage checks, CSV and estimate-unit contracts | **126 passed across 7 files** |
| CRM batch: old rendered suite and canonical-unit rendered checks (including English/Spanish labels) | **55 passed across 2 files** |
| API old suite after final all-allowed-role missing/stale-company expansion | **24 passed** |
| `git diff --check` | Passed |

Commands:

```sh
(cd artifacts/api-server && node_modules/.bin/vitest run \
  src/routes/catalog.test.ts src/routes/catalogUnits.test.ts \
  src/lib/hardscapeCategories.test.ts src/lib/hardscapeCategories.integration.test.ts \
  src/lib/hardscapeStorage.integration.test.ts src/lib/csv.test.ts \
  src/lib/estimateUnits.test.ts --maxWorkers=1 --no-file-parallelism)

(cd artifacts/highplains-crm && node_modules/.bin/vitest run \
  --config vitest.config.ts src/pages/HardscapeCatalog.rendered.test.tsx \
  src/pages/EstimateUnits.rendered.test.tsx --maxWorkers=1 --no-file-parallelism)

(cd artifacts/api-server && node_modules/.bin/vitest run \
  src/routes/catalog.test.ts --maxWorkers=1 --no-file-parallelism)
```

Final batch logs: `api-final.log`, `rendered-final.log`,
`api-role-guards-final.log` in the same ignored evidence directory.
PostgreSQL checks use the existing disposable-database helpers; no shared
catalog rows or production data were changed. The PostgreSQL driver emits an
existing SSL-mode deprecation warning; the checks pass.

No correctly configured check exposed an application bug or requirements
conflict. Broad typecheck/baseline cleanup was out of scope and was not run;
this report does not claim the historically failing project-wide typechecks
are green. No runtime code changed, so no workflow restart, visual screenshot,
authenticated browser journey, publishing or production operation was needed
or performed.

The delivery diff contains only three test files and this report. It contains
no application, authorization, layout, category implementation, schema,
migration, dependency, Dashboard or unit-rule changes. No durable new project
decision was introduced beyond the already documented test-runner guidance.
