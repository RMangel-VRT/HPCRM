# Billing view and multi-invoice completion verification

Verified in development on 2026-10-08. No schema changes, SQL migrations, historical repair, publishing, or Git sync were performed.

## Changed files

| File | Change |
| --- | --- |
| `artifacts/api-server/src/routes/routes.ts` | Registers the pending-invoices route and calls the narrowly extracted Invoice completion block from the existing final-status PATCH branch. |
| `artifacts/api-server/src/routes/pendingInvoices.ts` | Company/type/status-filtered uncapped query; explicit admin/office guard; bulk enrichment; source type metadata; Colorado-calendar age. |
| `artifacts/api-server/src/routes/pendingInvoices.test.ts` | Authentication/role boundaries, older-than-500 regression, renamed identities, scoped sources, age fallback and DST tests. |
| `artifacts/api-server/src/lib/invoiceCompletion.ts` | Existing completion comment and parent advancement, with one company-scoped sibling load and one bulk status load before deciding whether to wait. |
| `artifacts/api-server/src/lib/invoiceCompletion.test.ts` | Single Billable Task and Estimate Request, two-invoice sequential completion, standalone and company-isolation tests. |
| `artifacts/highplains-crm/src/pages/TicketsList.tsx` | Role-gated Billing mode and URL handling; hides irrelevant ticket filters in Billing; preserves existing views and scheduling sets. |
| `artifacts/highplains-crm/src/components/BillingView.tsx` | Charge table, states, property grouping, per-viewer preference, Invoice row navigation and scoped query cache. |
| `artifacts/highplains-crm/src/lib/billing.ts` | Role, ordering, grouping and guarded preference helpers. |
| `artifacts/highplains-crm/src/lib/billing.test.ts` | Role, ordering/deduplication, grouping and per-viewer/blocked-storage tests. |
| `artifacts/highplains-crm/src/lib/ticketListReturn.ts` | Allows validated Billing origins so Invoice detail Back returns to Billing. |
| `artifacts/highplains-crm/package.json` | Adds `test:billing`. |
| `.agents/memory/MEMORY.md`, `.agents/memory/colorado-calendar-days.md` | Records the hosting timezone constraint, not implementation history. |
| `docs/c2-billing-report.md` | This verification report. |

## Changed call sites and reused contracts

- `registerRoutes` registers `registerPendingInvoicesRoute(app)` in place of the inline endpoint. Response ticket/customer/source fields remain; `sourceTicket` adds `typeKey`/`typeName` and the row adds `ageDays`.
- `PATCH /api/tickets/:id` still uses `isSeededTicketType` and the existing final-status gate, then calls `propagateInvoiceCompletion`. The same parent final-status ordering, `completedAt`, status-history note and due-date-notification dismissal remain.
- Siblings use existing `storage.getTicketsByIds(ids, companyId)` and `getTicketTypeStatusesByTypeIds`; the parent and source counterparts remain company scoped. No per-row queries were introduced.
- `TicketsList` mounts Billing only for admin/office; denied URL modes fall back. Query keys begin with `/api/pending-invoices` and include viewer/company to avoid another session's stale rows.
- Existing invalidations in `TicketDetail`, `SettingsPage`, and `lib/schedulingStatus.ts` were inspected and reused unchanged. Prefix invalidation reaches the scoped Billing key.
- No general `getTickets` cap change, Dashboard queue change, linked-card hiding, QuickBooks change, or Billing batch actions.

## Test results

### New and focused tests

- Focused API command: `pnpm --filter @workspace/api-server exec vitest run src/routes/pendingInvoices.test.ts src/lib/invoiceCompletion.test.ts src/routes/ticketPatchRfbInvoice.test.ts src/routes/taskBilling.test.ts src/lib/scheduleBy.test.ts`
  - **5 files, 189 tests passed**, including 25 new Billing/completion cases and existing billing/scheduling/sparse-PATCH regressions.
- `pnpm --filter @workspace/highplains-crm run test:billing`
  - **6 tests passed**. Property A–Z/oldest sorting, unique invoice identity, grouping counts, identical-name distinct properties and per-viewer exception-safe preferences covered.
- API workflow build/start passed. CRM build passed with its required `PORT=23878 BASE_PATH=/` environment. Initial bare shell build omitted `PORT` and was corrected; no code fix was needed. Existing large-chunk warnings remain.
- `git diff --check` passed.

### Verified pre-existing failures, separate from new work

- Full API baseline: **675 passed, 7 failed**.
- Full API after changes: **700 passed, the same 7 failed**:
  - `src/lib/plantEnrichment.test.ts`: partial sync status expected `partial`, received `undefined`.
  - Six `src/routes/mailboxAccounts.oauthReconnect.test.ts` cases fail during mocked schema/Drizzle setup with `"undefined" is not valid JSON`.
- Existing CRM tests were separately run excluding the new Billing test file: **7 passed, 5 failed, 3 suites failed to load**. These untouched tests fail with missing DOM (`document is not defined`) and existing JSX transform/import-analysis setup errors. A full run including the initial four Billing tests showed those same failures plus four passing new tests; the final expanded Billing-only command passed all six.

## Baseline-relative typechecks

Workspace library declarations were refreshed before leaf-package baselines so stale declarations were not counted as new failures.

| Check | Baseline | After changes | New diagnostics |
| --- | --- | --- | --- |
| `pnpm run typecheck:libs` | Generated api-zod lacks `File` and `Blob` types | Unchanged library sources | None introduced; library check is not clean |
| API `typecheck` | 740 diagnostics | 739 diagnostics | **None**; removing the inline pending-invoices handler removes one existing TS7030 |
| CRM `typecheck` | 225 diagnostics | 225 diagnostics | **None** |

Diagnostics were compared by file, code and message with line positions normalized. Existing API failures are concentrated in the large route file, imported frontend schema stubs, mailbox routes/tests and other unchanged code. CRM failures are primarily schema stubs and existing proposal/customer/scheduling components. There are no diagnostics in the new Billing/Invoice modules or modified TicketsList/return helper. Neither overall typecheck is claimed clean.

## One development browser journey

The documented dev login returned 401, and the dev company had no types/statuses/properties. Continued the same browser tester with explicitly authorized disposable fixtures instead of changing existing accounts: a temporary company/property, standard workflows seeded by the existing `seedAllTicketTypes`, and temporary admin/office users.

Passed:

1. Created a Billable Task through the authenticated API (`extra_work`, `invoice_required`).
2. Advanced it in the browser through the standard workflow to Ready for billing.
3. The auto-created pending Invoice appeared once in Billing with Task source title/badge and all seven columns.
4. Grouping was initially off, displayed property/count when enabled, persisted through reload, and could be switched off.
5. Clicking the Property cell opened the Invoice, not its parent.
6. Marked the Invoice Invoiced in the browser with its required Invoice Number.
7. UI Back returned to Billing without manual reload; the charge disappeared and the empty state appeared. API confirmed no pending invoices and the parent Task at seeded `closed_won`/Done.
8. A standalone Invoice displayed `Standalone` and its row opened that Invoice.
9. A real isolated Office session saw Billing and the standalone charge. A real isolated crew-supervisor session was denied the Billing deep link and made no pending-invoices request.

Signed-in screenshots covered normal/grouped rows, saved grouping, standalone/office rows, completed Invoice and empty queue. Sorting across multiple live rows was not exercised by the browser fixture; the pure Vitest regression covers that order. Optional work-completed/category fields were left blank and correctly displayed dashes.

All temporary company, property, users/memberships, workflow types/statuses/fields, tickets and checked ticket dependents were deleted. Existing accounts, passwords, company data and production were untouched.

The browser observed two unrelated generic dashboard resource 404s without identifying their sources; no visible Billing error or blocked billing action resulted. These are reported, not treated as a clean application-wide console.

## Deliberate boundaries

- Header follows the requested literal `N charges waiting`, including `1 charges waiting`.
- Colorado dates are explicit because the development host runs UTC; `localDateString` is reused after Colorado-calendar projection without globally changing scheduling timezone behavior.
- Parent completion preserves the pre-existing write ordering. Concurrent Invoice completions and broader cross-login/company cache isolation were proposed as separate follow-ups, not folded into this narrow slice.
- Linked Invoice cards remain visible. C3 stays deferred until the billing manager has used Billing.
