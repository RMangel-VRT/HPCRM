# Estimates board verification

Date: October 21, 2026.

## Delivered

- Admin/office-only `GET /api/estimates/board` beside the dashboard queue registration.
- Five stages defined by the exported `ESTIMATE_STAGES` constant, using stable type/status identities.
- Direct company/type/status-filtered ticket selection without pagination or a row limit; no `storage.getTickets()` scan.
- Bulk company-scoped customers and assignees; a grouped `MAX(created_at)` query restricted to each ticket's current status.
- Colorado calendar-day aging, creation fallback, descending age ordering and an ID tie-breaker.
- Recognized type filters only, with every stage retained when empty.
- Protected `/dashboard/estimates` page, shared filter rail, counted columns, horizontal scrolling, existing ticket type visuals and whole-card ticket links.
- All card fields, seven-day warning, English/Spanish copy, light/dark warning tokens, explicit loading/error/empty states.
- Company/user/role/filter-scoped cache; 30-second staleness, one-minute polling and refetch on window focus.
- Estimates first in Business for admin/office. Platform Admin, billing visibility/access, Calendar absence, existing route permissions and native app unchanged.

## Source/reference

Read the complete uploaded N5 slice, shared rules, navigation README, approved navigation design and relevant project memory. Inspected the clickable HTML's decoded application bundle. Its illustrative Board rail/routes are superseded by the slice's exact All bids rail and `/dashboard/estimates?type=...` URLs.

## Pre-edit baseline and diagnostics

Before implementation:

1. `pnpm run typecheck:libs` passed and refreshed workspace declarations.
2. API typecheck: **735 existing diagnostic lines**.
3. CRM typecheck: **221 existing diagnostic lines**.
4. Original navigation configuration: **51 tests passed**.

After implementation, API and CRM typechecks still report **735 / 221**, respectively. Comparing diagnostic multisets after normalizing line/column positions finds **no new diagnostics**. These checks remain nonzero because of pre-existing failures; this is not a claim of clean full-workspace typechecks.

Existing diagnostic categories include missing returns (`TS7030`), untyped generic calls (`TS2347`), implicit-any parameters (`TS7006`), property/type mismatches and existing test casts. API diagnostics also include transitive frontend shared-schema errors; the two package totals should not be added together as distinct issues.

Ignored verification logs are under `generated-artifacts/estimates/`: `baseline-{libs,api,crm,tests}.log`, `final-{api,crm}.log`.

## Automated checks

| Check | Result |
| --- | --- |
| API `estimatesBoard.test.ts` + existing `dashboardQueue.test.ts` | 66 tests passed |
| CRM Estimates rendered tests, all navigation tests, BillingAccess and landing regressions | 117 tests passed |
| ContractCenter board, CustomerContracts, Settings QBO, TicketDetail visits regressions | 52 tests passed |
| Total focused/regression tests | **235 passed** |
| `git diff --check` | Passed |

The new API tests cover the exact exported stage map; each Estimate Request stage; every RFP mapping; later/closed/scheduled exclusions; company/type/status SQL predicates; unauthorized field roles and unauthenticated requests; admin/office access; valid/invalid filters; empty stages; history aggregation/fallback; nullable related records; deterministic sorting; UTC/Denver midnight and DST boundaries; uncapped results and constant query cost.

The client tests cover whole-card links, counted columns, warning state, filter URLs/active rail, invalid-filter handling, Spanish copy and explicit error handling. Navigation retains independent exact role matrices and route-permission assertions.

## Query-count evidence

Vitest counts **7 queries for 1 ticket and 7 for 1,001 tickets** with both types and populated related records:

1. Company ticket types.
2. Estimate Request statuses.
3. RFP statuses.
4. Filtered open tickets.
5. Bulk customers.
6. Bulk assignees.
7. Grouped latest entry into current status.

An additional real PostgreSQL execution check instruments the development connection and runs the actual board loader inside a transaction:

| Matching open tickets | SELECT statements |
| ---: | ---: |
| 13 | 7 |
| 1,013 | 7 |

All 1,013 records were returned, and the 1,000 added stress-check tickets were rolled back. Evidence: `generated-artifacts/estimates/real-query-count.json`. Valid single-type filters need only one status query; empty populations skip unnecessary related-record queries.

## Development safety and browser evidence

The documented development account was absent; no password was reset. An isolated temporary development company, canonical disposable admin/office/field-manager accounts, a synthetic customer and 17 existing-schema tickets were created for real authenticated verification. Thirteen tickets belong on the board; four later/closed tickets must remain absent. No new bid persistence or schema was introduced.

Real browser checks used the disposable accounts and the actual endpoint, not intercepted auth or board responses:

| State | API result / stage counts (New, Estimating, Proposal, Sent, Decision) |
| --- | --- |
| Unauthenticated | 401 |
| Admin, All bids | 200; **2 / 4 / 2 / 3 / 2** |
| Estimate requests | 200; **1 / 1 / 1 / 1 / 1** |
| RFPs | 200; **1 / 3 / 1 / 2 / 1** |
| Office, All bids | 200; **2 / 4 / 2 / 3 / 2** |
| Field Manager | API 403; no Estimates navigation item; direct page redirects to Access denied |

- Each filter made its correct actual API request and its five UI counts matched the response.
- All 13 cards were whole-card anchors to `/dashboard/tickets/<id>`.
- Three cards at 7, 8 and 9 days carried the warning marker.
- At **390 × 844**, board `scrollWidth/clientWidth` was **1464 / 342**; document width was **390 / 390** (no document-level horizontal overflow).
- Spanish filters, navigation and stage labels rendered. Test language and theme were restored to English/light.
- No drag/drop or status mutation controls were added or exercised.
- Two unrelated resource-load 404s occurred on dashboard landings; board requests succeeded.

Screenshots are attached to the task conversation as browser evidence, rather than written into the repository. The browser capture tool exposes observation IDs, not a supported filesystem export; no claim is made that image files exist under `generated-artifacts/estimates/`.

| Screenshot | Evidence ID |
| --- | --- |
| All bids, light | `rshpbv` |
| All bids, dark | `7zxrzj` |
| Estimate requests filter | `wbkiso` |
| RFPs filter | `nsmzcb` |
| Spanish RFP board | `53nwl5` |
| 390px narrow board | `oxsyph` |
| Office board | `o7nzuj` |
| Field Manager denial | `hzh62v` |

Additional **2240 × 1000** captures show all five columns together:

| Wide screenshot | Evidence ID |
| --- | --- |
| All bids, light | `u7n8fh` |
| All bids, dark | `9walfn` |
| Estimate requests | `nq01xm` |
| RFPs | `f8purq` |

The temporary company, customer, ticket types/statuses, tickets/history and all three disposable accounts were removed after verification. Existing users and their credentials were not changed.

The unauthenticated preview capture separately confirmed the sign-in gate. No production data, publishing, DDL, migrations or native-app changes were used.

## Changed source files

- `artifacts/api-server/src/routes/estimatesBoard.ts`
- `artifacts/api-server/src/routes/estimatesBoard.test.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/EstimatesBoardPage.tsx`
- `artifacts/highplains-crm/src/pages/EstimatesBoardPage.rendered.test.tsx`
- `artifacts/highplains-crm/src/App.tsx`
- `artifacts/highplains-crm/src/components/nav/navConfig.ts`
- `artifacts/highplains-crm/src/components/nav/navConfig.test.ts`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`
- `artifacts/highplains-crm/src/i18n/locales/es.ts`
- `artifacts/highplains-crm/src/index.css`
- This report.
