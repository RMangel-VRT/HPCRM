# P2-5 scheduling web release handoff

Validated in development on **2026-10-06**. No Publish was performed and no production data/schema was changed.

## Release decision

**Development scheduling integration passes. Production publication remains pending.**

- P2-1–P2-4 implementations and handoffs are present in this checkout. Confirm all five slices have merged before authorizing the final Phase 2 Publish.
- A production **read-only** `information_schema.columns` check found **none** of `schedule_by`, `accepted_at`, `accepted_by_id`, `follow_up_date`, `follow_up_note` on `public.tickets`. The check was repeated after development integration, with the same result.
- Production log access was available, but there were **no scheduling status migration/backfill deployment entries** to report. Development counts below are not production evidence.
- The seven known unrelated tests and existing TypeScript errors remain. Fix them, or explicitly accept the documented baseline before release; do not treat these checks as green.

## Changed files and call sites

Paths below are relative to `artifacts/highplains-crm/src/` unless stated otherwise.

| File | Changes |
| --- | --- |
| `lib/schedulingStatus.ts` | Shared complete status-set query; old singular response fallback only when the plural field is absent; Colorado calendar-day comparisons, priority preview and cache refresh helper. |
| `components/TicketCard.tsx` | Accepts `schedulingStatusSet`; card indicator uses membership, not a singular-ID comparison. |
| `components/TicketListView.tsx` | Uses the shared set; passes it to cards; list-row scheduling indicator uses membership. |
| `pages/TicketsList.tsx` | Shared set used by scheduling quick filter, list cards and the Kanban column/card prop chain. Default chip wording is translated Needs scheduling. |
| `pages/MyTickets.tsx` | Shared set passed through list cards and both `MyKanbanColumn` / `MyKanbanCard`; list-row indicator uses membership. |
| `pages/TicketDetail.tsx` | Stable type/status authorization, schedule-by fact, owner-response/follow-up panel, crew/date edit hint and official refetch after updates. Non-office owners return to My Tickets after Send back, because the returned job is outside their access scope. |
| `components/TicketSchedulingPanel.tsx` | Accept, required-note Send back, waiting dialog/default today +3, waiting pill, Customer replied and admin/office schedule-by editor. Server errors are visible; Scheduled acceptance feedback uses the actual response status. |
| `pages/NewTicket.tsx` | Contract/Billable priority date preview using P2-1's helper; urgent next-business-day explanation and explicit preview-only disclaimer. |
| `components/dashboard/NeedsYouQueue.tsx` | Labels/icons for New for you, Past schedule-by and Follow-up due; Open navigation; owner scope without office filters. Task's two identity badges share one grid cell, avoiding overlap; small-screen actions have a separate row. |
| `pages/FieldHomeDashboard.tsx` | Existing `field_manager` dashboard gets the scoped owner queue. Other field dashboards remain unchanged. |
| `shared/ticketVisuals.ts` | Extends the existing stable status helper's legacy New fallback; non-null status/type keys retain authority. |
| `i18n/locales/en.ts`, `i18n/locales/es.ts` | Sentence-case default scheduling wording and translated owner actions, scheduling facts, follow-up UI and creation-preview disclaimer. |
| `artifacts/api-server/src/routes/routes.ts` | Ticket details add only company-scoped creator display identity `{id, name}`. Field owners do not fetch the restricted company user directory for Send back feedback. No role permissions or financial/communications access are broadened. |
| `artifacts/api-server/src/shared/taskWebClient.test.ts` | Source wiring regressions for complete status sets, owner controls, official feedback, preview-only copy and scoped field dashboard. |
| `artifacts/api-server/client-tests/schedulingWeb.test.ts` | Runtime status-set, calendar/DST, priority preview and invalidation tests. Cross-artifact tests are outside the API TypeScript compilation root. |
| `docs/scheduling/P2-5-handoff.md` | This validation and release report. |

### Every changed scheduling-ID comparison

All now call `isNeedsSchedulingStatus(schedulingStatusSet, ticket.currentStatusId)`:

1. `TicketCard`: card `needsScheduling` indicator.
2. `TicketListView`: list-row `needsScheduling` indicator.
3. `TicketsList` → `KanbanCard`: Kanban `needsScheduling` indicator.
4. `MyTickets`: list-row `needsScheduling` indicator.
5. `MyTickets` → `MyKanbanCard`: personal Kanban `needsScheduling` indicator.

`TicketsList`'s quick filter already used set membership; it now uses the shared complete set. Both Kanban column/card prop chains and both list/card surfaces pass the entire set. No changed surface retains `currentStatusId === schedulingStatusId`. Custom status display labels are not rewritten by the client.

`TicketDetail` already used stable scheduling status identity in its existing delegation guard; it did not need the stale specification's proposed display-name replacement. New Task/Project/Estimate Request checks use the existing client helpers.

### Reviewed but unchanged

- `Dashboard.tsx` already routes field roles to `FieldHomeDashboard` before mounting admin Pulse/office queries. This routing was preserved.
- `components/dashboard/PulseRail.tsx` already uses the translated `tickets.needsScheduling` key; changing en/es updates its default wording without touching custom workflows.
- `artifacts/api-server/src/routes/dashboardQueue.test.ts` and the existing P2 backend tests already cover queue scoping, future follow-up suppression, existing sources, billing and sparse PATCH behavior.
- `scripts/src/migrate.ts` already applies ordered SQL migrations transactionally and fails on errors; `scripts/post-merge.sh` already runs the development migration command. No script change or new DDL was needed.
- Crew app, scheduling board/visits/calendar, campaign screens, QuickAddToDo/BatchTicketDialog type lookups and historical To-Do conversion were not changed.

## Development integration evidence

Used isolated temporary companies with office, admin, Ops Manager (`field_manager`), crew supervisor, a property and crew. Random credentials were kept only in a permission-restricted temporary file, not committed. All fixtures and accounts were removed afterward.

### Authenticated browser journey

One browser pass covered the critical flow:

1. Office created a **Billable Task**, Normal priority, assigned to Ops Manager, no crew/date. The form explicitly said **Preview only**. Urgent preview was **Wed Oct 7 (next business day)**; Normal was restored before creating.
2. Ticket `cd0d3f13-faf7-4a12-8c0e-b08d91fad0ad` was created New with official `scheduleBy = 2026-10-13`.
3. Manager's existing web dashboard showed **New for you** in Needs you. Open led to detail; Accept produced **Needs scheduling**, retained the date and removed Accept.
4. Waiting on customer defaulted to **2026-10-09** (company today 2026-10-06 +3). Saving a note displayed the waiting pill; Customer replied cleared the active follow-up, retaining history.
5. Existing admin edit dialog showed the scheduling hint. Crew plus due date **2026-10-06** produced official **Scheduled**.
6. Crew supervisor mobile login and `GET /api/m/today` returned **200**. That ticket appeared on Today for **2026-10-06**, crew `45737715-8b12-4f53-b4f5-af7bc4e2fd4c`, mobile status `not_started`. This verifies the existing phone API; no crew app code was changed.
7. Clearing due date in the same editor returned official **Needs scheduling**.
8. Schedule-by **2026-10-05** showed red overdue and **Past schedule-by**. Changing it to **2026-10-06** removed overdue styling.
9. Manager saw read-only schedule-by; admin and office had the editor. Manager queue exposed no Billing/Communications filters and loaded no admin Pulse.

The browser found a crowded Task queue row; the badge fragment was subsequently wrapped in one grid cell and small-screen action placement corrected. Production build and source checks confirmed the fix; no second full browser pass was run. Existing detail resource requests produced some 403/404s unrelated to the changed flow; permissions were not weakened.

### Additional live API checks

Real authenticated development HTTP requests, not mocked responses:

- Pre-dated/crew-assigned New Task `cdbaa60d-fde9-4c9f-b2d5-7fdac8fe6dc2`: Accept returned **Scheduled**, `acceptedAt`/`acceptedById` were set and `scheduleBy = 2026-10-09`. Client success-message selection is additionally covered by source regression.
- Send back `3aa9456b-62a8-493e-8c00-59802380995a`: whitespace note rejected **400**; valid note returned New to the office creator and removed it from the manager's queue. UI disables blank/whitespace submission.
- Follow-up `01ba2024-2490-47df-8e72-c394b8fea88b`: **2026-10-06** appeared as `followup_due`; **2026-10-09** did not. Clearing both fields succeeded.
- Contract Task `ed3361b4-dabb-4bdc-a712-14e54d2efa33`: authoritative `billingBehavior = no_invoice`. Description-only PATCH preserved work type, billing, High priority, assignee and schedule-by. Attempting Ready for Billing returned **422 / CONTRACT_CANNOT_BILL**.
- Manager queue contained only `new_for_you`, `past_schedule_by`, `followup_due`; `GET /api/dashboard/pulse` returned **403**.
- Follow-up verification after creator-display support: manager details returned exactly creator `{id, name}`; the company directory remained **403**. After Send back, ticket details correctly became **403** and the manager queue no longer contained it. Client redirects the non-office owner to My Tickets rather than leaving an inaccessible page.

The pre-scheduled toast and Send back UI were checked by code/source regression plus live API state, not a second browser journey. Contract and sparse PATCH checks were live API and unit checks, not browser coverage.

## Tests and builds

| Check | Result |
| --- | --- |
| Focused Phase 2/client suites | **226 passed**, 9 files. |
| Full API Vitest | **660 passed / 7 failed**, 37 files; baseline before changes was **653 passed / the same 7 failed**. |
| CRM production Vite build | **Pass**, using required `PORT=23878 BASE_PATH=/`; API managed workflow build also passes. Existing bundle-size/PostCSS warnings remain. |
| API typecheck | **740 baseline diagnostics, 740 final**; no new diagnostic categories/files. |
| CRM typecheck | **225 baseline diagnostics, 225 final**; no new diagnostic categories/files. |
| Library declaration refresh | `lib/db` declarations refreshed before baseline comparison. |
| Workspace `typecheck:libs` | Baseline missing `File` and `Blob` declarations in generated `lib/api-zod` remain. |
| Required Postgres extensions | **Pass**, `pg_trgm` present in development. |
| Schema drift | **Pass**, development schema matches Drizzle. |
| `git diff --check` | **Pass**. |
| Workflows/preview | API and CRM running after final code; unauthenticated preview correctly renders sign-in. |

Focused command:

```sh
TZ=America/Denver pnpm --filter @workspace/api-server exec vitest run \
  src/shared/taskWebClient.test.ts client-tests/schedulingWeb.test.ts \
  src/routes/dashboardQueue.test.ts src/routes/schedulingStatus.test.ts \
  src/routes/ticketOwnerResponse.test.ts src/routes/taskBilling.test.ts \
  src/lib/schedulingStatuses.test.ts src/lib/backfillScheduleBy.test.ts src/lib/scheduleBy.test.ts
```

Baseline failures:

- `plantEnrichment.test.ts`: partial-failure run does not receive the expected `partial` DB status.
- Six `mailboxAccounts.oauthReconnect.test.ts` cases: Drizzle/mock initialization fails before reconnect reset, email-mismatch and personal-mailbox autocorrection assertions.
- API/CRM TypeScript baseline and generated `File`/`Blob` gaps above. Follow-up work has been proposed separately; assertions and compiler settings were not weakened to make this release appear clean.

Session logs are in `/tmp/p2-validation/` (ephemeral): `baseline-vitest.log`, `final-vitest.log`, `focused-final.log`, baseline/final API/CRM typecheck logs, `final-crm-build.log`, `live-api-edges.log`, `creator-identity.log`, `cleanup.log`.

## Migration and authorized Publish gate

Development schema is already migrated. Fresh fixture seeding and repeated scheduling migration/backfill calls reported:

```text
Scheduling status migration complete: 0 inserts, 0 renames
Schedule-by backfill complete: 0 tickets updated
```

A real repeat **development API boot**, with the integration tenant/tickets still present, also reported those exact zero-work lines. No development scheduling migration work remained. These counts do **not** establish production execution or the historical number of records migrated.

At an authorized final Publish:

1. Confirm all five slices have merged and the release owner has resolved or explicitly accepted the baseline failures.
2. Use the project's supported **Replit Publish schema-diff flow** to apply P2-1's existing development schema to production **before** the new server starts. Do not add a custom production migration script, deploy-build hook, new DDL or startup DDL. The existing numbered development migration is `.migration-backup/migrations/0042_ticket_scheduling_fields.sql`.
3. Confirm all five production columns and `tickets_company_schedule_by_idx` exist before boot DML. Production schema synchronization and column verification are **pending**.
4. Capture actual production log lines/counts from `migrateSchedulingStatuses` and `backfillScheduleBy`, which run after capability backfill. Production counts are **pending**, not inferred from development.
5. Verify a repeat production boot reports zero new inserts, renames and backfills. Production repeat-boot evidence is **pending**.
6. Smoke-check published owner acceptance, scheduling status, scoped queue and phone Today after the schema and boot checks.

No production migration or deployment evidence is claimed beyond the read-only column check and the absence of scheduling deployment log entries.
