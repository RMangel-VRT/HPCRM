# Exact contract rates — implementation and verification

## Scope and safety

Seasons now store exactly their explicitly supplied rates, in input order.
Empty input stores no rows. The company card is an explicit picker/prefill and
estimate fallback, not an implicit list of contract commitments.

**No schema files, migration files, startup code, backfills or production data
were changed. Nothing was published.** Existing seasons were not converted,
classified or cleaned up. Tests used isolated disposable development companies.
Signed-PDF re-audit and explicit production PUT replacements remain separate,
post-publication work requiring the normal release approval.

Direct create and newly supplied replacement keys validate card keys against
the full company card, including inactive keys. Rates PUT may retain an existing
inactive-key row from the locked season only when all its agreed fields are
unchanged (reordering is allowed); introducing or repricing it is rejected.
Once removed it cannot be reintroduced as an inactive key. Existing retired
and custom snapshots are carried on renewal without repricing; only their
reference prices are refreshed. Coverage changes drop nonapplicable rows.

The shared editor preserves untouched nullable text exactly, including numeric
prices with accompanying price text, empty strings and whitespace-sensitive
minimums/text. Reorder, sibling edits and numeric-price edits do not rewrite
these terms. Numeric price and price text are independently editable.

Rates PUT retains the company lock, term lock, Colorado editability and
transaction. It writes exactly one `Rates updated` history item for draft,
sent, signed, active or eligible renewed seasons, including empty replacements.
Its machine-readable added/removed/changed field details are displayed as a
readable, translated entry, rather than a duplicate generic signed-edit event.

## Writers and disposition

| Writer | Disposition |
|---|---|
| `contractCenterLifecycle.ts` create | Exact submitted rows via `snapshotRates`; no card seed. |
| Lifecycle rates PUT | Exact ordered replacement, including zero; one atomic detailed event. Existing own inactive rows may remain unchanged, never newly added or repriced. |
| Lifecycle Renew / `contractChangingRenewal.ts` | Missing `rates` or `"carry"` preserves source commitments. Arrays are complete replacements, including `[]`. Form changes never reset rates. |
| `contractAuditPlan.ts` / `contractAuditExecution.ts` | Complete CSV rate list, including zero rows; execution already persists the planned list exactly and remains unchanged. |
| `contractRenewalPlan.ts` / `contractRenewalExecution.ts` | No child rate rows carries. Any supplied rows replace. Explicit `rates_mode=replace` with no child rows clears; contradictory `carry` plus rows is rejected. Execution already persists the plan exactly and remains unchanged. Dry runs expose carried/added/removed/changed reasons. |
| `contractCenterCopy.ts` / `contractCenterCopyExecution.ts` | Legacy planning includes only explicitly populated applicable legacy rate-sheet values, including zero, not the whole card. Executor remains a direct plan writer. The public legacy Copy endpoint still refuses real execution and remains dry-run only. |
| `contractRenewalFixture.ts` | Development-only source explicitly requests General labor instead of assuming empty input seeds a card. |
| `contractChangingRenewalVerification.ts` | Development-only coverage/form scenarios explicitly request applicable active keys when deliberately constructing an all-card fixture. Never imported by the app. |
| `contractExactRatesVerification.ts` | New development-only three-rate browser fixture with explicit setup/cleanup. Never imported by the app. |
| `customerPagesBrowserFixture.ts` | Unchanged development-only writer of one explicitly stated General labor row. |
| `contractNonRenewal.integration.test.ts`, estimate setup/estimate integration fixtures | Unchanged test-only explicit rate inserts; no card-copy behavior. |
| Other lifecycle/service/renewal tests | Test-only explicit rows and updated expectations; no live writers added. |

The writer inventory was searched for `snapshotRates`, `renewalRates`,
`insert(termRates)` and `replaceRows(...termRates)`.

## Reads, exports and import contract

- Full detail already reads all stored rows ordered by sort order/key; unchanged.
- Customer summaries retain current/upcoming/previous selection, include every
  ordered stated row and references, and project omitted active applicable card
  rows as `standardRates`. Noncommercial roles do not receive either price list.
- Contract and Billing views show stated versus collapsed standard rates
  separately. Billing includes irrigation/general rows and minimums while
  retaining its existing season picker and role boundaries.
- Audit and current reports include all stored rates, including card matches.
  Current exports also include import-shaped CSVs; row order preserves contract
  order and all commercial fields are exported.
- Explicit null/empty and protected text encoding are documented in
  `contract-center-audit-rollout.md`. Rate CSV fields remain editable; no hidden
  payload overrides hand-edited values.
- Export/re-import tests use a valid fresh import target. Existing interactive
  agreement replacement protections are intentionally not bypassed by export.
  Inactive keys are still invalid for newly supplied lists.
- Estimate governing-season selection and rate-card fallback were not changed.

## Validation

Logs are retained locally under ignored `generated-artifacts/cc217/`.

- API targeted Vitest: **364 passed, 8 files** — service, lifecycle routes,
  audit import, renewal import/export, changing renewal, legacy copy,
  customer projection and estimate fallback. Includes retiring a stated key,
  carrying it through renewal, editing/reordering other rates on the signed
  renewal, and rejecting inactive additions/price/text changes without writes.
- Disposable database integration: **26 passed, 3 files**, with
  `CONTRACT_EXACT_RATES_DB_TEST=1 CONTRACT_RENEWAL_DB_TEST=1`.
  Includes three-rate create/renew, remove/add edits, single history event,
  unchanged source after card changes, irrigation at $85 from contract and
  skid loader at $245 from card, complete export round trip, ZIP import of
  two rows and zero rows, and explicit empty renewal-import replacement.
- CRM `test:contract-center`: **147 passed, 15 files**, including rendered
  edit/save regressions preserving numeric-plus-text prices, empty strings,
  nulls and whitespace-sensitive text during reorder, sibling and price edits.
- History localization and customer CP1/CP2/CP3 regressions: **76 passed, 4 files**.
- `pnpm run typecheck`: existing failure baseline retained, **697 diagnostics
  before and after, identical normalized locations/codes/messages**. Composite
  library checks succeeded; no new diagnostics.
- Independent CRM typecheck: **210 existing diagnostics before and after**,
  identical normalized diagnostic sets. Existing examples include legacy shared
  schema stubs and unrelated components; this is not a clean repository-wide
  typecheck claim.
- Read-only `check-schema-drift`: **schema in sync**. Configured extension check
  reports required `pg_trgm` present.
- `git diff --check`: passed.
- API and CRM managed workflows restarted successfully. Development logs contain
  existing unrelated QuickBooks fixture-token warnings; no changed-rate startup
  crash.
- Authenticated browser verification uses a disposable three-rate signed season.
  A first test-plan expectation incorrectly sought snow-only skid loader in a
  landscape standard list; the list correctly excluded it. The unfinished edit
  journey passed using applicable Operator labor instead: added at $240, removed
  General labor, moved Mobilization first, saved/reloaded the exact three rows,
  then removed all rows and saved/reloaded zero. Both replacements produced one
  readable detailed history entry each without a generic duplicate. Standard
  rates remained accessible. No rate-surface console errors. Fixture cleanup
  removes only this disposable company and user.

### Established baseline failures

The unchanged-source archive initially had 61 lifecycle test failures because
its authorization fixtures supplied `activeRole` but not the current
`accessRole`. Affected lifecycle/renewal fixtures now supply both. The audit
suite initially could not load an ignored uploaded ZIP in the archive; supplying
the existing workspace asset gave **61 baseline audit tests passing**.

The client baseline had two failing request assertions, in
`ContractBilling.rendered.test.tsx` and `ContractWidgets.rendered.test.tsx`,
omitting the already-required `X-Company-Id` request option. Those affected
assertions are corrected without changing production authorization.

## Every changed file

Paths below are relative to the repository root.

### API Server

- `artifacts/api-server/src/lib/contractAudit.test.ts`
- `artifacts/api-server/src/lib/contractAuditExport.ts`
- `artifacts/api-server/src/lib/contractAuditFiles.ts`
- `artifacts/api-server/src/lib/contractAuditPlan.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.test.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.ts`
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterService.test.ts`
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractChangingRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/contractChangingRenewal.test.ts`
- `artifacts/api-server/src/lib/contractChangingRenewal.ts`
- `artifacts/api-server/src/lib/contractChangingRenewalVerification.ts`
- `artifacts/api-server/src/lib/contractExactRates.integration.test.ts`
- `artifacts/api-server/src/lib/contractExactRatesVerification.ts`
- `artifacts/api-server/src/lib/contractRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/contractRenewal.test.ts`
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`
- `artifacts/api-server/src/lib/contractRenewalPlan.ts`
- `artifacts/api-server/src/lib/customerContractSummary.test.ts`
- `artifacts/api-server/src/lib/customerContractSummary.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`

### CRM

- `artifacts/highplains-crm/package.json`
- `artifacts/highplains-crm/src/components/contracts/ContractWidgets.tsx`
- `artifacts/highplains-crm/src/components/contracts/RateHistoryNote.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/RateHistoryNote.tsx`
- `artifacts/highplains-crm/src/components/contracts/RatesEditor.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/RatesEditor.tsx`
- `artifacts/highplains-crm/src/components/contracts/RenewDialog.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/RenewDialog.tsx`
- `artifacts/highplains-crm/src/components/contracts/contractCreate.test.ts`
- `artifacts/highplains-crm/src/components/contracts/newContractDraft.ts`
- `artifacts/highplains-crm/src/components/contracts/renewPreview.ts`
- `artifacts/highplains-crm/src/components/contracts/useRateCard.ts`
- `artifacts/highplains-crm/src/components/customer/pages/BillingPage.tsx`
- `artifacts/highplains-crm/src/hooks/useCustomerContractSummary.ts`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`
- `artifacts/highplains-crm/src/i18n/locales/es.ts`
- `artifacts/highplains-crm/src/pages/ContractBilling.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/ContractPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractWidgets.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/CustomerBillingRates.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`

### Documentation and project memory

- `docs/contract-center-audit-rollout.md`
- `docs/contract-exact-rates-verification.md`
- `.agents/memory/contract-stated-rates.md`
