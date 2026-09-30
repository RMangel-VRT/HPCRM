# Scheduling Build: Phase 0 + 1 Rules (paste once at session start)

This pack starts the scheduling rebuild. It turns the **Extra Billable** ticket type into a **Task** type that covers both contract and billable field work, and moves the invoice decision onto each ticket. There's a design doc for context (DESIGN.md), but everything you need is in these slices.

## Order

1. **P0-1**: startup capability backfill matches by type key.
2. **P1-1**: Task type on the server (rename, key, one-time conversion, status maps by key).
3. **P1-2**: billing rules on the server (create, billing switch, status guards).
4. **P1-3**: client (New Task picker, type key on the client, billing toggle, labels).
5. **P1-4**: read-only review list of To-Do tickets marked contract. Report only, no changes.

Merge each slice before starting the next one.

## Rules for every slice

1. **Line numbers are from GitHub commit `bf8ed65`.** Find every site by its content, not by line number.
2. **Never compare ticket-type or status display names in new code.** Use `isSeededTicketType` / `findSeededTicketType` and `isSeededStatus` / `findSeededStatus` from `artifacts/api-server/src/shared/ticketCapabilities.ts`. Display names can be renamed by users; keys can't.
3. **No DDL in this pack.** `type_key` is a text column, so `'task'` is a new value, not a schema change.
4. **Data changes run at boot only as idempotent DML** inside `registerRoutes()`, in the order stated in each slice (see `replit.md` §"Production schema & extensions" and `.agents/memory/startup-migrations-not-wired.md`). `runStartupMigrations()` is never called, so don't add anything to it.
5. **The campaign category `"extra_billable"` is a different thing from the ticket type key `"extra_billable"`.** Campaign code (`campaigns.category`, `extraBillableAccess.ts`, the photo routes, CampaignsList, CampaignDetail, CampaignItemDetail) keeps `"extra_billable"`. **Only the ticket-type key changes.** Before editing any `extra_billable` reference, check which one it is.
6. **PATCH handlers use `pickProvided`** (`lib/patchBody.ts`). Keep it. Never write `result.data` from a `.partial()` parse.
7. **Static imports only** in api-server code.
8. **Tests use vitest** (`pnpm --filter api-server test`). Update existing tests that assert the old key or name instead of deleting them. Run the root `pnpm run typecheck` before finishing.
9. **Report back:** every file changed, every call site touched, test results, and any test failures that existed before your change.