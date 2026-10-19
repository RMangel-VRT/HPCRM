# High Plains CRM: Master schedule design

**Status (Oct 19, 2026):**
- Agreed with Randy. P3-1 (one crew list) and P3-2 (visits) are live.
- P3-3 (Scheduling page) is written: `scheduling-slices/phase3/P3-3-scheduling-page.md`.

## Core idea

Every scheduling tool produces **visits** (one crew, one Colorado day, one trip). The calendar, the crew-day view, the crew app and property pages only read visits. Services come in different shapes, so they get different planning tools, but they all write the same visits.

| Shape | Services | Planning tool | State |
|---|---|---|---|
| Recurring routes | Mowing, pet stations, winter visits, irrigation checks | **Routes**: property + crew + weekday + cadence, generating visits a few weeks ahead, with a rain-day "slide" | To build. Replaces the old Maintenance planner. |
| Counted rounds | Aeration ×2, fert/chem ×5, cleanups, shrub trims, grass cutback, irrigation start-up and winterization | **Campaigns**: window, one item per property, target/backup date, applicator, product, HOA pre/post notices, weather | Exists. Needs items placed as visits, and generation from contract scope. |
| One-offs | Tasks, projects, estimates, extra-billable jobs | **Tickets → Needs scheduling → Scheduling board** | Visits are live (P3-2). The board is P3-3. |
| Events | Snow | Storm-triggered, separate design | Not planned yet |

## Demand source

**Contract Center** scope lines (`term_scope_lines`: service key, quantity, month spread, per season term) say what each property is owed. They should be the **only** "what does this property get" source.

These should retire over time:
- legacy `contract_services`;
- `customer_service_plans` and their templates;
- `maintenance_visit_configs`;
- campaign items' `service_plan_category`.

## Design rules

- A master schedule is several views, not one giant calendar:
  - **crew-day** (what the crew lead sees);
  - **service-line progress** (e.g. "Fall aeration 64/112, 9 days left");
  - **exceptions** (Needs scheduling, Slipped).
- Mowing should run on autopilot; the board is for exceptions.
- **Weather is the normal case.** Generate a rolling few weeks, never a whole season. "Slide a crew's day" or "slide everyone's Tuesday" is a single action.
- Day plus route order is enough. Clock times only for chemical notices and appointments.
- `visits.service_key` (added in P3-3) makes the calendar filterable by service line.
- **The payoff is proof of service:** contract scope compared with completed visits, per property and season.

## Build order

1. **P3-3, the Scheduling page.** Needs scheduling and Slipped queue, crew × day board, crew-day sheet, a Visits card on ticket detail, `service_key`.
2. **Phase 4, the crew app on visits.** Start and Complete close the visit and move the official ticket status; photos; "needs a return trip".
3. **Routes.** Rebuild the planner on standing crews, generate dated visits, rain-day slide. One-time import of the planner placements that are still valid, then retire `/dashboard/schedule`. Randy says the current planner crews are inaccurate, so fix the crews in the new tool, not the old planner.
4. **Campaigns onto the calendar.** Placing an item creates its visit. Generate campaigns from Contract Center scope.
5. **Fulfillment report.**

## Facts from the code (checked Oct 19, 2026)

- **The planner** (`maintenance_crews`, `schedule_blocks`, `maintenance_visit_configs`, `weekly_schedule_templates`) is isolated: nothing outside its own pages reads it, and the crew app doesn't use it. Two traps:
  - deleting a planner crew cascades its blocks;
  - an inactive crew hides its blocks from both the grid and the Unscheduled list.
- **Production planner crews:** JOJO, Luciano Crew, Manuel Crew, Rolando, Sergio Crew.
- **Production had no standing crews as of Oct 12.** Randy confirmed each crew has a supervisor login.

## Open question

Do Contract Center 2027 scope lines record quantity and months for every property? This decides whether campaigns can be generated automatically (step 4).
