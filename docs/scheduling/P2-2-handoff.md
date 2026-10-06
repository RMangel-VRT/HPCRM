# P2-2 scheduling workflow handoff

## Read-only preflight (2026-10-06, before mutation)

Both environments were queried read-only, grouping by company and ticket-type ID
as well as stable type key (orders are local to a type, not global).
Development was also checked directly through the API's configured database.
Development has **zero ticket types/status rows**, including unkeyed legacy rows.
No development company was created permanently for this slice.

Production access succeeded. There is one relevant company and one type for each
of the three keys. The required inventory output is below (company/type/status
IDs were also returned and inspected). No duplicate orders, duplicate keys, or
custom intervening rows were present. No production writes were performed.

```csv
type_key,name,status_key,display_order
estimate_request,New,new,0
estimate_request,Estimating,estimating,1
estimate_request,Create Proposal,proposal_draft,2
estimate_request,Proposal Sent,proposal_sent,3
estimate_request,Decision Received,decision_received,4
estimate_request,Ready to Schedule,ready_to_schedule,5
estimate_request,Work Completed,work_completed,6
estimate_request,Ready for Billing,ready_for_billing,7
estimate_request,Invoicing,invoicing,8
estimate_request,Closed - Lost,closed_lost,9
project,New,new,0
project,Ready to Schedule,ready_to_schedule,1
project,Scheduled,scheduled,2
project,Work Completed,work_completed,3
project,Ready for Billing,ready_for_billing,4
project,Invoicing,invoicing,5
project,Closed - Lost,closed_lost,6
task,New,new,0
task,Ready to Schedule,ready_to_schedule,1
task,In Progress,in_progress,2
task,Work Completed,work_completed,3
task,Ready for Billing,ready_for_billing,4
task,Done,closed_won,5
```

## Implementation and changed call sites

- `artifacts/api-server/src/shared/ticketCapabilities.ts`: retain Ready to Schedule
  fallback, add Needs scheduling fallback for all three types, add Scheduled for
  Task and Estimate Request.
- `artifacts/api-server/src/lib/schedulingStatuses.ts` (new): guarded DML-only
  migration. Validate all seeded workflows before writing; use a transaction,
  advisory lock and row locks; preserve IDs/keys and custom names; shift later
  orders only with a missing Scheduled insert. Missing scheduling steps warn/skip.
  Duplicate orders/keys, missing/out-of-order successors, out-of-order Scheduled,
  and custom intervening steps throw and prevent all writes.
- `artifacts/api-server/src/routes/routes.ts`:
  - `ensureTaskTicketType` / `ensureEstimateRequestTicketType` seed target orders
    and Scheduled metadata; `ensureProjectTicketType` changes only default
    scheduling name/description. Existing legacy-name statuses remain reusable.
  - `registerRoutes` calls migration immediately after capability backfill.
    No new startup-runner wiring, schema edits, SQL files or DDL.
  - Approved-path constant and missing-invoice SQL repair include `scheduled`.
  - PATCH infers scheduling from effective persisted/request crew and due date
    when no explicit status key is supplied, including omitted scheduling keys.
    Existing status block writes history, applies billing guards and performs
    genuine step-back cleanup. `pickProvided` remains.
  - Prevalidate the PATCH schema before history/cleanup side effects, retaining
    the existing later parse and sparse-update selection.
  - Existing local-day notification boundary documents server-local Colorado.
- `artifacts/highplains-crm/src/shared/ticketVisuals.ts` and
  `artifacts/highplains-crm/src/pages/TicketDetail.tsx`: minimal compatibility fix
  for the active delegation lookup found in the audit. Use key-first seeded
  status/type helpers so the label rename cannot hide the existing option.
  No new scheduling UI.

Tests changed/added:

- `artifacts/api-server/src/lib/schedulingStatuses.test.ts` (new)
- `artifacts/api-server/src/routes/taskTicketType.test.ts`
- `artifacts/api-server/src/routes/taskBilling.test.ts`
- `artifacts/api-server/src/shared/ticketCapabilities.test.ts`
- `artifacts/api-server/src/shared/taskWebClient.test.ts`

## Legacy path and workflow-key audit

- Active `migrateApprovedEstimateRequestTickets`, reached from Estimate init and
  the manual approved-ticket migration endpoint, already resolves seeded type and
  `ready_to_schedule` by stable identity. Kept its destination and historical
  notes/messages; its ensure helper now uses the updated seed definitions.
- Active Estimate approval field-value handler still enters `ready_to_schedule`,
  even if a crew/date already exists. Tested through the real handler.
- Inactive `migrateProjectSchedulingStatus` and `fixProjectDisplayOrders` are
  referenced only by the unused `runStartupMigrations`; their historical labels
  and old ordering map are unchanged. Do not invoke that runner for this slice.
- Existing scheduling-status endpoint and ticket-list quick filter intentionally
  select Needs scheduling only, not Scheduled. Their lookups already use stable
  keys/returned IDs. Queue expansion remains in the subsequent slices.
- `work_completed` delegation-return and completion field definitions are
  completion-specific, so Scheduled does not belong. Likewise completion email
  event keys and chemical campaign workflow lists are distinct domains and
  unchanged. Task's client no-invoice projection still hides only billing.
- The active web delegation name comparison was repaired as noted above.
  Remaining Ready to Schedule occurrences are legacy identity fallbacks, default
  rename matching, historical notes/messages, or comments—not active name-based
  scheduling behavior.

## Verification

### Targeted vitest

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/schedulingStatuses.test.ts src/routes/taskTicketType.test.ts \
  src/routes/taskBilling.test.ts src/shared/ticketCapabilities.test.ts \
  src/shared/taskWebClient.test.ts
```

**5 files, 121 passing tests** in the final full run, including the final client
compatibility fix and persisted-value scheduling check. The preceding targeted
command passed all 120 cases before the last persisted-value case was added.
Covers ordering, idempotency, custom labels/types, Project non-insertion, schema
guard, transaction rollback, sparse crew/date edits and clears, explicit status
intent, history shape, forward field preservation, approved billing paths,
legacy identities and Estimate approval destination.

### Real development PostgreSQL check

Since development has no live workflows, a rollback-only transaction created
three legacy workflow fixtures and executed the actual migration code against
PostgreSQL (not copied SQL). First run: **2 inserts / 3 renames**. Second run:
**0 inserts / 0 renames**. Queried and asserted these target key/order lists:

- Task: `new 0`, `ready_to_schedule 1`, `scheduled 2`, `in_progress 3`,
  `work_completed 4`, `ready_for_billing 5`, `closed_won 6`.
- Estimate Request: `new 0`, `estimating 1`, `proposal_draft 2`,
  `proposal_sent 3`, `decision_received 4`, `ready_to_schedule 5`, `scheduled 6`,
  `work_completed 7`, `ready_for_billing 8`, `invoicing 9`, `closed_lost 10`.
- Project: existing `scheduled 2` retained; `ready_to_schedule 1` renamed;
  remaining orders unchanged.

All fixture data was rolled back. Live development inventory remains empty;
target lists above are verified fixtures, not claimed live-company data.

### Baseline failures, separately

- Full API vitest **before edits**: 550 passed, 7 failed (32 files).
- Full API vitest **after all edits**: 582 passed, the same 7 failed (33 files).
- The seven failures were verified, not assumed: one
  `plantEnrichment.test.ts` partial-run assertion and six
  `mailboxAccounts.oauthReconnect.test.ts` failures during Drizzle index setup.
- API `pnpm --filter @workspace/api-server run typecheck`: **770 diagnostics
  both before and after all edits**. Comparison strips shifted line/column
  numbers and compares file/code/message counts: **zero new diagnostics**.
- CRM TypeScript check: **225 diagnostics both at HEAD and after edits**.
  Baseline was compiled using an in-memory compiler host supplying HEAD versions
  of the two edited frontend files; final used current files. **Zero new
  diagnostics**. Neither typecheck is claimed to pass.
- API build and workflow startup passed; boot logged **0 inserts / 0 renames**
  against the empty live development inventory. `/api/healthz` returned HTTP 200
  and `{"status":"ok"}` through the preview proxy.

## Release boundary

No publishing or production mutation. Merge this slice before starting the next;
publish only after the later web slice, as required by Rules-P2. Existing
downstream work already covers the next steps, so no duplicate follow-up tasks
are proposed.
