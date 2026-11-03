# Customer push deadlock hotfix

## Scope and safety

This change is confined to the existing API Server. It does not change customer
eligibility, outbound payloads, billing ownership, activation, review policy,
schemas, migrations, remote write authorization, or the initial-sync gate.
No production restart, publishing, production data operation, real-company initial
sync, or live QuickBooks operation is part of this verification. Remote requests use
synthetic fixtures and mocks.

## Implementation

- A company owns one in-process worker and a Set of waiting customer IDs.
  Owner transactions register work through `onCustomerSyncCommit`; rollback
  discards registration. The worker starts on `setImmediate` after commit.
- The worker removes an ID **before** awaiting its push. Repeated waiting IDs
  collapse, but a later committed edit can append an in-flight ID for another
  turn. Each item is isolated by its own try/catch. Empty workers are removed
  without an intervening await, so cleanup cannot discard a concurrent enqueue.
- Scheduler retries select committed pending/error rows outside the company lock
  and enqueue the whole batch into that same worker. They await its drain instead
  of starting another push loop. There is no immediate requeue after contention.
- `isQboWriteEnabled(companyId, executor = db)` now reads settings through the
  push transaction. Existing non-locked callers keep the default executor.
- Immediately before advisory acquisition, the transaction executes
  `SET LOCAL lock_timeout = '15s'`. A wrapped PostgreSQL `55P03` is recognized
  through its cause chain after transaction rollback/release, logged, and
  translated to `CustomerSyncBusyError` (503, exactly
  `Customer sync busy, try again`).
- Busy background pushes roll back without creating `push_failed` reviews or
  changing pending state. The worker logs and moves on; durable pending state
  remains eligible for the next scheduler sweep.
- Customer/setup/outbound/binding/promotion routes already translate
  `CustomerSyncError`. The management-company PATCH now does too. The duplicate
  check preserves the shared error contract, and a final narrowly scoped error
  middleware covers uncaught busy errors from legacy HTTP writers.
- Management-company and branch fan-out remain transaction-local marking plus
  post-commit queue registration, never inline remote pushing.

## Pool identity

`artifacts/api-server/src/db.ts` creates the pool actually used by the API db
proxy, storage, and the PostgreSQL session store. Its maximum is explicitly 20.
`lib/db/src/index.ts` creates a **different** pool exported by the schema package;
changing that pool would not fix the API. It is unchanged.

The regression changes the actual exported API pool's `options.max` to 5 before
its first connection, asserts that maximum and its distinct identity from the
library pool, and checks both total connection count and unrelated pooled query
latency. This is real PostgreSQL, not a mocked pool/executor. The remote mock
also performs a real global connection lookup, exercising the intentional
second-connection requirement while the customer lock is held.

## Database/storage call audit

`tx` below is the transaction supplied by `withCustomerSyncLock`. Nested company
locks reuse it and reject cross-company nesting. `db` is intentionally **not**
globally rebound around all locked work.

### Push, dispatch, and remote client

| Call site | Audited database/storage operations | Boundary |
| --- | --- | --- |
| `lockedCustomer` | Company/customer SELECT FOR UPDATE | Explicit tx |
| `customerFields` | Bill-to customer lookup; management-company lookup | Explicit tx callbacks to the pure resolver |
| `pushLocked` eligibility/parent | Customer/parent locks; via-parent state update | Explicit tx |
| `pushLocked` gates | Connection SELECT; settings/feature-flag SELECT | Connection already tx; **settings was escaped, corrected to tx** |
| `pushLocked` reviews/quota | Open review SELECT; intentional parent-unlink review SELECT; parent pending update | Explicit tx; attempts map is process-local, no SQL |
| `pushLocked` no-change/success | Customer in-sync update; binding/token/baseline/pushed-at update; resolved push-failure review update | Explicit tx |
| `pushLocked.fail` | Customer error update; review creation/merge | Explicit tx; review helper receives tx |
| `pushLocked.nameTaken` | Name-taken review creation/merge; customer last-error update | Explicit tx |
| `exactCustomer` | Remote duplicate query; ingestion of matches | Remote OAuth exception below; nested ingestion reuses tx |
| `fetchQboCustomer` | Remote customer GET | No application SQL; OAuth exception below |
| Push stale-token/success echo | Nested `ingestQboCustomers` | Existing tx reuse, no second transaction/connection |
| `queueCustomerPush` / drain | Commit callback; in-memory Set operations; call `pushCustomer` | No SQL during registration; each committed item obtains its own tx serially |
| `retryPendingCustomerPushes` | Pending/error customer ID SELECT | Global db **outside** the lock, then shared queue |
| `qboCustomerRefFor` | Parent SELECT | Global db outside locked call paths; future Invoice Center helper, no current locked caller |
| `isQboWriteEnabled` | Settings feature-flag SELECT | Optional executor; push passes tx; status/settings/unlocked callers default to db |
| `qboRequest` | Connection SELECT; refresh reread; final-401 revoked-status update | **Intentional independent OAuth/connection bookkeeping** |
| `ensureFreshToken` / `upsertRefreshedTokens` | Token/status UPDATE; refresh-error status UPDATE; refreshed connection SELECT | **Intentional independent OAuth bookkeeping** |
| OAuth authorization/revoke/proactive refresh | Connection inserts/updates/selects/deletes in client/storage entry points | Outside customer application lock; unchanged |

### Ingestion, reconciliation, and scheduler

| Call site | Audited database/storage operations | Boundary |
| --- | --- | --- |
| `connection` | Connection SELECT | tx for ingestion; db only for unlocked acquisition/scheduler |
| `applicationConnection` | Connection SELECT FOR UPDATE | Explicit tx after remote acquisition |
| `billing` / `crmFields` | Customer and management-company resolver lookups | Explicit tx callbacks; mapping/validation itself has no SQL |
| `fieldFailure` | Review merge via `raiseCustomerReview` | Explicit tx |
| `raiseCustomerReview` | Existing subject SELECT FOR UPDATE; duplicate-resolution UPDATE; merged-review UPDATE; INSERT ON CONFLICT; recursive retry | Explicit tx throughout |
| `ingest` | Existing mirror SELECT; bounded mirror upserts; company CRM SELECT FOR UPDATE | Explicit tx |
| `ingest` bound records | Display/synced metadata UPDATE; open changed-field review SELECT; baseline/token UPDATE; review creation/merge | Explicit tx, including bill-to lookups |
| `ingestQboCustomers` | Connection read and `ingest` | Nested lock reuse when called from pushes/reviews/live duplicate checks |
| `applyFull` | Ingestion; missing-mirror deactivation UPDATE; bound CRM SELECT; stale-binding reviews; full-pull/cursor connection UPDATE | Explicit tx |
| `newerMirror` | Mirror timestamp SELECT | Explicit tx |
| `acquireFull` / `fullRecords` | Initial connection SELECT; paged remote acquisition | db read outside lock; remote/token bookkeeping independent; nested pulls explicitly rejected |
| `runFullCustomerPull` | Application connection lock; freshness/mirror checks; full application | Explicit tx after unlocked fetch |
| `runInitialCustomerSync` existing baseline | Connection lock; mirror application; CRM SELECT for summary | Explicit tx after unlocked fetch |
| `runInitialCustomerSync` first baseline | CRM SELECT FOR UPDATE; billing/review work; customer hydration/baseline UPDATE; baseline/cursor connection UPDATE | Explicit tx |
| `runIncrementalCustomerSync` | Initial connection SELECT; CDC/full fetch | Outside lock; remote/token bookkeeping independent |
| `runIncrementalCustomerSync` application | Connection lock; freshness/mirror checks; ingestion; cursor UPDATE | Explicit tx |
| `customerSyncStatus` | Connection SELECT; review COUNT | Global db, unlocked status reader |
| `writeCustomerSeedSuggestion` | Customer SELECT; mirror seed UPDATE | Explicit tx |
| `sweepQboCustomers` | Connected-company SELECT; per-company connection SELECT | Global db outside lock; pulls acquire/apply separately; pushes feed shared queue |

### Reviews, binding, promotion, and customer writes

| Call site | Audited database/storage operations | Boundary |
| --- | --- | --- |
| `listCustomerReviews` / `countCustomerReviews` | Joined review/customer/cache SELECT; open COUNT | Global db, unlocked read endpoints |
| `resolveCustomerReview` entry/changed fields | Review SELECT FOR UPDATE; customer lock; remote fetch and nested ingestion; fresh-review SELECT; parent SELECT; refreshed customer lock; customer baseline/billing UPDATE | Explicit tx for all application operations; remote/token bookkeeping independent |
| `resolveCustomerReview` link/unlink | Cached-target SELECT; target/parent locks; parent separate-mode UPDATE; branch fan-out; binding/unlink helper calls | Explicit tx and helpers passed tx |
| `resolveCustomerReview` other actions | Cached mirror SELECTs for prefill/name validation; inactive customer UPDATE; mark pending; final review resolution UPDATE | Explicit tx; prefill alone does not close the review |
| `bindCustomerLocked` | Cache SELECT; customer/parent locks; existing-binding SELECT; hydrated customer binding/baseline UPDATE; matching review resolution UPDATE | Explicit tx |
| `bindCustomer` / storage binding | Delegate to locked binder | Shared company lock; no escaped storage read |
| `unlinkCustomerLocked` / storage unbind | Customer lock; clear-binding/state UPDATE | Explicit tx |
| `promoteQboCustomer` / storage promotion | Cache SELECT; existing-binding SELECT; prospect INSERT; shared binder; final customer SELECT | Explicit tx |
| `markPending` | Customer pending UPDATE; commit callback registration | Explicit tx; registration itself has no SQL |
| `guardBranchMode` | Linked branch SELECT | Explicit tx |
| `afterCustomerEdit` | Mark pending; branch SELECT FOR UPDATE; via-parent UPDATE or intentional-unlink review SELECT plus pending UPDATE | Explicit tx; never remote work inline |
| `writeCustomer` relationships | Current/new-parent locks; child SELECT; activation customer/management-company lookups; linked-branch guard | Explicit tx |
| `writeCustomer` mutation | Parent flag UPDATE; customer UPDATE RETURNING; old-parent sibling SELECT and flag UPDATE; post-edit fan-out; final customer SELECT | Explicit tx |
| `storage.createCustomer` | Customer INSERT; post-edit hook; final SELECT | Explicit tx |
| `storage.updateCustomer` | Default path delegates to locked `writeCustomer`; explicit-writer path uses supplied writer | Default acquires/reuses shared lock; supplied executor remains transaction-bound |
| `storage.updatePropertyManagementCompany` | Directory UPDATE RETURNING; affected linked management-billed customer SELECT FOR UPDATE; pending updates/registrations | Explicit tx; no inline push |

### Setup and its ambient storage calls

`saveCustomerSetup` already encloses the complete local workflow in
`withCustomerSyncLock(companyId, tx => inTransaction(tx, ...))`.
The API db proxy reads that AsyncLocalStorage scope. The following storage
calls therefore already used the same transaction, despite lacking an explicit
tx parameter; they were **not escaped global reads** and were not rewritten:

| Setup call site | Audited operations | Boundary |
| --- | --- | --- |
| Setup entry / `setupBillingContext` | Existing customer SELECT FOR UPDATE; bill-to customer and management-company SELECTs | Explicit tx |
| Input defaults, contact validation, `validateRelationships` | `storage.getPropertyManagerById` for selected manager, each manager-linked contact, and relationship validation | Existing `inTransaction`-bound db proxy SELECTs |
| `validateRelationships` | Child SELECT; parent lookup; management-company lookup; activation/billing validation resolver reads | Explicit tx |
| Contact ownership validation | `storage.getContactById` for each edit/delete ID | Existing transaction-bound db proxy SELECT |
| Setup customer mutation | `writeCustomer` or customer INSERT; parent flag UPDATE | Explicit tx |
| Setup contact mutation | `storage.deleteContact`, `getContactsByCustomerId`, `updateContact`, `createContact` | Existing transaction-bound db proxy DELETE/SELECT/UPDATE/INSERT |
| `ensureManagerContact` | `storage.getContactsByCustomerId`; `getPropertyManagerWithContacts` → manager SELECT + manager emails SELECT + manager phones SELECT; `createContact` | Existing transaction-bound db proxy throughout |
| Setup binding/pending/final read | `bindCustomerLocked`; sync-state UPDATEs; `markPending`; final customer SELECT | Explicit tx; outbound registration is post-commit |
| `enrichLocation` | Remote geocoding; `storage.updateCustomer` | Intentionally after commit, outside setup tx; independent customer update reacquires shared lock |
| Setup/legacy HTTP validation and prefill readers | Customer/directory/contact/cache reads before calling the shared write boundary | Unlocked validation reads; authoritative locked validation/mutation remains in setup/write services |

The only genuinely escaped application query found in these locked paths was
the push write-flag read. OAuth connection/token calls are the deliberate
exception: remotely rotated credentials must commit even if later customer
reconciliation rolls back. Serial dispatch and bounded lock waits prevent a
same-company burst of waiting push transactions from consuming the pool
headroom those independent calls require.

## Verification evidence

Commands and full logs are retained under ignored
`generated-artifacts/cq32/` (excluded from Git and deployment).

### Measured results

| Check | Result |
| --- | --- |
| Real five-connection API pool, 30 customers, writes disabled | All complete in 5,242 ms; unrelated pooled SELECT 153 ms; no remote calls |
| Same pool, 30 customers, writes enabled with mocked remote calls | All complete in 10,271 ms; unrelated pooled SELECT 19 ms; exactly 30 remote customer writes |
| HTTP management-company address PATCH, 15 linked customers | Response 626 ms, before remote gate release; unrelated SELECT 19 ms; all 15 subsequently drain |
| Held real advisory lock: customer PATCH + management-company PATCH + background worker | Both HTTP writers return exact 503 message in 15,246 ms; background leaves pending and creates no review; connection waiters released |
| Recovery after releasing held lock | Scheduler uses same queue and reaches in-sync with one mocked remote write |
| Queue policy | Pending deduplication/order; later committed edit; rollback discard; nested tx reuse; missing-item failure recovery; independent company progress all pass |
| Main API pass, including new regression | **14 files / 344 tests passed** (`final-tests.log`, 180.25 s) |
| Additional unchanged API active-customer, activation, read, item, crypto suites | **5 files / 103 tests passed** (`additional-api-tests.log`) |
| Existing web setup/activation/review/settings/by-QBO/billing checks | **6 files / 48 tests passed** (`web-tests.log`) |
| Existing web QBO customer card and badge checks | **2 files / 29 tests passed** (`additional-web-tests.log`) |
| Total completed checks | **447 API + 77 web = 524 tests passed** |
| Development API build/start | Existing managed workflow rebuilt, listened on port 8080 |
| Development auth endpoint | Expected signed-out 401 in 67.8 ms through the preview proxy |
| Preview | Signed-out CRM login screen renders; expected auth 401, no fatal browser error |
| Whitespace check | `git diff --check` passed |

The main API pass retains the existing independently committed OAuth rotation
rollback test, parent-first creation, baseline/write gates, intentionally
unlinked pauses, sparse updates, reviews, tenant boundaries, and setup behavior.
There are no skipped cases in the final API or web selections.

### Baseline and typecheck qualifications

- A pristine archive of the unchanged API source supplied the test baseline.
  Its 337 selected cases were verified: 336 passed on the first archive run;
  one migration fixture initially failed because the archive lacked its relative
  SQL asset. After linking the unchanged migration assets, that single case
  passed (45 unrelated cases skipped in that focused recheck). No product code
  was changed to make the baseline pass.
- The first background broad test invocation did not honor the intended file
  selection and was stopped; it is **not** passing baseline evidence. A later
  parallel focused run passed all 337 assertions but had a cleanup-hook failure
  while the development API's global background work shared its fixture
  database. Final database passes ran serially with that development workflow
  stopped. Only disposable verification-owned synthetic companies were cleaned
  up; pre-existing development fixtures were left intact.
- The pre-edit leaf typecheck reported 1,962 diagnostics while reading stale
  emitted workspace library types. Refreshing the unchanged DB library
  declarations (`tsc --build lib/db`, successful) removed that confounder.
- After aligning archived project references with the same unchanged real
  workspace libraries, the archive reported 743 diagnostics, including eight
  archive-only root-directory (`TS6059`) artifacts. The completed API check
  reports 735 existing diagnostics. Comparing diagnostic counts by source file
  and TypeScript error code shows **zero added categories/counts**; the only
  removals are those eight archive-path artifacts. No new queue/service/helper
  diagnostic remains. See `baseline-typecheck-aligned.log`,
  `typecheck-final.log`, and `typecheck-comparison.json`.
- This is **not a clean project typecheck** and the lower diagnostic count is
  not a claim to have fixed unrelated types. Existing auth/routes/mail/shared
  frontend/schema-boundary problems and stale API-validator declarations remain
  outside this hotfix.
- The source archive was removed before completion/schema validation, retaining
  logs but no duplicate schema/config tree.
- Development startup still logs failed credential decoding for older synthetic
  QBO fixtures. All connected development records were confirmed to contain
  placeholder access/refresh credentials before restart; those failures occur
  locally before a remote request. They are not evidence of live QBO operations
  or a new customer-sync startup failure.

### Changed files

| File | Purpose |
| --- | --- |
| `artifacts/api-server/src/db.ts` | Explicit API pool maximum |
| `artifacts/api-server/src/services/qboClient.ts` | Optional write-flag executor |
| `artifacts/api-server/src/services/qboCustomerPush.ts` | Serial shared queue, drain, scheduler dispatch, transactional flag read |
| `artifacts/api-server/src/services/qboCustomerSync.ts` | Local advisory timeout and wrapped-cause busy translation |
| `artifacts/api-server/src/routes/customerSetup.ts` | Narrow propagated-busy HTTP error middleware |
| `artifacts/api-server/src/routes/routes.ts` | Management-company busy handling and middleware registration |
| `artifacts/api-server/src/routes/qbo.ts` | Duplicate-check shared sync error response |
| `artifacts/api-server/src/test/customerPatchApp.ts` | Actual production PATCH extraction with real error handler and directory fan-out |
| `artifacts/api-server/src/services/qboCustomerQueue.integration.test.ts` | Real max-five pool and incident regressions |
| `docs/cq32-customer-push-deadlocks.md` | This call inventory and evidence report |
| `.agents/memory/validation-durability.md` | Non-obvious archived TypeScript project-reference isolation lesson |

## Limits

- This is an in-process, per-company queue, not a durable/distributed job queue.
  Restart recovery still relies on committed pending/error customer state and
  the existing scheduler. Retry quotas remain process-local and unchanged.
- The pool increase is headroom, not the primary fix. Many different companies
  or unrelated concurrent HTTP writers can still occupy the pool; this hotfix
  does not introduce a global admission controller or distributed quota.
- Lock timeout bounds acquisition/lock waits, not time waiting for a pool slot
  or complete end-to-end request duration under arbitrary server overload.
  Existing remote request deadlines remain in force.
- No live QuickBooks or production remediation claim is made.
