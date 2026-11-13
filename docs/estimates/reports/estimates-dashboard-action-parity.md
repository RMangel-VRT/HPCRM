# Estimates dashboard Action Center parity

## Scope and predecessor contracts

Implemented Part 1 of the cleanup attachment only. Read the full attachment and
EA1/EA2 reports, and verified the current board enrichment, server classifier,
action-list shaping and default Urgent scope in the checkout. Historical
instructions to preserve the old Estimates tile are superseded by this task.
Hardscape fixtures and all other excluded work were left untouched.

## Integration details

- The existing company-scoped `loadEstimatesBoard(companyId, now)` is called
  once per Estimates summary. No extra database lookups or parallel classifier
  were introduced.
- Moved only pure action-bucket membership, board flattening/deduplication and
  the existing comparator into the driver-free estimate contracts module.
  The action list re-exports these through its existing frontend schema facade;
  the API imports the browser-safe contracts directly, never a frontend artifact.
- Estimates total is the five actionable buckets; overdue is red within that
  population. Waiting and won contribute to neither. The selected row follows
  urgency, bucket, descending stage age, then ID, not maximum stage age.
- The oldest payload retains label and ticket URL and adds `reason` with the
  authoritative message key/parameters. Its legacy string `detail` is empty for
  Estimates. SectionRouter translates the estimate-specific reason using the
  action list's existing `messageParams` date formatter. All other sections
  still render their string details. Existing English/Spanish keys suffice;
  no locale copies were introduced.
- The dashboard route returns JSON directly and the frontend reads JSON
  directly: there is no outgoing response schema that strips the new field.
  An Express/Supertest assertion verifies the reason survives serialization.
- Tile destination remains `/dashboard/estimates`; the page's existing default
  Urgent scope, ticket destination metadata, tile geometry/order, company scope
  and authorization are unchanged.
- Bids retains the original age-based implementation, seven-day threshold,
  labels/details, tie ordering and `/dashboard/bids` destination.

## Verification

Passed:

```sh
pnpm run typecheck:libs

pnpm --filter @workspace/api-server exec vitest run \
  src/routes/dashboardSections.test.ts src/routes/dashboardSections.integration.test.ts \
  src/routes/estimatesBoard.test.ts src/services/estimateNextAction.test.ts \
  --maxWorkers=1 --no-file-parallelism
# Unit/board/classifier files: 157 passing tests.
# Integration file initially exposed two fixture/expectation mistakes, corrected below.

pnpm --filter @workspace/api-server exec vitest run \
  src/routes/dashboardSections.integration.test.ts --maxWorkers=1 --no-file-parallelism
# 7 passing tests. Combined final coverage: 164 passing tests across four files.

pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/components/dashboard/SectionRouter.rendered.test.tsx \
  src/pages/EstimatesBoardPage.rendered.test.tsx --maxWorkers=1 --no-file-parallelism
# Existing action-list file: 22 passing tests.
# Router file initially exposed a translation mock setup mistake, corrected below.

pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/components/dashboard/SectionRouter.rendered.test.tsx --maxWorkers=1 --no-file-parallelism
# 11 passing tests. Combined final rendered coverage: 33 passing tests.

git diff --check
```

The disposable PostgreSQL fixture compares the actual board and tile with one
fixed `NOW`. Its 20 rows cover waiting/won exclusion; all five action buckets;
3-day assignment, 5/10-day draft idle, 5-day expiry, 2-day overdue and 7-day
unanswered boundaries; stage age differing from urgency; deterministic tied
IDs; customer label and authoritative reason; and a waiting/won-only remainder.
It asserts 16 actionable and 6 urgent rows. Existing integration tests continue
to assert Bids totals, age reset on re-entry, company isolation and access.

Test-only corrections: the existing sent-stage ticket has no estimate and is
assigned, so EA1 classifies it as amber Start, not seven-day overdue. The new
tenant needed a company membership for the assignee projection. Initial client
imports used an undeclared direct database package dependency; they now follow
the existing frontend schema facade. The translation test uses a standalone
i18next instance, not the mocked React plugin. No business rules were changed
to accommodate fixtures.

## Environment limits and runtime checks

- `pnpm --filter @workspace/api-server run typecheck`: nonzero, 695 diagnostics.
- `pnpm --filter @workspace/highplains-crm run typecheck`: nonzero, 213 diagnostics.
- No diagnostics reference any changed source/test file. Broader type errors
  remain outside scope; raw outputs are in ignored
  `generated-artifacts/estimates-dashboard/`.
- Both managed workflows restarted. The API initially exceeded the 90-second
  startup wait while existing per-company visit backfills ran; restarting with
  a 300-second allowance succeeded. No workflow or startup code was changed.
- Proxied `/api/healthz`, Vite's SectionRouter module and the action-list module
  each returned HTTP 200. Logs show existing unrelated QuickBooks fixture token
  decode warnings and frontend Browserslist/PostCSS warnings.
- The signed-out `/dashboard` screenshot attempt timed out while taking the
  screenshot. No authenticated visual capture is claimed. Rendered tests cover
  translated reasons, count/date interpolation, the empty actionable tile,
  link clicks and unchanged Bids details; the existing action-list rendered
  test confirms the destination defaults to Urgent.
- No browser-testing agent, production operations, schema/migration changes or
  publishing were used. Disposable integration records were cleaned up.

There are no remaining implementation blockers or scope deviations.
