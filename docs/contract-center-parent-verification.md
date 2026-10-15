# Parent contracts and guarded import removals: development verification

## Scope and readiness

The baseline already contains the merged signed-renewal importer, current
export and mode-aware Settings. Its mode parser, per-customer renewal executor,
company import gate, renewal planner, duplicate-import handling and provenance
contracts were inspected before implementation. Both phase rule attachments and
the complete parent/removal attachment were read. The revised audit rollout,
not the superseded Copy-after-publication instruction, remains authoritative.

No schema changes, migrations, new dependencies, publication, production
imports, real bank audit preparation or stored-object cleanup were performed.
All database verification targets disposable development companies only.

## Behavior and transaction contract

- Create and audit/renewal import accept parents without relaxing company
  scoping or role allow-lists. The New flow accepts parents from search,
  URL preselection and verified saved drafts.
- Exact-customer list reads remain the default. `includeParent=true` adds only
  direct-parent agreements in the active company, with `viaParent: true`,
  parent/branch metadata and canonical recovered selected-season payment lines.
  The response remains an array. Location counts exclude foreign-company rows.
- Branch cards separate own and inherited contracts; inherited cards retain
  all normal read information and Open navigation. Prefix matching uses
  customer number or branch name and canonical two-decimal cents formatting.
  No match adds nothing. No billing ownership is inferred.
- Parent cards are available on the parent's separate dashboard Contracts tab.
  Board/list labels add the child count but preserve actual customer ownership
  and grouping.
- Removal CSV parsing retains strict headers/CSV/UTF-8 and archive protections.
  Audit byte/ZIP limits remain 10 MB / 30 MB / 20 entries; renewal limits remain
  40 MB / 60 MB / 60 entries, 15 MB per PDF. Multipart supports the five required
  audit tables, optional removals and optional manifest.
- Replacement and removal use the same provenance guard, rechecked under locks.
  Renewal-imported seasons remain protected, consistent with the predecessor.
- Removal-bearing uploads use one transaction, taking the established company
  gate followed by deterministic customer/hierarchy, agreement, term/document,
  legacy source/document and link locks. Locks conservatively cover the active
  company to stabilize ownership, absent references and hierarchy. Fresh full
  planning precedes deletion. Removed and eligible replaced links are released
  before new agreements. Any error returns no successes and zero committed
  removals. Other audit and renewal transaction semantics are unchanged.
- New seasons retain normal import history plus attributable replacement notes.
  Structured removal logs are emitted only after commit. Legacy rows and
  document metadata are unchanged; storage objects are neither saved nor deleted.
- Settings lists removals before additions, shows Removed counts, confirms
  whole-upload removal scope, reports rollback without claiming removals, and
  invalidates Contract Center, customer and admin caches after real requests.

## Automated verification

Relevant API/schema/parser/planner/lifecycle/Copy suites and all three opt-in
database suites: **298 tests** across **11 files**. The combined run passed
296 tests; two existing large-ZIP renewal boundary tests exceeded their default
five-second timeout while suites ran concurrently. The complete renewal suite
then passed **60/60**, including both boundary tests, using `--testTimeout=20000`.
No size/count safeguard was changed to address timing.

The disposable database suites cover **26 cases** across audit, renewal and
parent consolidation. The parent suite creates one parent and two separate
branches, imports two branch agreements, previews without writes and imports
their consolidation through the real multipart route (including the optional
manifest). It verifies transferred legacy links/document metadata, all legacy
redirects, parent/branch reads, parent renewal import, frozen-row equality,
attributable history and committed logging. Storage save/delete spies remain
unused. Separate checks exercise unknown/foreign references, duplicate/blank/
overlapping references, manual/renewal-import provenance, named document guards,
unrelated ownership, cross-customer rollback after earlier additions,
concurrent consolidations and stale season/document/hierarchy eligibility after
waiting for the company gate. All fixtures are removed.

CRM rendered verification: **38/38** tests across New contract, customer cards,
board/list/detail suites; **3/3** additional Settings interaction tests cover
removal ordering, confirmation, cache refresh, mode-safe diagnostics and rollback
results. New-flow tests include parent search, URL preselection and saved-draft
creation, while foreign customer selection remains blocked.

Required extension and schema drift checks passed. Root library declaration
build passed. API and CRM managed workflows restarted successfully and served.
Ignored detailed logs are under `generated-artifacts/contract-parent/`.

## Signed-in browser verification

One end-to-end pass used only a disposable administrator/company/parent/two-branch
fixture. It verified the ZIP Preview's two removal rows before additions,
zero errors/warnings, the one-season addition, the explicit whole-upload removal
confirmation, and the successful two-removal/one-agreement result. Each branch
showed its correct $690.00 or $710.00 monthly line through the parent; both Open
links reached the shared parent agreement. The parent's own Contracts tab had
no inherited section, the global list showed `· 2 locations`, and a legacy
contract URL resolved to the new parent agreement. Screenshots were captured
for all these states. A few loading requests returned 404s or full-document
navigation timeouts, but the SPA rendered and every requested state passed.
The disposable browser fixture was cleaned up after verification; no storage
objects were created or deleted by that fixture.

## Existing failures, separate from this work

- Root `pnpm run typecheck`: **735 existing API diagnostics**, matching the
  merged predecessor's documented baseline. No diagnostic names a changed
  parent/audit/renewal/lifecycle file.
- Independent CRM typecheck: **221 existing diagnostics**, matching that
  baseline. No diagnostic names a changed CRM file.
- An early full API run reproduced seven documented unrelated failures:
  plant enrichment's partial-run status assertion and six mailbox OAuth
  reconnect/mismatch cases. No unrelated repairs were made.
- The combined focused run's two renewal ZIP timeouts are described above;
  both passed on the isolated complete-suite rerun.

## Parent-rule inventory

Changed contract-specific enforcement:

1. `routes/contractCenterLifecycle.ts`: removed Create's operational parent
   guard; added opt-in direct-parent reads and company-scoped counts/payments.
2. `lib/contractAuditPlan.ts`: removed parent rejection; extended only parent
   ownership of direct-child legacy contracts/documents and uncovered warnings.
3. `lib/contractRenewalPlan.ts`: removed parent-source rejection only; source
   company, lifecycle, dates, duplicates and renewal status validation retained.
4. CRM `pages/NewContractPage.tsx`: removed parent exclusion in customer
   verification, URL/draft selection and search-button disabling.
5. CRM `pages/ParentCustomerDashboard.tsx`: added an admin/office Contracts tab;
   retained hierarchy management, unlinking, rollups and operational behavior.

Retained sites and reasons:

- `utils/parentGuard.ts`: unchanged shared operational guard.
- `routes/routes.ts`: all **16** guard calls retained:
  `POST /api/customers/:customerId/contacts`,
  `POST /api/customers/:customerId/notes`,
  `POST /api/customers/:customerId/contracts`,
  `POST /api/contracts`, `PATCH /api/contracts/:id`,
  `POST /api/tickets`, `PATCH /api/tickets/:id`,
  `POST /api/equipment`, `POST /api/proposals`,
  `PATCH /api/proposals/:id`, `POST /api/visual-scope-sheets`,
  `POST /api/campaigns/:id/items`, `POST /api/communications`,
  `POST /api/communication-threads`,
  `POST /api/customers/:id/service-plans`,
  `POST /api/customers/:id/service-plans/from-template`.
  The three legacy-contract guards are behind the frozen write behavior, not
  Contract Center creation, and must not revive old writes.
- `routes/routes.ts`: parent-rollup's parent-only requirement; self-parent,
  same-company and one-level hierarchy checks on customer create/update; child
  reconciliation and old parent audit remain unchanged.
- `storage.ts`: parent customer filtering, lookup and hierarchy grouping remain
  unchanged. `contractAuditExport.ts` still exports hierarchy metadata;
  legacy batching and current exports are unchanged.
- CRM `components/contracts/newContractDraft.ts`: inspected; no parent
  exclusion exists, so unchanged.
- CRM `pages/CustomerDetail.tsx`: parent dashboard routing retained; the new tab
  is implemented in that dashboard rather than removing the parent route.
- CRM `components/CustomerSearchInput.tsx` and `pages/CustomersList.tsx`:
  hierarchy grouping and operational controls retained; the New contract flow
  uses its own customer selection.
- Crew, scheduling, campaign, proposal, communications and frozen legacy write
  paths were not relaxed or repointed.

## Changed files

API:
- `artifacts/api-server/src/lib/contractAuditEligibility.ts`
- `artifacts/api-server/src/lib/contractAuditExecution.ts`
- `artifacts/api-server/src/lib/contractAuditFiles.ts`
- `artifacts/api-server/src/lib/contractAuditPlan.ts`
- `artifacts/api-server/src/lib/contractAudit.test.ts`
- `artifacts/api-server/src/lib/contractRenewalPlan.ts`
- `artifacts/api-server/src/lib/contractRenewal.test.ts`
- `artifacts/api-server/src/lib/contractParentFixture.ts`
- `artifacts/api-server/src/lib/contractParentBrowserFixture.ts`
- `artifacts/api-server/src/lib/contractParent.test.ts`
- `artifacts/api-server/src/lib/contractParent.integration.test.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`

CRM:
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/CustomerContracts.tsx`
- `artifacts/highplains-crm/src/components/contracts/contractTypes.ts`
- `artifacts/highplains-crm/src/components/contracts/parentContract.ts`
- `artifacts/highplains-crm/src/pages/ContractCenterPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractCenter.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/CustomerContracts.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`

Documentation and durable context:
- `docs/contract-center-audit-rollout.md`
- `docs/contract-center-parent-verification.md`
- `.agents/memory/contract-center-phase-boundaries.md`
