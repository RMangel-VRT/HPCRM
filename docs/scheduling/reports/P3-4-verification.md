# P3-4 Scheduling layout and drag redesign

## Scope and call sites

- `artifacts/highplains-crm/src/App.tsx`: only `/dashboard/scheduling` joins the unpadded shell routes and receives scheduling-specific overflow boundaries.
- `src/pages/SchedulingPage.tsx`: wrapping header, independent queue/board panes, sticky crew/day grid, crew summaries/capacity bars, grouped queue, portal overlay and transient pending-drop presentation.
- `src/components/scheduling/SchedulingCards.tsx`: shared normal/lifted/pending card bodies. Queue badge and rail use one display-resolved identity; filtering and mutation decisions retain raw identities.
- `src/components/scheduling/scheduling-board.css`: 860px layout and 1100px legend breakpoints, crew-owned tints, ticket-owned rails, source/closed/pending opacity and reduced motion.
- `src/lib/schedulingBoard.ts`: presentation-only grouping, calendar age, week number, capacity fill, edge thresholds and keyboard coordinates over the actual enabled cells/visits.
- `src/hooks/use-scheduling-drag-scroll.ts`: pane-owned pointer scrolling that continues when hovered cells change, with exact 48px edges, a 250px/s cap and explicit bounds.
- English and Spanish scheduling labels were added together.

All `src/` paths above are relative to `artifacts/highplains-crm/`.

### Preserved writes

No API, schema, generated contract, migration, server logic, canvas, old planner or mobile-artifact changes.

The page still delegates every write to the existing `useVisitActions` methods:

| Interaction | Existing call and payload |
|---|---|
| Needs scheduling drop | `createVisit({ ticketId, crewId, visitDate }, ctx)` |
| Slipped drop | `patchVisit(existingVisitId, { crewId, visitDate }, ctx)` |
| Move visit | `patchVisit(visitId, { crewId, visitDate }, ctx)` |
| Reorder | `reorderCrewDay({ crewId, visitDate, visibleIds, filtered })` |
| Remove | `removeVisit(visitId, { ticketId })` |

The shared hooks, dialogs and crew-day sheet are unchanged. Hidden-stop merge ordering, ticketSync feedback, server errors and invalidation remain owned by those existing helpers. Pending copies are noninteractive, absolutely positioned presentation elements, never inserted into the authoritative visits/queue/cache. Request completion removes them, and the company-keyed page remount clears active/pending UI on a company switch.

Pointer activation remains 6px. Keyboard coordinates search enabled board cells and open visits instead of assuming a SortableContext that this grid does not have. Pointer collision remains pointer-defined, so a wide card dropped outside the board does not create a visit.

Autoscrolling is implemented by a dedicated continuous animation-frame loop over only the queue list and board. The ancestor-based dnd-kit autoscroller is disabled to prevent competing loops: the real-browser pass found it could stop early during a valid bottom-edge hover. Exact 48px edge regions, a 250px/s maximum, monotonic frame-time budgeting and explicit scroll limits keep movement bounded; leaving a pane stops that pane's scrolling. Fractional positions are integrated independently of rounded DOM scroll offsets so rounding or external adjustments cannot compound the rate. A wheel gesture resets the integrator to respect manual scrolling. Layout-shift compensation is disabled. A viewport modifier also keeps the lifted overlay visible at the extreme window edges.

## Automated verification

Pre-edit scheduling baseline: **80 tests passed in five files**.

The final **115-test** targeted regression set passes in nine files under both `TZ=UTC` and `TZ=America/Denver`, including the fractional-position rate budget.

The extended regression set covers:

- Existing POST/PATCH/slipped placement, reorder/hidden-stop merge, dialog alternatives, errors/refetch, ticketSync, removal/Visits detail and company-reset behavior.
- Portal overlay, stationary source, reduced motion, and protected Schedule/link controls.
- Full-bleed shell and independent responsive scroll boundaries, sticky stacking and crew/type ownership.
- Capacity thresholds at 89%, 90%, 100% and 101%.
- Queue grouping/counts/server order, missing dates, urgency boundaries and calendar-day ages through DST.
- Pending placement/move/reorder, success/failure cleanup, off-board no-ops and company changes.
- Actual-cell keyboard coordinate selection and existing non-drag controls.

Reproduce the targeted set with:

```sh
TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/SchedulingPage.rendered.test.tsx \
  src/lib/schedulingBoard.test.ts \
  src/components/scheduling/SchedulingCards.rendered.test.tsx \
  src/components/scheduling/schedulingLayout.test.ts \
  src/hooks/use-scheduling-drag-scroll.test.tsx \
  src/lib/scheduling.test.ts \
  src/lib/schedulingStatus.companyDay.test.ts \
  src/shared/visits.test.ts \
  src/pages/TicketDetail.visits.rendered.test.tsx
# Repeat with TZ=America/Denver.
```

### Typecheck delta

`pnpm run typecheck:libs` succeeds. With refreshed workspace declarations, an untouched HEAD copy and the working CRM both report **221 diagnostics**, with **zero added diagnostics** after normalizing shifted line numbers. The unchanged API package reports **732 diagnostics** with refreshed declarations. The historical 739 API / 225 CRM counts in the Phase 3 rules are not current baselines.

Before refreshing emitted declarations, the API check reported 1,143 diagnostics; that stale-declaration result is not a regression in this task.

### Wider-suite failures, separate from this task

The broader CRM run (`TZ=UTC`) reports **636 passed / 8 existing failures** across 59 files, before the additional fractional-position guard test was added. The final targeted set passes with that guard included. The wider-suite failures remain in three unchanged test files:

- `src/hooks/useTabParam.test.ts`: five failures.
- `src/components/CrewAssignmentBoard.test.ts`: two failures.
- `src/components/contracts/rateCardUtils.test.ts`: one failure.

The broader API run reports **18 failed tests**, **1,574 passed**, **69 skipped**, plus three suite-load failures (eight failing files total):

- Three Contract Center suites cannot load.
- Plant enrichment: one failure.
- Crew-supervisor details: one failure.
- Mailbox reconnect: six failures.
- Visits integration: nine failures; the extracted ticket PATCH handler references `applyTicketStatus` without providing it to the evaluation harness.
- Task web-client source assertion: one failure.

These failures are not suppressed or repaired by the frontend redesign. Raw command output and typecheck comparisons are retained in ignored `generated-artifacts/scheduling/`.

## Browser verification environment

The documented development account is rejected by the running API. No password or existing account was changed. Signed-in layout and drag verification therefore uses browser-local intercepted authentication and scheduling responses against the real running frontend; it does not verify live database writes. The API payload/reconciliation contracts are covered by the rendered regression tests above.

### Browser observations

The pass used 24 queue items, 18 crews, sibling visits and delayed browser-local writes:

- **1440×900 / 1920×1080:** body remains exactly viewport-sized. Desktop main has no scroll extent; queue and board scroll independently. At 1440px the main uses the full available 1184px width and the board has both horizontal and vertical overflow.
- **390×844:** no page-wide horizontal overflow; queue collapses/reopens and its list cap is 388.24px (46vh). After fixing mobile flex sizing, board outer height is 590.8px (70vh), with internal overflow, not content-expanded height. A real coarse-pointer touch context exposes usable visit menus.
- **Pointer placement:** source stays at its original position at 30% opacity, with no transform. The lifted copy is in document.body, outside the clipping panes. A valid cell gains its crew-colored target treatment. Delayed placement shows pending, then reconciles after the local response.
- **Keyboard / alternatives:** Space → arrow → Space places a queue item. Schedule opens its dialog without starting drag, links navigate normally, and Move up emits the existing reorder payload. The static fixture did not verify visual reorder reconciliation; rendered tests cover that contract.
- **Sticky layers:** corner remains fixed at the header intersection, day headers stay at the top during vertical scrolling, and crew labels stay pinned left during horizontal scrolling.
- **Themes / reduced motion:** both themes retain crew lanes, today treatment and resolved type identity. Reduced-motion drop has no animation, then pending and overlay clear.
- **Edge behavior after fixes:** stationary board-bottom hover passes the old early stall, reaches maximum scrollTop and stays bounded while body/main remain fixed. The queue can scroll without moving the board. At the extreme bottom-right the overlay remains visible with approximately 7.6px margins (8px before subpixel rounding).

The initial browser pass caught the mobile flex-size problem and an ancestor-autoscroll stall; both were fixed and rechecked using only those affected flows, not another broad pass.

The queue rate interval initially showed unexpectedly high aggregate movement. A subsequent instrumented frame confirmed the active loop requested 3.784px and the browser rounded it to 4px, consistent with the configured 218.75px/s edge velocity. The final integrator additionally prevents accumulated DOM rounding/external drift; its focused test simulates 60 rounded frames, a mismatched animation timestamp and an external scroll jump. That final safeguard was confirmed with the focused regression, not another browser pass. Live backend persistence remains outside the fixture-mode browser evidence.
