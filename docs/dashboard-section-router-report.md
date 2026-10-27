# Dashboard section router verification

## Scope and sources

- Seven live sections in fixed workflow order; Campaigns is a held, noninteractive eighth cell.
- `/api/dashboard/sections` is authenticated, active-company scoped, and filters sources before loading them. Billing visibility follows navigation, **not** the broader direct-route billing permission.
- Estimates calls the exported board loader with no type filter and one request time. Scheduling calls the same uncapped loader as its queue route. Invoicing calls the same `scope=all`, waiting-population loader as pending invoices, including linked-job suppression.
- Inbox reuses communication statistics and resolves mailbox access before looking up oldest work. Flags uses the sidebar's company-scoped `status=new` predicate. Contracts reuses upcoming renewals within 60 days. Mine uses caller assignment, nonfinal/actionable status identity, and excludes other sections' lifecycle ownership.
- Each source uses its own clock. Invoicing retrieves only the permitted charge/source tickets' ready-for-billing history. Missing legacy transition dates are not replaced with stale scheduling deadlines. Standalone invoices enter billing at creation.
- All sections return `flow: null`. There is no weekly transition scan, schema change, migration, or production write.
- Source loads run concurrently. The present implementation has a maximum of 27 source SQL queries for an admin, independent of ticket volume; empty sources skip unnecessary queries. Neither ticket population nor summary counts are silently capped. Only oldest-item lookups use `LIMIT 1`.

## Consumer audit and retirement

The implementation-base audit found **two**, not one, UI consumers:

1. `pages/Dashboard.tsx`: queue replaced in its existing grid slot; CommandBand, PulseRail, SchedulePreview, pulse fetching, and dashboard role branches retained.
2. `pages/FieldHomeDashboard.tsx`: field-manager-only embedded queue replaced by the permission-filtered router. The rest of the separate field dashboard is unchanged. This small additional replacement was necessary to retire the shared queue safely.

Retired queue cache invalidations were found and replaced in:

- `components/BillingView.tsx`
- `pages/TicketDetail.tsx`
- `lib/scheduling.ts`
- `lib/schedulingStatus.ts`

Additional test consumers were `api-server/client-tests/schedulingWeb.test.ts` and the field-manager placement assertions in `api-server/src/shared/taskWebClient.test.ts`; both now expect section summaries/router.

`NeedsYouQueue.tsx`, the action-queue handler, queue response/action/source types, and queue-only helpers/tests are removed. No other application importers of those types or that endpoint were found. The pulse handler, its shared date/revenue/type helpers, and pulse tests remain in `dashboardQueue.ts` and its test file.

`AppSidebar.tsx` is unchanged. Its independent badge-source consolidation is deferred, with special care required because its unsorted-mail population differs from the Inbox tile's drafts/follow-ups.

## Automated verification

- Focused API suite: **103 passing tests**, covering summaries, actual PostgreSQL empty-company/date behavior and destination parity, board behavior, pending-invoice duplicate suppression, pulse preservation, and scheduling invalidation.
- Existing visits integration suite: **68 passing tests** in the broader integration run, including actual Needs scheduling/Slipped winner semantics. The first run also exposed a missing required fixture field in the newly added test; this was corrected, and the standalone new integration suite subsequently passed.
- The updated field-manager placement assertion passes in isolation. Running the entire `taskWebClient.test.ts` file exposes one **inherited** assertion that expects an obsolete Tickets navigation shape. Its failing navigation code/assertion is unchanged by this slice.
- **8 passing** SectionRouter component regressions cover fixed order, held/hidden cells, whole-tile links, loading/error behavior, permission/billing visibility, cache scoping, responsive rules, and overdue 3-to-0 slot stability.
- `git diff --check` passes.

### Fresh typecheck baseline

Shared declaration refresh (`tsc --build`) succeeds. Root `pnpm run typecheck` fails on **735 existing API diagnostics** both before and after this change. Normalized diagnostic comparison finds **zero introduced diagnostics**.

Because recursive root checking stops on the API failure, CRM was also checked independently. A separate unmodified `HEAD` snapshot, using the refreshed shared declarations, reports **221 CRM diagnostics**, as does the final CRM check; normalized comparison again finds **zero introduced diagnostics**. No unrelated type cleanup was attempted.

Detailed command output is in ignored `generated-artifacts/section-router-*.log`.

## Browser verification

The documented demo login was absent from this development fork. Verification therefore uses only a disposable development company/account, never resets an existing password, and removes the fixtures afterward.

The first authenticated empty-company check found a PostgreSQL date/text COALESCE mismatch in Mine. The expression was corrected to coalesce two dates before serialization and to interpret the stored UTC due timestamp in Colorado. Real PostgreSQL regressions now cover this exact failure.

Final browser verification passed:

- Live empty company: HTTP 200 with seven zero summaries.
- Live Estimates: board stages 2 + 2 + 0 + 0 + 0 = **4**, matching the tile.
- Live Scheduling: Needs scheduling 1 + Slipped 1 = **2**, matching the tile; 1 overdue.
- Both destination screens opened correctly. Tile navigation issued GET requests only.
- Seven single-link tiles, no nested actions; Campaigns has neither count nor link.
- Visible keyboard focus; light and dark themes; two columns at 1000px and one at 540px, without horizontal overflow.
- Every tile measured **200px** high. Synthetic overdue 3-to-0 with constant total and changing oldest text preserved **every tile's 137×200px box and order** at desktop, as well as the pulse rail's position.
- Synthetic HTTP 500 displayed an explicit error and dashes, never zero totals.
- All disposable company/user/ticket/type/visit fixtures were removed.

Screenshot references and measurements are recorded in `generated-artifacts/section-router-browser/report.txt`. Populated/destination parity and the initial empty-company check used real endpoint data; intercepted empty/overdue responses were used only for layout/error evidence.

The browser reported two unrelated 404 resource errors from `/api/customer-visit-configs` and `/api/schedule-blocks`. Both query consumers already exist in the unchanged `SchedulePreview.tsx` at `HEAD`; this slice leaves that component and its behavior untouched. Synthetic sections failure and direct retired-endpoint checks also deliberately generate resource errors. No router runtime exception was observed after the PostgreSQL fix.

Screenshot inspection prompted a final token-only dark destructive-text contrast improvement and smaller section labels to keep Scheduling readable inside the preserved four-column dashboard slot; tile geometry is unchanged.

## Deliberately deferred

- Sidebar badge consolidation.
- Weekly flow metrics and their separately reviewed index migration.
- Campaigns counts/action ownership until the planned visits phase.
- Proposal monetary totals; their visual space is reserved without an invented amount.

No publishing, native-mobile changes, route-role changes, database DDL, or production writes were performed.
