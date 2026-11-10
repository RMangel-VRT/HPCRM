Production preflight: **0 non-final production tickets have both a crew and a due date.** This was obtained through the authorized read-only production query on October 13, 2026—not from development data or the specification's historical expectation.

# P3-2 Visits foundation — implementation and release evidence

## Prerequisites and scope

- Accepted the user-confirmed P3-1 publication prerequisite: publication commit `af86892` follows merge `4036abf`. No additional publication gate was imposed.
- Rechecked migration numbering. `0046_contract_center_payment_lines.sql` is occupied; the visits migration is `0047_visits.sql`.
- Exactly one additive table and its three specified indexes were added. Existing foreign-key targets and planner/campaign crew tables were not changed.
- No Scheduling/Calendar page, board UI, mobile visit-state workflow, maintenance/campaign producer, billing redesign, production write or publish was performed.

Production count query:

```sql
SELECT count(*)::integer AS candidate_count
FROM tickets t
JOIN ticket_type_statuses s
  ON s.id = t.current_status_id AND s.ticket_type_id = t.ticket_type_id
JOIN ticket_types tt
  ON tt.id = t.ticket_type_id AND tt.company_id = t.company_id
WHERE s.is_final = 'false'
  AND t.crew_id IS NOT NULL
  AND t.due_date IS NOT NULL;
```

Returned `candidate_count = 0`. An initial query used the wrong status-column name and produced no count; it was corrected before recording this result.

## Implementation

### Schema and contracts

- `.migration-backup/migrations/0047_visits.sql`: guarded table creation and all three named indexes, matching the supplied SQL.
- `lib/db/src/schema/schema.ts`: visits table, select/insert types, real-calendar/date/time validation, source/status enums, 0–24 hours and source-specific ticket/title requirements.
- `artifacts/highplains-crm/src/shared/schema.ts`: hand-synced columns and a real Zod object/refinement, rather than relying on the frontend Drizzle stub's no-op refinement. No new stub change.
- `lib/api-spec/openapi.yaml`: list, summary, create, sparse update, delete and reorder contracts and enriched/mutation result schemas.
- Regenerated `lib/api-client-react/src/generated/{api.ts,api.schemas.ts}` and `lib/api-zod/src/generated/{api.ts,types/*}`.
- Calendar keys remain strings in generated contracts. Real timestamps remain timestamps; no host-local conversion of a visit date.

### Shared scheduling and transactional synchronization

- `artifacts/api-server/src/lib/companyDay.ts`: added Colorado-noon resolution using the same independently resolved wall-clock offsets as the existing midnight helper.
- `lib/schedulingTransition.ts`: extracted the existing Phase 2 rule, including explicit-status and follow-up-only guards and the exact history notes.
- `lib/visitSync.ts`: one shared winner/mirror calculation; earliest today/future open visit or latest past open visit with route/time/id ties; scoped crew resolution; Colorado-noon due date; status/history and schedule-by maintenance in the caller's transaction; unchanged mirrors do not update tickets.
- `lib/visitTicketCompatibility.ts`: the ticket PATCH bridge reuses that mirror calculation, then lets the established ticket workflow own its single status/history update. Planned incomplete pairs are removed; in-progress incomplete pairs reject atomically; complete single in-progress pairs can move; explicit due-date null survives; multi-visit edits return the required exact schedule-directed message.
- `src/db.ts`: transaction-local database context lets the existing storage, step-back cleanup, invoice/billing and notification database operations join the same transaction without bypassing them.
- `lib/ticketPatchTransaction.ts`: ticket lock before scheduling reads, response buffering until commit, rollback on existing workflow rejection.
- The existing ticket PATCH handler in `routes/routes.ts` uses the wrapper, compatibility bridge and extracted transition. Existing auth, billing guards, explicit status intent, cleanup and assignment notifications remain in place. External push fan-out runs after successful response completion, outside the transaction context.

### APIs and backfill call sites

- `routes/visits.ts`: all six endpoints; admin/office/field_manager company-wide access; other roles denied; server-owned fields stripped; scoped active crews; scoped schedulable tickets; customer copied only from a same-company counterpart; one-query list enrichment and grouped summary.
- API writes acquire a company scheduling gate before sorted ticket locks. This deliberately stronger gate serializes crew-day append/reorder membership and prevents ticket/crew-day lock-order inversion. Visit identity discovery precedes locking; scheduling values are read after ticket locks.
- Appends, moves, closed-visit restrictions, exact reorder ID sets, response validation, mirror updates and history commit or roll back together.
- `routes/routes.ts` registers the visit routes next to the existing crew/mobile routes.
- `lib/backfillVisits.ts` is invoked immediately after crew linking. It first checks table existence, uses guarded DML only, locks candidate tickets in deterministic order, bulk-rechecks final status/crew/customer and no-visits membership, bulk-inserts planned visits and logs `[backfillVisits] company=… created=N`.
- Backfill neither updates tickets nor invokes status synchronization. Existing visits of any status prevent a legacy duplicate.

### Scheduling-field writer audit

- The general ticket PATCH/storage update path is the existing scheduling-field editor; it now uses the visit compatibility bridge and transaction.
- Individual and bulk ticket creation can write initial due dates/deadlines on tickets without visits; invoice creation helpers also create new tickets. They are not new maintenance/campaign visit producers.
- Decision-field approval, legacy capability/scheduling startup backfills and invoice completion update status/schedule-by, not the visit crew/date/route mirror. Completion-photo/email routes do not write scheduling fields.
- Mobile start/complete routes write mobile/work-completion fields, while work-item/photo/note routes update their own data. **No mobile writer of ticket crew, due date or route order was found.** Mobile Today/week remain readers of the existing ticket mirror.
- Planner/campaign crew linking and existing planner/campaign scheduling were left intact.

## Verification and actual database evidence

Durable local logs are in ignored `generated-artifacts/p3-2-validation/`.

- Numbered development migration applied successfully. Rerun: **0 applied, 55 already up-to-date**.
- `check-schema-drift`: passes; schema in sync with declarations.
- `check-required-extensions`: passes; `pg_trgm` present.
- Shared declaration build (`pnpm run typecheck:libs`): passes before final leaf typechecks.
- API and CRM workflows were rebuilt/restarted successfully. Startup backfill logs show per-company counts and repeat-run zeros; no new startup DDL was introduced.
- Public CRM login renders in the preview. Its expected unauthenticated `/api/auth/me` response is 401.

### Timezone and functional coverage

- Full API suite under **TZ=UTC**: **1,122 passed, 7 failed, 1 skipped**.
- Focused visits/calendar/mobile-day/existing ticket billing suites under **TZ=America/Denver**: **226 passed**.
- Client visit-schema suite: **7 passed under each timezone**.
- Covers spring/fall DST Colorado-noon instants, independently resolved day windows, the earliest/upcoming/latest-past winner and deterministic ties.
- A real supervisor bearer token under an 8 pm Colorado fake clock confirms today's placed visit appears in `/api/m/today` under UTC and Denver. Today/week and existing photo/note reads continue working; deleting the visit removes the stop.
- Covers all endpoint roles, unauthenticated access, foreign-company identities/counterparts, real dates/times, range bounds, source requirements, sparse/null updates, protected fields, closed moves/deletes, append ordering and exact reorder sets.
- List enrichment remains **one query for one or many rows**; summary uses **one grouped query**, counts only open visits and applies the 8-hour fallback.

### Concurrency and rollback—not mocked evidence

`routes/visits.integration.test.ts` exercises actual PostgreSQL transactions:

- Parallel moves of the same visit leave the final mirror exactly matching the final stored visit.
- Parallel opposite reorders finish without a mixed order or divergent mirrors.
- Parallel move/reorder either serializes successfully or rejects the stale exact ID set without partially applying it.
- Concurrent append requests produce distinct destination order values.
- Startup backfill and API creation share the gate/row locks. An API visit that commits first prevents a legacy duplicate; an intentional additional API trip is still allowed if backfill seeded first. Reruns create zero.
- A late existing ticket-workflow validation failure rolls back planned-visit removal, ticket changes, status history and step-back field cleanup.
- A real status-history foreign-key failure rolls back the visit insertion and mirror update.
- In-progress incomplete crew/date pairs reject with 409 `VISIT_IN_PROGRESS` and unchanged ticket, visit, history, comments, notifications and field snapshots. Complete new crew/date pairs move those visits.
- Explicit status intent is preserved. Explicit null is not inferred over; the existing non-null status contract still rejects it without writes.
- After the final identity-before-lock read hardening, a targeted UTC pass over concurrency/backfill/create-delete/scoping checks passed **7 tests**.
- Final ordering, closed-only route protection and real Today/tomorrow checks passed **3 targeted tests under each timezone**. No-open mirrors also remain clear when only closed visit history exists.

New/updated test files:

- `lib/visitSync.test.ts`
- `lib/backfillVisits.guard.test.ts`
- `routes/visits.integration.test.ts`
- `routes/taskBilling.test.ts` (existing mocked-storage harness injects the extracted transition; real visit transactions are covered separately)
- CRM `src/shared/visits.test.ts`

### Live development acceptance and remaining browser blocker

The real running preview/API—not just the in-process test app—passed the disposable HTTP/database acceptance flow:

1. Real-password admin login through the existing auth endpoint.
2. Standing crew creation through the existing crew API.
3. Needs scheduling Task placement through `/api/visits`, returning `ticketSync` Scheduled.
4. TicketDetail's live ticket endpoint returns Scheduled and the expected crew/date.
5. Real-password supervisor mobile login; Today contains the ticket and week returns successfully.
6. Sole planned visit deletion returns the live ticket to Needs scheduling, clears crew and retains exactly the same due date.
7. Supervisor Today no longer contains the ticket.
8. Disposable company/users removed. No existing records were altered for this acceptance flow.

**Signed-in TicketDetail visual acceptance is not complete.** The single browser-testing pass reached login and logged navigation to `/dashboard`, then its browser action timed out and lost its session. A separate authenticated Chromium snapshot attempt also stopped responding to `Runtime.evaluate`. Neither is reported as a passed visual check. Real-password HTTP login succeeds, so this is not claimed to be a credential rejection. No auth bypass or unrelated auth/UI fix was added.

## Baseline failures and typecheck deltas

These are current verified pre-change baselines, not older release-report totals:

| Check | Before | After | Delta |
|---|---:|---:|---|
| API tests | 1,045 pass / 7 fail / 1 skip | 1,122 pass / 7 fail / 1 skip | 77 new passing tests; no new failures |
| CRM tests | 71 pass / 8 fail | 78 pass / 8 fail | 7 new passing tests; no new failures |
| API TypeScript diagnostics | 735 | 735 | No new file/error-code diagnostic counts |
| CRM TypeScript diagnostics | 225 | 225 | No new file/error-code diagnostic counts |

Existing API failures: six mailbox OAuth reconnect tests and the plant-enrichment partial-status test.

Existing CRM failures: five `useTabParam` tests (`document` unavailable), two crew-board reducer tests and one rate-card query-count expectation. Full test commands therefore still exit nonzero; they are not reported as clean suites.

Leaf typechecks still exit nonzero because of the recorded baseline. Shared declarations were refreshed first. Added production helpers, routes and tests introduce no diagnostics.

## Release status

The API/schema implementation and database/timezone/regression evidence are ready for P3-2 review. **The user explicitly approved completing P3-2 with the signed-in visual-check blocker recorded.** That check remains unverified; approval is not treated as a passed browser test. No production writes or publish occurred. After this slice is approved/merged, apply the numbered migration through the existing release process before the new API starts. Do not start P3-3 as part of this task.
