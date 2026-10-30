# High Plains CRM: Master schedule design

**Status (Oct 30, 2026): Phase 3 is complete and live.**
- **Live:**
  - P3-1 (one crew list);
  - P3-2 (visits);
  - P3-3 (Scheduling page);
  - P3-4 (redesign: full-screen, crew lanes, ticket-style cards, overlay drag);
  - P3-5 (polish: lanes fill the height, drop hints only while dragging, clear today column);
  - O1 (Settings → Crews owns crews);
  - display-type filters (#783).
- **Mockup:** "High Plains Scheduling Board" artifact, https://claude.ai/artifact/7rJBcUXq4122PHbN3Wt3Zm.
- **Housekeeping still open:**
  - `replit.md` has plaintext test passwords (an admin login and the mobile seed user);
  - the dev-only test login task hasn't run.

## Core idea

Every scheduling tool produces **visits** (one crew, one Colorado day, one trip). The calendar, the crew-day view, the crew app and property pages only read visits.

| Shape | Services | Planning tool | State |
|---|---|---|---|
| Recurring routes | Mowing, pet stations, winter visits, irrigation checks | **Routes**: property + crew + weekday + cadence, generating visits a few weeks ahead, with a rain-day slide | **Next.** Replaces the old Maintenance planner. |
| Counted rounds | Aeration, fert/chem, cleanups, shrub trims, grass cutback, irrigation start-up and winterization | **Campaigns** | Exists. Needs items placed as visits, and generation from contract scope. |
| One-offs | Tasks, projects, estimates, extra-billable jobs | **Tickets → Needs scheduling → Scheduling board** | Live |
| Events | Snow | Storm-triggered | Not planned yet |

## Scheduling page design rules (approved)

- **Full-screen.** The queue and the board scroll in their own panes.
- **Crew color owns the lane; ticket-type hue owns the card.**
- **Queue cards use the ticket-list look**, with display types (approved estimates show as Project). They're grouped into Past schedule-by, Due this week and Later.
- **Lanes fill the height:** `laneHeight` clamps each lane between 120 and 220px. Drop hints show only while dragging. Today's column has a tint and side lines.

## Demand source

**Contract Center** `term_scope_lines` (service key, quantity, month spread, per term) are the only "what does this property get" source. See `claude/data-ownership-map.md`.

## Build order (remaining)

1. **Routes.** Rebuild the planner on standing crews: dated visits generated a few weeks ahead, a rain-day slide, and prefill from contract scope where it exists. One-time import of the valid planner placements, then retire `/dashboard/schedule`, `maintenance_crews`, `schedule_blocks` and `maintenance_visit_configs`.
2. **Campaigns onto the calendar.** Placing an item creates its visit. Generate campaigns from contract scope.
3. **Phase 4, the crew app on visits.** Coordinated with the mobile project (see `claude/mobile-app-assessment.md`): Today from visits; Start and Complete close the visit and move the official status; return trips.
4. **Fulfillment report.**

## Open question

Do Contract Center 2027 scope lines record quantity and months for every property? Routes can be built either way: prefill where they do, manual setup where they don't.
