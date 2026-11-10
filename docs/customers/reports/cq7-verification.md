# CQ7 verification: consolidated customer editor

Route: `/dashboard/customers/:id/edit` (admin/office). `/dashboard/customers/:id/setup` is a redirect only (hash preserved).

## Removed edit surfaces
- CustomerDetail "Edit customer" dialog, its form/schema/mutation (header button is now a link to `/edit`, admin/office only).
- CustomerDetail contact add/edit dialog and per-row edit/delete (contacts tab is read-only; "Edit contacts" -> `/edit#contacts`).
- QboCustomerCard "Edit billing" dialog (button is a link to `/edit#billing`; card is read-only).
- Wizard edit mode (`editId`, setup hydration, inactive notice, PATCH branch). The wizard creates only.
- Finish setup banner and activation dialog links now point at `/edit`.

## Editor behaviour
- Sections Property / Billing / Contacts / Site share components with the wizard (`components/customerWizard/sections`).
- One `PATCH /api/customers/:id/setup` with `expectedUpdatedAt`; body is a diff against the loaded baseline (`buildEditPatch`): only changed customer fields, changed/new contact rows, deleted ids, changed site facts. Untouched legacy values (null billing name, odd ZIP, non-code state) are never resent.
- Status: prospect/active/inactive in edit; inactive edits keep inactive. Any non-active -> active change is blocked while required facts are missing (live list at top of Property, inline "Needed to activate"); already-active customers get a non-blocking advisory.
- Master-billed branches: live activation check uses the parent's billing name/emails and the shared resolver's bill-to via the parent.
- Live bill-to preview uses `resolveBillTo` from `@workspace/customer-billing` (sequence-guarded).
- 409 -> "Someone else changed this customer..." with Reload (rehydrates). Stale save outcomes after unmount/company switch are ignored. Draft is keyed by viewer scope + customer id.
- Leave protection: in-app links (capture listener + unsavedGuard for sidebar/topbar), browser Back/Forward (popstate re-push, confirm navigates to the captured target with replace), beforeunload. Hash anchors never prompt.
- Save returns to the detail tab for the opened section (`?tab=contracts` for billing, `?tab=contacts`, `?tab=overview` for site/property).
- No QuickBooks duplicate check in the editor (create-only).

## Tests
Run from artifacts/highplains-crm with node_modules/.bin/vitest run --config vitest.config.ts <files>. Logs: generated-artifacts/cq7/customer-edit-test.log (34/34), detail-test.log (7/7), related-tests.log (134/134 across wizard, QBO card, activation/banner, contract widgets, estimate lifecycle, customer contracts).
- CustomerEdit.rendered.test.tsx also covers: master-billed parent (complete and incomplete, parent link, preview via parent), separate-billing parent, management c/o and incomplete company address, clearing company clears manager, header QuickBooks chip (6 states), sidebar/topbar guard, beforeunload, hash scroll and section chips, cache invalidation predicate (incl. ["/api/customers", id, "contacts"]), Spanish.
- CustomerDetail.cq7.rendered.test.tsx: Edit customer link, no edit dialogs, read-only site card with dashes and #site link, read-only contacts with #contacts link, hidden edit links for field/chemical managers, route order and admin/office roles for /edit and /setup.
- New `src/pages/CustomerEdit.rendered.test.tsx` (34): hydrate/diff, revert/discard, inactive keep, activation block/advisory, 409 reload, contacts notes/add/delete, QBO note gating, terms retry, live preview, legacy state, link/hash guard, cancel, return tab, stale save, /setup redirect, browser Back guard, patch model, and the additional cases listed above.
- Wizard tests: edit-mode tests removed, CO default/create-only statuses added. QboCustomerCard dialog tests replaced by link test. `/setup` href expectations updated to `/edit`.
- Pre-existing failures unrelated to CQ7 (fail on clean tree too): CrewAssignmentBoard (2), useTabParam (5), rateCardUtils (1).

## Server contract verification

No setup schema, whitelist, migration or activation-behavior change was necessary.
GET already returns the full customer, PATCH already uses the customer insert
schema with provided-field semantics, and the existing transition guard covers
both prospect and inactive reactivation.

- Before: 44/44 targeted frontend tests, 56/56 setup/billing/read API tests.
- After: 58/58 targeted API tests, including number/ranking GET/PATCH round-trip,
  inactive preservation, explicit clears, omitted billing/tags preservation, and
  atomic contact add/update/delete plus site changes with conflict rollback.
- Expanded customer/setup/QBO regressions: 303/306 passed in the concurrent run;
  three permission tests exceeded the 5-second timeout during heavy concurrent
  transforms. Retrying their unchanged controls file in isolation passed 87/87.
  No substantive server regression remained.
- Remote QBO calls and geocoding are mocked in setup integration tests; unique
  synthetic company fixtures are cleaned up by the tests.
- `pnpm run typecheck:libs` passes, including the browser-safe customer-billing
  library. `pnpm install --frozen-lockfile --ignore-scripts` passes; no unrelated
  dependency resolution changes were retained.

The existing resolver moved, without changing its rules, into
`lib/customer-billing/src/index.ts`. The API's `services/customerBilling.ts`
re-exports it, preserving existing callers. The editor preview imports the pure
library, never database or server runtime dependencies. Rendered preview parity
tests cover management c/o, incomplete addresses, parent/master versus separate
billing, company boundaries and live directory/parent updates with unchanged
row counts.

## Before/after typechecks

These are existing failing project checks, not newly clean checks:

| Check | Before | After | Change |
|---|---:|---:|---|
| CRM `tsc -p tsconfig.json --noEmit` | 223 diagnostics | 222 diagnostics | One obsolete dialog diagnostic removed; no new diagnostics |
| API `tsc -p tsconfig.json --noEmit` | 716 diagnostics | 716 diagnostics | Identical normalized diagnostic locations/codes |

CRM diagnostics were compared with source-line movement mapped through matching
source blocks; every remaining diagnostic has the same code and message. API
baseline sources include the frontend shared files imported by existing API
tests, with archived composite declarations built first.

Durable-in-workspace raw results are ignored under `generated-artifacts/cq7/`:
`frontend-before.log`, `server-before.log`, `server-after.log`,
`server-regressions.log`, `server-qbo-controls-retry.log`,
`preview-parity.log`, `crm-typecheck-before.log`, `crm-typecheck-after.log`,
`api-typecheck-before.log`, `api-typecheck-after.log`, `libs-typecheck.log`,
and `frozen-install.log`.

## Changed server/library/configuration files

- `artifacts/api-server/src/services/customerBilling.ts` — compatible resolver re-export.
- `artifacts/api-server/src/services/customerSetup.integration.test.ts` — demonstrated round-trip and atomic-edit coverage.
- `lib/customer-billing/{package.json,tsconfig.json,src/index.ts}` — pure resolver shared with the browser.
- `artifacts/api-server/{package.json,tsconfig.json}`,
  `artifacts/highplains-crm/{package.json,tsconfig.json}`,
  `tsconfig.json`, `pnpm-lock.yaml` — workspace dependency/reference declarations.
- `.agents/memory/artifact-test-runner.md` — baseline archive completeness guidance.

## Changed frontend files

New implementation:
- `src/pages/CustomerEdit.tsx`
- `src/components/customerWizard/billToPreview.ts`
- `src/components/customerWizard/sections/shared.tsx`
- `src/components/customerWizard/sections/PropertySection.tsx`
- `src/components/customerWizard/sections/BillingSection.tsx`
- `src/components/customerWizard/sections/ContactsSection.tsx`
- `src/components/customerWizard/sections/SiteSection.tsx`
- `src/components/customerWizard/sections/ManagementFields.tsx` — one management/manager selector implementation; editor Property always exposes it, creation retains its Billing-step placement.
- `src/components/customerWizard/sections/index.ts`
- `src/components/customer/SiteDetailsCard.tsx`

Existing implementation and call sites:
- `src/App.tsx` — protected editor and hash-preserving setup redirect before detail; editor excluded from detail layout.
- `src/pages/CustomerSetupWizard.tsx` — four shared imports; creation-only flow retained.
- `src/pages/CustomerDetail.tsx` — header/contacts/site edit links; old customer/contact dialog state, schemas and mutations removed.
- `src/components/qbo/QboCustomerCard.tsx` — billing edit link; exclusive billing dialog/schema/form/mutation removed; summary/actions/polling retained.
- `src/components/customerWizard/wizardModel.ts` — edit-safe hydration, number/ranking, baseline diff and conditional QBO warning helpers.
- `src/components/customerWizard/FinishSetupBanner.tsx`
- `src/components/customerWizard/CustomerActivationDialog.tsx`
- `src/lib/unsavedGuard.ts` — opt-in early history interception for the consolidated editor; other form guards retain existing behavior.
- `src/i18n/locales/en.ts`
- `src/i18n/locales/es.ts`

New tests:
- `src/pages/CustomerEdit.rendered.test.tsx`
- `src/pages/CustomerEdit.access.test.tsx`
- `src/pages/CustomerDetail.cq7.rendered.test.tsx`
- `src/components/customerWizard/billToPreview.rendered.test.tsx`

Updated regressions:
- `src/pages/CustomerSetupWizard.rendered.test.tsx`
- `src/components/qbo/QboCustomerCard.rendered.test.tsx`
- `src/components/customerWizard/CustomerActivationDialog.rendered.test.tsx`
- `src/pages/ContractWidgets.rendered.test.tsx`
- `src/pages/EstimateBuilder.lifecycle.rendered.test.tsx`

Paths in this section are relative to `artifacts/highplains-crm/`. This report
and the browser-hot-reload verification memory guidance were also added.

No production data changes, publication, integration write-setting changes,
initial sync or live QuickBooks writes are part of this task.

## Final targeted frontend results

The combined customer editor/create/detail/QBO regression run passed 181 tests
in 12 files. The additional route-authorization file initially lacked the
project's DOM matcher import; after adding that test-only import it passed all
10 cases (admin/office allowed; eight other roles blocked before editor mount).
Together these are 191 passing targeted tests in 13 files. Raw logs:
`frontend-regressions.log`, `access-regressions.log`.

**Final complete targeted run:** 197/197 passing tests in 14 files,
`frontend-final.log`. This includes the existing unsaved-guard tests and two
additional Property tests for management/manager editing independently of own
or inherited billing. Those selectors have one shared implementation; management
directory ownership can be changed even when billing uses the property address
or the master parent. Creation retains its existing Billing-step placement.
The final CRM typecheck remains 222 diagnostics, with no new diagnostic codes,
messages or locations compared with the established after-baseline; API remains
716 unchanged.

The browser surfaced a real history-ordering/lifecycle bug not reproduced by
the initial isolated router test: the page-owned popstate listener did not
reliably run before the application left the dirty editor. Capture on that
page-owned listener alone was insufficient. The final guard is installed once
at shared-module initialization, before mounted router subscribers, and is
enabled only by the customer editor while dirty. It restores the protected
route and publishes the intended target to the editor's confirmation dialog.
Native unload protection remains page-owned. Hot-module disposal removes the
development listener to avoid duplicate interception.

A regression assertion verifies an earlier-installed ancestor subscriber
observes the restored editor route. All 34 editor tests plus the 4 existing
guard and 27 contract-widget tests pass (`history-owner-fix.log`, 65/65).

## Browser and development-preview checks

Used an isolated synthetic company with no QuickBooks connection, synthetic
office account, linked-active fixture and unlinked prospect/inactive fixtures.
All fixtures and the test account were removed after verification. No billing
edit was saved, no production data was changed, and no remote QuickBooks write
was made.

- Active site/contact save sent exactly one setup PATCH with `expectedUpdatedAt`,
  no customer billing changes, only the intended site field/contact note.
  Overview and Contacts showed the persisted values; detail and QBO edit links
  opened the consolidated editor.
- Confirmed dirty bar, relevant billing-only QBO note, Discard, Cancel/Keep
  editing, and anchor changes preserving the same draft.
- Final same-document Back and Forward both displayed the leave prompt;
  Keep editing retained the draft, and confirmed Back reached the exact target.
  Native beforeunload also prevented a dirty full-document departure.
- Prospect activation listed missing property and billing facts. Its site-only
  save retained prospect. Inactive hydration retained its invalid legacy state
  visibly with “Check state”; activation listed missing billing facts, and a
  site-only save retained inactive and the legacy state.
- `/setup#contacts` redirected to `/edit#contacts`; creation defaulted to CO and
  offered only Prospect/Active.
- At 390×844 there was no horizontal overflow; all four chips, fields and sticky
  save controls fit within the viewport. Desktop editor/save surfaces were
  checked as well.
- Terms requests failed locally as expected for the disconnected company and
  showed the localized retry surface, without preventing unrelated saves.
  Retry-to-success behavior is covered in rendered tests.

The first anchor-reset observation coincided with development hot updates and
did not reproduce with files held unchanged. History failure was independently
reproducible and was fixed as described above. Browser module-import diagnostic
store reads were not treated as authoritative because Vite timestamped module
instances can differ; actual same-document navigation and visible draft
retention were checked directly.

The final frontend workflow restarted successfully and Vite came up cleanly
apart from existing Browserslist/PostCSS notices. The transformed editor and
shared billing modules return HTTP 200 without JSX instrumentation errors.
The signed-out preview renders the expected login route. Raw verification
outputs remain ignored under `generated-artifacts/cq7/`.

The first completion validation found an extra Drizzle configuration in the
ignored unchanged-source baseline archive, not actual schema drift or a missing
extension. Removed that archival config; the real database configuration and
schema were unchanged. Completion code review passed.
