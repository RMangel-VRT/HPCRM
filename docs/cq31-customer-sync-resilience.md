# Customer sync resilience verification

Verified November 3, 2026, against the merged CQ4 implementation. CQ1–CQ4
contracts and both supplied briefs were inspected before implementation.

## Scope and operational safety

- No schema, migration, mobile, invoice, wizard or new billing UI changes.
- No live QuickBooks requests/writes, production data/schema operations,
  write-access changes, real initial synchronization or publishing.
- QuickBooks responses and credentials in tests are synthetic. Database-backed
  tests use isolated development fixtures and clean them up.
- Before starting the API workflow, development had zero connected QuickBooks
  connections, so starting its existing scheduler could not contact QuickBooks.
- Existing company scoping, baseline/write gates, intentional unlink pauses,
  held field evidence, and independently committed OAuth rotation remain intact.

## Implemented contracts

- Incoming postal normalization uses digits if there are exactly five or nine;
  otherwise it preserves trimmed, uppercase postal text. Empty values retain
  null/empty-address behavior. Internal spaces in fallback postal text survive.
- Separate CRM/outbound validation accepts five digits, nine digits, or standard
  hyphenated ZIP+4. Optional empty addresses remain optional. Customer PATCH
  checks only explicitly supplied, changed ZIP fields, so unchanged legacy bad
  values and unrelated edits remain editable.
- Linked-customer CRM field failures raise/merge message-bearing `push_failed`
  evidence without advancing that customer's comparison baseline/token. Other
  customers and mirror upserts commit. First initial hydration checks existing
  CRM values separately from newly received postal text; ordinary pre-baseline
  ingestion remains cache-only. PostgreSQL transaction failures still roll back
  rather than pretending they can be isolated inside an aborted transaction.
- Outbound validation runs before tolerant normalization, so malformed postal
  text cannot be silently made valid by stripping its letters/punctuation.
- Only an actual successful remote create/update closes the same company and
  customer's open `push_failed` reviews, in the local success transaction:
  resolution exactly `Resolved by successful push`, current `resolved_at`,
  null `resolved_by_id`. Other kinds, subjects and resolved history survive.
  Gated, queued, failed, blocked, conflicting and no-op outcomes do not close
  failure evidence.
- Every `qboRequest` API attempt, including the 401 retry, has an independently
  cleaned-up 30-second abort deadline. Actual response bodies are consumed inside
  that deadline too, so a stalled body cannot retain a push lock indefinitely.
  Existing token-refresh behavior and its independent commit are preserved.
- Full/initial/CDC acquisition and both CDC full-pull fallback branches execute
  outside the company customer-write lock. The scheduler no longer wraps them
  in an outer lock. Local application and pushes remain serialized.
- Application re-reads/locks the connection and re-reads customers under the
  company lock. Connection identity, realm, environment, connected time, current
  baseline, pull timestamps and newer mirror ingestion are checked before any
  application. Obsolete full/CDC snapshots are discarded without advancing
  cursors; initial sync reacquires outside the lock instead of hydrating obsolete
  data. Newer push/duplicate-check mirror ingestion also invalidates an older
  pending pull. Fetch-start timestamps advance only with successful application.
- Display names permit 500 characters, reject 501, and still prohibit colons.
- Sync-now distinguishes a harmless obsolete snapshot from a missing baseline;
  it does not incorrectly ask a reconciled company to run initial sync again.

## Changed files

Paths below are relative to `artifacts/api-server/src/` unless stated otherwise.

### Runtime

| File | Change |
| --- | --- |
| `services/customerZip.ts` | New shared explicit CRM/outbound ZIP policy. |
| `services/customerBillingInput.ts` | Service/billing ZIP validation with optional provided/previous edit context. |
| `services/qboCustomerMap.ts` | Tolerant postal normalization and 500-character display-name limit. |
| `services/qboCustomerSync.ts` | Per-customer field-failure isolation; unlocked acquisition, guarded serialized application, scheduler/fallback changes. |
| `services/qboCustomerPush.ts` | Validate raw outgoing ZIPs; transactionally close recovered failures only after remote success. Initialize failure snapshot before early parent-validation failures. |
| `services/qboClient.ts` | Bounded API attempts/retry, body consumption and timer cleanup. |
| `routes/routes.ts` | Pass supplied and previous fields to merged customer PATCH billing validation. |
| `routes/qboCustomerOutbound.ts` | Validate raw outgoing ZIPs in the legacy create/override preflight. |
| `routes/qbo.ts` | Preserve the initial gate while returning benign overlapping-pull skips accurately. |

### Verification and documentation

- `services/qboCustomerMap.test.ts`
- `services/customerBilling.test.ts`
- `services/qboClient.test.ts`
- `services/qboCustomerSync.integration.test.ts`
- `services/qboCustomerPush.integration.test.ts`
- `services/qboCustomerTimeout.integration.test.ts` (new)
- `routes/customerBilling.test.ts`
- `routes/qbo.customers.test.ts`
- `test/customerPatchApp.ts` (new; executes the real PATCH registration with
  PostgreSQL reads/writes, omitting unrelated app startup jobs)
- Repository-root `docs/cq31-customer-sync-resilience.md` (this report)
- Repository-root `.agents/memory/customer-qbo-sync-direction.md` and
  `.agents/memory/qbo-sync-transaction-boundary.md` (durable policy clarification
  and removal of obsolete remote-read lock guidance)

## Call-site inventory

- `POST /api/customers`: existing shared `billingInputProblem` now validates
  supplied service/custom billing ZIPs.
- `PATCH /api/customers/:id`: same helper receives merged effective values plus
  provided/previous values; the storage write still uses `withCustomerSyncLock`
  and `writeCustomer`. Storage interfaces and schema contracts are unchanged.
- Legacy `POST /api/qbo/customers/create`: raw mapped outgoing fields are
  explicitly ZIP-validated before normalization/payload preflight.
- `pushCustomer` → `pushLocked` → `customerFields`: queued customer creates,
  activation/billing-edit retries, scheduler retries, parent-first recursion,
  review retry work, and explicit `POST /api/qbo/customers/:customerId/send-now`
  share the same validation and successful review-closure path.
- `ingestQboCustomers` → `ingest` → `crmFields`: ordinary reconciliation isolates
  invalid CRM records. Direct mirror producers (push echoes, explicit binding,
  review refreshes and duplicate checks) retain the same serialized entry point.
- `POST /api/qbo/customers/pull` → `runFullCustomerPull`: unlocked full acquisition,
  guarded `applyFull`.
- `POST /api/qbo/customers/initial-sync` → `runInitialCustomerSync`: unlocked
  acquisition, guarded first hydration or review-only baseline-preserving retry.
- `POST /api/qbo/customers/sync-now` → `runIncrementalCustomerSync`: unlocked CDC;
  absent/stale cursor or missing full-pull timestamp, and capped CDC responses
  both delegate to unlocked full acquisition. Under-lock baseline recheck remains.
- `startQboCustomerSync` → `sweepQboCustomers`: nightly full and interval CDC
  selection without the previous nested remote-fetch lock; pending pushes retain
  their existing bounded, in-lock behavior.
- `qboRequest`: both initial API fetch and post-refresh 401 retry use the shared
  deadline. All existing API consumers inherit it. OAuth refresh persistence is
  not enrolled in customer transactions.
- `normalize`: inbound parsing, comparison, initial/link hydration, review
  snapshots and mirror ingestion remain tolerant. Explicit CRM/outbound checks
  are deliberately not folded back into this function.
- `validateDisplayName`: existing payload and push callers inherit the new limit.
- The existing legacy live duplicate-check query and outbound duplicate/conflict
  probes remain locked and now bounded by the API deadline; they are not
  full/initial/incremental pull entry points.

## Vitest results

| Run | Result |
| --- | --- |
| Unchanged merged-source API baseline, archived under ignored generated output | **12 files / 300 tests passed** |
| Coherent completed API customer/QBO pass | **13 files / 341 tests passed** |
| Final focused pass after adding OAuth-rollback and sync-now overlap cases | **2 files / 87 tests passed**, including both newly added cases |
| Existing additional API billing-migration and active-customer suites | **2 files / 55 tests passed** |
| Existing CQ4/customer billing web suites | **6 files / 52 tests passed** |

The current main API selection contains 343 cases: all 341 cases in the coherent
pass were verified, and the two subsequently added cases and their affected
suites were verified in the focused pass. No remaining test failures.

Main selection (run from `artifacts/api-server`):

```bash
mapfile -t tests < <(
  find src/services src/routes -maxdepth 1 \
    \( -name 'qbo*.test.ts' -o -name 'customerBilling.test.ts' \)
)
pnpm exec vitest run "${tests[@]}"
```

The web pass covered the customer QuickBooks card, review badge, integration
settings, by-QBO navigation, review queue, and shared billing tests. Existing
QBO crypto/client/auth/route, CQ1 map, CQ2 reconciliation/race/invoice-reader,
CQ3 outbound/review, and CQ4 promotion/read contracts remained passing.

New regressions include unusual incoming postal hydration; both service and
billing input ZIP boundaries and unchanged legacy edits; 500/501 names; ordinary
and initial per-customer bad-ZIP/injected field-building isolation; create/update/
Send-now recovery and exact review metadata/isolation; blocked/no-op/conflict
review retention; per-customer retry continuation; abort-aware fake-timer tests
for both API attempts, body stalls and cleanup; real timeout-driven PostgreSQL
lock release followed by an HTTP PATCH; HTTP PATCH completing during initial,
full, CDC, old-cursor fallback, capped-CDC fallback and scheduler acquisition;
overlapping fetch ordering, stale initial reacquisition and connection changes.
The independent OAuth rotation regression refreshes through the real client
with mocked HTTP, then proves the rotated credentials survive a failed local
initial reconciliation.

Evidence logs are in ignored `generated-artifacts/cq31/`:
`tests-baseline-all.log`, `tests-final.log`, `tests-followup.log`,
`tests-additional.log`, and `tests-web.log`.

## Typecheck, startup and remaining discrepancies

- Before: `pnpm run typecheck` exits **2**, with **721 API TypeScript errors**.
- Final: the same command exits **2**, with **721 API TypeScript errors**.
- Error signatures were compared as multisets after removing line/column
  offsets: **zero additions and zero removals**. No changed customer/QBO service,
  test or helper introduced an error. The errors remain in unrelated existing
  auth/routes, shared frontend schema/type boundaries, mail services and other
  baseline code. Library, mobile, mockup and scripts checks completed; the
  recursive command stops at the existing API failure, so it is not a clean
  full-project typecheck.
- Logs: `typecheck-before.log`, `typecheck-after.log`,
  `typecheck-final.log` and companion exit files in the evidence directory.
- API workflow build/start succeeded and listened on its configured port.
  Frontend workflow started; preview screenshot confirmed the unauthenticated
  login screen renders. Expected unauthenticated 401 and existing dependency/
  tooling warnings are not customer-sync failures.
- `git diff --check` passed.

No substantive acceptance discrepancy remains. The broad pre-existing
typecheck failure is explicitly not repaired by this additive slice. Real-world
QuickBooks operation remains untested and unauthorized; operational rollout is
still gated.

## Downstream handoff

CQ5 is separate work: reuse the corrected customer POST/PATCH/shared billing
input contract, retain changed-only legacy handling, and keep incoming mirror
normalization tolerant. Do not replace the wizard, change schemas, enable
QuickBooks writes, or run initial sync as part of integrating this slice.
