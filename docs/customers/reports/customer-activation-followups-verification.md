# Customer setup, win activation and login return — verification

## Result

Implemented in the existing CRM and API Server. No schema changes, production data changes, remote QuickBooks operations, write enablement, initial synchronization, mobile changes or publishing.

- Already-active setup edits bypass **only activation completeness**. Active creation and every non-active-to-active setup transition still require completeness. Other input, relationship, permission, provided-field and concurrency rules remain in place.
- Incomplete active customers and prospects receive the existing permission-scoped Finish setup banner. Active Review uses the existing advisory, beginning “Still missing for QuickBooks: …”.
- Only successful signed-document registrations and estimate acceptances can return optional prospect activation metadata. Advisory lookup failures do not turn committed wins into failures.
- Both original win handlers use the same explicit activation dialog. Activation is a separate company-bound customer PATCH, with pending protection, cancellation, retryable failures, stale-completeness recovery, setup links and accurate asynchronous QuickBooks wording. Existing signing confirmation, lifecycle results and ticket behavior remain intact.
- All signed-out entry points preserve dashboard pathname **and query string**. The authenticated route tree also recognizes `/login`, so updating the auth cache cannot bypass the safe return decision. Unsafe `next` destinations fall back to existing role-aware landing.
- New copy is available in English and Spanish.

## Actual call sites touched

| Area | Call site and behavior |
| --- | --- |
| Setup API | `customerSetup.validateRelationships`: compares persisted prior status before enforcing completeness. Creation still enforces it. |
| Setup UI | `CustomerSetupWizard.WizardBody`: step/submission rules use the original persisted status; concurrency uses the same original snapshot. Existing Review warning is reused. |
| Customer detail | Existing `FinishSetupBanner` now queries and displays the authoritative missing list for active customers as well as prospects. |
| Signed upload API | Contract-center document registration: enrichment happens after the transaction commits and the one-use upload binding is consumed; only `kind: "signed"` is enriched. |
| Signed upload UI | `ContractPage.ContractView` → `ContractUploadButton.onUploaded`: offers activation, retains the existing mark-signed prompt, and does not replay upload if later refresh fails. The shared upload helper forwards the initiating company on URL issuance and registration, without changing storage PUT or legacy callers. |
| Estimate API | Lifecycle route after `transitionEstimate`: acceptance uses the committed result's customer ID for company-scoped advisory lookup. Other lifecycle actions retain their response shape. |
| Estimate UI | `EstimateBuilder.BuilderContent.act`: installs the saved result and preserves the original success handling before offering activation only for acceptance. |
| Activation UI | Shared `useCustomerActivation`: existing `/api/customers/:id` PATCH with `status: "active"` and `X-Company-Id`; invalidates customer data, including legacy paginated keys; clears the dialog on company/viewer scope changes. |
| Signed-out routing | Individual `ProtectedRoute` and **both** top-level signed-out fallback branches in `App.Router` use `LoginRequiredRedirect`. The loading-overlay branch previously bypassed the individual guard too. |
| Credential completion | `LoginPage` no longer races an imperative mutation-success navigation against authenticated rendering. The auth cache update leads to the same `LoginLandingRedirect`. |
| Already-authenticated login | The authenticated `App.Router` switch explicitly mounts `LoginPage` at `/login`; `LoginLandingRedirect` uses the same safe selector and query string. |

No separate MFA, password-reset or other credential-completion caller was found. Existing default/root landing and access checks are unchanged.

## Test and typecheck results

### Before

- Original API baseline: **119 tests passed, 3 files** (customer setup, contract lifecycle and estimate lifecycle integration).
- Untouched frontend baseline reconstructed from the original checkout: **49 tests passed, 4 files**. An earlier overlapping frontend run was not used as the baseline.
- `pnpm run typecheck`: **exit 2**, 716 existing diagnostic lines.
- `pnpm --filter @workspace/highplains-crm run typecheck`: **exit 2**, 223 existing diagnostic lines.

### After

- API customer/QBO, contract and estimate regression group: **499 passed, 18 files**, exit 0 (`generated-artifacts/cq6/api-verified.log`).
- CRM regression group: **208 distinct tests across 16 files**. The broad pass had 206 passing tests and one failing source-inspection assertion caused by jsdom's HTTP `import.meta.url`; after correcting that test fixture to use its filesystem directory, the entire **9-test login-return file passed**, exit 0. A subsequent safe-next test also covers encoded spaces, literal percent signs and nested URLs in query values (`web-verified.log`, `login-corrected.log`, `query-verified.log`). No application failure remains in this group.
- Final `pnpm run typecheck`: **exit 2**, the same **716** diagnostics.
- Final CRM typecheck: **exit 2**, the same **223** diagnostics.
- Normalizing line/column shifts and the pristine checkout prefix produced **zero new and zero removed diagnostics** in both comparable before/after checks. Workspace checking refreshed shared declarations before comparison.
- Existing failures include API imports of CRM schema/helpers outside its `rootDir` (`TS6059`), pre-existing return-path diagnostics, implicit-any diagnostics and the existing unsupported `"link"` button variant. These were not hidden, relaxed or fixed as part of this scope.
- `git diff --check` passed.
- Completion code review passed. The required schema/extension check initially found a duplicate Drizzle config in the ignored baseline snapshot, not database drift; the copied config was removed before retrying completion.

The API group includes:

- `customerActivation.test.ts`, `estimates.activation.test.ts`, `customerSetup.integration.test.ts`;
- `contractCenterLifecycle.test.ts`, `contractCenter.test.ts`;
- `estimateLifecycle.integration.test.ts`, both service/route `estimateLifecycle.test.ts` suites, `estimates.test.ts`;
- both customer billing suites, `qboCustomerReads.test.ts`, `qboCustomerMap.test.ts`, `qboClient.test.ts`;
- QBO customer push, promotion, sync and timeout integration suites.

The CRM group includes:

- New shared activation-dialog, safe-next and login-return suites;
- Setup wizard, both actual win-handler suites, landing and by-QBO resolver suites;
- Contract upload, contract billing/non-renewal, Contract Center rendered/board, new-contract, contract-save and contract-create suites.

Coverage includes incomplete active gate/contact saves, create/transition rejection, unchanged prerequisites, role-scoped banners, both win origins' activation/cancel/setup/stale/retry/no-prompt paths, company expectation headers, signed versus other document kinds, non-accept actions, committed-win advisory failure isolation, pending deduplication, role defaults, denied deep-link access and hostile encoded destinations.

### Running development app

The API and CRM managed workflows were restarted and confirmed running. A screenshot confirmed the public login page renders. The browser check used an isolated synthetic development company, admin and locally linked customer because the documented demo account is absent in this fork; the fixtures, sessions and temporary credential file were removed afterward.

The browser verified:

1. Signed-out `/dashboard/customers/by-qb/123?from=irrigo&tab=details` redirects to `/login?next=%2Fdashboard%2Fcustomers%2Fby-qb%2F123%3Ffrom%3Dirrigo%26tab%3Ddetails`.
2. Credential success resolves to that company's linked customer, without a competing dashboard redirect.
3. Already-authenticated `/login?next=…` resolves to the same customer.
4. The active incomplete customer displays Finish setup.
5. The existing setup link opens the wizard; missing billing emails do not prevent reaching Review; the requested non-blocking note and Save setup action are visible.

No frontend runtime exception was observed. The isolated company has no QBO connection, so the existing terms request correctly failed locally with “No QBO connection found for this company”; no remote call was made. Existing invalid placeholder tokens on unrelated synthetic development companies also generate background pull warnings. Remote customer writes remained disabled.

## Changed files

Paths below are relative to the indicated source directory.

### `artifacts/api-server/src/`

- `services/customerSetup.ts`
- `services/customerSetup.integration.test.ts`
- `services/customerActivation.ts` **new**
- `services/customerActivation.test.ts` **new**
- `routes/contractCenter.ts`
- `routes/contractCenterLifecycle.ts`
- `routes/contractCenterLifecycle.test.ts`
- `routes/estimates.ts`
- `routes/estimates.activation.test.ts` **new**

### `artifacts/highplains-crm/src/`

- `App.tsx`
- `components/customerWizard/CustomerActivationDialog.tsx` **new**
- `components/customerWizard/CustomerActivationDialog.rendered.test.tsx` **new**
- `components/customerWizard/FinishSetupBanner.tsx`
- `components/contracts/ContractUploadButton.tsx`
- `components/contracts/NonRenewal.rendered.test.tsx`
- `pages/CustomerSetupWizard.tsx`
- `pages/CustomerSetupWizard.rendered.test.tsx`
- `pages/ContractPage.tsx`
- `pages/ContractWidgets.rendered.test.tsx`
- `pages/ContractBilling.rendered.test.tsx`
- `pages/ContractCenter.rendered.test.tsx`
- `pages/EstimateBuilder.tsx`
- `pages/EstimateBuilder.lifecycle.rendered.test.tsx`
- `pages/LoginPage.tsx`
- `pages/LoginReturn.rendered.test.tsx` **new**
- `lib/contractUpload.ts`
- `lib/estimateBuilder.ts`
- `lib/landing.tsx`
- `lib/landing.regression.test.tsx`
- `lib/loginNext.test.ts` **new**
- `lib/protected-route.tsx`
- `i18n/locales/en.ts`
- `i18n/locales/es.ts`

Also changed: this report and the project-memory index/customer-sync guidance, with a new login-routing lesson. Generated logs, baseline copies and screenshots are ignored, not application source or deployment assets.
