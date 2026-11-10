# P2-4 handoff

## Changed files and call sites

- `artifacts/api-server/src/routes/dashboardQueue.ts`: `GET /api/dashboard/action-queue` adds `new_for_you`, `past_schedule_by`, and `followup_due`. The main query includes Needs scheduling across types; a separate company/date-bounded query excludes final statuses and includes Scheduled/custom-open follow-ups. Metadata covers custom types/statuses, and records merge by ticket ID before classification.
- `artifacts/api-server/src/routes/dashboardQueue.test.ts`: queue/source/date/role/company/query-bound coverage; the existing source assembly and Pulse tests remain.
- `artifacts/api-server/src/routes/schedulingStatus.ts` and `schedulingStatus.test.ts`: focused registration and endpoint tests for the complete Needs scheduling set, including Task and multiple matching statuses per type.
- `artifacts/api-server/src/routes/routes.ts`: registers the extracted scheduling-status route at the existing call site and URL.
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`: mirrored source union and explicit filter/count handling for scheduling sources. Scheduling items appear under All and do not increment unrelated category counts. Optimistic helpers preserve those counts.

Existing ticket and communication PATCH call sites, `pickProvided`, billing guards, status-history writes, schema, and Pulse authorization were not changed. PulseRail does not consume QueueSource, so it requires no compatibility edit.

## Access and contract

- Admin and office retain the full queue.
- Other authenticated ticket owners receive only their assigned Task/Project scheduling signals in their active company. No other assignees, unassigned work, invoice/estimate work, billing-stage items, contracts, communications, or inline queue mutations are exposed by that response.
- Creator names are resolved through company membership; missing creators are explicitly labeled Unknown creator.
- Calendar comparisons use server-local Colorado dates, with a comment matching the existing scheduling date convention. New aging counts weekdays after the creation day; lateness uses calendar days and does not depend on a 24-hour duration across DST.
- `schedulingStatusIds` is authoritative; `schedulingStatusId` remains the first ID or null. Existing singular client callers remain compatible; migration of visible ticket/dashboard screens belongs to P2-5.

## Verification

- Before editing: `pnpm --filter @workspace/api-server test` — 634 passed, 7 failed, 641 total.
- After implementation: the same full Vitest command — 653 passed, 7 failed, 660 total. All 26 tests in `dashboardQueue.test.ts` and `schedulingStatus.test.ts` pass.
- Both full runs have exactly the same baseline failures:
  - `src/lib/plantEnrichment.test.ts`: partial sync status assertion receives undefined.
  - Six tests in `src/routes/mailboxAccounts.oauthReconnect.test.ts`: existing Drizzle/index mock initialization fails with invalid JSON.
- `pnpm --filter @workspace/api-server typecheck` and `pnpm --filter @workspace/highplains-crm typecheck` fail before and after this slice. After refreshing library declarations, there are no new diagnostic categories (normalizing line shifts and regenerated target-type text), and no errors in the changed queue/status/client compatibility code. CRM reports the same 225 diagnostics; API diagnostics decrease from 786 to 740 as stale declarations refresh and the old route is removed.
- `pnpm run typecheck:libs` remains blocked by missing `File`/`Blob` types in unchanged generated API-Zod files.
- `git diff --check` passes.
- API and CRM workflows restart and serve successfully. Unauthenticated requests to queue, scheduling-status, and Pulse each return 401. The CRM public sign-in page renders correctly; authenticated queue behavior is verified by endpoint tests, not the public screenshot.

No DDL, publication, or visible P2-5 screen implementation was performed. Merge this slice before starting P2-5; publish only after P2-5 release validation.
