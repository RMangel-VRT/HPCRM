# P2-3 acceptance and follow-up handoff

## Scope and behavior

- Added company-scoped Accept and Send back endpoints, registered after authentication middleware.
- Accept locks and rechecks the ticket inside a transaction. It rejects repeat/invalid acceptance, selects the seeded scheduling target, records server-owned acceptance audit fields, preserves existing schedule-by dates and writes `Accepted` history atomically.
- Accept retains Task billing and mirrors PATCH's approved-path billing correction for directly-created Projects.
- Send back locks and rechecks New status and actor access, trims/validates a 1–1000 character note, rejects missing creators, and commits creator reassignment plus actor-authored comment together. It does not change status.
- Follow-up date set/clear writes the requested comments. Note-only/unrelated PATCHes do not. Follow-up-only edits do not trigger the existing crew/date status inference.
- Schedule-by upkeep preserves sparse `pickProvided` semantics. Office/admin explicit dates, including null, win. Unauthorized manual dates are removed before validation/recomputation; existing PATCH actor access remains unchanged. Blank date inputs are omissions, not clear actions.
- Real priority changes in New/Needs scheduling use acceptance or creation day; entering Needs scheduling fills a missing date from the server-local Colorado day, including both Estimate Request approval transition call sites.
- Boot backfill runs after the guarded scheduling-status migration. It is column-guarded DML, serializes concurrent boots, locks eligible ticket rows, uses the shared TypeScript priority calculation from creation day, and updates null values only. There is no new DDL.
- No queue, screen, phone, campaign or historical To-Do changes. No publication.

## Production read-only pre-backfill count

On 2026-10-06, the production read-only query reported **52** eligible Task/Project/Estimate Request tickets in New/Needs scheduling.

Production does **not** yet contain `tickets.schedule_by`; a direct query using that column correctly failed. The successful schema-aware query treats the absent column as null, so 52 is the eligibility count after the planned column migration, not a count of an existing production date column. No production data or schema was written.

```sql
SELECT count(*) AS eligible_count,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tickets'
           AND column_name = 'schedule_by'
       ) AS schedule_by_present
FROM tickets t
JOIN ticket_types tt
  ON tt.id = t.ticket_type_id AND tt.company_id = t.company_id
JOIN ticket_type_statuses s
  ON s.id = t.current_status_id AND s.ticket_type_id = tt.id
WHERE tt.type_key IN ('task', 'project', 'estimate_request')
  AND s.status_key IN ('new', 'ready_to_schedule')
  AND (to_jsonb(t)->>'schedule_by') IS NULL;
```

Result: `eligible_count=52`, `schedule_by_present=false`.

Development startup succeeded and logged `Schedule-by backfill complete: 0 tickets updated` on both observed boots.

## Changed call sites

- `registerRoutes`: runs `backfillScheduleBy()` immediately after `migrateSchedulingStatuses()`; registers owner-response routes after `setupAuth()`.
- PATCH `/api/tickets/:id`: invokes `maintainScheduleBy`, writes explicit follow-up comments, and calls the extracted `notifyTicketAssignment`.
- POST `/api/tickets/:id/send-back`: calls that same assignment notification after commit only for a real reassignment; sends the creator the existing direct-assignee push message.
- PATCH crew-supervisor push fan-out and recipient deduplication are unchanged.
- PUT `/api/tickets/:ticketId/field-values/:fieldId`: Estimate approval fills a missing schedule-by date.
- `migrateApprovedEstimateRequestTickets`: the existing approved-estimate upkeep path also fills a missing schedule-by date.

Assignment notification was previously inline and was extracted without changing its company/recipient, title/customer/old-due-date message, no-op reassignment behavior, or secondary-error handling.

## Changed files

- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`
- `artifacts/api-server/src/routes/ticketOwnerResponse.test.ts`
- `artifacts/api-server/src/routes/taskBilling.test.ts`
- `artifacts/api-server/src/lib/scheduleByMaintenance.ts`
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`
- `artifacts/api-server/src/lib/backfillScheduleBy.test.ts`
- `artifacts/api-server/src/lib/ticketAssignmentNotification.ts`
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`
- `lib/api-zod/src/generated/types/ownerResponseTicket.ts`
- `lib/api-zod/src/generated/types/ticketSendBackInput.ts`
- `docs/scheduling/P2-3-handoff.md`

Existing server/client scheduling columns and request schema fields already match; neither schema copy required edits.

## Verification

- Vitest baseline: **582 passed, 7 failed** across 33 files.
- Final Vitest: **634 passed, the same 7 failed** across 35 files. All **52 added tests** pass.
- Coverage includes owner/admin/office permissions, unrelated actors, renamed types/statuses, invalid workflows, repeat acceptance, audit/history rollback, missing creator, note validation, send-back notification/no-op behavior, follow-up set/clear/omission, approval dates, real/unchanged priority changes, manual date precedence, column guards and null-only backfill rerun behavior.
- API build succeeds; restarted API serves health with HTTP 200. Both new endpoints return HTTP 401 when unauthenticated.
- `git diff --check` passes.
- API typecheck is **not green**: initial stale declarations produced 770 diagnostics. After rebuilding shared declarations, an isolated copy of unchanged HEAD and the final implementation each produce **741** diagnostics, with no added error-code counts by file and no diagnostics in the new implementation modules.
- OpenAPI generation succeeds. The codegen script's subsequent `typecheck:libs` fails on the pre-existing generated upload `File` and `Blob` declarations. These were reproduced before the specification change.

### Verified baseline test failures, not introduced here

- `src/lib/plantEnrichment.test.ts`: partial sync-run status is undefined rather than `partial` (one failure).
- `src/routes/mailboxAccounts.oauthReconnect.test.ts`: six reconnect/email-mismatch/personal-mailbox tests fail while initializing the existing mocked Drizzle trigram index (`"undefined" is not valid JSON`).

These failures remain unchanged and were not repaired outside this slice.
