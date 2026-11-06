# Customer sub-navigation consolidation

## Scope and baseline

Implemented on the merged account-manager and customer-page-correctness baseline.
The CP2 detailed attachment governs behavior; the supplied review and interactive
HTML are supporting visual references, not replacement routes, example data,
permissions or a new design system. The banner header/dashboard and later list
redesign remain separate work.

This is a read/UI consolidation. No schema change, migration, new commercial
store, service-plan retirement, production data change, QBO write or publication
is authorized or performed by this work.

## Read capability decisions

* **Invoice revenue:** `services/invoiceReads.ts:listInvoices` provides
  company/customer-filtered invoice headers, but not authoritative agreement/term
  attribution or extra-work versus snow-T&M classifications. No existing suitable
  single analytics read was established. Billing therefore uses the brief's
  **Contract-only monthly table fallback** from the selected CP1 term. Invoiced
  and remaining KPIs are explicitly unavailable, not zero. Planned amounts are
  never described as invoices. No per-invoice detail fan-out was introduced.
* **Parent Tickets:** `TicketListView` accepts one `customerId`. The existing
  ticket read does not offer a supported multiple-customer filter. The shared
  parent Tickets page explicitly explains the limitation; it does not substitute
  parent-only tickets for the requested branch aggregate.
* **Branches:** existing same-company customer records own city; parent-rollup
  owns active-contract/open-ticket counts, own priced annual value, and last
  communication time. Its already-computed CP1 terms now also supply current
  labels, lines and dates in one read, without per-branch summary fan-out.
  Inherited parent revenue is not allocated to branches.
  Last communication is not presented as a verified contact person's identity.
* **Snow questions:** CP1's summary did not include the actual reconciled flag
  status. The existing summary read now includes a narrow status-only projection
  for effective snow terms, keyed by the existing flag source identity and
  company. Only admin/office/projected account-manager and field-manager readers
  receive it; no email, assignee, photo or privileged flag inbox data is exposed.
  Missing triggers alone do not establish that a flag is open.
* **Property:** the former mowing editor has already been replaced by Routes in
  the merged baseline. The Property card preserves this authoritative route
  summary rather than recreating retired mowing configuration or planner tables.

## Server boundaries

Parent-rollup rejects a mismatched initiating company header before reading
facts. Noncommercial parent readers neither query email activity nor read
negotiated rate/payment/scope rows merely to populate the shared dashboard.
Location-coordinate PATCHes require AM1 `accessRole` admin/office, including
explicit clearing; broader legacy edit eligibility does not bypass this check.
Existing QBO sending/review, PNC billing and route-write permissions are unchanged.

## Verification evidence

Reproducible source baseline and command output are retained in ignored
`generated-artifacts/cp2/`. Tests use each artifact's local Vitest runner.
Source archive excludes the extra Drizzle config to preserve schema discovery.

Before-change recorded results:

| Check | Baseline |
| --- | --- |
| CRM customer navigation/CQ7/CP1/contracts/QBO/editor/wizard selection | 148 passed, 4 failed across 9 files |
| CRM Contract Center prerequisite selection | 139 passed, 2 failed across 14 files |
| API CP1/customer/Contract Center/QBO selection | 137 passed, 98 failed across 8 files |
| CRM TypeScript | 217 diagnostics |
| API TypeScript | 697 diagnostics |

The four existing CRM QBO failures are `CustomerSyncControls.test.tsx`; the
two Contract Center client failures are the flat-rate save case in
`ContractBilling.rendered.test.tsx` and the panel-local details/scope save case
in `ContractWidgets.rendered.test.tsx`. The 98 API Contract Center failures
are recorded by name in the baseline logs. Several old API authorization
fixtures lack AM1's projected access role. They are not characterized as
passing prerequisite suites or repaired as unrelated feature work.

Final test results, inventories and typecheck delta are recorded below after
integration verification.

The API CP2 permission tests add 17 passing cases. The combined API selection
records 154 passed and the same 98 baseline failures. CP1 flag lifecycle tests
also verify inherited effective-term question status, resolved status and field
reader redaction. Before/after API typechecks have 697 diagnostics each, with
identical file/error-code/message multisets after ignoring shifted line numbers.
The development API health endpoint returned 200 after restart. Existing
disposable QBO fixture companies log invalid-token warnings during the unrelated
background sync sweep; no QBO credential or sending behavior was changed.

## Destination inventory

| Caller | Destination after consolidation |
| --- | --- |
| `components/RevenueMatrixPanel.tsx` (both customer links) | `?tab=billing&view=revenue` |
| `components/AuditDetailDrawer.tsx` revenue drill-down | `?tab=billing&view=revenue` |
| `components/ChecklistItemDetailPanel.tsx` map link | `?tab=property` |
| The same panel's communications link | `?tab=communications` (intentionally unchanged) |
| `pages/CustomerEdit.tsx` return from Billing | `?tab=billing` |
| The editor's Site and Property returns | `?tab=property` |
| The editor's Contacts return | `?tab=contacts` (unchanged) |
| Customer breadcrumbs and parent-account badge | `?tab=dashboard` |
| Parent Add branch | `/dashboard/customers/new?parentId=…`, validated against current-company parent records |
| Parent ticket limitation links | each branch's `?tab=tickets` |
| Dashboard page actions | canonical Services, Contracts and Property keys |

Legacy query aliases are centrally normalized using replace: overview →
dashboard; service-checklist/annual-rollup/fulfillment → services; maps/settings →
property; rate-sheet → billing/rates; revenue/monthly-summary → billing/revenue;
visual-scopes → proposals/scopes. Other parameters and meaningful hashes are
preserved. Unsupported/denied pages render an unavailable state, not hidden
content. Nested proposal and billing selections are URL-backed.

## Removal and remaining-reader inventory

Removed customer UI files (no remaining imports):

* `components/ServiceFulfillmentPanel.tsx`
* `components/AnnualServiceRollup.tsx`
* `components/CustomerServiceChecklist.tsx`
* `pages/ParentCustomerDashboard.tsx`

Removed `TAB_LABELS`, `BILLING_SUBTABS`, old top-level tab contents, the parent
inner tabs, and duplicate rail customer-name/switcher block. The existing usable
customer name/switcher remains outside the rail. The old detail-local maps,
checklist, proposal, worksheet, scope, rate-sheet and document/version components
were replaced by focused page components; legacy document/version viewing is
retained inside the new collapsed, read-only Previous contracts disclosure.
That disclosure queries legacy records only after opening, never for current
coverage, value, services or badges.

Both locale files remove `customerDetail.tabs`, `customerDetail.billingTabs`
and 92 otherwise unreferenced detail-only keys after literal/dynamic caller audit.
New navigation, groups, pages, nested views, limitations and disclosure labels
are supplied in EN/ES.

Retained service-plan/legacy owners and readers:

* `artifacts/api-server/src/routes/routes.ts`: compatibility service-plan/template,
  annual-service-rollup and operational service-summary routes, with existing
  freeze behavior; these endpoints are not customer-page data sources.
* `artifacts/api-server/src/storage.ts`: retained legacy plan/template accessors.
* `artifacts/api-server/src/routes/contractCenter.ts`: frozen legacy copy/archive
  compatibility and history, not a customer-page fallback.
* `artifacts/highplains-crm/src/pages/SettingsPage.tsx` and
  `components/nav/settingsNav.ts`: retained service-plan/template settings entry.
* Server/client shared contract catalogs and schemas, and `lib/db/src/schema`:
  retained vocabulary, compatibility types and tables.
* General revenue reporting, ticket-rate and mobile legacy contract readers
  remain as inventoried in `customer-pages-correctness.md`. They are not
  repointed or retired in CP2.

No service-plan API, table, Contract Center term, recorded invoice amount, QBO
mirror or seasonal contract commitment was deleted or rewritten.

## Changed-file manifest

Workspace: this report.

API:
`src/routes/{routes,customerContractSummary}.ts`,
`src/routes/customerPages.cp2.test.ts`,
`src/lib/customerContractSummary.integration.test.ts`.

CRM shared UI/hooks:
`components/{AuditDetailDrawer,ChecklistItemDetailPanel,CustomerLocationEditor,CustomerSchedulingSection,LayerMapViewer,RevenueMatrixPanel}.tsx`,
`components/customer/{CustomerSubNav,customerPages,customerBadges}`,
`components/customer/pages/{ServicesPage,PropertyPage,ProposalsPage,BillingPage,SnowPage,ParentPages,PreviousContractsSection}.tsx`,
`hooks/{useCustomerContractSummary,useCustomerServices}.ts`,
`lib/customerScope.ts`, `i18n/locales/{en,es}.ts`.

CRM pages:
`pages/{CustomerDetail,CustomerEdit,CustomerSetupWizard}.tsx`;
tests `CustomerSubNav.test.tsx`, `customerBadges.test.ts`,
`components/CustomerLocationEditor.cp2.test.tsx`,
`components/customer/pages/ServicesPage.cp2.test.tsx`,
`pages/{CustomerDetail.cp2,CustomerDetail.cq7,CustomerEdit,AccountManagerHeader}.rendered.test.tsx`.
Deleted files are listed above. No native-app, canvas, schema, dependency or
artifact configuration change.

## Final automated results

| Check | Result |
| --- | --- |
| Combined CRM customer/Contract Center/QBO prerequisites and CP2 | **318 passed, 6 failed / 27 files**; failures are exactly the four QBO controls and two Contract Center cases recorded above |
| Final CP2/CP1/CQ7/rail/badge selection after scope/type fixes | **76 passed / 5 files** |
| Location WebGL fallback + customer EN/ES regression selection | **60 passed / 3 files**, including 2 new location tests |
| Existing campaign detail-panel interaction | **1 passed / 1 file**; verifies real panel, campaign metadata and execution destination |
| Final CP2 permission + CP1 summary/lifecycle/snow HTTP selection | **57 passed / 4 files** |
| Broader API prerequisite comparison | **154 passed, 98 failed / 9 files**, same baseline failures |
| Library declaration build | Passed |
| CRM TypeScript | **217 → 215** diagnostics; no new file/code/message diagnostics |
| API TypeScript | **697 → 697** diagnostics; identical file/code/message multiset |
| Whitespace/diff check | Passed |

Diagnostics are compared by file, error code and message to avoid treating moved
lines as new errors. The two removed client diagnostics belonged to the
superseded detail-local code. These results do **not** claim that repository-wide
TypeScript or old prerequisite suites are clean.

The browser-discovered missing Open label is now translated in both languages,
as are the remaining previously missing Spanish customer-detail labels.
Mapbox initialization now explicitly reports unavailable maps instead of
throwing when WebGL is unavailable. Authorized location editors can enter
validated coordinates in that case; read-only readers have no mutation inputs.
Location writes retain the initiating-company header. Property's route summary
hides its management link for read-only property viewers without revoking their
separate global Routes permissions.

Campaign rows now open the **existing** `ChecklistItemDetailPanel` inside the
service drawer, preserving its execution, campaign, property/map and permitted
communications links rather than maintaining a replacement detail UI.
Permitted route visits retain their read-only visit projection and Routes entry.

## Browser evidence and boundaries

The documented development-admin login was rejected. The existing CP1 helper
created an isolated disposable company/account-manager account, and the same
browser session completed the requested journey after that setup. Its company,
customers and user were removed with the helper's guarded cleanup after testing.
No existing account, customer, commercial term or QBO record was changed.

Confirmed in the authenticated browser:

* Populated customer Dashboard, Property layout/empty layers, proposal subviews,
  Contract Center cards and Billing Rates/Revenue with fixture contract values.
* Legacy revenue alias preserves unrelated parameters and hash, uses replace,
  and Back returns to the earlier Rates entry; nested Billing Back behavior.
* Snow current term/trigger flag/no-history view; 800px chips navigate Services,
  Billing and Snow; desktop expanded/collapsed customer icon rail remains usable.
* Location WebGL failure no longer raises the runtime overlay. The explicit
  fallback, coordinate validation and cancellation work without saving.
* Parent Dashboard KPI row, populated Branches row with authoritative counts,
  Tickets aggregate limitation/branch link, and QBO-only parent Billing.
* Add branch preselects the validated parent and inherits its account manager;
  Cancel/Discard leaves branch count unchanged.
* Parent EN/ES rail, heading, current breadcrumb and document title agree for
  Dashboard/Branches/Tickets/Billing. Rendered tests cover all page-label pairs.

Representative browser captures: Dashboard `af3q5j`, collapsed customer rail
`hvwg32`, alias preservation `4hwd6e`, location fallback `9qxq9t`, parent Branches
`1ue03t`, parent Tickets `bptd3c`, parent-prefilled wizard `82uobz`, Spanish parent
Billing `6tcbg4`. An unauthenticated preview screenshot also confirmed the app
shell served successfully.

The browser found a narrow Billing term-selector overflow; its native selector
now shrinks within the available width. Services' category/window/status fields
are not hidden at narrow widths, and populated rows/grouping/extra separation
are covered by rendered tests; the disposable browser company had no service
activity, map layers, proposals or active branch term to exercise those populated
states in a live browser.

The testing report flagged the hidden **global** navigation anchors after main
sidebar collapse; those intentionally slide offscreen in the existing app shell.
The separate CP2 customer icon rail was subsequently clicked successfully.
It also flagged English QBO card internals and the home-icon breadcrumb's old
English accessible root label. The CP2 page names are localized; the QBO card
and existing global shell are intentionally unchanged, as required by scope.
No-QBO-connection terms reads returned 502 for the isolated fixture, and caught
WebGL diagnostics remained in browser logs; neither prevented the tested views.
Existing fixture-company sync warnings are not CP2 regressions.

Follow-up proposals were not duplicated: the already-planned subsequent customer
header/dashboard and layout tasks cover the next customer-page work.
