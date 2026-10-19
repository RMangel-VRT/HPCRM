# P3-3: Scheduling page (Needs scheduling → crew × day board)

> Assumes 00-RULES-P3.md, and P3-1 and P3-2 merged and published. **Line numbers are from GitHub `2f2f6df`**; find code by its content. **Schema: one additive nullable column** (next free migration number, 0049 at the time of writing; check first).
>
> This is the page that stops jobs getting lost: every job waiting for a crew is in one list, and placing it is one drag. Everything writes through the P3-2 visits API. **No new scheduling logic in the client.** The risk is UI that disagrees with the server, so every placement, move and removal shows the server's answer (`ticketSync`) and refreshes from it.

## Where this sits in the bigger design (context only, not in scope)

All scheduling tools produce **visits**: one-off jobs (this page), recurring **routes** (a later rebuild of the Maintenance planner) and **campaign** rounds (aeration, chemical, cleanups; wired to visits later). So the board must render **any** visit, not only ticket visits. Internal visits and future sources show with their `title` and `source_type`. Layering by service line starts here with `service_key`.

## Facts (verified at 2f2f6df)

- **Visits API** (`routes/visits.ts`):
  - `GET /api/visits?from&to` (≤ 62 days, enriched);
  - `GET /api/visits/summary`;
  - `POST`, `PATCH /:id`, `DELETE /:id`;
  - `POST /api/visits/reorder`;
  - errors: `NOT_SCHEDULABLE`, `VISIT_CLOSED`, `MULTIPLE_VISITS`, `VISIT_IN_PROGRESS`.
  - Admin, office and field_manager only.
- **`GET /api/crews/board`** (P3-1): active standing crews with color, hours, supervisor and order.
- **`tickets.service_type`** (schema ~L733) holds `mowing | pet_station | chemical | shrub_trimming | ornamental_grass | aeration | cleanups | tree_pruning`, and is nullable. These keys match Contract Center's scope service keys where they overlap.
- **`/dashboard/schedule`** is the old planner page (`SchedulePage.tsx`: builder plus viewer). **Leave it alone.** The new page is a separate route.
- **`@dnd-kit/core`** is already a dependency (WeeklySchedulerPage uses it).

## 1. Schema: `visits.service_key`

```sql
ALTER TABLE visits ADD COLUMN IF NOT EXISTS service_key text;
CREATE INDEX IF NOT EXISTS visits_company_service_date_idx ON visits (company_id, service_key, visit_date);
```

- Mirror it in `schema.ts` and the client schema copy (nullable string).
- **Ticket visits copy `tickets.service_type`** on create. They don't follow later changes to the ticket; a PATCH on the visit can change it.
- The P3-2 backfill and ticket-PATCH compatibility path set it the same way.
- **One-time guarded DML:** fill `service_key` on existing ticket visits where it's null and the ticket has a service type.
- Add `serviceKey` to the visit list enrichment, and add an optional `service` filter to `GET /api/visits` and `/summary`.

## 2. Server: the queue

**New `GET /api/scheduling/queue`** (admin, office, field_manager) returns two lists, each bulk-enriched with `{ ticket: id, title, typeKey, typeName, priority, scheduleBy, serviceType, customer: { id, name, city }, followUpDate }`.

| List | What's in it | Sort |
|---|---|---|
| `needsScheduling` | Every open ticket whose current status is stable `ready_to_schedule`, across all types that have it | `scheduleBy` ascending, nulls last; then priority (urgent → low); then `createdAt` |
| `slipped` | Tickets at stable `scheduled` whose **winning** visit (the P3-2 rule) is `planned` with a `visit_date` **before Colorado today**: the crew never started it | Oldest visit first |

- Each `slipped` row also includes `visit: { id, visitDate, crewId }`.
- **No cap.** Use one query per list plus the bulk lookups, not `storage.getTickets`.
- **Test:** a ready ticket older than 600 newer tickets is still returned.

## 3. Client: `/dashboard/scheduling`

**Sidebar:** add **Scheduling** (calendar icon) to the Dashboard group for admin, office and field_manager, right after Dashboard, with a count badge of `needsScheduling.length + slipped.length`. Add i18n keys in en and es.

**Layout (desktop):** a queue panel on the left (about 320 px) and the board on the right. **Phone width:** the queue becomes a collapsible drawer above the board, and the board scrolls horizontally inside its own container. There's no horizontal page scroll.

### 3a. Queue panel

- **Two tabs:** **Needs scheduling (n)** and **Slipped (n)**.
- **Card** (for each row in either list):
  - the property, the title and a type badge;
  - the priority, shown only for high and urgent;
  - a service chip, if there's a service type;
  - **Schedule-by**, shown in red when past, amber when within 2 days, muted otherwise;
  - for slipped rows, "Was due Tue Oct 14 · Crew 2".
- **Filters:** a search box (property or title), a type filter and a service filter.
- **Every card can be dragged onto the board**, and each card also has a **Schedule…** button. The button opens a dialog with a crew select, a date (the shared date picker) and optional estimated hours and notes, and it `POST`s. This is the touch and keyboard path; dragging is never the only way.
- **Slipped cards** move the **existing** visit with `PATCH`; they don't create a new one.

### 3b. Board

- **Rows are crews** from `/api/crews/board`, in their display order, each with a color swatch and supervisor name.
- **Columns are days:**
  - the week shown runs Monday–Saturday;
  - a **Sun** toggle adds Sunday;
  - there are prev/next week buttons and a **Today** button;
  - the week is read from `?week=YYYY-MM-DD` (that week's Monday, a Colorado date) so it survives reload and Back;
  - today's column is highlighted.
- **Data:** one `GET /api/visits?from=Mon&to=Sat|Sun` and one `GET /api/visits/summary` for the same range. Query keys include the company, the week and the service filter.
- **A cell** lists its visit cards in route order. Its header shows `n stops · 6.5 / 8 h`, turning amber at 90% of capacity and red when over. Hours come from the summary; visits with no hours count 0, so the count matters as much as the hours.
- **A visit card** shows the property, a short title, a type or source badge, a service chip and a status dot (`planned`, `in_progress`, `done`, `skipped`; `cancelled` visits are hidden). A `done` or `skipped` card is muted and can't be dragged.
- **Interactions:**

  | Action | API call |
  |---|---|
  | Drop a queue card on a cell | `POST /api/visits` with that crew, date and `ticketId` |
  | Drag a visit card to another cell | `PATCH` with the new crew and date |
  | Drag a visit card within its cell | `POST /api/visits/reorder` with the cell's full ID list |
  | Card menu (⋯) → **Open job** | navigate to the ticket |
  | Card menu (⋯) → **Edit** | dialog for hours, start time and notes (`PATCH`) |
  | Card menu (⋯) → **Remove from schedule** | `DELETE`, planned visits only; hidden otherwise |
  | Card menu (⋯) → **Add another visit** | the Schedule dialog for the same ticket (`POST`) |

- **Optimistic UI is allowed, but always reconcile.** On success, invalidate `/api/visits`, `/api/visits/summary`, `/api/scheduling/queue`, `/api/tickets`, `/api/tickets/my` and `/api/dashboard/action-queue`. On error, roll back and show the server's message.
- **Toast** after a placement or move when `ticketSync.statusChanged` is true: "Fall Aeration → Scheduled (Crew 2, Tue Oct 21)". Removing the last visit gives: "Back to Needs scheduling".
- **A service filter** (All, or one service) applies to both the board and the queue. Internal visits and visits with no service show under All only.

### 3c. Crew-day view

Clicking a cell header opens a side sheet for that crew and day:

- the ordered stop list with up/down reorder buttons (the same reorder API) as a non-drag path;
- each stop's property, title, address, hours and notes;
- the day's total hours against capacity;
- a **Print** button, giving a print stylesheet that lists the stops for the crew lead.

This is the office's view of what the crew's phone will show; the phone itself doesn't change.

### 3d. Ticket detail: a Visits section

On `TicketDetail`, for types that have a `scheduled` status, add a compact **Visits** card:

- the ticket's visits (`GET /api/visits?ticketId=…` with a wide date range, or a small `GET /api/tickets/:id/visits` if a date range doesn't fit; say which you chose);
- each one's crew, date, status and route order;
- **Add visit**, **Move** and **Remove**, using the same dialog as the queue.

This is where the `MULTIPLE_VISITS` message sends people. Change that message to link here: "This job has several visits. Change them in Visits below."

## 4. Small cleanups

- **Settings → Crews:** remove the P3-1 "N planner crews aren't linked…" banner. The planner is being replaced by routes, so it shouldn't nag. Keep the optional Planner crew field.
- **Dashboard "Needs you" queue:** its `past_schedule_by` and `new_for_you` items stay as they are. Add a **Schedule** action link to `/dashboard/scheduling` on `past_schedule_by` items. Change navigation only; leave counts and logic alone.

## Tests

- **Server:**
  - queue membership: `ready_to_schedule` across types, with To-Do and Invoice excluded;
  - queue sort order;
  - no cap;
  - slipped detection at 8 pm Colorado under `TZ=UTC`, where yesterday's planned visit is slipped and today's isn't;
  - a ticket whose winning visit is in progress is not slipped;
  - `service_key` is copied on create, by the backfill and through PATCH compatibility;
  - the service filter on list and summary;
  - roles: field_manager gets 200 and field gets 403.
- **Client (Vitest plus rendered tests):**
  - the week URL round-trips;
  - a drop calls `POST` with the right crew and date;
  - a move calls `PATCH`;
  - a within-cell reorder sends the full ID list;
  - an error rolls back and shows the message;
  - the `ticketSync` toast text;
  - capacity colors at 89%, 90% and 101%;
  - Schedule dialog submit;
  - a slipped card moves the existing visit and doesn't create a new one;
  - the TicketDetail Visits card renders and Add/Remove work;
  - there are no nested interactive elements, so the card menu sits outside the drag handle's link.

## Done when

- **In dev:**
  1. Create two crews.
  2. A Needs scheduling Task is dragged to Crew 1 on Tuesday: the card appears, the toast says Scheduled, the queue count drops and the supervisor's Today on Tuesday shows it.
  3. Drag it to Crew 2 on Wednesday: everything follows.
  4. Reorder two stops: the order holds after reload.
  5. Remove it: it's back in Needs scheduling with its due date unchanged.
  6. Make a visit dated yesterday that was never started: it appears under Slipped and moves from there.
- **Phone width:** the queue drawer and the horizontal board scroll work, and the Schedule dialog places a job without dragging.
- Tests pass, there are no new typecheck diagnostics, and the old `/dashboard/schedule` planner is untouched.

## Out of scope

- Routes (the planner rebuild) and campaigns producing visits.
- A month calendar view.
- The crew app changing visit status (Phase 4).
- Map or route optimization.
- Per-crew limits for field managers.