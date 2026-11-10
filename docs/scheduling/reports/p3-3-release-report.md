# P3-3 Scheduling release evidence

Verified in development on October 19, 2026. **No publish or production database write was performed.**

## Delivered

- Protected `/dashboard/scheduling` for admin, office and field_manager; sidebar entry immediately after Dashboard, unfiltered Needs scheduling + Slipped badge, English/Spanish labels.
- Uncapped company queue, stable type/status membership, bulk enrichment, exact Colorado winning-open-visit slipped semantics, required ordering/search/type/service filters.
- Standing-crew week board, URL-backed Monday week navigation, optional Sunday, today's highlight, crew colors/supervisors, server-summary open-stop capacity (90% amber; above capacity red).
- Pointer placement/movement/reorder plus Schedule/Move/Edit dialogs and stop up/down buttons. Slipped placement updates its existing visit. Service-filtered reorder fetches the complete open crew-day set and preserves hidden slots. Closed cards are separate; cancelled visits hidden. Internal/non-ticket cards have no ticket-only actions.
- Company-scoped query keys and explicit fetch functions; server-message errors; no optimistic scheduling state; broad invalidation on success/failure. Only transactional `ticketSync` determines ticket-transition feedback.
- Ordered crew-day detail sheet with address/hours/notes/totals and isolated printing.
- Complete ticket Visits history/card, shared Add/Move/Remove, MULTIPLE_VISITS navigation. Stable scheduled capability, not display names or current status, controls the card/edit guard.
- With open planned/in_progress visits, edit Crew/Due date are read-only; the exact **Change in Visits below** hint closes Edit and focuses Visits. Save freshly checks history and omits crewId, dueDate **and legacy routeOrder**. Unknown/failed history is not an empty list. Zero-open and deadline-only saves retain the compatibility payload.
- Removed only Settings → Crews' unlinked-planner warning; optional Planner crew selection remains. Dashboard past-schedule-by rows gained Schedule navigation; queue calculation/count logic is unchanged.

## Schema, contracts and call sites

### Database/service ownership

- `.migration-backup/migrations/0049_visits_service_key.sql` is the next free migration after occupied 0048: nullable service_key and company/service/date index, additive and guarded.
- Both schema copies agree: `lib/db/src/schema/schema.ts` and `artifacts/highplains-crm/src/shared/schema.ts`.
- Ticket visit POST, legacy ticket-PATCH creation (`visitTicketCompatibility.ts`), and P3-2 `backfillVisits.ts` copy ticket service_type.
- New `backfillVisitServices.ts`, statically registered in `routes/routes.ts`, checks schema existence, runs DML only, scopes each company, observes the company scheduling gate, and fills only null ticket-source service keys. It does not overwrite visit-specific values or track subsequent ticket-service edits.
- Existing visit write ordering remains company gate before sorted ticket locks; existing synchronization/compatibility/history rules remain server-owned.

### API and generated consumers

- `lib/api-spec/openapi.yaml` adds the service fields/filters, enriched customer address, scheduling queue, complete ticket history, and VisitRemoval success contracts.
- Regenerated `lib/api-client-react/src/generated/{api,api.schemas}.ts`, `lib/api-zod/src/generated/api.ts`, and generated type files (visit/input/update/list/summary/customer, scheduling queue item/result/customer/visit, VisitRemoval, index).
- `routes/visits.ts` uses generated runtime validators as well as its local extensions; list/summary retain the 62-day bound and planned/in_progress summary/reorder membership.
- New `routes/schedulingQueue.ts` implements GET `/api/scheduling/queue` with two list queries, no 600-row limit and no per-row lookups.
- New `lib/visitQueries.ts` shares same-company joined enrichment between board and GET `/api/tickets/:id/visits`. The history endpoint validates same-company ticket ownership and returns all dates/statuses without changing board bounds.
- DELETE `/api/visits/:id` now returns **200 `{ ticketSync }`**, the actual transaction result, rather than discarding it in a 204. Inventory found no existing mobile/old-planner DELETE consumer. Updated integration expectations, generated consumer response, and the new shared CRM removal caller.

### CRM files/call sites

- Routing/navigation: `App.tsx`, `components/AppSidebar.tsx`.
- Interaction/data: new `lib/scheduling.ts`, `hooks/use-scheduling.tsx`, `lib/multipleVisits.tsx`.
- UI: new `pages/SchedulingPage.tsx`, `components/scheduling/{VisitDialog,TicketVisitsCard,CrewDaySheet}.tsx`.
- Integration: `pages/TicketDetail.tsx`, `components/TicketSchedulingPanel.tsx`, `components/dashboard/NeedsYouQueue.tsx`, `pages/CrewsAdmin.tsx`.
- Supporting changes: `components/DatePickerField.tsx` adds an opt-out for its nested inline-clear affordance (new visit dialogs use the existing popover Clear instead); `index.css` print isolation; `i18n/locales/{en,es}.ts`.
- Tests: new `lib/scheduling.test.ts`, `pages/{SchedulingPage,TicketDetail.visits}.rendered.test.tsx`, API `backfillVisitServices.guard.test.ts`; expanded `routes/visits.integration.test.ts`; adjusted `shared/visits.test.ts`, `pages/CrewsAdmin.links.test.tsx`, and the existing `BillingAccess.regression.test.tsx` query fixture for the new queue query.
- **Unchanged:** old `SchedulePage.tsx`, `WeeklySchedulerPage.tsx`, old planner route, all mobile application files, dashboard queue calculation, billing logic, crew relationships.

## Baseline and regression results

The first attempted baseline overlapped edits and was discarded. A pristine HEAD archive was used for the actual pre-change full-suite baseline. Its temporary checkout was then removed; it is not shipped.

| Check | Fresh baseline | Final result |
|---|---:|---:|
| `pnpm run typecheck:libs` (refresh emitted declarations) | pass | pass |
| API leaf typecheck | 735 diagnostics | 735; **zero per-file/error-code count deltas** |
| CRM leaf typecheck | 221 diagnostics | 221; **zero per-file/error-code count deltas** |
| API full suite, UTC | 1341 pass / 8 fail / 31 skipped | 1356 pass / 7 fail / 31 skipped |
| CRM full suite, UTC | 205 pass / 8 fail | 250 pass / 8 fail |
| Focused API, America/Denver | — | **91 pass**, 4 files |
| Focused CRM, America/Denver | — | **60 pass**, 5 files |
| Final localized Scheduling/TicketDetail/helper tests, UTC | — | **46 pass**, 3 files |
| `git diff --check` | — | pass |

All new scheduling/server/client tests pass. The full workspace is **not globally green**:

- API: six pre-existing mailbox OAuth reconnect tests and one plant enrichment partial test still fail. The pristine baseline also timed out once in an existing reorder integration case (5 seconds); that case passes in the final full and focused runs.
- CRM: five pre-existing useTabParam tests fail because document is unavailable, two crew selection reducer assertions fail, and one rate-card missing-count assertion fails. No new full-suite failures remain.
- API/CRM existing typecheck diagnostics remain; this work introduces no new diagnostic count category. This is baseline-equivalent readiness, not a claim that existing diagnostics were repaired.

Test logs remain in ignored `generated-artifacts/p3-3-validation/`: pristine-api-tests, pristine-crm-tests, baseline/after leaf types, after-libs, after-api-tests, after-crm-tests, focused-api-utc/denver, focused-crm-denver, final-client-targeted.

### Server coverage

Queue membership/sort, a qualifying job older than 605 newer jobs, stable To-Do/Invoice exclusion, no N+1 lookups, role authorization and company isolation; past/future/in_progress winning visits; complete history with closed/cancelled/old/future entries; service copy on all three creation paths; schema-guarded/null-only/idempotent fill; list/summary filters; summary/reorder closed-visit exclusion; actual removal sync; ordinary title-only ticket edits preserving visits. Existing mobile Today/week/notes/flags/photos and P3-2 compatibility tests remain included.

### Client coverage

Rendered Schedule POST and slipped PATCH payloads, moves, full-set filtered reorder, capacity at 89/90/101%, safe source/status menus, server errors and refetch/no stale optimistic state, company switch reset, Monday URL/reload/Back-location restoration, dialog nonnested controls, print portal isolation, translation key parity. Ticket rendered tests exercise planned and in_progress guards, read-only field values, hint target/focus, actual save requests without scheduling keys, zero-open edited crew/date values through the legacy payload, closed/cancelled-only history, unknown/failed/refetching history, stable capability (including an unkeyed “Scheduled” display-name negative case), deadline-only edits, Add/Move/Remove requests, unauthorized roles and MULTIPLE_VISITS navigation.

## Timezone evidence

- Both UTC-host and America/Denver-host runs pass the changed scheduling flows.
- Explicit instant `2026-10-14T02:00:00Z` is **October 13 at 8 pm Colorado**, not October 14. Queue winning-visit/slipped and mobile Today/week cases use that boundary; the client calendar-day test asserts `2026-10-13`.
- Queue/server synchronization use existing `companyToday`/company calendar helpers; client today's highlight/urgency use the corresponding Colorado helpers. Week arithmetic uses calendar strings/UTC day arithmetic, not an instant serialized as a local date.
- DatePicker values use the existing calendar-date parser/serializer rather than timezone-shifting an instant.

## Signed-in acceptance

One browser acceptance pass used a disposable company, two crews, a customer, and three jobs. A targeted follow-up checked only the two failures found by that pass after fixing them.

Confirmed:

1. Scheduling immediately after Dashboard, initial two Needs scheduling plus one Slipped.
2. Placement to a crew/day; cross-crew Move; two-stop sheet reorder; reload preserves both placement and order.
3. Actual Edit PATCH contains unrelated title/description/priority fields but no crewId/dueDate/routeOrder; hint closes Edit and activates Visits.
4. Remove sole planned visit returns it to Needs scheduling only with server transition feedback; due date remains preserved.
5. Slipped move sends one PATCH of the existing visit, with no duplicate POST.
6. After fixing pointer collision fallback and including the header in the drop cell, a real header-target POST and cross-cell/body-target PATCH both use the exact intended crew/date.
7. At 390px, document/body width remains 390px; only board content scrolls horizontally. Queue collapses. A phone-width Move dialog completes its PATCH and closes.
8. No nested button/anchor controls in live Scheduling. New dialog does not use the shared date picker's nested inline Clear.
9. After fixing the portal self-match in print CSS, intercepted print runs once and print media shows all selected crew-day stops/address/totals, with no sidebar or queue.
10. Legacy `/dashboard/schedule` still loads the Weekly Schedule Builder (disposable fixture has no planner crews).

The disposable company/users were removed after acceptance. No real customer records were used.

## Publish-readiness and remaining approval

- Development migration applied successfully; repeat run: **0 applied, 57 already up-to-date**. Required-extension and schema-drift checks pass.
- API and CRM managed workflows are running; CRM restarted after the final UI batch. The signed-in API calls return successful responses. Existing PostCSS/SSL advisory warnings are not new feature failures.
- Generated runtime contracts, mirrored schemas and additive migration agree. No dependency, artifact manifest, planner/mobile application or production changes were needed.
- Ready for the task's normal validation/review and approved merge/publish process, subject to the existing workspace baseline failures above. Before an approved production publish, use the project's normal migration/extension checks; no production migration or publish is claimed here.
- Optional future work, not required for this slice: cross-session board refresh and dirty visit-dialog dismissal protection.
