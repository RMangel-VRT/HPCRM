# CG5 shared service fulfillment verification

Date: 2026-11-11. Scope: assigned CG5 plan; no customer Services UI.

## Pre-flight and source resolution

The initial stop is preserved in [historical pre-flight evidence](CG5-preflight-verification.md).
The owner subsequently requested task-plan-led project rules; those now
supersede mandatory repository-specification and merge-label gates in
`replit.md`, `docs/slices/README.md` and Campaigns rules. The removed CG5 source
was not recreated or edited. Implementation follows the assigned plan.

Inspected the actual available CG1–CG4 implementation and handoff:
`campaignServices`, `CAMPAIGN_TERM_STATUSES`, `campaignDemand`,
`coverageResolver.forMonth`, `reconcileCampaigns`, `withCampaignContractStates`,
`updateCampaignRoundItem`, campaign source/round identity, route stops and
visits, both schema ownership declarations and CG4 verification.
No predecessor work was rebuilt. Later `git fetch origin main` found
`0d4f47ee`; `git merge-base --is-ancestor a5bb028b origin/main` returned 0,
confirming CG4's implementation is now merged as well as available here.

Read the repository rules/ledger, ownership map, scheduling master design and
relevant memory. Retain Contract Center demand ownership, program-only fallback
timing, item-owned round outcomes, visit-owned route activity, Colorado dates,
manual campaign separation and finished-work preservation.

## Exact integrations

- New pure `customerServiceFulfillment` and input `ServiceFulfillmentInputs`,
  error `ServiceTermUnavailable`; generated response-type re-exports
  `CustomerServices`, `FulfillmentRow`, `FulfillmentRound`.
- New batch loader `loadServiceFulfillmentInputs`.
- New `registerCustomerServices`, mounted once from `routes/routes.ts`.
- `GET /api/customers/:id/services?termId=...`; OpenAPI operation
  `getCustomerServices`, response `GetCustomerServicesResponse`, generated
  React helper `useGetCustomerServices`.
- Contract-summary's existing role set is exported as
  `CUSTOMER_CONTRACT_READERS` and reused without changing its members.
- OpenAPI types: `CustomerServices`, `ServiceSeason`, `ServiceNext`,
  `ServiceRound`, `ServiceFulfillment`, `UncountedService`,
  `ManualServiceWork`, `RetainedServiceWork`, with generated enum helpers.
- API Zod barrel resolves Orval's path-validator/query-type name collision
  explicitly; `CustomerServicesQuery` aliases the query type.
- Migration, new database tables/columns: **none**.
- Full consumer contract: [Customer services integration](CG5-services-integration.md).

## Verification

```sh
pnpm --filter @workspace/api-spec run codegen
```

Passed, including generated client/validator output and `typecheck:libs`.
The initial generation exposed Orval's path/query name collision; resolved at
the stable barrel, not by editing generated output, then codegen passed.

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/customerServiceFulfillment.test.ts \
  src/lib/customerServiceFulfillmentLoader.test.ts \
  src/routes/customerServices.test.ts \
  src/lib/campaignDemand.test.ts \
  src/lib/customerContractSummary.test.ts
```

**73 tests passed across five files.** Pure fixtures cover cross-year and
multi-year demand parity, count/timing precedence and mismatch, standard/null/
zero handling, all blocking gaps, completed/skipped/pending/missing/overdue and
signature states, promised chemical dates, manual exclusion, retained work,
uncounted scope, route source/date/company/status counts, renewal preservation,
missing routes, season-end deficits, immediate-parent inheritance and own
exclusion, safe default/explicit term selection and input immutability.

Actual mounted Express-handler tests cover all existing contract-summary
reader roles and projected account-manager access regardless of attribution,
denied shop/unknown managers, signed-out users, missing active company,
cross-company context/header/customer access, unavailable terms, malformed
queries, response validation and omission of commercial/assignment/file fields.
The loader test compiles actual Drizzle predicates and proves the fixed
nine-query table set, company parameters on every query, and route-only bounded
visit read. No real PostgreSQL fixtures or Generate calls were necessary.

```sh
pnpm --filter @workspace/api-server run typecheck
```

Still fails with **695 existing API diagnostics**, matching the predecessor's
recorded baseline. No diagnostic names the new fulfillment, loader or route
modules, their tests, or the changed contract-summary module. This command is
not claimed as passing. Transcripts are ignored under `generated-artifacts/cg5/`.

No browser testing subagent is needed: this is a read-only API/pure calculation,
without changed sign-in, payments, stored-data writes or UI interactions.

The API workflow rebuilt and restarted successfully after the final code batch.
Proxy checks returned 200 with `{"status":"ok"}` from `/api/healthz` and 401
from the new services endpoint when signed out. A browser snapshot of the API
health route displayed the same healthy JSON (only a missing favicon request).
The existing schema/required-extension workflow passed. Development startup
still logs the predecessor's unrelated QuickBooks fixture-token warnings;
there was no CG5 startup/build error. Existing boot initialization was not
modified; no dedicated backfill or migration command was invoked.
`git diff --check` passed.

## Boundaries and deviations

- Task-plan-led source policy replaced the earlier missing-document stop;
  current main independently confirms CG4's merge.
- Unknown timing/count keeps owed null while retaining stated quantity.
  Generated items no longer matched to demand are exposed separately as
  `retainedWork`, not erased or silently applied to owed totals.
- Route activity is date-window activity, not exclusive term attribution;
  visits do not carry a term ID. Renewal cannot erase historical work.
- Account-manager assignments remain attribution rather than an invented
  access restriction, matching actual contract-summary authorization.
- No database schema/data writes by CG5, migrations, explicit Generate runs,
  generation opt-in, dedicated backfills, production operations, notices,
  publishing, legacy fulfillment changes, UI or company-wide report.
- Company-wide read batching is intentional for report reuse; it can be
  narrowed for larger histories without duplicating the pure calculation.
