# RV1 handoff — Contract Center billing

## Revenue source and API

- `artifacts/api-server/src/lib/contractRevenue.ts` reads `term_billing_months` joined to `agreement_terms`, `agreements`, and the owning `customers` row in one company-scoped query. The range is inclusive and uses `YYYY-MM-01` dates. Signed, active, and renewed terms count. The projection uses the stored schedule, including authorized pre-start payments; it does not recalculate payment dates or inherit parent agreements onto branch records.
- The November 23, 2026 read-only database checks found **zero** stored `up_for_renewal` terms in both development and production. If a stored row acquires that status, it does not count.
- `GET /api/revenue/contracts/billing?month=YYYY-MM` returns `{ month, totals, customers, snowTmCount }`. Fees are flagged line items and included in their stream totals. Only `line = snow` maps to snow; `both` maps to contract maintenance. The T&M count uses terms in effect today in Colorado, regardless of the requested billing month. If two terms on one agreement bill in a month, both sets of payment lines are included; the newest billing term describes the single agreement header.
- `GET /api/revenue/contracts/by-customer?year=YYYY&line=all|contract|snow|fee` returns `{ year, customers, monthTotals, totalCents }`. It defaults to `all`. The `contract` and `snow` views exclude fees. The response is one row per agreement, labeled by its owner, with zero-year agreements omitted. An additional bulk history read finds renewal markers even if an earlier counted season had no payment in the filtered year or stream.
- Dashboard stats, monthly chart values, top-customer revenue, and pulse now read the same billing projection. Dashboard response shapes and dollar units are unchanged. Top customers rank the full current Colorado calendar year's billing, combined by agreement owner. No new page or QuickBooks integration is included.
- Admin and office can read both new endpoints, monthly revenue, top customers, pulse, and legacy overview. Account managers retain admin access through the existing role projection. Existing admin restrictions on legacy audit, exceptions, and CSV exports are preserved. `/api/dashboard/stats` retains its previous signed-in access; it was not one of the two dashboard endpoints named for the access change.

## Legacy readers left in place

| Reader | Why it remains |
| --- | --- |
| `GET /api/revenue/overview` → `storage.getRevenueOverview` | The old Revenue matrix still reads it until RV7. The same handler now lives in `routes/revenue.ts`. |
| `GET /api/revenue/contract-audit`, `/api/revenue/exceptions`, and `/api/revenue/export/{audit,exceptions,filtered,matrix}` → `buildContractAuditRows` | The old audit, exception views, and exports still read frozen contracts and monthly amounts until RV7. |
| `storage.getRevenueExceptions` and `storage.getMonthlyRevenueData` | Legacy implementations retained for RV7 cleanup; neither has an active caller. |
| Dashboard `activeContractsCount`, top-customer `activeContracts`, and pulse `snowBook` | They remain legacy contract counts, not revenue. |
| `GET /api/customers/:customerId/revenue/:year`, `/api/customers/:customerId/all-monthly-amounts/:year`, `GET /api/contracts`, and `GET /api/contracts/:contractId/monthly-amounts` | Legacy contract/customer reads outside the Revenue namespace were not converted. The Contract Center legacy import also still reads frozen amounts as source data. |

No schemas, legacy records, or production data were changed.

## Verification

- 83 artifact-local tests passed across five files, including an isolated PostgreSQL fixture for counted and excluded statuses, scope on all four joined tables, cross-year prices, a pre-start fee, parent and branch owners, not-renewing snow, T&M as of Colorado today, and dashboard stats/ranking shapes. `contractRevenue.postgres.test.ts` is opt-in with `RUN_RV1_POSTGRES_TEST=1`; it checks for the disposable fixture database before creating any temporary tables.
- HTTP tests covered office, admin, projected account-manager access, denied field and other non-office roles, invalid query strings, and the unchanged legacy output shapes. Development `/api/healthz` returned 200 and all sampled protected routes returned 401 without a session.
- `pnpm run typecheck` rebuilt workspace library declarations in both runs. After remapping shifted lines and comparing file, line, column, and error code, the existing failure dropped from 595 to 592 diagnostics: no new diagnostics, three removed from the relocated handlers, and no changed messages at surviving positions.
