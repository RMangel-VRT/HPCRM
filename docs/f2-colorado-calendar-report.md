# Colorado calendar scheduling report

## Status and scope

Implementation and development verification completed on October 12, 2026.
**Publishing and observation of the new production boot log remain pending.**
Replit publishing is user-initiated; this task did not publish or change deployment
settings. After merge and the approved Publish flow, inspect production logs for
the exact company-day line below. Do not infer the production timezone from dev.

The F1 prerequisite was verified against the live task record (MERGED) and the
merged source: `getTickets` selects every matching open ticket, including missing
statuses, and bounds only the closed selection to 500. F2 does not implement F1.

No schema changes, migrations, global timezone changes, timestamp reinterpretation,
or historical schedule-by repairs were added.

## Changed files

Server:

- `artifacts/api-server/src/lib/companyDay.ts`: explicit Denver instant projection,
  UTC calendar arithmetic, weekends and independently resolved day boundaries.
- `artifacts/api-server/src/lib/scheduleBy.ts`: preserved public signatures;
  compatibility `localDateString` projects instants once to Denver.
- `artifacts/api-server/src/lib/scheduleByMaintenance.ts`: corrected misleading comment.
- `artifacts/api-server/src/lib/dueDateDismissal.ts`: changed/provided date and
  Colorado-tomorrow threshold.
- `artifacts/api-server/src/index.ts`: one timezone line through the existing logger.
- `artifacts/api-server/src/routes/dashboardQueue.ts`: Colorado today, business-day
  aging, normalized calendar fields, pulse bounds, season selection and revenue year/month.
- `artifacts/api-server/src/routes/pendingInvoices.ts`: removed duplicate Denver
  projection; preserved calendar-day subtraction and all invoice query/scoping behavior.
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: Today, history, week and sync
  dates/bounds/buckets; no authorization or crew/company scope changes.
- `artifacts/api-server/src/routes/routes.ts`: due-date dismissal uses the new
  threshold helper; explicit-change and final-status guards remain intact.

CRM:

- `artifacts/highplains-crm/src/shared/scheduleBy.ts`: corrected the discovered
  host-local scheduling gap, with the same priority rules as the server.
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`: instant-based previews,
  pure calendar-string follow-up arithmetic and separate calendar-selection serialization.
- `artifacts/highplains-crm/src/components/TicketSchedulingPanel.tsx`: calendar
  serialization for follow-up and schedule-by selected-date saves.

Tests:

- `artifacts/api-server/src/lib/companyDay.test.ts` (new)
- `artifacts/api-server/src/lib/scheduleBy.test.ts`
- `artifacts/api-server/src/routes/dashboardQueue.test.ts`
- `artifacts/api-server/src/routes/pendingInvoices.test.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.companyDay.test.ts` (new)
- `artifacts/highplains-crm/src/lib/schedulingStatus.companyDay.test.ts` (new)
- `artifacts/highplains-crm/src/components/TicketSchedulingPanel.companyDay.test.tsx` (new)

Documentation: this report and the existing Colorado-calendar memory. The memory
now cautions against double projection and distinguishes date-picker components
from instants.

## Changed and verified call sites

### Scheduling

- `computeScheduleBy` converts the base instant once to a Colorado date. Urgent
  advances at least one date, skipping weekends; high adds 3, normal/default 7,
  and low 21 calendar days. It does not mutate the supplied Date.
- Verified unchanged consumers in `routes.ts`: existing single-ticket creation,
  batch creation, Needs-scheduling fallback and bulk workflow fallback.
- Verified `maintainScheduleBy`: priority changes continue using accepted/created
  instants, and entry into Needs scheduling uses the current instant.
- Verified `backfillScheduleBy`: existing guarded null-only DML and stable type/status
  criteria are unchanged. It does not overwrite non-null dates.
- Verified `ticketOwnerResponse`: Accept continues calculating from creation when
  no explicit schedule-by exists; owner-response regressions pass.
- CRM `NewTicket` uses `previewScheduleBy`. The default follow-up is company today
  plus 3 calendar dates. Both schedule-by edits and follow-up saves serialize
  browser-local picker components, not Denver-projected picker instants.
- A rendered ScheduleByFact test invokes the actual picker callback and verifies
  the exact PATCH payload at local midnight, including both DST dates and leap day.

### Dashboard and billing

- Action queue today/follow-up query date, Past schedule-by comparisons,
  calendar lateness and New-for-you business-day aging use Colorado.
- Date-only strings stay literal calendar dates. Date objects and serialized
  instants project to Colorado before queue or season date comparison.
- Pulse crew query uses inclusive Colorado midnight and exclusive next midnight.
  Season selection and revenue year/month use the same Colorado date, including
  December 31 evening.
- Invoice age projects each instant once and subtracts UTC calendar day numbers:
  neither 23-hour nor 25-hour days change the age rule.
- Existing elapsed-time rules for proposal staleness, draft staleness and
  close-to-invoice duration were not converted to calendar-day rules.

### Crew and notification dismissal

- `/api/m/today`: requested `date` is a calendar string; omitted date uses Colorado
  today. All response branches return that date. Historical days include completed
  stops; live days retain their existing completed-stop exclusion.
- Mobile ticket detail and start/complete/work-item write guards share the
  Colorado-midnight past-day check. The route tests verify detail read-only rollover.
- `/api/m/me/week`: requested `startDate` is retained; exactly seven calendar
  buckets; window end is midnight of start plus seven dates, not 168 elapsed hours.
- `/api/m/sync`: matching Today and seven-day windows and Colorado stop buckets,
  including no-crew responses. Existing offline detail/cache payloads are preserved.
- Due-date dismissal requires a supplied, non-null, actually changed instant at
  or after the exclusive end of today's Colorado window. Later times today do
  not qualify. The separate explicitly changed status lookup and `isFinal ===
  "true"` guard are unchanged; moving to a final status still dismisses.

## Timezone-specific regression results

| Environment | API suites | API tests | CRM suites | CRM tests |
|---|---:|---:|---:|---:|
| `TZ=UTC` | 7 passed | 165 passed | 2 passed | 9 passed |
| `TZ=America/Denver` | 7 passed | 165 passed | 2 passed | 9 passed |

Commands, run from the workspace root:

```sh
TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  src/lib/companyDay.test.ts src/lib/scheduleBy.test.ts \
  src/lib/backfillScheduleBy.test.ts src/routes/dashboardQueue.test.ts \
  src/routes/pendingInvoices.test.ts src/routes/ticketOwnerResponse.test.ts \
  src/routes/crewsAndMobile.companyDay.test.ts
TZ=America/Denver pnpm --filter @workspace/api-server exec vitest run \
  src/lib/companyDay.test.ts src/lib/scheduleBy.test.ts \
  src/lib/backfillScheduleBy.test.ts src/routes/dashboardQueue.test.ts \
  src/routes/pendingInvoices.test.ts src/routes/ticketOwnerResponse.test.ts \
  src/routes/crewsAndMobile.companyDay.test.ts
TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run \
  src/lib/schedulingStatus.companyDay.test.ts \
  src/components/TicketSchedulingPanel.companyDay.test.tsx
TZ=America/Denver pnpm --filter @workspace/highplains-crm exec vitest run \
  src/lib/schedulingStatus.companyDay.test.ts \
  src/components/TicketSchedulingPanel.companyDay.test.tsx
```

Coverage includes independent offset-bearing evening/midnight fixtures; Friday
October 9 at 7pm urgent → Monday October 12; other priority rules, unknown/missing
priority, year/leap boundaries, immutable inputs and actual client/server parity;
Dashboard yesterday-at-8pm/follow-up/business-day/pulse cases; crew stop selection,
explicit dates, no-crew branches, seven-day rollups, history and sync; invoice age;
explicit due-date-change dismissal thresholds; rendered selected-date saves.

Independent boundary expectations:

- March 8: `2026-03-08T07:00:00Z` to `2026-03-09T06:00:00Z` = 23 hours.
- November 1: `2026-11-01T06:00:00Z` to `2026-11-02T07:00:00Z` = 25 hours.
- March 6–12 seven-date window = 167 hours.
- October 30–November 5 seven-date window = 169 hours.

The five existing affected suites passed before editing: 112 tests under UTC.
An initial new-test failure was ISO string formatting only (expected strings
omitted `.000`); final runs above pass without changing boundary behavior.

## Baseline failures, separate from F2

- Canonical `pnpm run typecheck` was run before and after. It stops in
  `typecheck:libs` on the same **2** existing diagnostics: missing `File` in
  generated API Zod code and missing `Blob` in generated mobile upload-body types.
  This library build refreshed available declarations before the leaf comparison.
- Because the canonical command stops before checking applications, independent
  API and CRM typechecks were also run before and after.
- API: **739** diagnostics before and after; **0 new** diagnostics after normalizing
  source line/column shifts. Existing categories include legacy route typing,
  missing/incorrect database fields, implicit-any errors and cross-root CRM schema
  imports from existing tests.
- CRM: **225** diagnostics before and after; **0 new** diagnostics. Existing
  categories include stub schema typing, implicit-any, component/library typing
  and incomplete returns.
- This is not a claim that the workspace typecheck passes or that all other
  workspace artifacts were fully checked after the canonical early failure.
- No unrelated baseline fixes were included.

## Runtime and production observations

- API and CRM workflows restarted once after the code batch. API build succeeded;
  development boot logged once through Pino:
  `[companyDay] host timezone=UTC company=America/Denver`.
- Existing dev null-date backfill reported **0 tickets updated**. Schema-drift
  workflow reported the existing schema in sync and required extension present.
- Proxied `/api/healthz` returned HTTP 200. The unsigned-in CRM screenshot renders
  its existing sign-in page. That screenshot is not presented as verification of
  signed-in scheduling interactions; those were checked through route and rendered
  component regressions.
- Deployment metadata reports an existing successful public autoscale deployment
  at `https://app.highplainsprop.com`. It is the pre-F2 deployment.
- A production-log search for `[companyDay]` found no matching line. Therefore
  **production host timezone and F2 rollover behavior remain unverified until
  publishing**, not inferred from the UTC development host.

### Read-only historical production audit

Observed October 12, 2026, before publishing F2:

| Metric | Tickets |
|---|---:|
| Stable `new` / `ready_to_schedule` eligible rows | 78 |
| Non-null stored dates differing from corrected calculator | **6** |
| Non-null stored dates matching corrected calculator | 45 |
| Null stored dates (reported separately; not historical date discrepancies) | 27 |
| `IS DISTINCT FROM`-style difference count including nulls | 33 |

**No production rows were written or repaired. Randy decides whether the six
historical non-null dates should change.** Null rows are not silently classified
as dates written incorrectly at an earlier release.

The audit joined ticket types by both ID and company, and status by ID and ticket
type, and selected stable `status_key`, never editable names. Information-schema
inspection confirmed `created_at` is timestamp without time zone and `schedule_by`
is date. Drizzle's PgTimestamp mapper interprets that timestamp string with a
`+0000` suffix, independent of process TZ. The read-only query explicitly formatted
creation timestamps with `Z` to reproduce this existing application interpretation;
it did not change any stored value or database timezone. Grouped rows were compared
with the actual bundled corrected `computeScheduleBy`; only aggregate counts are
recorded here, without ticket/customer identifiers.

Reproducible read-only audit input:

```sql
SELECT COALESCE(json_agg(row_to_json(grouped)), '[]'::json)::text AS audit
FROM (
  SELECT t.priority,
    to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_utc,
    t.schedule_by::text AS schedule_by,
    count(*)::int AS tickets
  FROM tickets t
  JOIN ticket_types tt
    ON tt.id = t.ticket_type_id AND tt.company_id = t.company_id
  JOIN ticket_type_statuses s
    ON s.id = t.current_status_id AND s.ticket_type_id = t.ticket_type_id
  WHERE s.status_key IN ('new', 'ready_to_schedule')
  GROUP BY t.priority, t.created_at, t.schedule_by
) grouped
```

Compare each row's `schedule_by` to
`computeScheduleBy(row.priority, new Date(row.created_utc))`, weighted by `tickets`;
track null dates separately. Run only via production read-only database access,
not by exposing credentials or reusing a development connection.

## Deferred call sites (unchanged by design)

Located by content rather than the uploaded historical line numbers:

- `artifacts/api-server/src/due-date-notifications.ts`,
  `checkAndSendDueDateNotifications`: host-local today/tomorrow windows and dedup day.
- `artifacts/api-server/src/storage.ts`, communications scheduled-today selection:
  `todayStart` / `todayEnd` from host-local date components.
- `artifacts/api-server/src/routes/routes.ts`, crew worksheet manual creation,
  creation from proposal, current PDF filename and version PDF filename defaults:
  `worksheetDate` fallback based on UTC `toISOString().slice(0, 10)`.
- `artifacts/api-server/src/routes/unsortedEmails.ts`, `resolvedToday` filter:
  host-local midnight and a lower-bound-only query.
- `artifacts/api-server/src/routes/routes.ts`, `resolveDatePreset` this-week /
  this-month date windows: host-local date math.
- `artifacts/api-server/src/routes/routes.ts`, Operations overdue / due-this-week
  campaign windows: host-local midnight and local calendar parsing/arithmetic.

These are follow-up work, not quietly corrected in F2. Other unrelated calendar
calculations discovered during searching (for example contract display and snow
event naming) were not expanded into this scheduling slice.

## Remaining release verification

1. Merge, then publish through the approved user-initiated release flow.
2. Observe production's exact `[companyDay]` boot line and record its host timezone.
3. Confirm live Colorado midnight rollover; do not substitute the development
   log, pre-F2 production logs or unit tests for this production observation.
4. If a fresh discrepancy count is wanted after release, repeat the read-only audit;
   never automatically rewrite existing non-null schedule-by dates.
