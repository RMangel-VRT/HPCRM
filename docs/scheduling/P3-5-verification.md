# P3-5 scheduling board polish verification

Verified in development on October 29, 2026. **Not globally green. No production publish or production changes.**

## Revisions and boundaries

- Fresh baseline: `2cc3bf1ac7a2b10db641012ed0609d2673e74e5f`.
- Final tested application and test sources: `9c20a3da139706f0747cf2ef4b414fbc8063b0b2`. The browser geometry/interaction pass used `b1b73fd8ef7697196d63cf9cd0d922e3258e9e68`; the only later application change strengthened today-column text colors. Final CRM full/focused regressions and numerical contrast assertions cover that color-only correction. Evidence/report additions afterward do not change application or test sources.
- Node 24.22.1, pnpm 10.26.1, Vitest 4.1.5. Date-sensitive focused runs use both `TZ=UTC` and `TZ=America/Denver`.
- Read the complete P3-5 attachment, Phase 3 rules, P3-4 verification, P3-3 release report and the newer display-filter audit. No scheduling mockup exists in `docs/scheduling/mockups/` or the current canvas registry; no canvas content was created or changed.
- Presentation only. No API, database, schema, migration, generated contract, scheduling mutation, permission, date-semantic, queue-behavior, crew-day sheet, mobile-app or routing changes.

## Changed files and behavior

Paths below are relative to `artifacts/highplains-crm/`:

| File | Change |
| --- | --- |
| `src/lib/schedulingBoard.ts` | Pure guarded `laneHeight(pane, header, gaps, crews)`, where gaps includes every vertical row gap plus bottom padding. |
| `src/hooks/use-board-lane-height.ts` | Observe actual scroll-pane and header-row dimensions, subtract horizontal scrollbar space via `clientHeight`, and publish the minimum only while neither dragging nor pending. Measure latest dimensions on settlement, observe no lane/content nodes, suppress equal-value updates, disconnect on cleanup. |
| `src/pages/SchedulingPage.tsx` | Wire observer refs and `--lane-h`, freeze on `active OR pendingDrops`, expose empty-cell hints/descriptions only while dragging, mark last lane for continuous today lines. |
| `src/components/scheduling/scheduling-board.css` | Content-sized header, shared content-expanding minimum rows, absolute hints, light/dark today overlays with continuous 2px primary side lines, preserved target/focus styles and opaque normal cards. |
| `src/lib/schedulingBoard.test.ts` | Corrected five-crew formula case, true caps, invalid/empty inputs, existing calendar/capacity/keyboard cases retained. |
| `src/hooks/use-board-lane-height.test.tsx` | Observer subjects/cleanup, pane/header resizes, unchanged-size stability, active + pending freeze and latest-value settlement, loading, zero crews, unmeasured pane, crew-count changes. |
| `src/pages/SchedulingPage.rendered.test.tsx` | No hints/descriptions at rest; queue/visit active hints and drop/cancel cleanup; pending failure coverage retained; grid variable; today's header, pill and column in both themes. |
| `src/components/scheduling/schedulingLayout.test.ts` | Shared minimum/expanding row CSS, out-of-flow hints and pending copies, theme-specific tint and continuous noninteractive side lines. |

Other changes: this report, `docs/scheduling/P3-5-evidence.json`, `docs/scheduling/summarize-p3-5.py`, `docs/scheduling/check-p3-5-contrast.py`, `docs/scheduling/P3-5-contrast.json`, browser evidence noted below, and memory notes recording the user-approved specification correction and full-suite resource-contention lesson.

### Formula and unchanged write paths

For a **900px pane**, a 40px header, five 10px row gaps and 12px bottom padding:

```text
(900 - 40 - (5 × 10 + 12)) / 5 = 159.6px
```

The user chose **keep the formula, correct the test**. Five crews do not imply a 220px minimum in that pane. The unit upper-cap case uses a 1300px pane. The header remains content-sized; a busy cell can expand its entire shared grid row. Few-crew capped boards leave unused space below; crowded boards retain the 120px floor and internal scrolling.

All writes still use existing `useVisitActions`: `createVisit`, `patchVisit`, `reorderCrewDay` and `removeVisit`. Their call sites and payloads are unchanged. No optimistic/cache record is inserted for presentation copies. Hints and pending copies are outside normal flow. Pending requests keep the same frozen minimum even after the active pointer/keyboard drag clears.

## Automated results

| Check | Fresh baseline | Final |
| --- | --- | --- |
| Library declaration refresh | pass | unchanged; no library changes |
| API leaf typecheck | 730 diagnostics | 730, **zero added/removed normalized diagnostics** |
| CRM leaf typecheck | 221 diagnostics | 221, **zero added/removed normalized diagnostics** |
| Scheduling-specific regressions, UTC | 86 pass | **100 pass** |
| Scheduling-specific regressions, Denver | — | **100 pass** |
| Extended focused set including Ticket Detail, UTC | 117 pass / 1 fail | **131 pass / 1 fail** |
| Extended focused set including Ticket Detail, Denver | — | **131 pass / 1 fail** |
| API full suite, UTC | 1,876 pass / 7 fail / 73 skipped | **1,876 pass / 7 fail / 73 skipped** |
| CRM full suite, UTC | 698 pass / 11 fail | **713 pass / 10 fail** |

Final API: 92 passing files, two failing files, ten skipped files; final CRM: 61 passing files, five failing files. Neither has a module-load error. Vitest's JSON suite counters include nested describes; the file counts here are computed directly from file results, treating files with only skipped assertions as skipped. Existing opt-in/skip guards remain untouched.

Full suites and leaf typechecks exit nonzero because of the failures/diagnostics documented here. No tests, timeouts, assertions or checks were weakened or excluded.

### Individual differences from the display-filter audit's 7 API / 8 CRM

The committed [machine-readable evidence](P3-5-evidence.json) contains **every failed full test name and file**, first-line reason, before/final counts, exact set differences against the display-filter audit, and normalized typecheck deltas.

**API: all seven audited identities remain, zero additions/removals.**

- `src/routes/mailboxAccounts.oauthReconnect.test.ts`: the same six reconnect/mismatch/personal-account cases fail at dependency initialization with `SyntaxError: "undefined" is not valid JSON`.
- `src/lib/plantEnrichment.test.ts`: `enrichPlants — partial failure > marks the sync run as 'partial' in the DB` still receives `undefined` instead of `partial`.

**CRM: all eight audited identities remain, plus two already present in the fresh baseline.**

- `src/hooks/useTabParam.test.ts`: same five cases, `document is not defined`.
- `src/components/CrewAssignmentBoard.test.ts`: same cross-column shift-selection and prune/lastClicked assertions.
- `src/components/contracts/rateCardUtils.test.ts`: same `groups and counts missing`, 42 versus 23.
- Additional relative to the older audit, **not introduced by this task**:
  1. `src/components/TicketConversation.rendered.test.tsx` — `Shared ticket conversation > preserves the empty state and always offers the main composer and compact navigation`; expected `No tickets found` text is absent (the rendered untranslated key is `ticketDetail.noComments`).
  2. `src/pages/TicketDetail.visits.rendered.test.tsx` — `TicketDetail conversation locations > always offers the Overview Conversation card and opens the focused tab when empty`; `button-view-all-comments` is absent. This is the one existing failure in both extended focused runs.

The pre-edit full CRM run additionally failed `DisplayTypeFilters.rendered.test.tsx` — `actual display-type pills, My Tickets=false > selects all five approved stages with real Projects, not estimates or name lookalikes; toggles multi-select and clears` (5.43s, generic runner stack). It **passes** in the final low-concurrency full run; its source was not changed. There are no added failed identities against the fresh baseline. This is not a claim that this unrelated timing issue was repaired.

### Resource-contention run retained, not hidden

An intermediate run launched both full suites alongside both leaf typechecks. It reported API 1,867 pass / 16 fail and CRM 698 pass / 25 fail, with additional timing failures in unrelated crew-link/invoicing/estimate/QBO integration and contract/irrigation/display-filter rendered cases. The original outputs remain as `contended-*`; their individual failures are also preserved in `P3-5-evidence.json`.

The complete suites were then run **sequentially**, each with `--maxWorkers=2`, using the same default test timeouts, original assertions and complete file discovery. All those additional contended-run failure identities pass in the final results above. Typechecks were already complete and were not rerun without a source change.

## Reproduction

Raw text/JSON outputs are ignored under `generated-artifacts/p3-5/`, excluded from Git and deployment by the existing ignore rules. Compact results are committed in `P3-5-evidence.json`.

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/highplains-crm run typecheck
pnpm --filter @workspace/api-server run typecheck

# Run separately, not concurrently with typechecks.
TZ=UTC pnpm --filter @workspace/api-server exec vitest run --maxWorkers=2 \
  --reporter=json --outputFile=../../generated-artifacts/p3-5/final-api.json
TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  --maxWorkers=2 --reporter=json --outputFile=../../generated-artifacts/p3-5/final-crm.json

# Extended focused set; the documented Ticket Detail failure is deliberately retained.
TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/SchedulingPage.rendered.test.tsx src/lib/schedulingBoard.test.ts \
  src/hooks/use-board-lane-height.test.tsx \
  src/components/scheduling/SchedulingCards.rendered.test.tsx \
  src/components/scheduling/schedulingLayout.test.ts \
  src/hooks/use-scheduling-drag-scroll.test.tsx src/lib/scheduling.test.ts \
  src/lib/schedulingStatus.companyDay.test.ts src/shared/visits.test.ts \
  src/pages/TicketDetail.visits.rendered.test.tsx
# Repeat with TZ=America/Denver.

# Rebuild compact evidence after capturing the same named baseline/final outputs.
python docs/scheduling/summarize-p3-5.py
python docs/scheduling/check-p3-5-contrast.py
git diff --check
```

## Real-browser verification

Browser verification uses browser-local authenticated admin/scheduling fixtures against the real running frontend, including intercepted/deferred writes. It does not claim live database persistence or alter real accounts/data. Existing mutation contracts are exercised by the rendered regressions.

The single browser journey and its remaining-check continuation confirmed:

| Viewport / case | Actual observations |
| --- | --- |
| 1440×900, five crews | Pane client 755px, header 41px, row gaps 50px, bottom padding 12px; variable 130.4px, rendered rows 130.391px. |
| 1920×1080, five crews | Pane client 950px; variable 169.4px, rendered rows 169.391px; body remains 1080px tall and document 1920px wide. |
| 1920×1400, true upper cap | Pane client 1270px; raw result 233.4px clamps to 220px. Grid 1203px, with 67px unused pane space below. |
| Both themes | Today is exactly one header plus one cell per crew; light alpha .10, dark alpha .14; computed side lines 2px primary, overlay `pointer-events:none`; header pill and crew identity remain. |
| Pointer / pending | Zero hints/descriptions at rest; 30 during a five-crew/six-day drag. Target retains crew ring/dashes. Resizing pane client 855→585px preserves 150.4px minimum, every row top/height, target rect and pending-copy rect. Hints clear on drop; local failed write clears pending and recomputes 120px; restoration recomputes 150.4px. Local success also clears pending. |
| Keyboard / cancellation | Real Space/arrows/Space queue placement and visit reorder emit the existing exact browser-local payloads; deferred copies clear on settlement. Visit Space/Escape clears 34 empty-cell hints/descriptions. Pointer Escape and off-board release clear transient UI with no additional writes. |
| Busy row | Eight stops grow a row to 563.5625px. With Sunday enabled, all seven day cells share the expanded grid track; other crew rows remain 150.391px. The crew label belongs to that same grid row. |
| 18 crews / continuous edge scrolling | Client/scroll height 755/2393px, max scrollTop 1638, floor 120px. Stationary lower-edge sample advanced 104px over 1005.2ms (103.46px/s, below 250px/s); reaches exact bottom and remains bounded. Leaving pane gives zero movement over 508.3ms. Escape stops scrolling; a local drop followed by a new drag recovers continuous scrolling. Main scrollTop stays zero, body 900px and document width 1440px. |
| 390×844 | Both themes retain outer board height 590.796875px (70vh); client 360×576px, internal extent 1168×703px, document/body width 390px. No page-level horizontal overflow. |

Pointer resize testing used a temporary **pane-height** override: Chromium viewport resizing itself cancelled the pointer. This still exercises a real ResizeObserver delivery during active drag and deferred presentation, not a jsdom layout approximation. Keyboard placement and visit cancellation use the real sensors, not injected drag callbacks.

### Contrast correction and evidence

The stronger today overlay exposed a light-theme amber-text contrast problem. Today capacity text now mixes the existing semantic warning/destructive/foreground tokens, and today's muted hint is slightly stronger. Only today's text is affected; capacity thresholds, data attributes, bars, card surfaces and other-day colors remain unchanged.

`check-p3-5-contrast.py` parses the actual theme tokens and checks the composed sRGB colors with WCAG relative luminance. It bounds **every possible crew color** using the RGB cube corners and tests both ordinary and 18% active-target crew tints, followed by today's theme-specific overlay. All small-text ratios exceed 4.5:1:

| Minimum ratio | Light | Dark |
| --- | ---: | ---: |
| Today capacity, normal | 6.4897 | 5.7543 |
| Today capacity, amber | 5.4907 | 5.8348 |
| Today capacity, red | 8.8077 | 5.0476 |
| Today drag hint | 4.7567 | 5.5792 |
| Opaque card text | 14.2044 | 14.6884 |
| Card muted text | 5.1088 | 7.0305 |
| Today pill | 6.5179 | 7.4582 |

Exact browser measurements, the continuation report and screenshot attachment IDs are retained in [`P3-5-browser-evidence.json`](P3-5-browser-evidence.json). The initial snapshot's `notRun` list is historical; the continuation and separate contrast proof close its scrolling/AA items. The retained [`P3-5-browser-repro.js`](P3-5-browser-repro.js) targets the managed Playwright notebook (`newBrowserContext`, `REPLIT_DEV_DOMAIN`) and reproduces the central sizing/freeze/drop/keyboard/busy-row/mobile checks; it is not an npm test, a complete replay of every manual observation, or a claim that Playwright was added to this project. Full screenshots remain outside Git. The initial mobile dark capture was obscured by the sidebar, but its measured dimensions/theme alpha were recorded. This screenshot limitation does not establish a layout failure.
