# P2-1 scheduling foundation handoff

## Scope and deployment

Implemented scheduling columns, create-time schedule-by calculation, acceptance
audit protection, and admin/office ticket creation. No status changes, acceptance
endpoints, historical To-Do conversion, scheduling backfill, queue sources, crew
app changes, or campaign changes. This slice has **not been published**.

## Changed files

- `.migration-backup/migrations/0042_ticket_scheduling_fields.sql`
- `lib/db/src/schema/schema.ts`
- `lib/db/src/schema/calendarDate.ts`
- `artifacts/api-server/src/lib/scheduleBy.ts`
- `artifacts/api-server/src/lib/scheduleBy.test.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/taskBilling.test.ts`
- `artifacts/api-server/src/shared/taskWebClient.test.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `artifacts/highplains-crm/src/shared/drizzle-stub.ts`
- `artifacts/highplains-crm/src/shared/scheduleBy.ts`
- `artifacts/highplains-crm/src/App.tsx`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/dashboard/CommandBand.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- This handoff.

## Schema and date semantics

The SQL, server table, and hand-synced client table agree on `schedule_by` and
`follow_up_date` as string-mode calendar dates, `accepted_at` as a timestamp,
`accepted_by_id` as a nullable user foreign key with `ON DELETE SET NULL`,
`follow_up_note` as text, and the company/schedule-by index.

Both insert validators explicitly validate schedule/follow-up dates and notes,
without defaults. Dates must be real `YYYY-MM-DD` calendar dates (including
leap-year validation). Empty strings become omitted values; explicit null stays
null. The client stub's existing passthrough behavior remains intact; its date
builder now accepts the mirrored string-mode option. Server validation remains
authoritative.

Both date helpers use local calendar arithmetic and local formatting, not UTC
ISO formatting. The documented assumption is the server-local Colorado company
day, consistent with the existing crew app. Browser calculations are previews;
the server is authoritative. Urgent skips weekends; high adds 3 calendar days;
normal/unknown adds 7; low adds 21.

## Changed server call sites

- `POST /api/tickets`: admin/office gate; strips both acceptance audit fields
  before parsing; calculates a missing schedule-by after successful validation
  using the company-scoped resolved seeded Task/Project identity.
- `POST /api/tickets/batch`: same creation role policy and audit stripping;
  validates the three scheduling inputs through a pick of the authoritative
  insert schema; calculates schedule-by for the resolved seeded Task/Project.
  Existing batch access for irrigation managers is removed to meet the explicit
  admin/office-only creation policy.
- `PATCH /api/tickets/:id`: strips both acceptance audit fields before parsing;
  retains `pickProvided`, existing company scope, billing guards, and history.

Create-time null, missing, and empty schedule-by values get a calculated date
for Tasks/Projects; valid explicit dates are preserved. Other types remain
unscheduled, even if the body supplies a date. PATCH can explicitly clear the
new dates/notes. Existing status-history writes and billing rules are unchanged.

## Every changed web permission gate

- `App.tsx`: `/dashboard/tickets/new` allows admin/office.
- `App.tsx`: `/dashboard/tickets` allows admin/office so office can actually reach
  the existing batch-creation buttons, not merely see inaccessible links.
- `AppSidebar.tsx`: Tickets navigation link allows office.
- `TicketsList.tsx`: header New Ticket, Batch To-Do, Batch Invoice, and empty-state
  Create Ticket buttons use the creation gate. Selection/deletion remain admin-only.
- `TicketListView.tsx`: same header creation/batch controls, compact New Ticket
  button, and empty-state button use the creation gate. Selection/deletion remain
  admin-only, and caller options still control which buttons appear.
- `CommandBand.tsx`: New Ticket and Estimate Request shortcuts allow office.
- `QuickAddToDo.tsx`: component explicitly limits its trigger to admin/office.
  Previously it had no internal role guard.

`NewTicket.tsx`, `BatchTicketDialog.tsx`, QuickAdd type lookups, customer-detail
creation links (already admin/office), ticket edit/reassign/delete permissions,
and unrelated navigation/route permissions were not changed.

## Verification and baseline failures

- Before edits: full API Vitest suite had **483 passing / 7 failing** tests
  across 31 files.
- Full suite after implementation/migration:
  `TZ=America/Denver pnpm --filter @workspace/api-server exec vitest run`
  had **548 passing / the same 7 failing** tests across 32 files.
- Final focused run, including two subsequently added permission-entry-point
  checks:
  `TZ=America/Denver pnpm --filter @workspace/api-server exec vitest run src/lib/scheduleBy.test.ts src/routes/taskBilling.test.ts src/shared/taskWebClient.test.ts`
  had **115 passing / 0 failing** tests.
- `pnpm --filter @workspace/scripts run migrate`: applied only
  `0042_ticket_scheduling_fields.sql`; 49 existing migrations were current.
- `pnpm --filter @workspace/scripts run check-schema-drift`: schema in sync.
- `pnpm exec tsc --build lib/db`: passed.
- `pnpm run typecheck`: unchanged baseline failure in generated API types,
  missing `File` and `Blob`; the library-stage failure prevents later stages.
- Separate API and CRM typechecks, compared with a HEAD source snapshot:
  API **741 before / 741 after**, CRM **225 before / 225 after** diagnostics.
  Error-code/file comparisons are unchanged except the pre-existing cross-root
  client-schema TS6059 is now attributed to the parity test's import rather than
  the existing ticket-visuals import. Existing schema-type diagnostics have
  shifted line numbers/type-display details, not new error categories.
- API and web workflows restarted and started successfully. Public preview
  renders the sign-in screen; authenticated changes are covered by actual
  mutation-handler tests and source-based permission checks, not that screenshot.
- `git diff --check`: passed.

The seven baseline Vitest failures are one plant-enrichment partial-run status
assertion and six mailbox OAuth reconnect/mismatch/autocorrection tests:

1. `plantEnrichment.test.ts`: marks partial failure sync run as `partial`.
2. `mailboxAccounts.oauthReconnect.test.ts`: resets `syncErrorCount` to zero.
3. Same file: explicitly includes the zero-valued key.
4. Same file: failed code exchange does not update the mailbox.
5. Same file: shared mailbox rejects an email mismatch.
6. Same file: personal mailbox autocorrects an unclaimed email.
7. Same file: personal mailbox rejects an already claimed email.

No new test failures were introduced. Next work remains the already planned
P2-2 status workflow slice; publishing waits until P2-5.
