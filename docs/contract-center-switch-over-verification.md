# Contract Center customer switch-over and legacy freeze

## Release hold — revised manual production gate

**Implementation is verified in development, not permission to merge or publish.**
The merged starting tree includes the preceding create/renew slice. The revised
audit-import attachment supersedes the former pre-freeze repair and immediate-Copy
instructions. No production corrections, imports or publication are authorized by
this development verification.

Required production order:

1. Merge the legacy freeze before the audit-import slice starts.
2. Publish freeze and audit import together, manually with owner approval.
3. Export/audit production batches only afterward, while legacy data is read-only.
4. Review signed documents and Excel corrections, then Preview and explicitly
   confirm each audit import. Never run Copy as the migration step.
5. Create, edit and renew only in Contract Center. Skip those null-import-reference
   seasons in the audit CSVs; imports leave them alone and warn.

See [Audit rollout and Phase 7 shared-object retention](contract-center-audit-rollout.md)
for the current authoritative release order and storage cleanup rule. Historical
Copy verification below describes the freeze slice's development baseline, not a
currently available production migration action.

Dashboard, revenue, reports, tickets, snow events and the crew app deliberately still
read the frozen legacy tables. **Contracts created after switch-over will not appear
on those screens until Phase 4 repoints them.** Revenue and Monthly summary calculations
are not changed here. Phase 7 removal of the legacy routes, storage and builder is not
part of this work.

## Complete legacy writer inventory

Audit scope: the merged API routes, storage methods and callers, other server route/service
files, scripts, SQL migration files, database foreign keys, and frontend callers.
Case-insensitive SQL searches and ORM insert/update/delete searches were included.
The only runtime writers of the five legacy target tables are the storage methods
and cascades below. There are no additional user-reachable writers in other route files.
All existing legacy GET registrations and storage read implementations are unchanged.

All thirteen direct entry points now call the single `rejectLegacyContractWrite(res)`
immediately after their existing authentication check, before role checks, validation,
ownership lookups, storage access, object URL issuance, ACL changes or workflow work.
Their exact response is HTTP 409:

```json
{ "message": "Contracts are managed in the Contract Center now." }
```

Unauthenticated callers retain their existing 401 behavior.

| User entry point | Direct/indirect legacy work now prevented |
| --- | --- |
| POST `/api/customers/:customerId/contracts` | `createContract`; associated status history; automatic service-plan population |
| POST `/api/contracts` | `createContract`; associated status history; automatic service-plan population |
| PATCH `/api/contracts/:id` | `updateContract`; status history; automatic service-plan population |
| DELETE `/api/contracts/:id` | `deleteContract`; contract FK cascades to services, monthly amounts, documents and history |
| POST `/api/contracts/:contractId/services` | `createContractService`; automatic service-plan population |
| PATCH `/api/contracts/:contractId/services/:serviceId` | `updateContractService` |
| DELETE `/api/contracts/:contractId/services/:serviceId` | `deleteContractService` |
| PUT `/api/contracts/:contractId/monthly-amounts` | `upsertContractMonthlyAmounts` |
| POST `/api/contracts/:contractId/documents/upload-url` | Object upload URL issuance, before any source lookup |
| POST `/api/contracts/:contractId/documents` | Object access-policy work and `createContractDocument` |
| DELETE `/api/contracts/:contractId/documents/:docId` | `deleteContractDocument`, including its current-version/history implications |
| POST `/api/contract-builder/documents/:id/publish-and-create` | Builder publication/PDF work, `createContract`, status history, service-plan population and `createContractDocument` |
| PUT `/api/customers/:customerId/rate-sheet` | `upsertCustomerRateSheet` |

Additional destructive user entry points:

* POST `/api/admin/reset-for-setup`: unconditionally rejects after authentication,
  before even its old administrator role check. `deleteAllUsers` raw SQL explicitly
  deletes `contract_services`, `contract_status_history`, `contract_documents` and
  `contracts`. Its later customer/company deletes also cascade monthly amounts and
  customer rate sheets. Blocking the entire reset prevents unrelated ticket, schedule,
  builder, membership, company, session and user deletions as well.
* DELETE `/api/customers/:id`: retain authentication and the existing role authorization;
  perform the company-scoped customer ownership lookup first. Missing/foreign IDs return
  404 without a freeze probe. Probe contracts and rate sheets by the authorized customer's foreign key,
  then return the same 409 if either exists. Customer deletion cascades contracts and
  rate sheets; contracts in turn cascade services/monthly amounts/documents/history.
  Deletion of a customer with no legacy targets still works, including its existing
  parent cleanup. The probe deliberately follows customer IDs even if an old row's
  company ID is inconsistent: a real FK cascade would still delete that frozen row.
* DELETE `/api/admin/companies/:id`: require authenticated superadmin before any
  lookup/probe, confirm the target company exists, then check all five company-scoped
  target tables plus contracts/rate sheets joined through customers owned by that
  company. Those ancestry probes also protect rows whose legacy company IDs are
  inconsistent. Reject if any exists; preserve deletion of companies without legacy
  rows. All five targets have cascading company foreign keys, in addition to customer/
  contract cascades. Superadmins remain authorized to delete a target company other
  than their active company, provided it contains no frozen targets.

Storage implementations retained, **not globally disabled**:

* `createContract`, `updateContract`, `deleteContract`.
* `createContractService`, `updateContractService`, `deleteContractService`.
* `upsertContractMonthlyAmounts` (insert/upsert monthly rows).
* `createContractDocument`, `deleteContractDocument`.
* `upsertCustomerRateSheet` (insert/upsert sheet).
* `createContractStatusHistory`, `deleteAllUsers`, `deleteCustomer`, `deleteCompany`.
* `autoPopulateServicePlansFromContract`: its only runtime callers are the blocked
  legacy create/update/service-create/builder-publish paths. The function remains
  available and service-plan reads and independent scheduling are untouched.

There is no separate customer bulk-delete or user-delete writer bypassing these gates.
Direct database cleanup in test helpers and the opt-in development verifier remains
possible for disposable fixtures; it is not reachable from an application user action.
Existing startup schema/backfill machinery was not modified. No new legacy SQL
corrections or migrations were added.

Contract Center lifecycle/rate-card writes target new agreement/term/catalog tables,
not these five targets. Preview reads old records and remains operational. Copy is
now disabled; validated audit import writes new agreements/terms/source links.
Builder draft editing
targets `contract_builder_*`, not legacy contracts; the hidden direct builder route
is retained, but its publish-and-create handler is frozen.

## Customer surfaces and provenance

* Admin/office (and authorized superadmin) see customer-filtered Contract Center cards
  first. Shared line/status/renewal badges, form, season/calendar dates and annual
  pricing are used. Open navigates to the agreement; New contract carries the customer
  ID into the existing create flow. Query keys include active company and customer.
* Loading and retryable error states do not show the exact successful empty state
  `No contracts yet.`. Other roles neither query nor display Contract Center data
  through customer detail.
* Native `details` starts collapsed, headed `Old system (read-only)`. Existing legacy
  cards, monthly billing values, service/schedule reads, history and downloads remain.
  Old creation dialog/mutation and all legacy card upload/replace/edit/end/delete/
  billing mutations are removed.
* Rate-sheet values/notes are plain read-only text, with the required
  `Rates now live on each contract in the Contract Center.` note; its save mutation
  and editing state are removed. `ContractServices` receives explicit `canEdit={false}`
  and does not mount its write dialog when read-only. `ScheduleSummary` has no writes.
* Tools hides only the builder tile; the existing builder route stays.
  `/dashboard/contracts/old` retains year/filter/sort reads and displays
  `Old system (read-only). Use the Contract Center.`.
* GET `/api/contract-center/copy-status` uses the same admin/office/superadmin read
  authorization and active-company requirement as Contract Center. Its persisted
  source-link aggregation is `min(created_at)` and
  `count(distinct legacy_contract_id)`, **not** agreement/term/run counts.
  The legacy section displays “These records were moved into the Contract Center
  on <date>”, or `not yet moved` only
  after a successful null result. Loading/errors are distinct.

## Verification

Logs live in ignored `generated-artifacts/cc2-4/`.

| Check | Result |
| --- | --- |
| API focused freeze/provenance/foundation/Copy suites | 139 tests passed across 4 files |
| Customer read-only/render/role/provenance tests | 15 tests passed |
| Existing Contract Center frontend focused suite | 80 tests passed across 11 files |
| Opt-in real development Copy, document downloads and Revenue Audit | 1 comprehensive test passed; disposable database and private-storage fixtures cleaned |
| Required extensions | Passed, `pg_trgm` present |
| Schema drift | Passed; schema matches declarations |
| `git diff --check` | Passed |
| Canonical `pnpm run typecheck` | Existing baseline failure: 735 diagnostics in both current and unchanged archived tree; identical counts by file/error code, no new diagnostics in changed/new surfaces |
| Additional CRM leaf typecheck | 221 diagnostics versus baseline 222; no added file/error-code diagnostics; one removed implicit-any diagnostic in the removed legacy form |
| Final full API suite | 1,189 passed, 7 failed, 3 skipped; 67 files |
| Full CRM suite | 184 passed, 8 failed; 30 files |

The real development verifier creates its own companies, actor, customer and three
legacy source fixtures, never corrects existing data, and refuses `NODE_ENV=production`.
It proves no-copy status, Preview without links, successful Copy, earliest persisted
timestamp, repeated-Copy stability, three distinct source IDs even when two sources
share a term, customer-filtered copied cards and cross-company isolation. It also
verifies actual FK ancestry protection for deliberately inconsistent disposable
legacy contract/rate-sheet company IDs. All temporary
agreements/companies/users are removed.

The same verifier subsequently uses live authenticated development HTTP requests to
test legacy document history/current-version GETs and protected downloads of two real
private PDFs. Both downloaded files parse successfully as PDFs; current version is 2,
both historical versions remain readable, unauthenticated object reads return 401,
and the frozen legacy upload-URL request returns the exact 409. It also checks the
live Revenue Audit API returns 200 and the expected year/rows shape. This closes the
browser's initially empty-document and unvisited-Audit-subtab gaps without another
browser run. Storage objects, legacy fixture documents, companies and users are removed.
It does not automate production Copy.

Baseline failures were checked against an archived unchanged merged tree, not repaired:

* Full CRM: two `CrewAssignmentBoard.test.tsx` reducer expectations, five
  `useTabParam.test.ts` Node/window failures, and one `rateCardUtils.test.ts` obsolete
  standard-rate count (23 expected, 42 actual). The unchanged tree reproduces these
  same eight failures (169 passed versus the new tree's additional 15 passing tests).
* Full API: six `mailboxAccounts.oauthReconnect.test.ts` failures and one
  `plantEnrichment.test.ts` partial-run expectation reproduce on the unchanged tree.
  An earlier full run also hit the real-DB `crewLinks.integration.test.ts` cleared-
  linkage scenario during workflow restart/background activity; the complete
  isolated crew suite subsequently passed all 18 tests without code changes.
  The unchanged full tree instead hit two real-DB `visits.integration.test.ts`
  scenarios (1,125 passed, 9 failed, 2 skipped), demonstrating that those shared-DB
  integration failures vary under background/concurrent work. These are reported
  separately from the focused freeze tests, which pass. The final full run passed
  both crew/visits integration suites and retained only the seven reproduced
  mailbox/plant baseline failures.
* Canonical typecheck includes pre-existing shared frontend schema stub typing,
  API cross-root schema imports, ticket/chemical/scheduling typing and other
  artifact/script diagnostics. Absolute archive paths and structural property
  ordering differ between logs; file/error-code counts are unchanged. No
  unrelated baseline typing was repaired.

Both changed managed workflows were restarted after the initial code batch; the API
was restarted again after the final ancestry-guard batch. They start successfully.
API build succeeds and the server listens on its assigned port; Vite
starts successfully. Existing PostgreSQL/PostCSS/startup warnings remain.

### Authenticated navigation smoke

A single consolidated browser pass used a separately seeded disposable development
company/admin/customer and two landscape legacy source records:

* Standard-rate seeding, Preview and Copy succeeded only in that fixture company.
  Two legacy sources produced one copied agreement/term with 12 billing months and
  $1,800 annual pricing.
* Customer cards appeared above the initially collapsed Old system section. Expanding
  it retained both legacy cards, amounts and first-copy provenance with no write
  controls. The copied card showed shared badges, season/dates, price and Open.
* New contract carried the actual customer ID into the prefilled create flow. Cancel
  left the copied agreement count unchanged. Open displayed the copied term/detail.
* Old overview retained year/search/service/status/sort controls and the exact banner.
  Tools lacked the builder tile; the direct builder route remained reachable.
* Rate sheet contained only displayed values/notes and the required migration note.
* Dashboard, Revenue Overview matrix and Reports settled and rendered without an
  indefinite spinner. The additional live HTTP check above covers Revenue Audit.
* Legacy contract GET returned 200; invalid legacy creation and nonexistent-builder
  publication returned the exact 409.
* Browser fixtures were removed; zero remaining company/user/customer/agreement/
  legacy-contract fixture counts were confirmed.

The tester's overall verdict was failure because the **unchanged retained builder**
logs repeated React `Maximum update depth exceeded` errors while still rendering its
customer chooser. Its implementation, `App.tsx` and Revenue Overview are byte-for-byte
unchanged against the merged starting tree. This pre-existing builder defect is not
repaired in this slice, which explicitly excludes unrelated baseline repairs and
retains the route until Phase 7. The tester also observed two resource 404s on otherwise
rendered customer/dashboard pages and existing untranslated rate-label keys. These
observations are not presented as passing checks or silently fixed.

The first browser fixture contained no documents, and a read-only database check found
no existing development contract/term documents. Consequently browser history/download
actions could not be exercised there. The retained controls are covered by render
regressions; the actual history/current GETs and both protected PDF downloads were
then verified using the isolated real-storage/live-HTTP fixture described above.
The public preview screenshot confirms the signed-out application loads; authenticated
screens were inspected by the browser tester.

## Changed files

* `artifacts/api-server/src/lib/legacyContractFreeze.ts` — shared rejection and cascade probes.
* `artifacts/api-server/src/routes/routes.ts` — 13 direct gates, reset gate, conditional customer/company cascade gates.
* `artifacts/api-server/src/routes/contractCenter.ts` — copy-status read.
* `artifacts/api-server/src/routes/legacyContractFreeze.test.ts` — real-handler mocked gates and cascades.
* `artifacts/api-server/src/routes/contractCenterCopyStatus.test.ts` — authorization/scoped aggregate tests.
* `artifacts/api-server/src/lib/contractCenterFreezeDevelopment.test.ts` — opt-in real development Copy verification.
* `artifacts/highplains-crm/src/components/contracts/CustomerContracts.tsx` — new-first customer cards and collapsed legacy/provenance wrapper.
* `artifacts/highplains-crm/src/pages/CustomerDetail.tsx` — read-only legacy cards/rates, removed old creation/upload/billing mutations.
* `artifacts/highplains-crm/src/components/ContractServices.tsx` — omit write dialog in read-only mode.
* `artifacts/highplains-crm/src/components/ScheduleSummary.tsx` — read-only empty-state wording.
* `artifacts/highplains-crm/src/pages/ToolsPage.tsx` — hide builder tile.
* `artifacts/highplains-crm/src/pages/ContractsOverview.tsx` — old-system banner.
* `artifacts/highplains-crm/src/pages/CustomerContracts.rendered.test.tsx` — new-first/read-only/role/provenance regression coverage.
* `docs/contract-center-switch-over-verification.md` — full audit, checks and manual release hold.
* `.agents/memory/contract-center-phase-boundaries.md` — durable downstream freeze/manual release-order reminder.

**Database migration status: none.** No schema or migration files changed.
