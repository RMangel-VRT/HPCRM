# High Plains CRM: Scheduling System Design

**Status:** Locked Sept 30, 2026 (Randy). Phase 0 and Phase 1 slices written; Phases 2–6 still to be cut.
**Mockup:** "High Plains Scheduling" artifact, https://claude.ai/artifact/Q1rbF6wTWGNMNaaPwMDfeL
**Code checked against:** GitHub `bf8ed65` (Sept 29, 2026).

## The problem

A ticket gets assigned (for example, account manager → operations manager) and then sits in a stack of about 100 until a manual list audit catches it. Being assigned and being scheduled are two different states, and nothing moves a ticket from one to the other. "Ready to Schedule" is only a label: none of the three existing schedulers schedules tickets.

## Principles

1. **No open field job exists without a next date.** Every ticket is in one of three places: New (not yet accepted), on the calendar, or Waiting on something with a follow-up date.
2. **One company calendar, many scheduling tools.** Each tool writes the same kind of record (a *visit*). The calendar only displays them.
3. **Billing is decided per ticket, not per type.**
4. **The crew's phone moves the office status.** Starting and completing work in the field updates the official ticket.

## The Task type (Phase 1)

- The Extra Billable ticket type becomes **Task**. Its internal key changes from `extra_billable` to `task`, while the database row, its statuses and its history are kept.
- **New Task** has a three-way choice:
  - **To-Do:** a person's job. Keeps the existing To-Do type (Open → Done). No customer required, and it never goes on the crew calendar.
  - **Contract:** the Task type, work type `contract`, billing `no_invoice`.
  - **Billable:** the Task type, work type `extra_work`, billing `invoice_required`.
- **Contract work goes to Task, not To-Do.** Today contract work creates a To-Do (Open → Done), so it can never reach scheduling. That is one reason tickets get lost.

### Billing rules (the part that must be right)

- **For Task, only the ticket's own billing setting decides invoicing.** The Task type's `requires_invoicing` flag is `false`.
- **Contract ↔ Billable can change until the ticket reaches Ready for billing.** The work type and billing setting always move together, and every change is written to the ticket as a comment.
- **A contract Task can never enter Ready for billing.** The server rejects it with a 422.
- **A billable Task can't reach Done without a linked invoice ticket.**
- **The Extra Billable fix-up that forced "needs an invoice" at Ready for billing is removed.** With it in place, every contract Task would be billed.
- **Extra-billable campaigns** keep generating Task tickets that are marked billable explicitly.

## Flow (Phases 1 and 2)

```
New → Needs scheduling → Scheduled → In progress → Work completed ─┬─ Contract: Done
                                                                    └─ Billable: Ready for billing → Invoice ticket → Done
```

- **New:** nobody has accepted it yet. The owner either **Accepts** it or **Sends it back**. Accepting a field job moves it to Needs scheduling automatically.
- **Priority sets a schedule-by date.** P1 Urgent means the next business day, P2 High 3 days, P3 Normal 7 days, P4 Low 3 weeks. The priority field already exists on tickets.
- **Waiting on customer** has a follow-up date. On that date the job returns to the list.
- **Phase 2** renames "Ready to Schedule" to "Needs scheduling" (the status key stays `ready_to_schedule`) and adds a **Scheduled** status (`scheduled`).

## Visits and the calendar (Phases 3 and 5)

- **A visit** is one crew, one day, one trip. It carries route order, hours, a status, actual times, and a link to where it came from (a ticket, the maintenance pattern, a campaign item, or internal time).
- **One job can have several visits.** For example, a "needs a return trip" job gets a second visit.
- **Tools that create visits:**
  - the Scheduling page (jobs from Needs scheduling),
  - the Maintenance planner (today's weekly template turned into dated visits for the season),
  - the campaign board (assigned campaign items),
  - appointments (people, not crews).
- **Screens that read visits:** the Calendar, the Scheduling board and crew-day view, the crew app's Today and Me tabs, property pages, and the dashboard queue.
- **One crew list** replaces the three that exist today (`crews` for the crew app, `maintenance_crews`, and `campaign_crews`). This comes before the Scheduling board.
- **Compatibility:** placing a job also writes the ticket's `crew_id` and `due_date`, so the existing crew app's Today shows it with no phone changes.

## Crew app (Phase 4)

- **Start and Complete move the official status** (`current_status_id`), not just the phone's own status. Today completing only sets `mobile_status`, so the office never sees "Work completed."
- **"Needs a return trip"** sends the job back to Needs scheduling with the crew's note.
- **In Phase 5, Today shows every visit** for the crew's day, including maintenance routes and campaign work.
- **Property pages** (phone and web) gain Upcoming visits and Open jobs. On the phone the open jobs appear as "While you're here," so the crew can do a job on the spot.
- **Each flag becomes a New ticket** for the Ops Manager.

## Where it lives in the app

- **Sidebar, Dashboard group:** Dashboard, whose "Needs you" queue *is* the inbox; Scheduling (new, `/dashboard/scheduling`); Calendar (new, `/dashboard/calendar`); Tickets; My Tickets.
- **CRM group:** Customers gains the new property-page sections. Contracts and Revenue are unchanged.
- **Management group:**
  - Operations: Campaigns now create visits; the Schedule tab is renamed **Maintenance planner** and generates visits. Checklists, Maps, Route Map, Snow and Equipment are unchanged.
  - Flags: each flag also creates a ticket.
- **Admin group:** Crews becomes the one crew list.
- **Everywhere:** the New Task button (three-way choice), and a schedule panel on ticket detail.
- **Roles:**
  - Admin and office: everything.
  - Field manager: Scheduling and Calendar.
  - Irrigation manager: Scheduling for the irrigation crew.
  - Landscape supervisors: the phone app.

## Build order

| Phase | What ships | Why it's in this order |
|---|---|---|
| 0 | Startup capability and status-key backfill matches by type key | Renaming a type can't silently break it |
| 1 | The Task type, billing rules, New Task picker, converting Extra Billable tickets | Contract work can reach scheduling, and billing is correct |
| 2 | Accept / Send back, schedule-by date, Needs scheduling + Scheduled statuses, dashboard queue sources | **Stops tickets getting lost, even before the board exists** |
| 3 | One crew list → visits table → Scheduling page + crew-day view | The board needs crews and visits |
| 4 | The crew app moves the official status; return trips | Jobs reach billing on their own |
| 5 | Maintenance planner generates visits, campaigns create visits, Calendar page, Today shows every visit, property sections, flags → tickets | The single calendar |
| 6 | Estimate → Project handoff | Waiting on Randy's projects-section design |

## Facts from the code (checked at bf8ed65)

- **The status-name cleanup is already done server-side.** Status checks go through `isSeededStatus` and `findSeededStatus`. What's left is name-keyed maps: `ensure*` helpers return status maps keyed by *name*, and `extraBillableBilling.ts` looks up `"Ready for Billing"` by name.
- **The client schema copy** (`artifacts/highplains-crm/src/shared/schema.ts`) still has **no `typeKey`**. `NewTicket.tsx` and `QuickAddToDo.tsx` pick ticket types by display name.
- **`POST /api/tickets` is admin-only.** An account manager with the office role cannot create tickets today.
- **`POST /api/tickets` trusts the client's `ticketTypeId` and `billingBehavior`.** Phase 1 moves that decision to the server for Task.
- **The Maintenance planner stores a weekly pattern** (`schedule_blocks`: crew + day of week), not dated visits.
- **The crew app's Today** reads `tickets.crew_id` + `due_date` + `route_order`. Completing a stop sets only `mobile_status`.
- **Existing data:** all 15 Extra Billable tickets in production have `work_type = 'contract'`, and 11 of them have `billing_behavior = 'no_invoice'`. The old save bug (fixed in #641/#642) caused this. The Phase 1 conversion sets them all to Billable. Randy chose to leave past billing to the year-end audit.
- **`work_type = 'contract'` on To-Do tickets can't be trusted** for the same reason: the save bug reset admin and shop To-Dos to contract. So contract To-Dos are **not** converted automatically. They go through a review list (P1-4).

## Open questions

- The projects-section design (for Phase 6): where does it live?
- Should account managers be able to create tickets (currently admin-only)?
- Should the irrigation manager's Scheduling view be limited to the irrigation crew?