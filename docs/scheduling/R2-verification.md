# Routes R2 verification

## Release prerequisites: do not switch production ownership yet

This implementation does **not** authorize a production import, select a planner
template, populate an approval fingerprint, publish, or mutate production.

The published app was confirmed reachable in deployment metadata. The read-only
production schema/import readiness query was rejected because authenticated
production database access is unavailable in this task session. A successful
published build is **not** evidence that R1 has been published or imported.

The checked-in approval registry remains empty. The latest verified production
evidence in `docs/routes-engine-verification.md` still records seven active
templates, an import blocked before creating any stops, and the need for Randy's
separate template selection and explicit approval of a fresh fingerprint.

The approved `R-mockup-routes.html` is absent from both the repository and supplied
attachments. It was requested. No approved-mockup visual fidelity is claimed.
When supplied, preserve the original under `docs/scheduling/mockups/` and compare
with current components/tokens taking precedence.

**Safety gate:** the planner freezes per company only after its existing
`routes_imported_at` marker is committed by the approved R1 import transaction.
Before that marker, the existing planner remains usable, its navigation remains
available, and customer readers retain legacy information. An unverified
production switch is not labeled “R2 merged / Frozen” globally in the ownership
map. A disposable imported development company demonstrates the switched state.

## Ownership, scope and API

- `route_stops` is the only live recurring pattern. Contract coverage, quantities,
  month spread and governing term identity are read projections from Contract
  Center, not new stop columns. Crew identity/capacity stays with `crews`.
- `0063_route_import_decisions.sql` adds only company-scoped import workflow
  snapshots and resolution. Source block IDs are stable provenance, deliberately
  not cascading foreign keys to the legacy planner. Keep selects the candidate
  placement for the **single** active stop; Remove dismisses the extra placement.
  Neither choice edits planner history or automatically rewrites dated visits.
- Approval fingerprint computation is unchanged. The importer snapshots review
  candidates only in its real, approved transaction, with stops and the import
  marker; dry runs remain read-only. Duplicate active stops remain protected by
  R1's partial unique index.
- Route writes validate initiating-company headers and active same-company
  references. Management endpoints retain admin/office/field_manager access.
  Fill now also allows field_manager while retaining the 42-day maximum.
- `/api/customers/:id/route-summary` follows the existing authenticated,
  company-scoped customer-read boundary, not company-wide Routes-management
  access. `/api/planner/readiness` exposes only import/read-only state to existing
  planner viewers. `/api/planner/route-preview` replaces the dashboard's old
  company-wide planner preview with the same limited read-only pattern fields.
  These reports expose no contract or import-decision management data.
- Ordinary pattern edits do not change visits. Explicit calendar reconciliation
  validates the stop timestamp and reads eligibility **under the scheduling
  gate**, then reuses `patchVisitInTransaction` (also used by visit PATCH).
  Changes are atomic: any error rolls the entire action back.
- Only matching future planned route visits are moved/cancelled. Past original
  occurrences, past dates, completed/skipped/cancelled/in-progress work, ticket
  visits and other companies/stops are not rewritten. Original occurrence
  identity is retained, and contract zero-spread months remain excluded.
- A weekday change aligns a fortnightly anchor within the same anchor week.
  Refill recognizes original occurrence weeks already on the calendar, including
  cancelled/moved identities, rather than generating a second occurrence after
  a weekday change. Rain-day dates are never treated as new occurrence identities.
- Planner-only HTTP endpoints return authenticated 409 `PLANNER_REPLACED` with
  the exact 2026 banner message **after import**. All corresponding storage
  entry points (including duplicate and bulk-delete helpers) recheck the marker
  under the same scheduling gate as import, closing the admitted-before-import
  race. The late error handler preserves the 409 JSON response in that race.
  Legacy reads and Settings → Crews column links remain intact.
- The historical `/dashboard/schedule` intentionally still shows **legacy
  template data**, read-only with the exact banner. It is not supposed to show
  imported route rows. The dashboard's `SchedulePreview` and the customer's
  scheduling section instead use live read-only route summaries after import.
  Before import, both retain their existing legacy readers.
- Routes and Scheduling share lane headers, day-cell surfaces, capacity,
  pointer-first collision, keyboard coordinates, drag sensors, floating overlay
  and pane-owned scrolling. Query keys include company/viewer, and GET/write
  requests bind the initiating company header so a switched session cannot
  populate a previous company's cache with the new company's results.
- No planner table is dropped, renamed, cleared, or used as a second live pattern.
  No mobile, campaign, optimization, production migration script, or startup DDL
  was introduced.

## Verification evidence

Fresh pre-edit baseline, after rebuilding shared declarations:

| Check | Baseline |
| --- | --- |
| Shared declarations | pass |
| API typecheck | 730 diagnostics |
| CRM typecheck | 221 diagnostics |
| Full API, UTC, two workers | 2370 pass / 7 fail / 96 skipped |
| Full CRM, UTC, two workers | 902 pass / 10 fail |

The inherited failures are the same categories as R1: six mailbox reconnect
cases and plant-enrichment partial-state on API; CrewAssignmentBoard, conversation
Overview/composer, useTabParam and rate-card grouping on CRM. Final comparisons
and signed-in observations are recorded below when verification is complete.

Raw evidence is in ignored `generated-artifacts/r2/`, excluded from Git and
deployment. Disposable demonstration access is never committed or included in
this report.

### Final checks

| Check | Result |
| --- | --- |
| Root library-first typecheck | Declarations pass; root artifact check stops on inherited API errors |
| API diagnostics, normalized file/code multiset | **730 → 730**, zero additions/removals |
| CRM diagnostics, normalized file/code multiset | **221 → 221**, zero additions/removals |
| R1 engine + scheduler + R2 database/API suites, UTC | **57/57 pass** |
| Same suites, America/Denver | **57/57 pass** |
| Later additive preview/company-boundary API check | **10/10 pass**, includes the R2 cases above |
| Full API UTC | 2368 pass / 9 fail / 105 skipped |
| Isolated estimate integration recheck | **25/25 pass**, including both extra failures in the full run |
| Full CRM UTC | **931 pass / same 10 baseline failures** |
| Extended P3/R2 CRM, UTC and America/Denver | **161 pass / 1 inherited Ticket Detail conversation failure**, each timezone |
| Final changed Routes/Scheduling/planner/preview focused set | **72/72 pass** |
| API bundle and running workflow | pass |
| CRM production Vite build | pass, existing source-map/chunk-size warnings |
| Development migration / schema-drift check | pass; schema in sync |

The full API run's two additional failures were in untouched
`services/estimates.integration.test.ts`; both recovered in the isolated 25-test
run without source edits, assertion weakening or increased timeouts. The seven
baseline API failures remain. The extended CRM failure is the same missing
Overview conversation-card assertion recorded before this task; every
Scheduling/Routes/Rain-day assertion passes. The final focused check includes the
additional live dashboard preview test added after the full CRM run.

The first broad focused API run also encountered one timeout in an unchanged
multi-assert R1 authorization test under contention; the entire focused set then
passed serially in both timezones, with the original timeout unchanged.

`R2-evidence.json` retains baseline/final failure identities, normalized diagnostic
deltas, and the complete changed-file list. Rebuild it with:

```sh
python docs/scheduling/summarize-r2.py
```

Reproduction commands (run broad checks serially to avoid resource contention):

```sh
pnpm run typecheck
pnpm --filter @workspace/highplains-crm run typecheck
PORT=23878 BASE_PATH=/ pnpm --filter @workspace/highplains-crm run build
pnpm --filter @workspace/scripts run migrate
pnpm --filter @workspace/scripts run check-schema-drift

ROUTES_DB_TESTS=1 TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  src/lib/routeEngine.test.ts src/lib/routeEngine.integration.test.ts \
  src/lib/routeScheduler.test.ts src/lib/routesR2.integration.test.ts --maxWorkers=1
# Repeat with TZ=America/Denver.

TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run \
  --config vitest.config.ts --maxWorkers=2
# Extended P3 commands are unchanged in P3-5-verification.md; add
# lib/routes.test.ts, pages/RoutesPage.rendered.test.tsx,
# pages/SchedulingRoutes.rendered.test.tsx, pages/PlannerFreeze.rendered.test.tsx.
```

### Signed-in development demonstration

Only a disposable development company was imported using a freshly approved
in-memory fixture fingerprint. No production URL/data was used. The approval
registry on disk remains default-off. Raw sanitized observations are retained in
`generated-artifacts/r2/r2-journey-evidence.json`.

1. Routes showed six imported stops Monday–Saturday and three contractual needs.
2. Pointer drop of Route Property 8 onto Thursday opened the 60-minute/weekly
   default dialog. Choosing every two weeks created the stop and its cadence tag.
   Drawer values came from the API: 0/26 done, 0 planned/skipped, actual month
   spread, linked property and governing contract, contract season and effect note.
3. Fill returned **2 created** for November 2–23, 2026. R1's development startup
   fill had already created 19 visits for the existing imported pattern before
   this UI action; only the two new fortnightly occurrences were missing.
4. The calendar deep link selected Mowing. Thursday grouped the original stop
   before the new stop; expansion exposed Move / Skip / Open property. Ticket
   work remained separate below the route block.
5. Tuesday November 3, All crews, Push the rest of the week returned **6 moved**.
   Seven original route occurrence identities in the inspected week were retained;
   six changed visit date and rendered slid. The ticket stayed on November 3.
6. Refill returned **0 created**. There were 21 route visits with 21 unique visit
   IDs and 21 unique original-occurrence keys; two belong to the new fortnightly
   stop. No ticket work was moved.
7. Hide routes persisted after reload and rendered `Routes: n stops`. Mowing and
   All services retained the same aggregate crew-week capacity: 7 stops,
   4.5 / 48 hours after the slide.

The initial browser report mistook the deliberately retained historical planner
for the dashboard's route preview and stopped early. The continuation checks only
the previously unrun layout/keyboard/scroll and reader/409 assertions; the core
fill/slide/refill journey is not repeated.

**Browser verification limitation:** the continuation stopped on an
unexpected execution failure before recording the remaining checks. Resuming the
same browser session was then refused because its access context had changed.
No second browser tester was started. The live login screen was subsequently
captured successfully, both development services were restarted with the final
code, and anonymous readiness correctly returned 401.

On the user's request to proceed, the remaining data/permission checks were
completed against the running development server using a separate normal
authenticated HTTP session for the disposable fixture, without changing any
pattern or visit:

- Live dashboard preview: 200, seven stops, new fortnightly property included.
- Property route summary: 200, one Thursday stop with `everyWeeks: 2`.
- Planner block PATCH: **409 `PLANNER_REPLACED`**, with the exact message from
  readiness; no write occurred.
- Initiating-company mismatch: 409.
- Session logged out after the check; no credentials/cookies appear in evidence.

Raw sanitized results are in `generated-artifacts/r2/r2-remaining-http.json`.
The dashboard/customer React rendering is covered by the passing focused
`PlannerFreeze.rendered.test.tsx` cases.

The shared keyboard-coordinate, stationary-edge-scroll, breakpoint/height,
sticky-header and light/dark styling checks are covered by the retained passing
P3 focused suites, rather than another browser pass. Service colors have
separate light/dark token values. **The full signed-in visual matrix across
light/dark, 390/1440/1920 widths and both sidebar states was not observed in the
browser and is not claimed as passed.** Pointer creation and the populated
light-theme route/calendar boards were observed in the original signed-in run.
The disposable development fixture is retained for demonstration.
