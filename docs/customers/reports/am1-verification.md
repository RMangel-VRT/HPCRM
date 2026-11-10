# AM1 account-manager role and assignment verification

## Scope and release boundary

Implemented against the revised AM1 attachment. CQ1–CQ7/CQ3.1/CQ3.2
customer contracts remain in place. During implementation the task branch's old
planner schema disagreed with the shared development database. With the user's
approval, latest main's planner retirement was merged into this branch. No
retired planner tables were recreated. Schema drift then passed.

No existing person's role, password, or customer assignment was changed.
No production assignment, publication, or live QuickBooks write was performed.
Disposable development-only fixtures were used and removed.

The additive AM1 migration was allocated as
`0069_customer_account_manager.sql` when 0069 was free. The incoming planner
retirement independently used 0069. Both historical filenames are preserved;
the migration runner tracks full filenames, not only numeric prefixes.
The migration adds a nullable user FK with `ON DELETE SET NULL` and the
company/manager index. It contains no backfill, inferred assignment, or startup DDL.

## Ownership and transport

- `customers.account_manager_id` owns the assignment for standalone/parent rows.
- Identity belongs to users; role/status eligibility belongs to company membership.
- A branch's displayed/filterable manager is its same-company parent's current
  assignment, resolved only through an active same-company `account_manager`
  membership. Missing parents/users/memberships, demotion, suspension and removal
  resolve unassigned. Stored IDs are not cleared by eligibility changes.
- `lib/db/src/accountManager.ts` is the reusable browser-safe resolver contract.
  `services/accountManagers.ts` loads customer and eligible-member maps in two
  bulk queries, not one query per row.
- GET `/api/customer-account-managers` returns active choices and resolved IDs/names.
  Its cache is company/viewer/real-role scoped and the request carries company ID.
- POST `/api/customers/account-manager` requires projected admin/office access,
  an explicit matching company header, strict input, and one transaction.
  All rows are locked, checked for company/existence/branch restrictions before
  writing, and eligibility is share-locked. Distinct IDs are updated only when
  the stored value actually differs. The response is `changedCount`.
- Setup GET/PATCH round-trips the field through the existing shared customer schema.
  No second setup transport was added. Setup, legacy customer writers, and bulk
  assignment share eligibility validation. Omission preserves, explicit null
  clears, and any provided branch value, including null or malformed values,
  returns 422 before schema parsing can obscure that branch restriction.
- Invalid role/company/status/missing-member assignment returns 422:
  `Account manager must be an active Account manager in this company.`
- The new assignment is absent from the QBO field map and billing-column comparison.
  Bulk uses no QBO writer. Assignment-only setup edits do not enqueue a push.
  Existing simultaneous billing/address changes retain their established paths.

## Role definitions and authentication copies

| Copy | Treatment |
| --- | --- |
| `lib/db/src/accessRole.ts` | Canonical real-role values/type; browser-safe `accessRole` maps only account_manager to admin |
| DB `schema/schema.ts` | Membership union, insert validator, `RoleName`, nullable customer FK/index/validation |
| CRM `shared/schema.ts` | Same membership/customer definitions; no separately mutable assignment |
| API `auth.ts` | Shared `Role`, real activeRole and derived accessRole on login, deserialize, registration, company switch and first-company context |
| API `mobileAuth.ts` | Derived accessRole after token membership revalidation; real-role admission unchanged |
| API `crewsAndMobile.ts` | Login/me/detail responses include derived access; real role preserved |
| API Team handlers in `routes.ts` | New-user role validation, existing-user invitation schema, provided-field membership PATCH |
| CRM `use-auth.tsx` | Shared Role and derived access; finite revalidation/poll/focus refresh and auth-cache updates |
| CRM `UsersPage.tsx` | Invite/change validators and both localized selects; keyed company/viewer/role form boundary and company-bound writes |
| CRM `navConfig.ts`, `AppSidebar.tsx`, `protected-route.tsx` | Role types accept real AM; navigation/permission evaluation projects |
| CRM `RoleBadge.tsx`, EN/ES locales | Real-role display: Account manager / Gerente de cuentas |
| Mobile `AuthContext.tsx` | Real role union plus derived accessRole on sign-in/refresh |
| Mobile `app/(tabs)/me/index.tsx` | Real-role display localized by user language |

Ordinary account managers are not super admins. Platform-only checks remain
separate. Mobile still admits only its existing field-crew roles: neither
ordinary admins nor account managers can enter through that gate.

## Permission call-site inventory

The full changed-file inventory follows below. Main `routes.ts` covers its
actual admin/admin-office and role-list gates, including customer/member
management, contracts/documents, tickets, campaigns/checklists, communications,
equipment, snow, seasons, proposals and scheduling/worksheet APIs.
Role-taking helpers project internally; logs, cache identity, membership
selection, assignment validation and role labels retain real identity.

Additional API call sites:

- Billing/invoice/estimate/extra-billable access helpers; dashboard section gates.
- QBO settings, customer read/outbound/review gates; contract center/lifecycle;
  visits, route stops, crews, estimate/bid boards, catalog and document settings.
- Mailbox scope/accounts, unsorted email, storage batch reads.
- Flags, ticket owner response, extra-billable billing/photos and mobile photo deletion.

Web call sites:

- All `ProtectedRoute` definitions through the shared route wrapper, navigation
  groups, work/settings rails, landing/billing/QBO review helpers and topbar/sidebar.
- Customer detail and parent dashboard, contracts and scheduling actions.
- Team/settings; equipment; campaigns/items/checklists; communications/mailbox
  controls; estimates/proposals/catalog/plants; tickets/tasks; scheduling/worksheets.
- Manual assignment candidate lists in ticket/campaign/to-do/flag/worksheet
  controls project eligibility without changing stored ownership or real roles.
- Settings billing-tag candidates are authorization/configuration eligibility,
  not an automatic notification query.

## Exhaustive admin-recipient inventory and decisions

Searched production API sources for admin comparisons, membership role SQL,
role arrays, `.find`/`.filter`, and notification/email recipient selection.
There are three automatic admin-recipient queries:

| Query | Classification and approved behavior |
| --- | --- |
| `emailSyncService.sendSyncErrorNotification` | User-approved exception: owner email first, otherwise **one** active same-company admin **or AM**. `.limit(1)` retained. Never broadcast. Existing owner-first behavior preserved even if the owner's membership is no longer active. |
| `flags.notifyOfficeOfNewFlag` | Notify all active same-company admin/office recipients; **include AM**. Inactive and other-company members excluded. |
| `ticketStatusChange.applyTicketStatus` completion fallback | Picks one admin fallback notification owner; **admin-only remains unchanged**. No projection and no AM expansion. |

The mailbox query did not fit the original binary rules; implementation paused
until the user explicitly approved preserving one fallback. No other automatic
recipient-selection policy was invented. Manual candidate configuration and
mobile supervisor candidates are not notification fan-out queries.

## Changed files

Paths below are relative to the repository root; directory headings abbreviate
their listed children. This inventory excludes incoming main's planner retirement
and records this task's changes relative to that approved main baseline.

- `.agents/memory/`: `MEMORY.md`, `account-manager-boundaries.md`,
  `customer-pages-direction.md`.
- `.migration-backup/migrations/0069_customer_account_manager.sql`.
- `lib/db/src/`: `accessRole.ts`, `accountManager.ts`, `schema/schema.ts`.
- `docs/`: `data-ownership-map.md`, `am1-verification.md`.
- `artifacts/api-server/src/`: `auth.ts`, `auth.billing.test.ts`, `mobileAuth.ts`,
  `storage.ts`, `test/customerPatchApp.ts`.
- API `src/lib/`: `accountManager.parity.test.ts`,
  `accountManagerBrowserFixture.ts`, `billing.ts`, `estimateAccess.ts`,
  `extraBillableAccess.ts`, `invoiceAccess.ts`.
- API `src/routes/`: `accountManager.roles.test.ts`, `accountManagers.ts`,
  `bidsBoard.ts`, `catalog.ts`, `contractCenter.ts`, `contractCenterLifecycle.ts`,
  `crewsAndMobile.ts`, `customerSetup.ts`,
  `dashboardSections.integration.test.ts`, `dashboardSections.ts`,
  `documentSettings.ts`, `estimatesBoard.ts`, `extraBillableBilling.ts`,
  `extraBillablePhotos.ts`, `flags.ts`, `mailboxAccounts.ts`,
  `mobileTicketPhotosNotes.ts`, `qbo.ts`, `qboCustomerOutbound.ts`,
  `qboCustomerReads.test.ts`, `qboCustomerReads.ts`, `routeStops.ts`, `routes.ts`,
  `ticketOwnerResponse.ts`, `unsortedEmails.ts`, `visits.ts`.
- API `src/services/`: `accountManager.migration.test.ts`,
  `accountManagers.integration.test.ts`, `accountManagers.ts`, `customerSetup.ts`,
  `emailSyncService.ts`, `mailboxScope.ts`,
  `qboCustomerPromotion.integration.test.ts`,
  `qboCustomerPush.integration.test.ts`, `qboCustomerWrites.ts`.
- `artifacts/highplains-crm/src/components/`: `AppSidebar.tsx`,
  `BatchTicketDialog.tsx`, `ChecklistItemDetailPanel.tsx`,
  `ExtraBillableCampaignView.tsx`,
  `QuickAddToDo.tsx`, `RevenueModuleHeader.tsx`, `RoleBadge.tsx`,
  `ServiceFulfillmentPanel.tsx`, `TicketListView.tsx`.
- CRM `src/components/contracts/`: `ContractSettings.tsx`,
  `CustomerContracts.tsx`.
- CRM `src/components/customer/communications/`: `CommunicationsQuickViewModal.tsx`,
  `MailboxViewAsPicker.tsx`.
- CRM `src/components/customerWizard/`: `wizardModel.ts`,
  `sections/PropertySection.tsx`, `sections/PropertySection.accountManager.test.tsx`.
- CRM `src/components/dashboard/CommandBand.tsx`.
- CRM `src/components/estimates/`: `ProposalEstimateSection.tsx`,
  `TicketAdvanceNotice.tsx`, `TicketEstimatePanel.tsx`.
- CRM `src/components/nav/`: `TopbarMenus.tsx`, `WorkPageLayout.tsx`,
  `navConfig.ts`, `settingsNav.ts`, `workNav.ts`.
- CRM `src/components/qbo/CustomerSyncControls.tsx`.
- CRM `src/hooks/`: `use-account-managers.ts`, `use-auth.tsx`, `use-routes.ts`.
- CRM `src/i18n/locales/`: `en.ts`, `es.ts`.
- CRM `src/lib/`: `account-manager.parity.test.tsx`, `billing.ts`,
  `protected-route.tsx`, `qboReview.ts`.
- CRM `src/pages/`: `AccountManagerHeader.rendered.test.tsx`,
  `CampaignDetail.tsx`, `CampaignItemDetail.tsx`, `CampaignsList.tsx`,
  `CommunicationsCenter.tsx`, `CrewWorksheetDraft.tsx`, `CrewWorksheetMaker.tsx`,
  `CustomerDetail.cq7.rendered.test.tsx`, `CustomerDetail.tsx`, `CustomerEdit.tsx`,
  `CustomerRouteMap.tsx`, `CustomerSetupWizard.tsx`,
  `CustomersList.accountManager.rendered.test.tsx`, `CustomersList.tsx`,
  `EquipmentDetail.tsx`, `EquipmentList.tsx`, `EquipmentTicketDetail.tsx`,
  `EstimateBuilder.lifecycle.rendered.test.tsx`, `EstimateBuilder.tsx`,
  `EstimateBuilderList.tsx`, `FlagDetailPage.tsx`, `HardscapeCatalog.tsx`,
  `IrrigationCatalog.tsx`, `LaborRatesPreview.tsx`, `MailboxAccountsSettingsPage.tsx`,
  `MyTickets.tsx`, `NewEquipment.tsx`, `NewTicket.tsx`,
  `ParentCustomerDashboard.tsx`, `PlantLibrary.tsx`, `PlantMatches.tsx`,
  `PropertyDetail.tsx`, `PropertyMapsPage.tsx`, `ProposalDraft.tsx`,
  `QuickBooksSetup.tsx`, `SchedulingPage.tsx`, `SeasonsPage.tsx`,
  `SettingsPage.tsx`, `SharedMailboxesAndOversightPage.tsx`, `TicketDetail.tsx`,
  `TicketsList.tsx`, `UsersPage.tsx`.
- CRM `src/pages/communications/`: `AllCommunicationsTab.tsx`,
  `CommunicationsSecondaryNav.tsx`, `SentTab.tsx`, `CommunicationsToolbar.tsx`,
  `InboxTab.tsx`.
- CRM `src/shared/schema.ts`.
- `artifacts/highplains-mobile/`: `contexts/AuthContext.tsx`,
  `app/(tabs)/me/index.tsx`.

## UI behavior

- CQ7's real shared PropertySection serves create and edit, using the same native
  select styling as Ranking. Includes explicit Not assigned.
- Only a new standalone/parent defaults to a sole eligible manager. Zero/multiple
  managers do not invent a choice; an explicit choice/clear, existing edit value,
  or refetched options cannot be overwritten.
- Branches show the resolved parent manager read-only with a localized parent link;
  create/edit serializers omit their assignment field.
- CustomerDetail and the separate ParentCustomerDashboard both show a quiet
  localized manager line below the badges. Loading/errors do not falsely display
  a stale resolved name.
- Customers list loads all pages for company-scoped selection, adds the resolved
  manager column and All/manager/Not assigned filter, and disables branch
  checkboxes with a parent-setting explanation. Select-all targets eligible
  filtered standalone/parent rows only.
- Bulk selection resets after success and company/viewer/role changes; failed
  requests retain selection. Changed-count feedback uses the server count.
  Filter/cache invalidation incorporates changed assignments, parents and
  membership eligibility. Pending controls prevent duplicate writes.
- Assignment is optional and is not an activation requirement.

## Verification

Artifact-local Vitest launchers were used. Development output and initial/final
diagnostics are retained in ignored `generated-artifacts/am1/`.

### Tests

- API: 251 distinct tests across 17 selected files, passing after updating old
  synthetic request contexts to include the new derived accessRole contract.
  These cover AM resolver/eligibility, setup GET/PATCH and legacy branch rejection,
  atomic bulk rollback/company scoping/counts, recipient rules, actual Team
  create/invite/PATCH handlers, real Passport login/deserialization/company-switch
  refresh, production-source permission inventory and unchanged mobile admission.
  The completion-review regression exercises every role's set and clear through
  legacy PATCH, setup PATCH, bulk POST, wizard creation and legacy creation.
  Crew-supervisor/shop-manager/mapping retain their previous unrelated legacy
  field edits, but cannot write account-manager assignment.
- Migration: real temporary-table application twice on one rolled-back connection;
  existing rows stay null, scoped index exists, deleting the temporary user sets
  the assignment null. Public tables/data are not used for this migration test.
- Existing selected CQ1–CQ7/CQ3.1/CQ3.2 API suites cover billing, activation,
  mapping, pulls, queue/timeout/locking, push/reviews/promotion, setup and reads.
- Web: 269 distinct selected tests across 16 files, passing. Includes every actual
  protected-route definition and navigation item, other-role expectations and
  super-admin separation; auth/login routing; wizard/editor; Property defaults,
  explicit clears/refetches/inheritance; list EN/ES filtering/selection/error/scope;
  production JSX for both localized headers; and CQ7 related billing/contract/
  estimate widgets.
- Old test mocks bypassing AuthProvider initially lacked accessRole, causing
  false permission denials. Their synthetic contexts now derive projection from
  real role, including mutable-role tests; production authorization was not
  weakened to accommodate incomplete mocks.

### Typechecks and runtime

| Check | Before initial work | Fresh latest-main baseline | AM1 after |
| --- | ---: | ---: | ---: |
| Shared-library declarations | 0 | 0 | 0 |
| API | 716 | 697 | 697 |
| CRM | 222 | 219 | 219 |
| Mobile | 0 | unchanged | 0 |

These are diagnostic counts, not clean-typecheck claims. Baseline source was
archived from incoming main with its own workspace package targets and refreshed
declarations. Diagnostics were compared by unchanged source site and TS code,
not moved line numbers or union-member print order. The edited frontend
membership-role union retains the same pre-existing TS2347 from the untyped
Drizzle stub; adding the role is not a new diagnostic site.

API production bundle built and served. CRM Vite and mobile Metro served after
restart. Extension/schema-drift validation passed after the approved merge.
The known disconnected-QBO terms request returned 502 during fixture editing;
the AM select and save worked independently. Pre-existing synthetic QBO token
decode warnings and Expo package-version warnings are not reported as AM fixes.

### Browser evidence

One tester used only an isolated development company with canonical disposable
accounts. Verified real AM identity/admin-equivalent Team/Customers access without
Super Admin; changed a synthetic existing Office member to AM and reloaded;
filtered unassigned; selected Parent + Standalone but not Branch; observed
exactly one scoped bulk POST and `changedCount: 2`; selection cleared and filtered
rows disappeared. Branch header/editor showed inheritance and parent link.
Spanish labels were checked with the existing language toggle.

The separate parent header omission was fixed and the remaining parent flow
continued with the same tester, not a second full pass. At 390×844 the parent
select fit (285px wide; document/body 390px); explicit clear saved with 200 and
both parent/branch headers became Not assigned. Existing detail-page horizontal
scroll remains outside the field; it is part of downstream layout work, not an
AM input clipping issue. Fixture users, memberships, customers and company were
removed. A signed-out `/login` screenshot also confirmed the app renders.

## Manual rollout after merge and publication

1. Follow the normal reviewed migration/publication process; verify the additive
   account-manager column/index are present. This task did not publish.
2. Randy changes Brady's existing company membership to **Account manager** in
   Team. No password reset or new user is required.
3. Open Customers, filter **Not assigned**, select all eligible filtered rows,
   choose Brady and click **Set account manager**. Confirm the actual changed count.
4. Branches inherit automatically; do not assign them separately.
5. Spot-check parent, standalone and branch headers; assignment-only changes
   should not create QuickBooks pushes.

CP1–CP4 are already queued downstream; no duplicate follow-up tasks were proposed.
Snow routing, property-specific access restrictions, billing redesign and
header/layout redesign are not part of AM1.

## Completion-review correction: every write entry point

The first completion review identified that legacy customer PATCH's old field-role
deny-list admitted crew supervisors, shop managers and mapping users. Extending the
shared schema had unintentionally opened assignment writes through that route.
It now has an explicit provided-field projected admin/office guard before parsing
or writing. Both assigning and clearing require that authorization. The check is
field-specific to preserve all other roles' established non-assignment access.

| Entry point | Caller authorization / assignment input handling |
| --- | --- |
| Legacy POST `/api/customers` | `createCustomerRequest` → `setupAccess`: projected admin/office |
| Wizard POST `/api/customers/wizard` | Same `createCustomerRequest`/`setupAccess` policy |
| PATCH `/api/customers/:id/setup` | `setupAccess`: projected admin/office |
| Legacy PATCH `/api/customers/:id` | Explicit provided-field assignment guard: projected admin/office; omission retains legacy unrelated-field policy |
| POST `/api/customers/account-manager` | Projected admin/office plus matching initiating-company header |
| QBO promotion/import | Only mapped QBO-owned inputs; accepts no assignment field |
| Contact, geocode, maintenance/contract internal updates | Explicit fixed field sets; no caller-supplied assignment |
| `storage.createCustomer` / `writeCustomer` | Trusted internal writers; target eligibility validated, no public raw-write endpoint outside the authorization gates above |
| Nonrenewal transaction writer | Rejects any account-manager field; may write inactive status only |

The imported customer-page memory was also reduced to durable ownership,
sequencing and display rules, removing dated queue/slice-planning details.
