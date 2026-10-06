# Scheduling Build: Phase 2 Rules (paste once at session start)

Phase 2 makes sure **no field job sits assigned without a next date.** New tickets get **Accept / Send back**. Priority sets a **schedule-by** date. "Ready to Schedule" becomes **Needs scheduling**, and a **Scheduled** status is added. Giving a job a crew and a date moves it to Scheduled. The dashboard's "Needs you" queue gains **New for you**, **Past schedule-by** and **Follow-ups due**.

Context: `docs/scheduling/Design.md`. Phase 1 (the Task type, per-ticket billing) is merged and in production.

## Order

| Slice | What | Publish after? |
|---|---|---|
| P2-1 | New ticket columns (one SQL migration), schedule-by helper, office can create tickets | No |
| P2-2 | Status rename + Scheduled status + crew-and-date → Scheduled | No |
| P2-3 | Accept / Send back / Waiting on customer + schedule-by maintenance + backfill | No |
| P2-4 | Dashboard queue sources + scheduling-status endpoint | No |
| P2-5 | Web app screens | **Yes, after this one** |

Merge each slice before starting the next.

## Rules

1. **Line numbers are from GitHub `8cc5cd0`.** Find code by its content.
2. **Never compare type or status display names.** Use `isSeededTicketType` / `findSeededTicketType` / `isSeededStatus` / `findSeededStatus`. Display names can be edited by users, and this phase renames one.
3. **DDL only in the numbered SQL migration P2-1 creates** (`.migration-backup/migrations/0042_…sql`, `IF NOT EXISTS` guards), mirrored in `lib/db/src/schema/schema.ts` **and** the hand-synced client copy `artifacts/highplains-crm/src/shared/schema.ts`. No startup DDL.
4. **Data changes at boot are DML only.** They're idempotent, guarded by an `information_schema` column check, and called from `registerRoutes()` after `backfillTicketTypeCapabilities()`. `runStartupMigrations()` is never called; don't add anything there.
5. **Status changes always write a `ticket_status_history` row**, the same shape the PATCH handler writes (`ticketId`, `fromStatusId`, `toStatusId`, `changedById`, `notes`).
6. **Server-owned fields are never accepted from request bodies.** `acceptedAt` and `acceptedById` are set only by the Accept endpoint. Strip them from `req.body` in `POST /api/tickets`, `POST /api/tickets/batch` and `PATCH /api/tickets/:id` before parsing.
7. **PATCH handlers keep `pickProvided`.**
8. **Dates:** `schedule_by` and `follow_up_date` are calendar dates (`YYYY-MM-DD`) in the company's local day. The crew app already uses server-local time for "today" (Colorado), so do the same and say so in a comment.
9. **Tests use vitest.** Report changed files, call sites, test results and any failures that were already there before your change (the 7 known ones in plantEnrichment and mailbox OAuth).
