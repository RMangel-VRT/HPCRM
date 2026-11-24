# RV7 handoff — Legacy Revenue retirement

## What was retired

- RV6 already mounted `RevenuePage` at `/dashboard/revenue` for admin and office. Income, Planning, Contract detail and admin Setup are unchanged. Revenue reads the income engine and Contract Center billing; the dashboard pulse and stats read Contract Center billing. No active Revenue consumer needed to be moved.
- Searched `artifacts/` (including mobile and the component sandbox), `lib/` (including OpenAPI, generated clients and validators), and `scripts/` for the legacy route strings, component names, types, storage methods and CSV helpers. The only callers of the retired reads were the old page/chart tree and tests for that tree or the retired endpoints. No OpenAPI operation referenced them.
- Removed `RevenueOverview`, `RevenueMatrixPanel`, `RevenueModuleHeader`, `RevenueChart`, `AuditDetailDrawer`, `use-revenue-filters`, and the unimported `CustomerGrowthChart`. Checked all 18 keys in each old `revenue` locale block individually. No surviving translation referenced them; navigation, customer billing and the new `revenueV2` keys remain.
- Removed `auditEngine`, all three copies of its `auditTypes` module and both type re-exports. Removed `getRevenueOverview`, `getRevenueExceptions`, `getMonthlyRevenueData`, `getTopCustomers`, and their private or exported result types. The dashboard’s `dashboardRevenueMonths` helper still serves pulse, and `isAdminOrSuperAdmin` still serves the migrations admin routes.
- Removed `GET /api/revenue/overview`, `/api/revenue/contract-audit`, `/api/revenue/exceptions`, `/api/revenue/export/{audit,exceptions,filtered,matrix}`, `/api/dashboard/monthly-revenue` and `/api/dashboard/top-customers`, plus the old Revenue CSV helpers. `/api/dashboard/stats`, `/api/dashboard/pulse`, and the non-Revenue `/api/dashboard/customer-growth` remain.
- Contract Center Audit’s export, batches, current export, and import paths are untouched, as is `AuditImportCard`’s `/api/revenue` cache invalidation. No table, column, migration, or frozen data changes ship.

## Full remaining grep inventory

`getRevenueOverview|buildContractAuditRows|contract_monthly_amounts|contractMonthlyAmounts` over `artifacts/`, `lib/`, `scripts/` and `.migration-backup/` (excluding build output) has these file matches. Neither retired function name remains.

| File | Why it remains |
|---|---|
| `artifacts/api-server/src/lib/contractAuditData.ts` | Contract Center Audit loads frozen source data for audit export and import planning. |
| `artifacts/api-server/src/lib/contractCenterFreezeDevelopment.test.ts` | Opt-in development smoke test seeds and rereads a disposable frozen amount and verifies that it contributes nothing to new Revenue. |
| `artifacts/api-server/src/lib/contractRevenue.postgres.test.ts` | Private PostgreSQL fixture has both current billing and nonzero frozen amounts, one attached to a legacy-only customer. The Revenue endpoint returns only the current billing and omits the legacy-only customer. |
| `artifacts/api-server/src/lib/legacyContractFreeze.ts` | Cascade guard checks frozen monthly rows before customer or company deletion. |
| `artifacts/api-server/src/routes/contractCenterCopy.test.ts` | Existing legacy Copy fixtures and assertions. |
| `artifacts/api-server/src/routes/contractCenter.ts` | Copy preview loads frozen amounts. Copy execution is already blocked with 409. |
| `artifacts/api-server/src/routes/legacyContractFreeze.test.ts` | Freeze regression fixtures. |
| `artifacts/api-server/src/routes/routes.ts` | Legacy `GET /api/contracts` includes stored monthly amounts. The per-contract monthly GET, per-customer all-monthly GET, and per-customer legacy revenue GET also remain through storage. These are read-only compatibility paths outside the retired Revenue namespace. The legacy monthly PUT remains blocked with 409. |
| `artifacts/api-server/src/storage.ts` | `getContractMonthlyAmounts` supports those compatibility paths; `getCustomerRevenue` is reached only by the separate legacy customer revenue handler. The existing upsert has no allowed write path through the frozen PUT. |
| `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx` | Legacy builder variable projection mentions a local `contractMonthlyAmounts` query result. Its standalone `/api/contract-monthly-amounts` query has no matching handler in the current code; it is not part of Revenue and was left unchanged. |
| `artifacts/highplains-crm/src/shared/schema.ts` | Frozen table declaration and derived schemas/types. |
| `lib/db/src/schema/schema.ts` | Frozen table declaration, constraints and derived schemas/types. |
| `.migration-backup/migrations/0000_needy_ben_grimm.sql` | Historical DDL, unchanged. |

Dashboard counts do not appear in that grep because they read `contracts`, not monthly amounts. `activeContractsCount` in `storage.ts` counts active legacy contracts; `snowBook` in `routes/dashboardQueue.ts` counts legacy snow contracts. Both were deliberately preserved. The removed top-customer ranking was the only caller of its separate per-owner active-contract count.

## Verification

| Check | Before | After |
|---|---:|---:|
| API targeted Vitest suites, excluding opt-in DB tests | 220 passed, 13 failed, 12 skipped | 217 passed, same 13 failed, same 12 skipped |
| CRM Revenue, Planning, Dashboard and Audit Import rendered suites | 32 passed, 1 failed | 32 passed, 0 failed |
| Forced workspace declaration build | Passed | Passed |
| API TypeScript diagnostics | 592 | 585; 7 removed, 0 added |
| CRM TypeScript diagnostics | 183 | 183; 0 removed, 0 added |

- Ran Vitest from each artifact. The three removed passing API cases covered only deleted dashboard routes; the one removed failing CRM case asserted on the obsolete chart chain. The unchanged API failures are all in `contractCenterCopy.test.ts`. TypeScript diagnostics were compared by source file, mapped line, column and error code after rebuilding workspace declarations on both sides.
- Ran four suites separately against verified disposable PostgreSQL databases: Contract Center Revenue and the frozen-row check (1), QuickBooks mirror (7), planning and targets (5), and income streams (7). All 20 passed. The combined fixture returned exactly `176965` cents for 2026 without either of the two nonzero legacy amounts. The older development smoke test is still opt-in and was not run: it uses live development login and App Storage for legacy document downloads. It now checks the replacement endpoint and expects the already-disabled Copy write to return 409 rather than trying to create copied records.
- The dashboard pulse route tests use the current Contract Center projection; no `getMonthlyRevenueData` mock remains. The dashboard render checks that it requests only pulse. The Revenue render tests cover the new page and detail views. Both development workflows started, the Revenue route served and Vite transformed its `RevenuePage` registration, and the surviving API routes returned the expected signed-out 401. Both retired dashboard routes returned 404. No authenticated live browser test was run.
