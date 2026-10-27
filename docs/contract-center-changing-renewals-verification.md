# Contract-changing renewals — implementation and verification

## Boundary and delivery

An agreement is one customer's continuing contract relationship. Line and form belong to each season's signed document. This slice changes Contract Center only; legacy operational contracts, revenue/reports, tickets, Snow/mobile consumers, roles and frozen legacy records are not repointed. Copy remains disabled.

### Migration / expected Publish schema difference

The **only new migration is `0050_term_line_form.sql`**:

- Add `agreement_terms.line text NOT NULL`.
- Add `agreement_terms.form text NOT NULL DEFAULT 'ours'`.
- Drop NOT NULL on `agreements.line` and `agreements.form`; retain both columns and the existing agreement form default.

The guarded backfill only fills missing seasonal values, preserving already-populated values on repeat execution. PostgreSQL supplies transaction-default `created_at`; no stored renewal-set marker, table, or document-link column was added. Schema declaration diff contains only these changes. No unrelated destructive schema diff was found.

**A platform Publish preview was unavailable: no publication was attempted.** The above is the reviewed migration/declaration difference, not a claim that a Publish preview ran. Development migration and schema-drift checks passed. Production migration/publication is not part of this work.

## Behavior

- New contracts and all renewal/import/disabled Copy writes put line/form on terms, not agreements. Both schema copies and explicit frontend insert-term validation agree.
- Display/current selection remains separate from renewal source selection. Headers use current, with latest fallback. Cards use their card season; table sorting/filtering uses its row season. API coverage filters include current or pending renewal.
- Renew accepts exactly one percentage or exact annual cents, rounding, up to four later-year increases, optional seasonal form/line, rates/scope modes and dry run. Old explicit percentage-plus-rounding requests preserve calculation behavior.
- Coverage transformations precede repricing; adding Snow defaults to T&M, never an automatic flat-payment line. Exact scaling uses integer arithmetic for potentially unsafe cent products and reconciles to the requested total. Zero-total sources use twelve Grounds maintenance payments.
- Rates carry only covered custom/override rates and add covered active card rates; reset discards old overrides/custom rates. Changing to Our form defaults to reset unless explicitly overridden. Scope carries covered services/adds newly-covered defaults or resets to shared `initialScope`.
- One-year dates retain `renewalDates`. Multi-year dates are contiguous twelve-month seasons. Each draft carries the prior year's seasonal settings, scope, rates, contacts, PO, triggers and notes, applies its own increase, and chains to the prior year.
- All years/children/history write atomically under the agreement lock; previews write nothing and describe each year's before/after payments and price plus year-1 changes.
- Membership requires the same company/agreement, predecessor chain, exact PostgreSQL transaction timestamps, **and positive matching year/range creation-history evidence on every member**. Timestamp selection preserves microseconds instead of comparing JS millisecond Dates. Ordinary multi-season audit imports remain independent one-year sets even when their chained seasons share a transaction timestamp; separate one-year renewal transactions also stay separate sets.
- Year 1 owns status changes and signed documents. Set Sent/Signed timestamps are shared. Signing renews predecessors in order, leaving only the last year Signed; Lost/Cancelled/back-to-Draft apply atomically. Later-year status requests return 409 with year-1 guidance.
- Set/document navigation survives signing/reload. Signed fields remain read-only; year 1 retains the set's document upload/status controls after its intermediate status becomes Renewed. Later years navigate to year 1 rather than requesting duplicate signed documents.
- Audit import grouping requires customer agreement only, not identical seasonal form/coverage. Renewal CSV optional form/line default to its explicit source ID. Carried rates/scope share coverage transformations; existing required explicit payment and explicitly supplied scope/rate override rules remain intact. Exports use seasonal values without changing existing CSV columns.

## Consumer audit

The baseline search included direct `agreement.line/form`, `agreements.line/form`, and aliases `a`, `ag`, `contract`, `item`, `detail`, and copy/import DTOs in the Contract Center surface. No application read/write of the retained **database agreement** line/form columns remains.

| Audited site | Replacement / explanation |
| --- | --- |
| `contractCenterLifecycle.ts` create `const {line,form,...}` / agreement insert | Relationship-only agreement insert; fields written on first term. |
| Same route list filter `a.line` | Selected current/latest and pending season coverage. |
| Same route PATCH `agreement.line` for snow validation/payment summary | Edited `term.line`. |
| Same route child scope/rates/payments PUT `agreement.line` | Edited `term.line`. |
| Same route Renew rate selection, snow defaults/validation, payment summary | Pure planner using explicit selected source season and requested year-1 line/form. |
| `contractCenterPersistence.ts` spreading agreement into detail/list | Line/form explicitly overwritten by current/latest seasonal projection; every term summary carries its own fields. |
| `contractRenewalPlan.ts` synthetic row `agreement.line/form` | Optional CSV fields or explicit source term values. |
| Same planner rates, snow/T&M payment requirements, supplied-rate validation, report term fields | New seasonal `line/form`. Form-to-ours reset uses active card; explicit CSV overrides still apply. |
| `contractAuditExecution.ts` `agreement.line/form` writes | Removed from agreement insert; each imported term carries row-level values. |
| `contractAuditPlan.ts` grouping / report `a.line/form` | Grouping agrees only on customer. Remaining alias denotes an in-memory import-plan compatibility projection, **not a DB agreement**. Report terms expose their own line/form. |
| `contractAuditExport.ts` `seasonCsv` aliases `a.line/form` | `t.line/form`; shared by audit and current `contract_center.csv` exports. |
| `contractCenterCopy.ts` / `contractCenterCopyExecution.ts` | Seasonal fields populated on each term. Planner's `agreement.line` is a legacy grouping/report hint, stripped before agreement insert. Copy remains disabled. |
| Copy tests and `LegacyCopyCard.tsx` `a.line` | In-memory legacy grouping/report keys, not retained DB columns; deliberately unchanged matching/grouping behavior. |
| `boardLogic.ts` `item.line/form` | Card term, row term, or current/latest seasonal values; compatibility fallback is already a server-derived header, not a stale agreement column. |
| `ContractCenterPage.tsx` row/card `item.line/form` | Own card/row season through `termLine/termForm`, `rowLine/rowForm`. |
| `CustomerContracts.tsx` `contract.line/form` | Current/latest term; compatibility fallback is derived API header. |
| `ContractPage.tsx` `detail.line/form` and editor inputs | Header uses derived current values; selected season supplies badges and scope/rate/payment validation/editor line. |
| `RenewDialog.tsx` target/header line/form | Server preview source or detail's `selectRenewalSource`, not display-current season; defaults remain implicit server source when unchanged. |
| `AuditImportCard.tsx` `a.line/form` | Each preview term's line/form; old report fixtures may fall back to compatibility grouping metadata. Agreement header no longer claims uniform coverage/form. |
| `ScopeEditor.tsx`, `RatesEditor.tsx`, `PaymentEditor.tsx`, `rateCardUtils.ts` | Already parameter-driven; callers now pass selected seasonal line. No DB agreement reads inside these utilities. |
| Schema copies / 0050 | Retained nullable agreement definitions and migration backfill are intentional; only migration reads old columns. |
| Fixtures/test assertions containing agreement line/form | Compatibility assertions and setup of old/imported data; not application consumers. New disposable sources write seasonal fields. |

## Verification

Evidence logs are in ignored `generated-artifacts/cc29/`. Disposable companies/users are removed after database suites and browser verification.

### Automated checks

- API service, Copy, audit, renewal and lifecycle unit suites: **244 tests passed**.
- Post-report/status-return changes: affected audit/renewal/lifecycle delta suites **149 passed**.
- Opt-in PostgreSQL renewal/import/changing-renewal suites: **28 passed**; current-season integration **2 passed** after updating its requests to explicitly supply the now-required price choice.
- Guarded migration fixture: **1 passed**, including rerun preserving seasonal values, agreement nullability, required term columns/default, and rollback of fixture DDL.
- CRM `test:contract-center`: **103 passed** before the final signed-set document regression; final delta recorded below.
- Broader contracts directory: **102 passed / 1 pre-existing failure** in unchanged `rateCardUtils.test.ts > groups and counts missing`: expected 23, actual 42. Both catalogs, the utility and that test are unchanged from baseline. A previous catalog expansion made this fixed count stale.
- Required extensions and `check-schema-drift`: **passed** after 0050. Frozen/offline dependency installation passed; lockfile changes are limited to the CRM workspace dependency on the existing API-Zod package.
- Root `pnpm run typecheck`: **blocked by existing errors** (735 emitted errors in the captured root run), including `auth.ts` TS7030, existing `routes.ts`/storage export mismatches, mailbox mock/test type errors, cross-artifact script imports and the CRM's existing untyped Drizzle stub schema errors. No new renewal implementation diagnostic remained in that run. The directly run CRM typecheck also reports existing unrelated App/loading/schedule/schema errors. No broad unrelated type fixes were made.
- API/CRM workflows were rebuilt/restarted and served successfully. Login screenshot loaded without a rendering failure. The unrelated mobile watcher failed during dependency relinking; restarting its existing workflow restored it.

The new tests cover target scaling/patterns/odd cents/zero/overflow, every coverage transition, rate reset/carry including custom removals, scope-default parity, multi-year dates/prices/chains, dry-run no writes, term-only creation, current/pending filtering, atomic lifecycle/write rollback and duplicate concurrency, post-sign membership/document references, separate one-year transaction independence, authorization, old archive imports, optional renewal CSV fields and differing-form audit rows.

### Development scenarios

1. Browser: Their-form Landscape $30,000 → Our-form Both, three years +3/+3/+3. Form-change/Snow notices and automatic card reset appeared; prices were $30,900 / $31,827 / $32,782 under whole-dollar rounding. Creation opened year 1 and created three drafts. Sent then Signed propagated; original/year1/year2 became Renewed, final year Signed. Day-aware year1 displayed Active on the board at $30,900 and Both coverage.
2. Browser: later-year Status follows and Signed document see-year1 navigation survived reload/signing. The initial check found hidden year-1 document uploads after signing; corrected with a rendered regression while leaving signed fields read-only.
3. Browser/API: Both with $6,000 flat Snow → Landscape exact **$31,500.17**. Persisted 12 Grounds rows total exactly 3,150,017 cents; no Snow billing/rates/scope, snow pricing/flat price null. Source seasonal fields, payment rows, rates, scope and history stayed unchanged. The preview deliberately shows removed Snow's old→zero and old flat→none values as required before/after explanations.
4. Existing `contract-import-template_1791932139984.zip` imported/reimported in isolated scratch companies through the opt-in audit suite, substituting only placeholder IDs. Existing renewal archive integration passed unchanged. No real signed customer records or audit trails were used.
5. Final signed-set document-control regression and cleanup results are recorded in the completion addendum.

## Changed files

### Database, shared library and workspace
- `.migration-backup/migrations/0050_term_line_form.sql`
- `lib/db/src/schema/schema.ts`
- `lib/api-zod/src/contractScope.ts` (canonical browser/server-safe initial-scope policy)
- `lib/api-zod/package.json`
- `pnpm-lock.yaml`
- `artifacts/highplains-crm/package.json`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `.agents/memory/contract-center-phase-boundaries.md`
- `.agents/memory/MEMORY.md`
- `.agents/memory/drizzle-correlated-selects.md`

### API implementation / verification helper
- `artifacts/api-server/src/lib/contractChangingRenewal.ts`
- `artifacts/api-server/src/lib/contractChangingRenewalVerification.ts` (explicit development-only fixture prepare/cleanup)
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.ts`
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`
- `artifacts/api-server/src/lib/contractAuditFiles.ts`
- `artifacts/api-server/src/lib/contractAuditPlan.ts`
- `artifacts/api-server/src/lib/contractAuditExecution.ts`
- `artifacts/api-server/src/lib/contractAuditExport.ts`
- `artifacts/api-server/src/lib/contractRenewalPlan.ts`
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`

### API tests
- `artifacts/api-server/src/lib/contractChangingRenewal.test.ts`
- `artifacts/api-server/src/lib/contractChangingRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/contractTermMigration.integration.test.ts`
- `artifacts/api-server/src/lib/contractCurrentSeason.integration.test.ts`
- `artifacts/api-server/src/lib/contractRenewal.test.ts`
- `artifacts/api-server/src/lib/contractAudit.test.ts`
- `artifacts/api-server/src/lib/contractAudit.integration.test.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`

### CRM implementation
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/CustomerContracts.tsx`
- `artifacts/highplains-crm/src/components/contracts/RenewDialog.tsx`
- `artifacts/highplains-crm/src/components/contracts/boardLogic.ts`
- `artifacts/highplains-crm/src/components/contracts/contractTypes.ts`
- `artifacts/highplains-crm/src/components/contracts/newContractDraft.ts`
- `artifacts/highplains-crm/src/components/contracts/renewPreview.ts`
- `artifacts/highplains-crm/src/pages/ContractCenterPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractPage.tsx`

### CRM tests / report
- `artifacts/highplains-crm/src/components/contracts/RenewDialog.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/boardLogic.season.test.ts`
- `artifacts/highplains-crm/src/pages/ContractCenter.board.test.tsx`
- `artifacts/highplains-crm/src/pages/ContractBilling.rendered.test.tsx`
- `docs/contract-center-changing-renewals-verification.md`

## Completion addendum

- Final CRM delta: **20 tests passed** across `ContractBilling.rendered`, `AuditImportCard.rendered` and `boardLogic.season`. This includes the signed-set year-1 upload/status regression and confirms signed-field editing stays disabled.
- The development-only browser company/user and ignored credential file were removed successfully. Integration suites remove their isolated fixtures in teardown.
- Final required extensions and schema drift passed. API and CRM rebuild/restart logs show both serving without a startup error. `git diff --check` passed.
- A new browser pass was not run for the small document-control visibility fix; the rendered regression directly confirms the upload button and status menu while the existing route tests cover authorization/document versions. No actual signed blob was uploaded during browser verification.
- The Both→Landscape **draft** intentionally does not change the parent header's still-current historical source coverage before signing. Its own season/card/editor uses Landscape, and list filtering also matches the pending Landscape renewal.
- Completion review caught a false-positive membership case for same-transaction audit histories. Corrected by requiring matching positive multi-year notes on all grouped terms, not just accepting absent notes. The new PostgreSQL audit regression imports a real multi-season archive, verifies identical transaction timestamps and predecessor chaining, reloads detail, changes the later season's status directly, and successfully attaches signed documents to **both independent imported seasons** through the real route/database (only external object I/O mocked).
- The tighter regression also exposed Drizzle stripping interpolated outer-column qualification in a correlated SELECT projection. The creation-note lookup now uses fixed, explicitly table-qualified identifiers, and integration assertions require actual non-null year notes plus length-3 membership. Final changed audit/multi-year PostgreSQL suites: **19 passed**. Existing renewal archive (10) and current-season (2) suites passed separately; the combined database coverage is now 31 tests plus the migration fixture.
- The final review's custom-scope finding is also **addressed**: retained `other:` services preserve their original Snow/Landscape/Irrigation line instead of accepting `buildScope`'s default line for a newly created custom service. Invalid retained custom coverage fails explicitly. Custom Snow services now remain Snow across Both→Both and Snow→Both and are removed for Both→Landscape, including after an intervening carried Both season. The renewal-import planner uses the same corrected function; explicitly supplied CSV scope keeps its existing semantics.
- Added four custom-scope service regressions, three renewal-CSV planner regressions, and three real PostgreSQL persisted-row transition regressions (source rows also remain unchanged). Final affected service/import unit run: **82 passed**. Final changing-renewal PostgreSQL run: **13 passed**. API typecheck still has the previously documented unrelated failures, with no diagnostic in the changed Contract Center/renewal/audit files. No review finding remains intentionally unaddressed.
