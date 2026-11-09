# Fees and exact payment schedules — completion report

Verified in development on November 6, 2026. No publication or production schema/data changes were performed.

## Commercial behavior

- Contract Center still owns season payment obligations. Fees, full-term contract totals and duration are computed; no additional totals are stored.
- Pattern payloads remain compatible, default components to non-fee and retain their existing date-edit expansion behavior. A short pattern still annualizes its entire twelve-month cycle.
- Exact schedules store precisely the submitted component/month rows, including deliberate zero amounts. They never expand, repeat, trim or shift on reads or date edits.
- Explicit annual contract and fee values use the twelve months starting with the service-start month. Pre-start and later-year payments are excluded from these annual figures, but non-fee obligations remain included in full-term contract total.
- Unknown/null contract value does not suppress fees. Snow T&M accepts fees but still rejects contract payments.
- A pre-start replacement needs express consent, is limited to two months, and records history inside the same transaction. Later date edits cannot implicitly authorize additional pre-start obligations. Invalid edits identify offending rows and leave dates/payments unchanged.
- Increases and target amounts exclude fees. Explicit renewals require rebuilding, use the source's first twelve months, and produce a twelve-month monthly pattern rather than copying dated obligations.
- Imports share the same validation/execution rules. Monthly imports carry omitted source fee components unchanged; exact-date imports must supply their own dated fee obligations rather than silently inventing them. Both exports include fee flags and exact dated months. Existing wide and numeric-month CSVs remain supported.
- Existing signed-rate, coverage, access, Colorado-calendar, history and invoice-ownership boundaries remain unchanged.

## Migration and publication review

Migration: `.migration-backup/migrations/0072_contract_payment_schedules.sql`.

Only these schema additions are intended:

1. `term_billing_months.is_fee boolean NOT NULL DEFAULT false`.
2. `agreement_terms.payment_schedule text NOT NULL DEFAULT 'pattern'`.
3. `agreement_terms_payment_schedule_check`, restricting that column to `pattern` / `explicit`.

The server and client declarations have the same columns, defaults and check. The client intentionally uses its existing lightweight schema stub without adding a new untyped generic call.

The guarded migration was applied to development only: one migration applied, 84 already applied. There is no backfill, automatic fee classification, startup DDL, commercial data rewrite, extra table/index, or stored computed total. Required extension check passed (`pg_trgm`); final schema-drift check reports “Schema is in sync with Drizzle declarations.” Actual publication schema application remains unperformed.

## Value consumers checked

| Consumer | Result |
| --- | --- |
| Payment preparation/recovery, annual summary and billing classification | Non-fee amounts only; computed fees independent of nullable contract price |
| Contract detail/full-detail projection | Computed annual fees, contract total and duration on every season |
| Contract header, Payments summary, monthly amount | Contract versus fees separated, component names/tags, total/duration for long terms |
| New contract/payment review | Fee-aware annual amount; pattern/exact editing and fee-only snow T&M supported |
| Renewal preview, percentage increase, target allocation, multi-year renewal planning | Only non-fee components change; carried fees identified |
| Renewal import and audit import | Shared schedule validations; fee metadata preserved; pre-start consent cannot be bypassed |
| Current Contract Center export and customer audit export | Both contain fee-aware, dated payment CSVs; descriptive season summaries also preserve dated identity |
| Customer contract-summary projection | Stored nullable annual value respected; fee summary independent; explicit first-year window preserved |
| Customer Billing Revenue | Annual contract and annual fees separated with component names, per-month split, total/duration; current/upcoming/previous selection unchanged |
| Customer dashboard aggregate/monthly metric | Fees excluded from contract monthly aggregates as well as annual values; no inherited branch-value allocation |
| Active-customer responsibility and list values | Responsibility model has no monetary calculation; customer list/parent-group annual revenue uses the non-fee customer contract-summary annual value |
| Parent-group totals and de-duplication in customer routes | Continue using non-fee annual summary; no fee allocation to branches |
| Contracts board/list, RFP linked contract cards, customer contract panels | Use stored/projected non-fee annual values; no independent raw-payment sum introduced |
| Legacy copy planner | Explicit defaults only (`pattern`, non-fee); no existing row reclassification or legacy value rewrite |
| Invoice/QBO ownership | Unchanged; season payment plans are not invoices or receipt facts |

## Development examples

All examples used disposable, isolated companies/customers; no real customer was corrected.

- **Jewell Ridge-like:** $22,248 annual contract plus $479.40 annual Mobilization fees ($39.95/month).
- **Westfield-like:** $24,720 annual contract plus separate fees.
- **College Hills-like:** April 2026–September 2027 grounds obligations (18) plus March–September chemical obligations in each year (14). Exact stored rows: 32. Contract total: **$71,030**. First-year April 2026–March 2027 value: **$41,515**. The isolated fixture uses synthetic grounds distributions consistent with the required total; it is not an import or reconstruction of the real signed schedule.
- Browser fixture was removed after verification, including its temporary account, company and local credential file.

## Tests and checks

Targeted backend coverage: nine files, **345 tests passing across the main and corrected follow-up runs**:

```text
contractPaymentSchedules.test.ts
contractPaymentSchedules.integration.test.ts (CONTRACT_PAYMENTS_DB_TEST=1)
contractCenterService.test.ts
routes/contractCenterLifecycle.test.ts
contractChangingRenewal.test.ts
contractCenterCopy.test.ts
contractAudit.test.ts
contractRenewal.test.ts
customerContractSummary.test.ts
```

The integration test uses actual route handlers and database transactions with isolated fixtures. It covers exact create/replacement storage, denied and authorized pre-start writes/history, unchanged rows on unrelated edits, rejected date changes, first-year/full-term values, renewal confirmation/fee carry, fee-only snow T&M, both exports and validated audit/renewal import execution.

Client `test:contract-center`: 16 files / 155 tests passed before the final two Revenue regressions; the changed Revenue and schedule suites then passed all 10 tests. Combined current suite coverage is **157 tests**. Customer dashboard suite separately passed **21 tests**.

Rendered coverage includes fee checkbox/tags, snow T&M fees, exact component grid with explicit zero cells, pre-start consent, contract/fee separation, total/duration, renewal rebuild confirmation and checkbox request state, and Customer Billing Revenue with null/T&M and explicit annual fee windows.

One signed-in browser pass verified:

1. $22,248 + $479.40/year split and checked Mobilization Fee.
2. Pattern-to-exact conversion with no lost rows.
3. Adding a single $10 pre-start fee; save blocked without consent, then saved with atomic history.
4. Reload: exactly 25 obligations, one pre-start fee and the original 24 in-term obligations. Annual fee remained $479.40; the dated all-month fee amount correctly included the extra $10.
5. Invalid start-date change rejected with offending rows; persisted dates/payments unchanged.
6. Explicit renewal preview blocked until rebuild confirmation, then unchanged $39.95/month carried fee; dialog canceled without creating a renewal.

Evidence: signed-in screenshots `zjk701`, `bdp9rl`, `k2afhh`, `ai762w`; an independent app screenshot also confirmed the signed-out page loads. No second browser pass was launched.

### Baseline-aware typecheck

- Canonical `pnpm run typecheck`: exit **2** both before and after; **697 diagnostics** both times, with **zero added or removed file/TypeScript-code diagnostic counts**.
- Baseline errors include existing frontend schema-stub generic calls pulled into API checking, implicit/no-return errors, stale Zod `.errors` use, and mailbox service typing. The root command stops on the pre-existing API failure; it is not a green root check.
- Standalone CRM typecheck: **210 existing diagnostics** at completion. No new payment/contract implementation diagnostics remain. Existing `SeasonDocuments` button-variant error remains.
- An exploratory unchanged non-renewal rendered suite had a fixed-date fixture failure (November 2 assumptions versus the November 6 development date); that unrelated fixture was not rewritten.
- Existing workflow warnings include QBO token-decryption failures for unrelated test companies, PostgreSQL SSL alias/deprecation warnings, Browserslist age and a PostCSS warning. API and CRM workflows start and serve successfully.
- `git diff --check` passed.

Detailed local command logs are under ignored `generated-artifacts/cc2-18/`, including baseline/final typecheck comparison, main/follow-up backend and frontend runs, dashboard tests and schema-drift output.

## Changed files

Schema, backend and verification:

```text
.migration-backup/migrations/0072_contract_payment_schedules.sql
lib/db/src/schema/schema.ts
artifacts/api-server/src/lib/contractCenterService.ts
artifacts/api-server/src/lib/contractCenterService.test.ts
artifacts/api-server/src/lib/contractCenterPersistence.ts
artifacts/api-server/src/routes/contractCenterLifecycle.ts
artifacts/api-server/src/lib/contractChangingRenewal.ts
artifacts/api-server/src/lib/contractPaymentCsv.ts
artifacts/api-server/src/lib/contractAuditFiles.ts
artifacts/api-server/src/lib/contractAuditPlan.ts
artifacts/api-server/src/lib/contractAuditExecution.ts
artifacts/api-server/src/lib/contractAuditExport.ts
artifacts/api-server/src/lib/contractAudit.test.ts
artifacts/api-server/src/lib/contractRenewalPlan.ts
artifacts/api-server/src/lib/contractRenewalExecution.ts
artifacts/api-server/src/lib/contractRenewal.test.ts
artifacts/api-server/src/lib/contractCenterCopy.ts
artifacts/api-server/src/lib/contractCenterCopy.test.ts
artifacts/api-server/src/lib/customerContractSummary.ts
artifacts/api-server/src/lib/customerContractSummary.test.ts
artifacts/api-server/src/lib/contractPaymentSchedules.test.ts
artifacts/api-server/src/lib/contractPaymentSchedules.integration.test.ts
artifacts/api-server/src/lib/contractPaymentBrowserFixture.ts
```

Client:

```text
artifacts/highplains-crm/package.json
artifacts/highplains-crm/src/shared/schema.ts
artifacts/highplains-crm/src/components/contracts/PaymentEditor.tsx
artifacts/highplains-crm/src/components/contracts/ExplicitScheduleEditor.tsx
artifacts/highplains-crm/src/components/contracts/explicitSchedule.ts
artifacts/highplains-crm/src/components/contracts/paymentDraft.ts
artifacts/highplains-crm/src/components/contracts/newContractDraft.ts
artifacts/highplains-crm/src/components/contracts/contractTypes.ts
artifacts/highplains-crm/src/components/contracts/ContractWidgets.tsx
artifacts/highplains-crm/src/components/contracts/RenewDialog.tsx
artifacts/highplains-crm/src/components/contracts/renewPreview.ts
artifacts/highplains-crm/src/components/contracts/FeesSchedule.rendered.test.tsx
artifacts/highplains-crm/src/components/contracts/RenewDialog.rendered.test.tsx
artifacts/highplains-crm/src/pages/NewContractPage.tsx
artifacts/highplains-crm/src/pages/ContractPage.tsx
artifacts/highplains-crm/src/pages/CustomerBillingRates.rendered.test.tsx
artifacts/highplains-crm/src/components/customer/pages/BillingPage.tsx
artifacts/highplains-crm/src/hooks/useCustomerContractSummary.ts
artifacts/highplains-crm/src/components/customer/dashboard/dashboardModel.ts
artifacts/highplains-crm/src/components/customer/dashboard/dashboardModel.test.ts
artifacts/highplains-crm/src/i18n/locales/en.ts
artifacts/highplains-crm/src/i18n/locales/es.ts
```

Documentation:

```text
.agents/memory/contract-payment-direction.md
docs/contract-payment-schedules-verification.md
```

## Reserved for separate approval

No real Jewell Ridge, Westfield, Westlake or Vistas fee classification was changed. The real College Hills schedule was not loaded. Both corrections require publication first, a signed-document comparison and Randy's separate approval; this implementation does not authorize them.
