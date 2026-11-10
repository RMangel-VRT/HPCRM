# CP3 — Customer Banner and dashboards

## Scope and integration

Built on the merged CP2 customer pages (`customerPages` configuration and shared
parent frame), not on the former tabs or separate parent page. No schema,
migrations, production writes, QBO sending changes, mobile/canvas changes, note
pinning or owed-versus-done implementation is included.

The selected **B Banner** reference governs the presentation: non-sticky token
gradient, decorative 56px initials, full wrapping 28px name/switcher, quiet
metadata, wrapping actions and chips. The supplied HTML's illustrative figures,
mock controls, alternate headers, sticky base style and future fulfillment
switches are not application features.

## Fact ownership and readers

| Surface | Source and semantics |
| --- | --- |
| Contract chip / regular season KPI | CP1 `useCustomerContractSummary`, every current term. Independent priced terms sum in cents. Labels and landscape/snow lines combine. T&M is named, never converted to zero. Inherited amounts are not allocated to a branch. |
| Monthly context | Only uniform, aligned, actual CP1 payment schedules support a single monthly amount. There is no annual-divided-by-twelve fallback. |
| Renewal attention | CP1 summary now includes the existing Contract Center `renewalDue` result, including signed-successor and non-renewal suppression. CP3 additionally limits visible countdowns to 0–60 Colorado calendar days. |
| Services and progress | CP1 `useCustomerServices`: observed campaign work and permitted route visits. No legacy service-plan query, promised fulfillment or synthetic completions. |
| Open tickets | Existing customer tickets and company ticket-status finality. The activity feed uses actual ticket-status-history timestamps, not inferred changes at creation/update. |
| Latest contact / email activity | New read-only `dashboard-activity` projection over existing communications. Sent/logged contacts and received inbound mail only; drafts, scheduled and failed messages are excluded. Source timestamps and people are retained. |
| Mailbox boundary | Canonical `resolveVisibleMailboxes` feeds the storage query; optional mailbox filters only narrow that result. The customer communication page currently has local filters, not an application-wide selected mailbox. Dashboard defaults to all permitted mailboxes. |
| Account manager | AM1's shared resolved assignment, including branch inheritance. An unresolved or failed read does not fabricate an assignment. |
| Management / contacts / notes | Existing customer, management-company, manager, contacts and notes reads; newest note until CP4 introduces pinning. |
| Site / property | CQ7 site facts and existing outline layers/location pin; unavailable maps are reported, not replaced with example geometry. |
| Billing | CQ7/CQ customer QuickBooks-card projection (resolved bill-to, emails and terms). QuickBooks state classification is shared with `QboCustomerCard`. PNC/master-billing behavior and warnings remain unchanged. |
| Parent dashboard | Existing batched parent rollup, enhanced with deduplicated own-plus-branch current terms and uncovered-branch count. Parent terms are counted once even when several branches inherit them. Existing ticket/completion sources provide operational counts. |
| Parent Branches | One extracted CP2 Branches table, also rendered compactly on the dashboard without branch-management actions. |

The new activity endpoint checks authentication, the initiating company, customer
membership and crew-supervisor ticket assignment. Field roles do not read email
or commercial/billing sources through the new dashboard. Field projections omit
commercial term details. New and changed reads retain invalidation prefixes and
are scoped to company/viewer/role.

## Removed readers and presentation

The regular dashboard no longer renders Annual Contract Value, Active Contracts,
Next Service, Primary Contact, the old Property summary or standalone
Communications card. It does not read `/contracts`, legacy monthly amounts,
rate-sheet or service-plans. The CP1/CP2 legacy read-only disclosure on the
**Contracts page** remains intentionally outside the dashboard.

The embedded identity/badge/action header is replaced by `CustomerHeader`.
Coverage, ranking and tags no longer form a badge row: coverage is in the
authorized Contract chip and ranking is in the localized quiet line.
The Dashboard setup chip replaces only that page's Finish setup banner;
other pages retain the existing banner.

## Customer-tag inventory

- The former customer-detail badge row was the production customer-tag display.
  Existing tags are retained in Dashboard People rather than deleting data.
- Customer schema and PATCH input continue to store/accept tags. No tag schema or
  customer data was removed or rewritten.
- The current customer wizard/editor/list has no customer-tag editing or filtering
  workflow to replace.
- `scripts/src/seed-randy.ts` assigns the `randy-demo-seed` customer tag to
  synthetic demo properties. This assignment is retained.
- Team-user `billing` tags, flag taxonomy tags and campaign/communication labels
  are different facts, not customer tags. Their readers and workflows are unchanged.

## Verification

Evidence is retained in ignored `generated-artifacts/cp3/`. Tests use each
artifact's local Vitest launcher.

Before-change checks:

- CP1/CP2/CQ7/account-manager header/rail/services/QuickBooks-card selection:
  **94 tests passed across 7 files**.
- Composite library declarations built successfully.
- API TypeScript: **697 existing diagnostics**.
- CRM TypeScript baseline is retained in `frontend-before.log`.

The previously merged CP2 report records existing broader prerequisite failures:
four `CustomerSyncControls` cases, two client Contract Center save cases, and
98 API Contract Center cases (including old role fixtures without AM1's
projected access role). Those are not represented as clean baseline suites.

Verification results and populated browser evidence are recorded below.

### API and model evidence

- Initial targeted API/model run: **86 API tests passed**, plus **20 pure
  dashboard-model tests** (subsequent final runs include additional cases).
- Broader API selection: **271 passed / 109 failed across 17 files**.
  The three failing files were then executed from an unchanged merged-CP2
  source archive using the artifact-local runner: **35 passed / the identical
  109 failed test names**. There are **zero added or removed failure names**.
  The failures comprise 98 Contract Center route/board cases and 11
  `qbo.customers` cases. No attempt was made to alter unrelated billing or
  authorization behavior to force these old fixtures green.
- API TypeScript: **697 → 697**, with identical file/error-code/message
  multisets after ignoring shifted locations.
- The broader selection includes disposable development integration checks for
  CP1 contract summaries, CQ6 setup, customer billing/activation, AM1 resolution,
  and QBO reads. External sending is mocked by those suites; no real customer
  repairs or production writes were performed.

### Frontend evidence

- Customer pages/wizard focused selection: **135 passed in 13 files** before
  adding the final Ute Creek assertion. The shared account-manager header also
  passes in EN and ES.
- Broader frontend selection: **368 passed / 4 failed in 34 files**. Running
  the four failing files from unchanged merged CP2 produced **42 passed / the
  identical 4 failed test names**: one each in ContractBilling, ContractWidgets,
  NonRenewal and rateCardUtils. There are no newly failing names in this
  selection.
- Final additional checks: **28 passed** across the pure model and real
  EN/ES header interaction tests; **15 passed** in the CP3 dashboard rendered
  fixture suite, including Ute Creek's $13,536 / 2026–27, 10 of 13 observed
  services and two open tickets.
- Header interaction tests exercise keyboard/search switching and All customers,
  real Add menu selection/callbacks and contextual Ticket navigation, regular /
  branch / parent metadata, concurrent term labels/prices/T&M, contract and
  other chip destinations, unassigned AM, and field-equivalent action omission.
- Frontend TypeScript: **215 → 210**, with no new diagnostic messages. Five
  implicit-any errors disappeared with the superseded embedded header markup.
- No schema, migration, package, manifest, canvas, native-mobile, sync behavior,
  or production configuration was changed.

### Changed-file groups

- CRM header and composition: `CustomerHeader`, `CustomerDashboard`,
  `CustomerDetail`, CP2 `ParentPages` shared compact `BranchesTable`.
- CRM shared facts: `dashboardModel`, `useDashboardActivity`,
  `useCustomerContractSummary`, `FinishSetupBanner`'s reusable advisory read,
  EN/ES strings.
- API: `customerContractSummary` renewal projection, `customerDashboard` route,
  `customerDashboardActivity` canonical mailbox-scoped reader, and existing
  `routes` parent-rollup aggregation.
- Tests: pure aggregation/rules, header interactions, regular/parent rendered
  fixtures, CP1/CP2/CQ7 mocks, account-manager header, scoped activity route,
  parent rollup and Contract Center renewal boundary.
- `customerDashboardBrowserFixture` supplements the existing guarded disposable
  CP1 browser helper with synthetic observed work and parent agreement data.
  Neither helper updates any existing company or customer.

### Populated browser verification and visual comparison

The documented development login was rejected, as in the earlier customer-page
slices. The existing guarded disposable-company helper, supplemented with CP3
test data, supplied a real development session using AM1's account-manager →
office-equivalent projection. No API responses were mocked in this pass and no
existing accounts, roles, customers or contracts were modified.

- Regular Ute Creek: **UC**, full name, **2026–27 · $13,536 · Landscape + Snow**,
  **$1,128/month**, **10/13 done**, three overdue observed events, two open
  tickets, latest actual inbound contact, note and HOA contact. Gate access
  remained visible through CQ7.
- Parent: one branch, one active agreement, **$1,200**, one branch ticket and
  zero completed YTD work orders matched the real rollup response. Inherited
  branch value stayed Unknown, not $0 or an allocated $1,200. No own physical
  address/Property content appeared; only People and Billing were on the side.
- Search + ArrowDown/Enter switched customers; All customers, Contract,
  QuickBooks, management and address destinations worked. The account-manager
  chip was noninteractive. Note and Log communication dialogs opened in the
  correct context and were cancelled; Ticket retained customer context.
  Proposal creation was deliberately not clicked.
- Real populated layouts checked at **1440×900**, **800×900**, **390×844**,
  light/dark, expanded/collapsed global navigation and mobile drawers. Names,
  actions and chips wrap without document-width overflow. Customer page chips
  and the compact Branches table scroll within their own containers.
- Against selected Banner B: soft token-green band, 56px rounded decorative
  monogram, 28px semibold name, quiet metadata, wrapping outlined chips and
  actions match the intended composition while preserving the actual app
  rails/cards/tokens. Desktop uses the prescribed two-thirds / one-third
  composition; narrower screens stack. Alternate headers, mock figures,
  sticky behavior and future switches were not imported.
- Dashboard reloads returned 200 with no API 5xx, frontend page errors, legacy
  `/api/contracts` / `/api/service-plans` requests, or per-branch waterfalls.
  One unattributed resource 502 during separate Billing navigation was not
  reproducible in the subsequent API checks.
- The browser identified a missing existing note-description translation and a
  missing description on the new communication dialog. EN/ES descriptions and
  the accessible dialog description were added afterwards; targeted rendered /
  interaction tests passed. No second browser pass was necessary for that text-only fix.

Sixteen populated captures are attached to the task conversation (the browser
runner did not expose file export). An unauthenticated app screenshot is saved
at `generated-artifacts/cp3/public-preview.jpg`. Temporary company/account and
all its commercial/work fixture records were removed with guarded cleanup,
and the ignored credentials file was deleted.
