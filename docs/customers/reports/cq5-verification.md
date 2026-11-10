# Customer setup wizard: implementation and verification

## Scope and integration contracts

Implemented in the existing CRM and API artifacts after integrating the merged
CQ1–CQ4 contracts. No publishing, production data changes, initial-sync run,
QuickBooks write enablement, remote customer creation, new schema owner, mobile
changes, or ContractBuilder UI changes were made.

The CRM customer remains the billing owner. The wizard uses CQ1 display-name and
resolved-address validation, CQ3 company synchronization locks and post-commit
push/binding behavior, and CQ4 terms/review links. Write enablement and the initial
customer reconciliation baseline remain independent outbound prerequisites.

### Differences between the original brief and the merged code

- Binding is exposed as `bindCustomerLocked`, with normalized cache fields and
  a SyncToken required. That actual transaction-aware CQ4 contract is reused;
  no substitute binder or baseline writer was introduced.
- The existing duplicate-check endpoint originally required a saved customer
  and searched its property name. It now also accepts an unsaved billing draft,
  using the same scoped cache/live lookup and response contract.
- Existing service-address columns are NOT NULL. Omitted prospect addresses are
  normalized to their existing empty-string storage representation at the
  server boundary. Creation clients omit blank optional address keys; an edit
  deliberately clearing a service-address field sends `""`. Active validation
  is not weakened. No migration or startup DDL is necessary.
- CQ1 already rejects an incomplete deliberately selected custom bill-to.
  That rule remains intact, including for prospects; prospects can keep
  property mode and leave service/billing details empty. The wizard validates
  explicit custom addresses before advancing.
- CQ3 forbids a separate QuickBooks binding for master-billed branches.
  Both server and wizard preserve this rule instead of silently discarding a
  requested link or falsely promising one.
- The documented development login was rejected. Browser verification uses
  disposable development fixtures, without resetting an existing account.

## API and data behavior

- `POST /api/customers/wizard` accepts `customer`, `contacts`, `siteNotes` and
  `qbo: { sendNow, linkQboId? }`. It validates scoped parent/directory/contact
  references and commits the customer, parent auto-mark, contacts, existing site
  columns and optional binding/cache baseline in one transaction.
- `POST /api/customers` delegates to the same create path and preserves its
  legacy Customer response shape. Both create routes require admin/office.
- A create atomically records pending state and schedules CQ3 work only after
  commit. The request promptly returns the saved CRM customer and waiting
  outcome, never waiting on remote duplicate lookup, token refresh or writes.
  Failed background work leaves the saved CRM record and durable retry state
  accessible. The CQ4 card observes eventual success/error/review status.
- `GET /api/customers/wizard/options` supplies write/baseline gates and a
  company-scoped most-used payment term only when there is an unambiguous
  winner. The client also requires the term to exist in the available terms
  list and never overwrites an explicit choice.
- `GET /api/customers/wizard/prefill/:qboId` is a read-only scoped cache snapshot;
  it does not bind a record or resolve review evidence.
- `GET /api/customers/:id/setup` loads the existing customer, contacts and
  missing activation fields.
- `PATCH /api/customers/:id/setup` uses the existing customer ID, requires
  `expectedUpdatedAt`, updates existing contact IDs, preserves omitted contacts,
  and deletes only explicitly requested scoped `deletedContactIds`. It never
  calls create. Manager contact creation is shared and deduplicated.
- Prospect-to-active validation is enforced at the shared customer-write
  boundary, as well as in setup. Incomplete effective records return
  `400 { code: "ACTIVATION_INCOMPLETE", missingFields }` before mutation or push.
  Master branches resolve billing through their parent. Parent auto-mark and
  old-parent last-child cleanup are now in the same locked write transaction,
  after concurrency/completeness checks.
- Property geocoding reuses the existing Nominatim implementation extracted
  into a shared helper. It is best-effort post-commit enrichment, not a remote
  dependency inside the transaction or the response. Its optimistic version
  guard prevents a late lookup from overwriting a subsequent user edit.
- Setup PATCH passes both provided fields and the previous record to CQ1's
  billing validator: unchanged legacy/international ZIP values do not block an
  unrelated edit, while a newly supplied invalid ZIP still fails.

## Changed callers and screens

| Caller | Change |
| --- | --- |
| `App.tsx` | Protected specific create/setup routes before dynamic customer IDs; standalone page layout. |
| `CustomersList.tsx` | Add Customer navigates to the wizard; the old dialog/form is removed. |
| `NewTicket.tsx` | One atomic prospect-lite wizard request with optional nonblank addresses and contact rows. |
| `CustomerDetail.tsx` | Finish setup banner; activation errors show localized missing fields and a setup link. |
| `ActiveCustomersPage.tsx` | Existing status PATCH now displays structured activation errors with an actionable setup link. |
| `QboCustomerMapping.tsx` | Create CRM customer opens a QBO-prefilled linked wizard. |
| `QboCustomerReview.tsx` | Review promotion opens the same prefilled wizard. |
| `routes.ts` legacy create | Shared atomic create/manager-contact/active-push path. |
| `routes.ts` legacy PATCH | Effective activation validation and locked parent bookkeeping; existing provided-key/concurrency semantics retained. |
| `qboCustomerWrites.ts` | Completeness enforced for every caller using the shared activation boundary. |
| `QboCustomerCard.tsx` | An initially pending wizard customer starts the existing bounded poll without another Send action; name collisions expose the CQ4 review link. |
| `/api/geocode` | Uses the shared existing geocoder helper. |

Audit of remaining status PATCH consumers also covered the QBO billing card,
parent dashboard and CustomersList active-flag control. The billing card edits
billing facts, the parent dashboard edits hierarchy/name, and the list control
changes the legacy active flag, not prospect status. The two status-editing
screens that activate customers now expose structured missing fields.

### Legacy promotion callers retained

There are no remaining production frontend calls to
`POST /api/qbo/customers/promote`. The endpoint remains available and delegates
through `storage.promoteQboCustomerToCrm` to `promoteQboCustomer`, unchanged.
Remaining references are route/service regression tests and an unused test
response stub in `QboCustomerReview.rendered.test.tsx`; these are not live UI
consumers. Unknown external callers cannot be enumerated from the repository.
ContractBuilder's existing legacy create caller was deliberately left alone;
it now receives the shared create validation and CQ3 push behavior.

## Changed files

API:

- `artifacts/api-server/src/routes/customerSetup.ts` (new)
- `artifacts/api-server/src/services/customerSetup.ts` (new)
- `artifacts/api-server/src/services/customerSetupValidation.ts` (new)
- `artifacts/api-server/src/services/propertyGeocoder.ts` (new)
- `artifacts/api-server/src/services/customerSetup.integration.test.ts` (new)
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/qbo.ts`
- `artifacts/api-server/src/routes/customerBilling.test.ts`
- `artifacts/api-server/src/routes/qbo.customers.test.ts`
- `artifacts/api-server/src/services/qboCustomerWrites.ts`
- `artifacts/api-server/src/services/qboCustomerPush.integration.test.ts`
- `artifacts/api-server/src/services/qboCustomerSync.integration.test.ts`

CRM:

- `artifacts/highplains-crm/src/components/customerWizard/wizardModel.ts` (new)
- `artifacts/highplains-crm/src/components/customerWizard/FinishSetupBanner.tsx` (new)
- `artifacts/highplains-crm/src/pages/CustomerSetupWizard.tsx` (new)
- `artifacts/highplains-crm/src/pages/CustomerSetupWizard.rendered.test.tsx` (new)
- `artifacts/highplains-crm/src/App.tsx`
- `artifacts/highplains-crm/src/pages/CustomersList.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.preselection.test.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ActiveCustomersPage.tsx`
- `artifacts/highplains-crm/src/pages/QboCustomerMapping.tsx`
- `artifacts/highplains-crm/src/pages/QboCustomerReview.tsx`
- `artifacts/highplains-crm/src/pages/QboCustomerReview.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/qbo/QboCustomerCard.tsx`
- `artifacts/highplains-crm/src/components/qbo/QboCustomerCard.rendered.test.tsx`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`
- `artifacts/highplains-crm/src/i18n/locales/es.ts`

Boundary/documentation:

- `lib/db/src/schema/schema.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `.agents/memory/validation-durability.md`
- This verification report.

## Automated verification

Persistent local logs are under ignored `generated-artifacts/cq5/`.

- After reconciling the newly merged CQ3.1 routes, the API built successfully
  and **3 files, 138 affected tests passed**.
- The completion follow-up changed create/Send now to asynchronous acknowledgment
  and preserved ZIP edit context. The affected server group passed **4 files,
  190 tests**, including existing CQ3 push tests and all setup regressions.
  Deliberately held QBO and geocoder promises prove that active wizard create,
  prospect Send now and legacy create all return before remote completion.
  After tightening fixture-mock scope and cleanup, the setup file was repeated:
  **25 tests passed**.
- Final wizard/QBO-card rendered verification: **2 files, 33 tests passed**,
  including automatic waiting-status polling through a name-taken review link
  without sending a second request.
- Leaf typechecks after the follow-up retain **716 API / 223 CRM** diagnostics,
  with no diagnostics in the changed setup, write-helper or card modules.
- API customer/QBO regression group: **8 files, 239 tests passed**, including
  PostgreSQL atomic rollback, post-commit visibility/failure safety, legacy
  create, binding isolation, manager deduplication, activation and concurrency,
  plus the existing push/sync/promotion suites.
- Supporting QBO/billing group: **7 files, 170 tests passed**, including the
  updated duplicate-check suite and existing QBO client, crypto, item, route and
  billing/migration checks. This group repeats the duplicate-check file from the
  first group; counts are not a claim of 409 unique tests.
- Changed CRM callers/wizard: **4 files, 56 tests passed** before the final
  master-link, paginated-cache and optional-address quick-add regressions.
  The final focused wizard/NewTicket run is **2 files, 26 tests passed**.
  These are 59
  distinct changed-caller tests across the four files, not the sum of overlapping
  runs.
- Full CRM run: **88 files passed, 3 failed; 1,057 tests passed, 8 failed**.
  Failures are five `useTabParam` browser-environment cases, two crew-board
  selection cases and one pricing missing-default-count case. Those test and
  implementation files are unchanged from the merged baseline. They are
  reported separately rather than changing unrelated behavior in this task.
- Shared-library declaration build passed before the full typecheck.
- API diagnostics: **721 before, 716 after**. CRM diagnostics:
  **223 before, 223 after**, with no added normalized diagnostics in CRM or new
  setup/geocoder files. Two existing equipment-route Zod `.errors` diagnostics
  have different expanded inferred-type wording; their sites/error codes are
  unchanged. The full workspace typecheck is still red on its existing baseline,
  not represented as a passing build.
- API/CRM workflows started successfully. The schema-drift workflow reported
  schema in sync and the required extension present. No schema migration ran.

Two initial API regression attempts passed their assertions but failed fixture
cleanup (a timeout, then a cascading-delete deadlock). Cleanup now serializes each
isolated fixture company with queued customer-sync work instead of relying on a
longer timeout. The final eight-file regression run passes. Afterward, an
exact-ID cleanup of the previously failed runs removed 91 matching synthetic
companies, checking their fixture names before deletion. No existing business
company was selected.

## Signed-in development browser verification

Used an isolated disposable company and lowercase admin account after a
read-only lookup confirmed the documented demo account was absent. The first
signed wizard-options response confirmed `writeEnabled: false`.

- Created a CRM-only prospect with no service/billing address, one primary
  contact and synthetic site details. POST returned 200, `not_linked` and no
  QuickBooks customer ID. Back/Next and review Edit retained the draft.
- The detail page displayed Finish setup with the missing activation fields.
  Setup loaded the saved values. Updating the contact role and access note
  issued PATCH, returned the same customer ID, and persisted both edits.
- Created an explicitly active irrigation/service-call property without a bid,
  ticket or contract. Its complete service/billing details persisted. The
  response reported `pending_push`, no QuickBooks customer ID, and the toast
  said “Waiting to send to QuickBooks.” Review explained the write-disabled
  gate. Terms lookup was unavailable in the isolated company and remained
  explicitly unset.
- Captured development requests included local POST/PATCH and read-only
  duplicate checks (503 because this isolated company had no QBO connection).
  No remote customer write was initiated. Initial reconciliation and flags
  were not changed.
- The tester used the visible missing-field banner/setup link for incomplete
  activation; structured activation PATCH rejection is covered by server tests.
  Spanish is covered by rendered tests, not an additional browser pass.
- The tester found a stale-cache bug: Customers showed an empty paginated list
  even though the API returned both new records. Wizard/quick-add success now
  invalidates both bare and query-string customer keys. A regression test starts
  with an infinitely fresh cached empty paginated result, submits the wizard,
  and proves it becomes invalidated so the list refetches on mount. This fix was
  confirmed with that cheaper rendered check, not another end-to-end run.
- A separate NewTicket quick-add regression verifies that only supplied address
  parts and the contact travel in one wizard envelope, with no fabricated blank
  street/state/zip keys.
- Both browser-created customers were deleted through the API and verified
  404; the disposable company, membership and user were removed. Temporary
  credential/helper files were deleted. No existing account was modified.

Browser screenshot evidence is available in the testing report: prospect review
`cz05vq`, Finish setup banner `q8dpxu`, setup review `lip216`, persisted edit/toast
`fxdnfw`, active waiting review `lc1dds`, waiting result `erkuiy`, settled active
detail `yhz9k6`, and the pre-fix stale-list reproduction `3j8msg`.

The browser pass preceded the completion follow-up. The asynchronous
acknowledgment, legacy ZIP edit and initial waiting-card polling corrections were
confirmed with the focused server/rendered regressions above, without repeating
the end-to-end browser pass.
