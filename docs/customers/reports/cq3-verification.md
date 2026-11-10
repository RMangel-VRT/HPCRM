# CQ3 — customer outbound synchronization and review resolution

## Scope and prerequisite integration

Implemented only CQ3 in API Server and High Plains CRM, against merged CQ1 and
CQ2. No publishing, initial reconciliation, production migrations, schema changes,
or live QuickBooks validation/writes were performed. Database tests use disposable
synthetic development-company fixtures; every QuickBooks request in them is mocked.
CQ4 review/customer-card/navigation/terms UI and CQ5 wizard remain separate work.

CRM customer billing columns remain the owner. The directory owns management-company
addresses, read live. `qboCustomerSync` remains the only QuickBooks customer cache
writer. Baselines and review evidence are explicitly snapshots.

## Files changed

| File | Purpose |
|---|---|
| `artifacts/api-server/src/services/qboCustomerPush.ts` | Serialized outbound create/sparse-update service, gates, parent-first policy, duplicate handling, stale-token ingestion, selective baseline advancement, retries, invoice-reference export |
| `artifacts/api-server/src/services/qboCustomerWrites.ts` | Durable pending state, owner-edit dependencies, atomic branch-mode guard and branch fan-out |
| `artifacts/api-server/src/services/qboCustomerBinding.ts` | Shared scoped binding, baseline initialization, parent/uniqueness checks and serialized full metadata unlink |
| `artifacts/api-server/src/services/qboCustomerReviews.ts` | Review list/count and all resolution actions, fresh remote decisions, actor/time auditing |
| `artifacts/api-server/src/services/qboCustomerSync.ts` | Post-commit callbacks on the existing re-entrant company transaction; scheduler push retries; optional company selection for isolated scheduler tests |
| `artifacts/api-server/src/routes/qboCustomerOutbound.ts` | Validated legacy create/explicit-send/review endpoints and billing authorization |
| `artifacts/api-server/src/routes/qbo.ts` | Mount outbound router, retire synchronous legacy create implementation, propagate safe binding/unlink errors |
| `artifacts/api-server/src/routes/routes.ts` | Provided-field validation for directory PATCH before queued billing fan-out |
| `artifacts/api-server/src/storage.ts` | Shared create/update triggers, directory transaction/fan-out, binding/unlink delegation, pending-state mapping projection |
| `artifacts/api-server/src/services/qboCustomerPush.integration.test.ts` | 45 mocked-remote/real-PostgreSQL tests, including API permission and resolution tests |
| `artifacts/api-server/src/services/qboCustomerSync.integration.test.ts` | Mock write gate and restrict scheduler tests to their own synthetic companies |
| `artifacts/api-server/src/routes/qbo.customers.test.ts` | Replace obsolete synchronous-create assertions with queue validation/binding assertions; remote cases move into real-DB push suite |
| `artifacts/highplains-crm/src/pages/QboCustomerMapping.tsx` | Handle 202 waiting response, allow queueing with writes disabled, persistently display pending state |
| `artifacts/highplains-crm/src/shared/schema.ts` | Optional mapping-response `qboSyncState` type, not a new database column |
| `artifacts/highplains-crm/src/i18n/locales/en.ts` | Waiting/queue explanation |
| `artifacts/highplains-crm/src/i18n/locales/es.ts` | Spanish waiting/queue explanation |
| `docs/ownership/data-ownership-map.md` | Update customer sync rollout status without changing fact ownership |
| `docs/customers/customer-qbo-sync.md` | CQ3 service, endpoint and future-consumer contracts |
| `docs/customers/reports/cq3-verification.md` | This acceptance/report evidence |
| `.agents/memory/customer-qbo-sync-direction.md` | Durable intentional-unlink product boundary and retry-limit decision |
| `.agents/memory/validation-durability.md` | Shared-database scheduler-test isolation lesson |

## Touched call sites and audited owner writers

1. `storage.createCustomer`: commits owner values and `pending_push` together when
   status is active, then starts best-effort logged work after commit.
   Prospects remain unlinked unless explicitly sent.
2. `storage.updateCustomer`: ordinary callers now use the same company lock and
   row-locked owner transaction. Actual activation and changes to billing columns,
   effective name, property address, directory association or parent policy queue work.
   The existing optimistic timestamp check is retained.
3. Both `POST /api/customers` and `PATCH /api/customers/:id` already call these
   shared storage writers, so no second trigger is added at the HTTP layer.
4. All other storage-writer consumers were audited: internal/demo/parent-bank
   creation and repair, auto-marking/removing parent flags, primary-contact
   property-manager association updates, geocode coordinates and directory
   association repair. Shared dependency detection applies where billing can change;
   coordinates and unrelated contact fields do not send.
5. `runContractNonRenewalSweep` is the one external transaction writer. It supplies
   `writer=tx` for **inactive-only** status changes and retains its existing
   transaction/locking behavior; it cannot activate or modify billing and never
   sends QuickBooks `Active`.
6. `PATCH /api/property-management-companies/:id` now parses an omitted-company,
   partial schema and uses `pickProvided`, avoiding default injection and tenant
   reassignment. `storage.updatePropertyManagementCompany` commits the directory
   change and pending state for same-company linked directory-billed customers.
7. Parent `branchBillingMode` edits are guarded and fan out within the owner
   transaction. Separate-to-master with any linked branch returns 409:
   **“Branches already exist in QuickBooks; un-link them first.”**
8. `sweepQboCustomers` retains CQ2 pull behavior and then calls
   `retryPendingCustomerPushes`; each push independently rechecks all gates/reviews
   and durable customer state. A pull failure does not bypass push gates.
9. Existing mapping bind/unbind routes still call storage, whose implementations
   now share the company lock, safe binding checks and baseline/token handling.
10. Existing `/customers/create` now delegates to the nonblocking outbound router;
    this removes the only legacy synchronous customer-create remote path.
11. The current mapping page's create mutation accepts the 202 pending response,
    invalidates mapping/count/connection queries and displays a waiting toast.
    Mapping rows expose pending state after reload. The old 409 collision-reading
    compatibility branch remains harmless; new asynchronous collisions are reviews.
12. Review endpoints call the shared list/count/resolve service. Accepted CRM
    changes and resolution metadata commit atomically; repush is post-commit.
13. Outbound duplicate checks, successful responses, stale-token reads, survivor
    reads and fresh conflict reads all delegate cache changes to CQ2 ingestion.
14. `qboCustomerRefFor` is exported but has **no invoice consumers changed here**.

No activation writer outside the shared storage create/update paths exists in the
application API. Direct customer insert/update SQL in fixtures and test helpers is
development/test setup, not a second application owner path. Legacy QBO promotion
creates a **prospect**, not an automatically activated customer.

## Outbound behavior and recovery

- Both initial-baseline and company `qbo_write` gates are required. Disconnected
  companies also remain pending. Gate checks and unresolved name/removal reviews
  precede attempt accounting.
- Creates use CQ1's resolved fields, including service/bill-to addresses, terms,
  AP contact, billing emails, phone/mobile and `PreferredDeliveryMethod: "None"`.
  The outbound wrapper always deletes `Active`; updates never set delivery method.
- Updates contain only changed, unreviewed keys plus Id/SyncToken/sparse identity.
  Only sent keys advance their agreed-value snapshot.
- Customer/company locks cover the captured sent values through local bookkeeping.
  A later CRM edit waits for that transaction and separately persists pending work,
  rather than being incorrectly marked synchronized by the earlier response.
- 5010 and stale-object text fetch and ingest the current remote record, preserving
  review evidence and never posting a second time blindly.
- Exact-name matches and 6240 are held as `name_taken`; other failures merge into
  `push_failed` and retain a useful local error. A create followed by local rollback
  is caught by the live exact-name check on its next attempt, rather than duplicated.
- Master branches are `via_parent` and never receive their own outbound record.
  Separate branches establish their parent first and use ParentRef/Job/BillWithParent
  false. Parent-first recursion rejects invalid/cyclic hierarchies and cannot undo
  a parent's intentional `qbo_removed` unlink.
- Owner transactions register callbacks on CQ2's existing lock context. Rollbacks
  discard callbacks. OAuth token rotation remains outside these local transactions.

### Retry durability limitation (explicit)

The three-attempt sliding-hour budget is **process-local**. Under one running API
process, all explicit, automatic and scheduler pushes share this budget under the
company lock; exhausted work remains pending/error with existing reviews retained.
Closed gates spend no attempts. It resets on process restart and is not a durable
cross-instance quota. CQ1/CQ2 provide no attempt ledger. Per the task's instruction
to document durability gaps rather than invent unapproved schema, no new table,
column or migration was added. Do not treat this limiter as a distributed quota.

## Review API contract for CQ4/CQ5

- `GET /api/qbo/customer-reviews?status=open|resolved|dismissed` returns flat review
  rows plus `customerName` and `qboName` (nullable for absent subjects).
- `GET /api/qbo/customer-reviews/count` returns `{ open }`.
- `POST /api/qbo/customer-reviews/:id/resolve` uses the supplied brief's actions.
  All three APIs require `canSeeBilling` (admin, office or billing tag), use the
  authenticated company, and reject an inconsistent `X-Company-Id`.
- Optional `expectedUpdatedAt` is the exact review timestamp; a stale value
  returns 409. Closed reviews also return 409. All successful resolutions record
  `resolution`, `resolvedById`, `resolvedAt`, status and update time.
- `changed_in_qbo`: an exact key set of qbo/crm choices is mandatory. Fetch/ingest
  first. New evidence returns 409 and **commits refreshed open evidence**, not a
  stale decision. Accepted billing addresses become custom. CRM choices repush
  with the fetched token; accepted QBO keys are not echoed.
- Structural/address choices must be representable by CRM constraints: incomplete
  QBO addresses cannot replace required CRM addresses; a QBO parent must be the
  same-company linked separate parent; QBO `BillWithParent:true` cannot create the
  forbidden own-record master-branch configuration. These choices return actionable
  400/409 errors instead of corrupting owner facts. Keep CRM or repair/unlink first.
- `new_in_qbo` / `sub_customer`: promote returns
  `{ ok:true, prefill:{ qboId, fields, parentQboId } }`, where fields is the normalized
  CQ1 field-map **snapshot**; it does not create a CRM record. Link takes customerId,
  safely binds and initializes the baseline. A branch changing its parent from
  master to separate requires `confirmSeparate:true` and matching remote parent.
  Ignore dismisses only the review.
- `qbo_inactive`: set_crm_inactive changes only CRM status; ignore only dismisses.
- `name_taken`: link uses the existing review's QBO Id; renamed requires a changed
  CRM billing name and queues another attempt.
- `push_failed`: retry queues eligible existing work without bypassing gates,
  rate limit or other reviews; dismiss closes only that review.
- `qbo_removed`: link requires a surviving **same-company cached** qboId, fetches
  and ingests it, checks uniqueness/parent policy and initializes baseline/token
  from that survivor. The old removed Id cannot be selected. Unlink atomically
  clears Id/display-name/token/baseline, sets not_linked and clears stale error/
  sync metadata. Dismiss closes only the review and changes no binding or facts.
  Stale bindings reject link/unlink rather than overwriting a later manual link.
- Unlink shares the push lock. Old queued work, scheduler retries, billing edits,
  a stale push_failed retry, branch-mode fan-out and parent-first recursion cannot
  recreate that intentionally unlinked record. A subsequent actual activation or
  explicit admin/office send-now is required.
- `POST /api/qbo/customers/:customerId/send-now` requires admin/office and returns
  202 `{ ok:true, state:"pending_push", message:"Waiting to send" }`.
- Legacy `POST /api/qbo/customers/create` retains its path and override names.
  Overrides are validated and persisted to CRM billing columns/custom address
  before returning 202 and queueing work. It still rejects already-linked rows.
  Company/role checks precede all data access; untrusted extra fields are rejected.

## Verification and discrepancies

- Before changes: selected QBO customer routes, OAuth routes, client, map,
  CQ2 real-database sync and billing tests: **194 passed**.
- After implementation: corresponding existing suites with obsolete synchronous
  create assertions replaced, new CQ3 suite and existing billing-input suites:
  **258 passed**, 9 suites passed; optional non-renewal suite initially skipped.
- Explicit enabled non-renewal run:
  `CONTRACT_NON_RENEWAL_DB_TEST=1 pnpm --filter @workspace/api-server exec vitest run src/lib/contractNonRenewal.integration.test.ts`
  — **17 passed**. Total selected API coverage: **275 passed**, including **45 new
  CQ3 tests**. No intended skipped suite remains unverified.
- Final focused rerun after binding-version/error-propagation fixes: new CQ3 and
  existing QBO customer routes: **129 passed**.
- Existing frontend `CustomerSyncControls.test.tsx`: **4 passed**.
- Canonical `pnpm run typecheck` builds shared declarations first. Before:
  **721 existing diagnostics**; after: **721**, same errors after ignoring source
  line movement and TypeScript union-member ordering. No errors in new CQ3 modules.
  The final API-only check likewise introduces no CQ3 diagnostics. Existing
  failures include cross-artifact rootDir/shared-stub errors, legacy Zod errors,
  unrelated storage and mailbox-backfill typing; they are not bypassed or repaired.
- A first combined test run exposed the old scheduler test scanning other suites'
  baselined fixtures. Optional company selection now isolates scheduler tests; the
  production scheduler still scans all connected/baselined companies by default.
- Schema/required-extension workflow reports in-sync declarations and pg_trgm.
  No database schema change/migration was necessary.
- API and CRM workflows rebuilt/restarted cleanly. Public login screenshot renders.
  The proxied Vite-transformed mapping module returns 200. The screenshot is not
  evidence of an authenticated mapping interaction; changed behavior is covered by
  API/database tests, source contract checks and the transformed module.
- Test/typecheck output is retained under ignored `generated-artifacts/cq3/`.
- The dated brief described old synchronous 403/409 create behavior; the specified
  nonblocking/pending semantics intentionally change it to 202 and review-based
  remote errors. The mapping consumer was updated accordingly.
- CQ1 represents Active in its pure mapper; CQ3 removes it at the outbound boundary,
  following the stricter no-Active-write requirement rather than altering CQ1.

## Future invoice reference and IrrigoPro coordination

Export: `qboCustomerRefFor(customer)` from
`artifacts/api-server/src/services/qboCustomerPush.ts`, returning
`Promise<string|null>`. A master-billed branch uses the same-company parent's QBO
Id; a separate branch uses its own. Invalid parent hierarchy fails explicitly.
No existing invoice behavior was rewired.

When CQ3 is eventually live, coordinate IrrigoPro's locked-field wording:
**“Edit in QuickBooks” → “Edit in High Plains CRM.”** The by-QuickBooks-ID customer
link belongs to CQ4. No IrrigoPro change, deployment or operational sync is claimed
by this task. CQ4 is already downstream, so no duplicate follow-up was proposed.
