# SC2.1 — Calendar-only round timing

Date: 2026-11-12. Existing API Server and High Plains CRM only.
The assigned task and complete November 12 owner decision govern this change.
SC2's actual engine, reconcile, contract-state, fulfillment and handoff were
inspected; no predecessor or obsolete specification was rebuilt.

## Rule and interfaces

**Contracts supply service counts; the Service calendar alone supplies timing.**
This supersedes SC2's stated-month placement, informational count mismatch and
exact-standard/all-only selection. Historical reports are unchanged.

`campaignDemand`:

- Never reads or validates `monthSpread`. Nonzero, malformed, negative,
  conflicting and excessive totals neither select rounds nor create gaps.
- Blank quantity uses entries marked `inStandard`; no available standard is
  `no_count`. Explicit valid N uses the first N entries in calendar **position**
  order, not chronological sorting or the standard subset.
- More visits than available entries produces `needs_rounds`, count N and no
  rounds, with current guidance:
  **“This contract lists more visits than the calendar has rounds; review it”**.
- A missing service calendar remains `no_count`, including explicit counts.
  Explicit zero, integer/range validation (0–24), duplicate-line refusal and
  legacy chemical behavior are preserved.
- Annual backflow is still one deadline obligation, not a trip per device.
  Checklist zero/invalid/duplicate/no-calendar guards stay in place.
- Selection still passes through SC2's exact inclusive deadline coverage
  resolver. Entry/year identities, October–September and mid-month ownership,
  prior-year openings, property-before-parent exclusions and term priority do
  not change. Result presentation remains ordered by deadline after selection.

`DemandGapKind`, OpenAPI and generated Zod/React contracts no longer include
`month_outside_calendar` or `count_mismatch`. Removed `month` / `monthTotal` gap
metadata. Demand-member and Services-round timing is narrowed to `calendar`.
Response validation rejects both retired kinds and `timing: contract`.

`summarizeServiceUsage` retains one eligible included season per term/service,
not an expanded property count. It removes `withoutMonths`,
`noCountWithoutMonths` and month-derived validation. Campaign `needsRounds`
means a valid count exceeds available round entries; smaller counts and any
stored months are irrelevant. Blank, count, explicit-zero, invalid quantity,
duplicate and legacy reporting remain; checklists never compare device counts
with round capacity.

Reconcile and contract state consume the same changed engine without a second
allocation path. Fulfillment still uses it across selected-term years; unknown
counts remain null, retained work stays separate, and chemical item promises
retain their own dates. Generate, Services status/timing badges, calendar usage
flags and English/Spanish guidance use the new semantics. `RoundCard` continues
rendering supplied server usage; it does not calculate counts in the browser.
No endpoint was added.

### Contract editor count-only saves

The completion check found that the shared editor still required stored months
to sum to a changed campaign count. `spreadProblem` now bypasses month-total
validation for catalog services scheduled as campaign or checklist. Both
new-contract step validation and existing-contract panel saves already consume
that shared helper, so neither flow retains the old restriction.

English/Spanish editor guidance explicitly says that stored months do not
affect calendar rounds or need to match the count. Existing stored month arrays
are preserved in submitted payloads, not cleared or rewritten. Route and other
existing month-spread validation is unchanged; a mowing count that conflicts
with its stored total still blocks saving.

## Automated verification

Commands ran from the workspace root. Full output is retained in ignored
`generated-artifacts/SC2.1-*.log`; those outputs are not source or deployed assets.

### Pure engine, usage, fulfillment and Routes units — 97 passed

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignDemand.test.ts \
  src/lib/customerServiceFulfillment.test.ts \
  src/lib/customerServiceFulfillmentLoader.test.ts \
  src/services/serviceCalendar.test.ts \
  src/lib/campaignMembership.test.ts \
  src/lib/routeEngine.test.ts src/lib/routeScheduler.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

The initial engine-only pass was **12 passed**, before connecting consumers.
Coverage includes clean-ups 3/2/blank/4 regardless of months; shrubs with
June/October months; non-first standard subset versus explicit count of equal
cardinality; stable-ID position reorder; malformed/excessive month data ignored;
missing standards/calendar; quantity/zero/duplicate/legacy guards; annual
backflow with malformed months; unchanged October–September, October 15–
October 14, December-to-January, term priority and Routes resolution.

### Database and mounted-handler suites — 100 final passing checks across subsets

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/routes/campaignGeneration.integration.test.ts \
  src/lib/campaignMembership.integration.test.ts \
  src/lib/campaignRoundLists.integration.test.ts \
  src/routes/serviceCalendar.integration.test.ts \
  src/routes/customerServices.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

Initial combined run: 96 passed, four failures from superseded expectations and
one new sent-fixture assertion. These expectations were corrected, not skipped.
Final successful subsets:

- `src/routes/serviceCalendar.integration.test.ts`: passed in
  `SC2.1-integration-fix.log` (11 checks); count 2 accepted, count 4 linked,
  preview/reconcile/fulfillment parity and stored-month preservation.
- Round-list and customer-services suites passed in the initial combined log
  and were not changed afterward (41 checks together).
- The final command below passed **60 checks**, consisting of 48 generation/
  membership checks plus the 12 already-counted engine checks:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignDemand.test.ts \
  src/lib/campaignMembership.integration.test.ts \
  src/routes/campaignGeneration.integration.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

One intermediate generation teardown encountered a PostgreSQL deadlock deleting
its disposable company; the unchanged test passed on the later full-suite
rerun. No application locking/retry or production behavior was changed to hide it.

The new persisted integration verifies first-N versus standards, rollback-only
preview, stable-ID reorder via calendar replacement, response validation and
fulfillment round identity parity. Existing reconciliation/idempotency,
company/role/header isolation, elapsed/missed/closed handling, unopened snapshot
refresh, started/recorded/protected retention, checklist completion/reopen,
checklist Start exclusion, team access and SQL identity constraints still pass.
Contract-state assertions now prove changing stored months leaves membership
and entry/year identity unchanged; signature still changes waiting → owed.

After the contract-editor correction, the generation suite was rerun:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/routes/campaignGeneration.integration.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

**31 passed**, including the strengthened count regression: insert clean-ups
count 3, save count 2 through the real Contract Center scope PUT with its
original month spread retained, verify the stored quantity/spread, then validate
Spring + Fall leaf 1 preview and matching Services fulfillment. Blank standards,
over-capacity, reorder and rollback assertions continue in the same test.

Enabled database Routes regression:

```sh
ROUTES_DB_TESTS=1 pnpm --filter @workspace/api-server exec vitest run \
  src/lib/routesR3.integration.test.ts --maxWorkers=1 --no-file-parallelism
```

**19 passed.** No Routes implementation was edited.

### Rendered/adapter regressions — 85 final passing checks across subsets

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  src/pages/CampaignGenerate.rendered.test.tsx \
  src/pages/ServiceCalendar.rendered.test.tsx \
  src/components/customer/pages/ServicesPage.cp2.test.tsx \
  src/lib/contractCustomerServices.test.ts \
  src/components/campaigns/GeneratedRoundView.test.tsx \
  src/hooks/useContractCustomerServices.test.tsx \
  src/lib/roundLists.test.ts src/pages/CampaignDetail.rendered.test.tsx \
  --maxWorkers=1 --no-file-parallelism
```

Initial run: 82 passed, three obsolete label/primary-versus-secondary expectations
failed. Updated those assertions; the two affected suites passed **39 checks**.
The six other suites were already passing. Generate was rerun after its final
provenance-text cleanup: **9 passed**. These reruns are subsets, not additional
unique tests. Existing permissions, scoped query keys, details/drawers, checklist
exclusions and manual/generated edit boundaries remain covered.

### Contract create/edit regressions — 45 additional passing CRM checks

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  src/pages/NewContractPage.rendered.test.tsx \
  src/pages/ContractScope.rendered.test.tsx \
  src/components/contracts/contractSave.test.ts \
  src/components/contracts/ScopeEditor.split.test.tsx \
  src/components/contracts/contractCreate.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

**45 passed**. Rendered new-contract Next/Create and existing-contract Scope
Save accept clean-ups 3 → 2 while sending unchanged stored month arrays. The
existing-contract rendered regression separately proves route mismatch saves
remain blocked. Shared helper tests cover campaign and annual checklist count
edits. Existing legacy split and create-policy regressions still pass. Together
with the earlier suites, **130 distinct CRM checks passed**.
No second browser run was launched for this focused form-validation correction.

## Generated contracts and baseline-aware checks

```sh
pnpm --filter @workspace/api-spec run codegen
# Orval generation + pnpm -w run typecheck:libs: passed

pnpm run typecheck
# Fails on existing broad leaf diagnostics, not waived or suppressed

pnpm --filter @workspace/scripts exec tsx src/compare-rfp-typecheck-baseline.ts
# passed: zero added diagnostic messages in API or CRM
```

The existing compiler-host comparator reads HEAD source against refreshed
current library declarations. API baseline-context **699** / current **695**;
CRM baseline-context **213** / current **212**; **added []** in both.
These baseline-context counts are not claims about historical emitted builds.
Current totals match the SC2 handoff's API 695 / CRM 212. No type assertions,
exclusions or validation scripts were weakened.
After the contract-form correction, the same comparator passed again with API
**695 / 695**, CRM **212 / 212**, and no added messages. This later comparison
uses the newer HEAD source baseline; the earlier pre-completion comparison
above records the initial implementation delta.

API and CRM managed workflows restarted successfully after the application
batch. Proxy API health and actual Generate Vite module returned **200**.
Existing QuickBooks synthetic-token decode, Browserslist/PostCSS and PostgreSQL
SSL-mode warnings were observed; no new startup/backfill was introduced.

## Actual 2027 development preview

Before setup:

1. Explicit development environment inspection confirmed no production mode.
2. A development-only read verified the installed `service_calendar` and
   campaign calendar identity prerequisites. No migration/setup DDL was needed.
3. A new disposable company, admin, four properties and signed Jan 1–
   Dec 31, 2027 terms were inserted transactionally. Only that new company's
   calendar received the existing typed starting entries.

Fixture clean-up quantities: **3, 2, blank, 4**, each with conflicting stored
June total **99**. Each also had shrubs ×2 with June/October months. No existing
company, contract or calendar was edited. The dev-only helper refused production
mode and called `runCampaignGeneration` only with **dryRun: true**, year 2027.

Actual preview:

| Round | Opens | Deadline | Memberships |
|---|---|---|---:|
| Spring clean-up | 2027-03-01 | 2027-04-15 | 3 |
| Fall leaf clean-up 1 | 2027-11-01 | 2027-11-30 | 3 |
| Fall leaf clean-up 2 | 2027-11-15 | 2027-12-31 | 2 |
| Spring shrub trim | 2027-04-01 | 2027-07-31 | 4 |
| Fall shrub trim | 2027-09-01 | 2027-10-31 | 4 |

Count 3 and blank appeared in all three clean-ups; count 2 appeared in Spring
and Fall leaf 1; count 4 appeared in none and was the only `needs_rounds` gap.
Every member reported calendar timing. Before and after the preview:
**campaigns 0 / campaign_items 0 / campaign_generation_years 0**. Exact
scope-line quantities and stored month arrays were compared and unchanged.
Raw report and before/after evidence: ignored
`SC2.1-development-preview.json`, not a production audit.

One signed-in browser journey then used actual persisted endpoints (no mocked
responses) to capture the **2027** Generate preview, reload, calendar usage and
count-2/count-4 Services. Actual preview and Services GETs returned 200; the
browser independently checked that fixture campaign/item/opt-in counts stayed
zero. No Generate POST or calendar/contract edits occurred in this journey.

| Screenshot evidence | Capture |
|---|---|
| `ox5054` | Expanded 2027 clean-up rounds, members and over-capacity warning |
| `rmobca` | Reload still says 2027 has not been generated |
| `wax3un` | Current calendar timing/count guidance |
| `ki24d6` | Three standard clean-ups; only count 4 flagged in usage |
| `qvo2mg` | Count-2 Services: owed 2, Spring + Fall leaf 1, calendar timing |
| `9sv19y` | Count-4 Services: unknown owed count, review status, no owed rounds |

Generate and Services screenshots were visually inspected. Browser evidence is
attached in the task conversation, not a claimed filesystem PNG export. A
separate unsigned screenshot capture timed out; it does not replace or invalidate
the successful signed-in evidence.

The fixture company, properties, calendar, agreements/terms/scope, admin
membership/account and login session were removed after capture. No disposable
preview work was retained. Existing database test fixtures used their own
company-scoped cleanup.
Two disposable companies left by the intermediate teardown deadlock were
explicitly removed after verifying their exact IDs; no unrelated data was touched.

## Operational limits

- No schema declarations, migrations, contract rewrites or application DDL added.
  No migration runner was invoked. Existing predecessor integration tests retain
  their own idempotent/transient constraint-verification SQL.
- No production Generate, production calendar load, production data changes or
  publication. Development generation/protection regression tests mutate only
  their disposable fixtures; the documented 2027 browser journey is preview-only.
- No SC3/customer schedule, native mobile, Routes algorithm, new editor/conflict
  behavior or SC2 identity/checklist/protection redesign.
- No production rollout or live-company demand correctness is claimed.
- Root typecheck remains baseline-failing as described above.
- Calendar editor optimistic conflicts remain outside scope; company locks
  serialize writers but cannot detect a later stale editor's replacement.
