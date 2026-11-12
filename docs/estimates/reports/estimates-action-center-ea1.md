# EA1 — Estimates Action Center data gate

## Contract and decisions

- The estimate-only board HTTP response now carries ticket follow-up date/note,
  current version ID, sent/accepted timestamps, Colorado valid-until day,
  latest draft edit timestamp, missing-price count, and server-owned nextAction.
- `lineCount` is the minimal additional support for EA2's eligible-draft Send
  action. Non-drafts do not need line reads and report zero.
- No stored validity period exists in the estimate/document settings contracts.
  The exported `ESTIMATE_VALIDITY_DAYS = 30` matches the PDF price promise;
  no setting, schema or migration was added.
- Draft enrichment uses two company-scoped bulk queries independent of board
  size: current versions/lines, then draft sections. Version, section and line
  edits participate in age. Existing frozen subtotal ownership is unchanged.
- `estimateLineNeedsPrice` is shared by send validation, line payloads, and board
  counts. Manual zero-price lines are deliberately not flagged.
- Only Estimates receives enrichment and nextAction. The Bids serialized ticket
  shape is asserted exactly and its shared board component is untouched.
- Rules live in a pure server function. Day comparisons project instants once
  into Denver dates, then use calendar arithmetic.
- Follow-up changes are combined with the actual linked-ticket status PATCH.
  At-target recovery does not replay PATCH: rescheduling every recovery would
  perpetually postpone follow-ups, and clearing them at target would destroy a
  later Scheduling follow-up. `planLinkedTicket` is unchanged. No alternate
  caller-specific placement or recovery flag was introduced.

## Verification gate (before EA2 page implementation)

Passed:

```
pnpm --filter @workspace/api-server exec vitest run \
  src/services/estimateNextAction.test.ts src/services/ticketEstimates.test.ts \
  src/routes/estimatesBoard.test.ts src/services/ticketEstimates.integration.test.ts
# 4 files, 144 tests
pnpm --filter @workspace/api-server exec vitest run src/services/estimateLifecycle.integration.test.ts
# passed in initial combined run (19 tests)
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts src/lib/advanceLinkedTicket.test.ts
# 21 tests
pnpm run typecheck:libs
# passed
```

Checks include serialized Express/Supertest output, exact Bids keys, constant
query count at 1 and 1001 tickets, all ordered rules and boundaries, DST and UTC
evening, price predicate parity, send today/future preservation, accept/decline
clears, real combined status/follow-up PATCH comment logging, and the real
Scheduling queue response showing the won ticket with no waiting date.

Existing board HTTP test fixtures lacked the now-required `accessRole`; updated
fixtures to model the actual authenticated user. No authorization was relaxed.
The API typecheck has substantial pre-existing diagnostics; the only new
diagnostic during this work was a test harness import/signature, corrected
before this gate. Final complete-task checks are recorded in the EA2 report.

## EA2 handoff

Use `EstimateActionTicket`, `EstimateBoardSummaryDto`, and `EstimateNextAction`
from driver-free estimate contracts. Consume nextAction, never reclassify on the
client. Use `versionId` for lifecycle/PDF, `lineCount` plus missing-price count
and subtotal for finish-row Send eligibility. Date params stay YYYY-MM-DD for
client formatting. The existing board route has no outgoing Zod stripping
boundary. No generated API edits were required.
