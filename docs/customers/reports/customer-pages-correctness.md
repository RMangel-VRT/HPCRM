# Customer-page correctness and release evidence

## Scope and ownership

This changes correctness inside the existing layout, not the later navigation/header/layout redesigns. AM1's merged account-manager resolver and access-role projection are used without changing anyone's role or real assignment. Contract Center remains the commercial owner; customer activity and immediate parentage remain customer-owned; flags remain workflow-owned.

The approved clarification is represented as **collections** of current/upcoming/previous selections, one selection per agreement. Simultaneous landscape and snow agreements are retained. Billing and rates select a particular agreement/term; only the owning customer's annual KPI aggregates priced current terms. Inherited amounts are explicitly the parent's agreement values, never an inferred allocation to a branch. Snow T&M is unpriced, not zero. Future/history never replace a missing current term.

Effective selection reuses Contract Center's `selectInEffectTerm`, priority, `displayStatus`, `recoverPayments` and `paymentSummary`. `annualPriceCents` is projected as `annualCents`, preserving card parity. Current entitlement uses today's **America/Denver calendar date**, including inclusive start/end boundaries. An effective own term wins over inherited parent terms. Route service/year scope selection is unchanged; display fallbacks do not grant coverage.

There is **no legacy fallback**, even for customers not yet loaded into Contract Center.

## Touched caller inventory

| Concern | Implementation / callers |
|---|---|
| Canonical company projection | API `lib/customerContractSummary.ts`, `routes/customerContractSummary.ts`; registered before generic customer-ID routes |
| Shared client/caching | CRM `hooks/useCustomerContractSummary.ts`, `lib/queryClient.ts` |
| Customer entry and recents | `AppSidebar.tsx`, existing `components/nav/navConfig.ts` role URLs, `lib/last-viewed-customer.ts`; obsolete `CustomersViewSwitcher.tsx` removed from subnav/list |
| Commercial/header reads | `CustomerDetail.tsx`, `CustomerDashboard.tsx`, `CustomerContracts.tsx`, `CustomerContractPanels.tsx`; old year-based Revenue/Monthly/Rate implementations removed from the page |
| Correct destination/mutation binding | `ContractPage.tsx`, `NewContractPage.tsx`, `RenewDialog.tsx`, `NotRenewingDialog.tsx`; term links use `/dashboard/contracts/{agreementId}#term-{termId}` |
| Parent surfaces | Parent rollup route in `routes.ts`, `ParentCustomerDashboard.tsx`, parent rows in `CustomersList.tsx`, conditional property/site cards in detail/dashboard; branch counts are bulk company counts, not counts of the current page/search result |
| Snow consumers | `CustomerDetail.tsx`/`CustomerSubNav.tsx`; `SnowEventDetail.tsx`; customer export in `routes.ts`; `/api/m/properties/:id` in `crewsAndMobile.ts` (the existing mobile `snowEnabled` response field is now derived, so its existing localized property display remains compatible) |
| Retired snow writers | Both insert-schema copies omit the field; wizard model/property/review no longer send it; boot default inserts removed; `snowCoverageInput.ts` guards every customer POST/PUT/PATCH before parsing and the setup service independently guards its boundary |
| Reconciled questions | `contractQuestionFlags.ts`, `index.ts`, flags route metadata protections; schema copies/tag catalogs and `useFlagTaxonomy.ts`; migration `0070_contract_question_source_key.sql` |
| Actual service activity | `useCustomerServices.ts`, `CustomerNextService.tsx`, `CustomerServiceChecklist.tsx`, detail's checklist tab, `ServiceFulfillmentPanel.tsx`; customer-filtered visits preserve existing authorization |
| Visible correctness | EN/ES locales, `currency.ts`, actual proposal status, category/unit labels, customer ticket list/card internal-ID suppression, parent address/property suppression |

No customer-contract repairs, real assignment changes, PNC billing changes, QBO behavior changes or production writes are part of this work. The only persisted metadata added is `flags.source_key`, with the company/source partial unique index for non-resolved/non-dismissed flags. The legacy snow column and legacy tables/endpoints remain.

## Visibility and company boundary

`GET /api/customers/:id/contract-summary` and `/api/customers/snow-covered` require authentication, an authorized reader role and the active company. An initiating `X-Company-Id` mismatch returns 409; another company's customer returns 404. Responses are private/no-store.

* Admin, office and AM1-projected account managers receive commercial current/upcoming/previous collections, annual amounts, payment rows, negotiated rate snapshots, scope and inherited-parent provenance.
* Other allowed readers (field manager, chemical manager, field, irrigation manager, mapping, landscape supervisor and crew supervisor) receive only `asOf`, coverage and current line/label/start/end. They receive **no agreement/term IDs, prices, payment/rate/scope/triggers, future/history or nested commercial records**. Existing route permissions are not widened.
* The client summary key starts with `["/api/customers", customerId, "contract-summary"]`, followed by company/viewer/role identity. Snow/service query keys have the same identity boundary. Customer detail itself has a company/viewer-bound request/key; recents contain five unique IDs **per company**, tolerate blocked/quota/malformed storage and never read the old unscoped remembered customer.
* The main Customers link uses `navConfig` directly: list for the existing office/manager roles and the field list for the existing field-facing roles, never remembered-customer redirects.

## Invalidation and reconciliation inventory

Successful `apiRequest` mutations under Contract Center, admin Contract Center, customers (including setup, activation and AM bulk assignment), user/team/company-membership, QBO and estimate/bid/proposal paths invalidate **all** customer contract-summary keys and snow-membership keys. This includes acceptance/conversion that creates terms outside the Contract Center controller, and intentionally includes inherited branches rather than only the agreement owner. Failed writes and reads do not invalidate. Contract Center create/term edits/scope/rates/payments/status/renew/non-renewal/audit/document mutations are covered by these path families. Existing Contract Center own-list/detail invalidations remain.

The post-commit middleware captures the initiating company before the handler, and queues reconciliation only after a successful response has finished. The same relevant term/customer/parent/activation/assignment/membership/import path families are covered. Each company's reconciliation holds a transaction advisory lock, bulk-loads facts and AM1 context, then reconciles against locked open source-key flags. The unique partial index is the second concurrency guard. Only `new` flags are reassigned; acknowledged/in-progress workflow ownership is preserved.

* `snow-triggers:{termId}`: signed/active/renewed snow/both terms whose end is today or later, including future terms, and whose trigger text trims empty. The exact note names the season and asks for trigger depth. Saving triggers or cancelling/ending the qualification resolves the question.
* `no-term:{customerId}`: active customer status **and** active=true without an effective own/qualifying inherited term. Prospects/inactive customers do not qualify. Exact note: “No contract in the Contract Center for this property. Add the current contract.” Effective terms, parent changes and deactivation resolve the question.
* Creator is system/null; assignee is the resolved eligible AM or null, never a fallback human. Clients cannot write source metadata.
* Startup plus hourly sweep follows the existing non-renewal scheduler pattern and includes every Colorado midnight. A failed post-commit pass logs the error and is retried by the sweep; no application fallback is introduced.

## Service activity boundary

Campaign items retain their service identity and real campaign metadata. Completed/skipped/overdue/in-window/upcoming classification uses Colorado date-only comparisons; extra-billable categories are not `inContract`. Route occurrences are added with source-prefixed stable IDs. Ticket/campaign-linked visits are not counted a second time.

Visits are included only for existing admin/office/field-manager access (account managers through AM1); permissions are not broadened. The existing visits endpoint's bounded range is honored: **31 days before and after today**. Campaign history is not truncated. Route work outside that 62-day query window is the narrow deferred limitation, not a reason to fetch unauthorized/all-company visits or revive service plans. A day timer updates classification across Colorado midnight even if unchanged query rows are structurally shared.

## Remaining legacy consumers (inventory, not repointed)

* General Revenue pages/reports and `/api/revenue/*`, `/api/dashboard/*revenue*`, `/api/customers/:id/revenue/:year`, all-monthly/contract-monthly compatibility endpoints still use frozen legacy contracts/monthly amounts.
* `TicketDetail.tsx` still reads the legacy customer rate-sheet endpoint. Legacy `ContractWidgets.tsx` (`ContractServices`/`ScheduleSummary`) and exported archive card/history helpers remain for compatibility, but customer-page commercial/activity tabs do not mount legacy readers.
* The maintenance-free legacy service-plan endpoints and service-plan/template settings remain; parent-to-child plan propagation in `routes.ts` is outside customer-page reads. No campaign generation or owed-versus-done rules are invented.
* Mobile legacy contract-basis/service readers outside the explicitly switched snow field remain independent work. Recurring routes remain the sole recurring schedule owner.
* No operational decision still uses the manual snow switch; a source search leaves schema retention, guards, derived response/prop names, tests and the comparison script.

## Read-only snow/missing-term evidence and manual release gates

Reproducible development commands (from workspace root):

```sh
pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/scripts/compare-customer-snow.ts --company=<company-id>
pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/scripts/compare-customer-snow.ts --all --counts-only
```

The script runs `SET TRANSACTION READ ONLY`, makes only scoped SELECTs, and never repairs contracts or creates flags. Per-company full output includes IDs/names, manual/derived snow, covering agreement/term/line/dates/parent and active missing-term customers. Global mode requires counts-only to avoid an accidental cross-company row export.

Recorded on Colorado date **2026-11-05**, before the final regression suites:

* All development companies: **69 companies, 38 customers, 2 snow mismatches, 28 active missing-term customers**, including the disposable four-customer browser fixture.
* Excluding that isolated fixture: **68 companies, 34 customers, 0 snow mismatches, 25 active missing-term customers**. This development fork includes prior synthetic test companies; these are not production counts or evidence that production is safe.
* Positive disposable fixture: **2 mismatches and 3 missing-term customers**. Ute Creek has manual=false/derived=true with the 2026–27 both-line term listed. The uncovered fixture has manual=true/derived=false and no covering term. Its parent and branch are also uncovered. This proves both mismatch directions and the missing-term report without modifying a real contract.
* Raw development evidence is ignored under `generated-artifacts/cp1/snow-comparison-{all-dev,fixture}.*`; row output is not committed.

**Before publishing, Randy must manually run the per-company comparison read-only against production and correct genuine Contract Center gaps through the authorized contract workflow.** Do not publish merely because the development comparison ran. No code or nightly job repairs the gaps, and missing terms never invoke a legacy fallback. Apply migration 0070 with the normal migration process before running the new server. Production schema/data comparison and gap corrections remain manual gates.

## Verification

Evidence, exact command output, archived prerequisite source and before/after typechecks are retained under ignored `generated-artifacts/cp1/`. Baselines use refreshed library declarations and artifact-local Vitest launchers. Targeted API tests cover concurrent agreements, Ute annual/payment parity, role allowlists, company isolation, no fallback, flag concurrency/reassignment/date transitions/post-commit lifecycle and every supplied snow value including false/null. Rendered EN/ES guards exercise all customer tabs and reject visible translation keys or legacy customer commercial/service-plan query calls. Cache tests cover each mutation family, inherited branches and failed-write behavior. Colorado service and safe company-recents tests are separate.

A passing targeted result must not be represented as a clean repository-wide typecheck: the input baseline already contains unrelated errors.

### Final results

| Check | Before | After / final evidence |
|---|---|---|
| Refreshed composite library declarations | Pass | Pass (`baseline-libs.log`, `after-libs.log`) |
| API TypeScript | 697 diagnostics | 697 diagnostics; two existing inferred-type messages reorder their literal fields, not new errors (`final-api.log`) |
| CRM TypeScript | 219 diagnostics | 217 diagnostics, no new diagnostic signatures (`final-crm.log`) |
| Mobile TypeScript | Pass, 0 diagnostics | Pass, 0 diagnostics (`final-mobile.log`) |
| CP1 API/unit/HTTP tests | New coverage | **40 passed / 3 files** (`cp1-api-final.log`) |
| Rendered customer EN/ES guards + CQ7 | CQ7 prerequisite passed | **49 passed / 2 files**, including failed-summary versus no-contract distinction (`customer-tabs-final.log`) |
| Other focused client checks | Contract Center UI prerequisite **28 passed / 3 files** | **65 passed / 7 files** across focused evidence, plus the corrected 49 above: **114 named focused cases passing**. Includes rates/cards, renew/create/doc UI, recents, classification and cache invalidation. The final cache family check is **17/17** (`cache-final.log`), including estimate acceptance. |
| Schema/migration | Existing baseline | Migration 0070 applied; **schema in sync** (`migrate.log`, `schema-drift.log`) |
| Signed-in disposable AM journey | Not applicable | **Passed**, screenshot evidence listed below; fixture and synthetic account removed afterwards |

The broad prerequisite sweep is deliberately reported as **not fully green**:

* Archived unchanged-source API sweep: **492 passed, 164 failed, 38 skipped** across 34 files. These include older authorization fixtures without AM1's `accessRole`, stale board/schema contracts and existing visits expectations. The explicitly enabled archived audit/parent/non-renewal/migration subset also fails: **16 passed, 12 failed, 10 skipped** across four files; its audit fixture initialization is not a passing baseline.
* Working API sweep with the optional audit/renewal switches enabled: **615 passed, 180 failed** across 37 files. This raw run includes the initial CP1 post-commit **test harness** failure (passing a Supertest object instead of an Express app), fixed and confirmed in the final 40/40 CP1 run. The QBO sync integration file also reported an after-test `Customer sync busy, try again` cleanup failure; its underlying commercial/sync implementation was not changed. Do not characterize this broad run as a clean prerequisite release gate.
* Archived CRM prerequisite sweep: **191 passed, 10 failed**; an additional AM-list suite initially could not resolve an archived image. Linking the unchanged asset directory made that suite pass **4/4**. Six old customer-contract assertions expected the retired legacy customer-page display; those were replaced by the new Contract Center-only contract tests. The four existing `CustomerSyncControls` failures remain outside this feature.
* The working broad CRM run recorded **231 passed, 41 failed** before correcting company-key-aware mocks in the two customer rendered files. Those two files are now **49/49 passing** (including two added error-state cases); the other seven focused files were already 64/64, with the additional estimate-acceptance cache case now passing too. The remaining QBO control failures were reproduced in the unchanged baseline, not silently skipped.
* No dependency/security scan or second browser pass was added. No production comparison, migration, publication or contract-gap repair was performed.

Reproducible focused commands, from the respective artifact directories:

```sh
# artifacts/api-server
./node_modules/.bin/vitest run \
  src/lib/customerContractSummary.test.ts \
  src/lib/customerContractSummary.integration.test.ts \
  src/routes/customerSnowWrite.test.ts

# artifacts/highplains-crm
./node_modules/.bin/vitest run \
  src/pages/CustomerDetail.cp1.rendered.test.tsx \
  src/pages/CustomerDetail.cq7.rendered.test.tsx \
  src/pages/CustomerContracts.rendered.test.tsx \
  src/components/contracts/RenewDialog.rendered.test.tsx \
  src/components/contracts/SeasonDocuments.rendered.test.tsx \
  src/pages/NewContractPage.rendered.test.tsx \
  src/lib/customerServices.test.ts \
  src/lib/recentCustomers.test.ts \
  src/lib/contractSummaryInvalidation.test.ts
```

Before/after typecheck commands are `pnpm run typecheck:libs`, followed by `pnpm --filter @workspace/{api-server,highplains-crm,highplains-mobile} run typecheck` individually. Broad sweep path selection and complete output are retained in the ignored regression logs/inventory; optional API switches were `CONTRACT_AUDIT_DB_TEST=1 CONTRACT_NON_RENEWAL_DB_TEST=1 CONTRACT_RENEWAL_DB_TEST=1`. Skipped opt-in development scenarios were not forced against existing people or real customer contracts.

Browser evidence: `zga5r2` Ute populated overview, `eknhbd` selected 2026–27 customer Revenue/payment rows, `suygu6` Customers list/parent branch count, `fda5e8` uncovered customer. The tester observed one generic login 401 and one unidentified transient 502, followed by successful summary/agreement/Revenue/uncovered responses. Separate stateless screenshot captures timed out; the authenticated screenshots and browser journey are the UI evidence. The independent global Revenue page still showed zero for this newly seeded Contract Center-only customer, as expected from the remaining legacy-consumer inventory; it was not repointed within this slice.

### Changed-file manifest

Paths below are relative to their named package except for the workspace entries.

* Workspace: `.agents/memory/customer-pages-direction.md`, `.migration-backup/migrations/0070_contract_question_source_key.sql`, `lib/db/src/schema/schema.ts`, `lib/db/src/flag-tags.ts`, `docs/ownership/data-ownership-map.md`, `docs/ownership/reports/data-ownership-audit.md`, this report.
* API: `scripts/compare-customer-snow.ts`; `src/index.ts`; `src/lib/{customerContractSummary,contractQuestionFlags,snowCoverageInput,customerPagesBrowserFixture}.ts`; `src/lib/customerContractSummary{,.integration}.test.ts`; `src/routes/{customerContractSummary,crewsAndMobile,flags,routes,visits}.ts`; `src/routes/customerSnowWrite.test.ts`; `src/services/customerSetup.ts`.
* CRM components: `AppSidebar.tsx`, `CustomerServiceChecklist.tsx`, `ServiceFulfillmentPanel.tsx`, `TicketCard.tsx`, `TicketListView.tsx`; `contracts/{CustomerContracts,RenewDialog,NotRenewingDialog}.tsx`, `contracts/RenewDialog.rendered.test.tsx`; `customer/{CustomerContractPanels,CustomerNextService,CustomerSubNav}.tsx`, `customer/CustomerSubNav.test.tsx`, deleted `customer/CustomersViewSwitcher.tsx`, `customer/dashboard/CustomerDashboard.tsx`; `customerWizard/wizardModel.ts`, `customerWizard/sections/PropertySection.tsx`.
* CRM hooks/libraries/schema/copy: `hooks/{useCustomerContractSummary,useCustomerServices,useFlagTaxonomy}.ts`; `lib/{currency,last-viewed-customer,queryClient}.ts`, `lib/{contractSummaryInvalidation,customerServices,recentCustomers}.test.ts`; `shared/schema.ts`; `i18n/locales/{en,es}.ts`.
* CRM pages: `{CustomerDetail,CustomersList,CustomerSetupWizard,ParentCustomerDashboard,SnowEventDetail,ContractPage,NewContractPage}.tsx`; `{CustomerDetail.cp1,CustomerDetail.cq7,CustomerContracts,NewContractPage}.rendered.test.tsx`.
* Mobile: `app/flag/new.tsx`, `i18n/{en,es}.ts`; the property screen's existing Boolean response contract stays compatible while its API field is derived.
