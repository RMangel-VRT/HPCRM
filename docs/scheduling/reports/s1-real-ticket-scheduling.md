Verified production preflight: **1 affected ticket**. Randy ran the read-only check on November 19, 2026, in the production Database pane before any repair.

| Customer | Ticket type | Ticket title |
| --- | --- | --- |
| Hyland Village | Task | McStain Townhomes: weeds coming up in the rock beds along the buildings and sidewalks |

# S1: Require real ticket scheduling

The repair targets company-scoped Tasks, Projects and Estimate Requests in a stable `scheduled` status, with a stable Needs scheduling destination and no planned or in-progress stop. A closed stop is history, not a placement. The SQL below documents the repair's candidate predicate for reference; production access was not retried for this report update.

```sql
WITH affected AS (
  SELECT t.id, t.title, c.name AS customer
  FROM tickets t
  JOIN ticket_types tt ON tt.id = t.ticket_type_id AND tt.company_id = t.company_id
  JOIN ticket_type_statuses s ON s.id = t.current_status_id AND s.ticket_type_id = tt.id
  LEFT JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id
  WHERE tt.type_key IN ('task', 'project', 'estimate_request')
    AND s.status_key = 'scheduled'
    AND EXISTS (
      SELECT 1 FROM ticket_type_statuses r
      WHERE r.ticket_type_id = tt.id AND r.status_key = 'ready_to_schedule'
    )
    AND NOT EXISTS (
      SELECT 1 FROM visits v
      WHERE v.company_id = t.company_id AND v.ticket_id = t.id
        AND v.status IN ('planned', 'in_progress')
    )
)
SELECT count(*)::int AS affected_count,
       coalesce(json_agg(json_build_object('title', title, 'customer', customer)
                         ORDER BY customer, title, id), '[]'::json) AS affected_tickets
FROM affected;
```

## Predecessors and status writers

P2-3's arrival date, Accept, Send back and history are preserved. P3-2 and P3-3 continue to own placement via dated visits and a ticket mirror for mobile. S1 replaces P2-3/P3-2's unconditional explicit status precedence: explicit status is not permission to cross the scheduling gate. Stable seeded successors are `in_progress` for Task and `work_completed` for Project and Estimate Request.

| Path | Status behavior and write boundary |
| --- | --- |
| Ticket PATCH (including Billing and linked Estimate recovery callers) | Existing response-buffered transaction; company gate, then sorted ticket locks (including invoice parent). Compatibility can place a real stop before checking the gate; a rejection rolls that placement and all workflow effects back. An unchanged legacy crew/date payload is not a placement. |
| Shared `applyTicketStatus` | Applies the same gate before persisting fields, history or completion effects. Standalone scoped calls lock and reload the ticket before evaluating the move. RFP-specific callers retain their existing RFP workflow rules. |
| Accept / Send back | Accept takes the same lock order, checks actual open stops and preserves its prior actor, schedule-by, acceptance audit and history. Send back remains reassignment plus comment, not a status move. |
| Visit create, compatible ticket edit, move, reorder, remove, and calendar reconciliation | `syncTicketFromVisits` validates inferred status against the locked ticket. New Task/Project auto-advances on explicit placement; New Estimate Request does not. Needs scheduling advances on a real open stop. Existing last-stop/due-date behavior remains. |
| Estimate decision field and legacy approved-estimate repair | Estimate decision updates re-read the ticket and persist decision, transition and history in one transaction. Valid approval and denial from Decision Received remain permitted. The legacy Estimate Sent → Proposal Sent rewrite also checks its source and target under the company/ticket locks. |
| Invoice completion | The same transaction gates any parent advance before its comment, history, fields or notification cleanup. The ordinary later-stage transition and waiting for open sibling invoices are unchanged. |
| Skip scheduling | Only the dedicated action supplies skip authority. It validates the reason, actor, current status, open-stop state and exact successor; clears schedule-by and stale crew/routing mirrors without changing due date; and records one history entry. |
| Single and batch manual creation | No existing row to lock. Both ignore caller-controlled `currentStatusId` and validate their server-selected start stage before any insert. |
| Estimates board and scheduling queue reads; invoice-only producers; campaign rebilling | Reads do not change status. Manual and automated invoice producers create Invoice tickets only. Campaign extra-billable billing creates a Task for already-performed, recorded campaign work; it is not a transition on an existing ticket and was left unchanged as scoped. Mobile work timestamps/photos and estimate-number writes do not mutate workflow status. |

## API and startup

- `GET /api/tickets/:id/next-stop` returns the next exact-property stop on or after Colorado today. The opaque `X-Next-Stop-Snapshot` header binds the offer to the ticket, property, anchor, crew, date and displayed route order. `POST /api/tickets/:id/schedule-next-stop` requires that header's value as `If-Match`. It reselects under the company gate and ticket locks, returns 409 if the offer is stale, and inserts in the full open crew-day order. No recurring route or campaign records are changed.
- The ticket footer and On the schedule card share placement actions. The browser binds scheduling requests to the initiating company and refreshes details, history, next-stop offers, board and queue after acknowledgements or conflicts. Roles without raw visit access get only a boolean scheduling hint in ticket details for authorized skip.
- The DML-only repair follows stable workflow setup and precedes legacy visit synthesis. It rechecks and locks candidate tickets, preserves due date/deadline, clears crew and route mirrors, fills a missing schedule-by date by the normal entry rule, and writes the automatic history note atomically. The synthesis pass will also not fabricate a stop for an unrepaired Scheduled candidate lacking audit prerequisites. No schema change or production write was made, and nothing was published.

## Verification

- **Signed-in development API:** Using the existing password sign-in and a disposable company, verified a 422 without a stop; insertion immediately after an offered stop; manual placement with no offer; `ticketSync` moving both placed jobs to Scheduled; and skipping to In Progress with the exact history note and no schedule-by. All three jobs left the queue.
- **Normal API startup, twice:** The first start repaired the disposable unplaced ticket, preserved its deadline, filled its schedule-by, and wrote one history row with no stop. The second start left the same history and did not create a stop. The development fixtures were removed and `/api/healthz` returned 200.
- **Focused unit and rendered checks:** 192 API checks covering compatibility, Task create/batch and workflow transitions, owner response, visit sync, Invoice completion and startup guards passed. 115 CRM scheduling, ticket detail and linked-estimate checks passed in both `TZ=UTC` and `TZ=America/Denver`. The final ticket-detail-only reruns passed 44 checks in each timezone. The live Vite transform returned HTTP 200 for `TicketDetail.tsx`, and the configured CRM build passed.
- **Real PostgreSQL:** All 87 visits, queue, workflow and S1 integration cases passed under `TZ=UTC`. The 19 S1 and date-sensitive cases selected for `TZ=America/Denver`, including both compatibility regression cases, also passed. The Colorado evening case crosses the UTC date boundary and verifies matching by exact property, active crew and route order, insertion among all crew-day stops, and retention of the closed row and recurring route.
- **Updated old fixtures:** Owner response and Task route tests now provide the real `accessRole`; storage doubles provide transaction/locking and open-stop queries. The test that expected a legacy crew/date pair to imply Scheduled now verifies it stays in Needs scheduling instead. The CRM rendered harness models placement acknowledgements, open-stop queries and the new copy. All new visits tests use disposable companies; the Colorado-evening fixture uses a crew day separate from older P3 fixtures.
- **Compatibility regression:** A title edit that sends the same crew and Colorado day preserves the deadline, status, stop count and history, even when the date is sent at a different instant and the job has done, skipped or cancelled stop history. Changing the day deliberately creates one planned stop and advances the job.
- **Broader checks, separately:** A full untouched checkout already failed 210 API and 84 CRM tests, including unrelated QuickBooks, service calendar, Bids board and customer-rendering cases. The broad in-progress run of the changed checkout also failed while earlier fixes were pending and multiple suites competed for the test database. This report does not claim a clean full-workspace run.
- **Live-browser limitation:** The screenshot service timed out, and Chromium did not render the login form in two attempts against the public and local development previews. The live password-signed-in HTTP flows and the English/Spanish rendered ticket-page interactions passed separately; a live signed-in browser pass was not completed.
