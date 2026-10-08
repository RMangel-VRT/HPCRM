# Production has 8 open tickets beyond the 500-ticket cap; the cap was not changed.

## Read-only cap audit (2026-10-08, before browser test fixtures)

The exact SELECT supplied in the C1 sheet succeeded in both environments.

| Environment | Company ID | total | open | open_beyond_cap |
| --- | --- | ---: | ---: | ---: |
| Production | b49cba01-b667-4e4f-87ec-2f65d5937a12 | 545 | 155 | 8 |
| Development | No company rows returned by the supplied query | — | — | — |

Development returned an empty result set, not an access error and not a synthetic
zero count. A second read against the application's development `DATABASE_URL`
confirmed the same empty result. The development database had zero tickets at
audit time. Because the supplied query inner-joins statuses, companies without
matching ticket/status rows do not appear.

```sql
WITH ranked AS (
  SELECT t.company_id, t.id, s.is_final,
         ROW_NUMBER() OVER (PARTITION BY t.company_id ORDER BY t.created_at DESC) AS rn
  FROM tickets t JOIN ticket_type_statuses s ON s.id = t.current_status_id
)
SELECT company_id,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_final = 'false') AS open,
       COUNT(*) FILTER (WHERE is_final = 'false' AND rn > 500) AS open_beyond_cap
FROM ranked GROUP BY company_id;
```

The production cap finding needs a separate fix slice. No production writes,
data repair, cap changes, schema changes, migrations, or publishing were performed
for C1.

## Implementation and changed call sites

- `artifacts/api-server/src/lib/ticketLinkSummary.ts`: server contract and bulk
  service; empty input returns an empty map without reads. Each input ID receives
  `{ invoices: [], parent: null }` unless a safe counterpart is found.
- `artifacts/api-server/src/routes/routes.ts`: attaches summaries to every row of
  `GET /api/tickets`, `GET /api/tickets/my`, and
  `GET /api/customers/:customerId/tickets`. Existing filters, authentication,
  company scoping, and My Tickets customer/status fields are preserved.
- `artifacts/highplains-crm/src/shared/ticketLinks.ts`: independent client contract
  and chip label/state calculation; no server imports.
- `artifacts/highplains-crm/src/components/TicketLinkDisplay.tsx`: display-only
  chip and truncated parent line. No anchors, buttons, or click handlers.
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`: list `TicketCard` and
  `KanbanCard` render both directions; list query/row type retains the summary.
- `artifacts/highplains-crm/src/components/TicketCard.tsx`: shared list card used by
  My Tickets and customer TicketListView renders both directions.
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`: `MyKanbanCard` renders both
  directions; its list query uses the shared enriched ticket type.
- `artifacts/highplains-crm/src/components/TicketListView.tsx`: query rows retain
  the summary through the existing enrichment spread and shared TicketCard.
  Browser verification also exposed an existing nested button in the Tickets
  selection toolbar. Its decorative checkbox is now an aria-hidden span in
  TicketsList and TicketListView, preserving the outer button's selection action.
- Tests: `artifacts/api-server/src/lib/ticketLinkSummary.test.ts`,
  `artifacts/api-server/src/lib/ticketLinkSummary.queryBudget.test.ts`,
  `artifacts/highplains-crm/src/shared/ticketLinks.test.ts`, and
  `artifacts/highplains-crm/src/components/TicketLinkDisplay.test.tsx`, plus
  `artifacts/highplains-crm/src/components/TicketListView.ticketLinks.test.tsx`.
- Test tooling: `artifacts/highplains-crm/vitest.config.ts`, frontend
  `package.json` (`test:ticket-links` and Vitest dev dependency), `pnpm-lock.yaml`.

One `invoice_for` query handles source and target directions. Counterpart IDs
are deduplicated, then one company-scoped ticket fetch, one bulk status fetch,
and one bulk type fetch complete the summary: four bulk operations, independent
of row count. The unchanged all-statuses storage method first fetches company
type IDs, then statuses, so the actual SQL budget is **at most five reads**.
Tests exercising the real storage read methods confirm exactly five SQL reads
for 1, 2, and 500 linked rows, including company predicates.
The existing storage method skips SQL for empty counterpart IDs.
Deleted/foreign-company counterpart tickets are skipped; an additional company
check defends against a storage-adapter regression. Seeded Invoice identity uses
the server helper rather than an editable display name.

Single-invoice labels are `Invoice · Pending` / `Invoice · Invoiced`; multiple
labels include total and non-final count. Colors derive from stable status keys
and the universal status scale, choosing the least-finished state. Parent lines
are shown only for client `typeKey === "invoice"` and use the parent's type hue.
Standalone Invoice cards get no extra markup.

All existing `schedulingStatusSet` call sites and Needs scheduling checks remain
intact. No sparse PATCH, scheduling, invoice completion, QuickBooks, batch, or
ticket-detail behavior was changed.

## Endpoint-to-renderer audit

Content searches covered every `TicketTypeBadge`, `TicketCard`, and
`TicketListView` renderer in the CRM, plus the mobile artifact.

| Consumer | Endpoint(s) | Treatment |
| --- | --- | --- |
| Tickets list / By Type / By User board | `/api/tickets` | Enriched |
| My Tickets list / kanban | `/api/tickets/my` | Enriched |
| Customer Tickets tab (`TicketListView`) | `/api/customers/:customerId/tickets` | Enriched |
| Reusable TicketListView without customer scope | `/api/tickets` | Enriched |
| Dashboard `NeedsYouQueue` | `/api/dashboard/action-queue`, `/api/tickets/:id/details` | Explicitly excluded by C1; untouched |
| TicketDetail | Detail/linked-ticket endpoints | Explicitly excluded; no duplication of detail-link work |
| Contract ticket endpoint | `/api/contracts/:contractId/tickets` | No rows feed the enumerated identity/card components; unchanged |
| Equipment linked ticket list | `/api/equipment/:id/linked-tickets` | Separate renderer, not TicketTypeBadge/TicketCard; unchanged |
| Equipment tickets in Tickets/My Tickets | Equipment ticket endpoints | Separate model/renderers; no `invoice_for` relationships |
| Pending invoices | `/api/pending-invoices` | Explicitly deferred to C2; unchanged |
| Mobile | Mobile-specific ticket renderers/endpoints | Does not consume these CRM components; unchanged |

## Tests and baseline-relative typechecks

| Check | Before | After |
| --- | --- | --- |
| API Vitest full suite | 660 passed, 7 failed; 35 passing / 2 failing files | 675 passed, same 7 failed; 37 passing / 2 failing files |
| New server summary and real-storage query budget tests | Not present | 15 passed |
| New client relationship and customer list rendering tests | Not present | 12 passed |
| Full workspace typecheck | 2 diagnostics, stops in generated api-zod | Same 2 diagnostics |
| API leaf typecheck after library declaration refresh | 740 diagnostics | Same 740; no added/removed diagnostic categories |
| CRM leaf typecheck after library declaration refresh | 225 diagnostics | Same 225; no added/removed diagnostic categories |

Diagnostics were compared by file/code/message with line coordinates normalized,
not by shifted line numbers. No diagnostics mention the new summary/display files.
The workspace blockers are missing `File` and `Blob` in generated api-zod types.

The seven API baseline failures were verified, not assumed:
one plantEnrichment partial-run status assertion (undefined instead of `partial`),
and six mailbox OAuth reconnect tests blocked by the existing Drizzle trigram
index/schema import failure. Those failures remain unchanged.

Commands:

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server exec vitest run src/lib/ticketLinkSummary.test.ts
pnpm --filter @workspace/api-server exec vitest run src/lib/ticketLinkSummary.queryBudget.test.ts
pnpm --filter @workspace/highplains-crm run test:ticket-links
pnpm run typecheck
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/highplains-crm typecheck
```

An exploratory run of all existing frontend tests under the new Node-only config
found two unchanged CrewAssignmentBoard reducer assertions and five useTabParam
tests requiring a DOM (`document is not defined`). There was no existing frontend
test script/baseline command. These are reported separately, not labeled C1
regressions or asserted to be seven known API failures. The added scoped frontend
command runs only C1 tests and passes; it does not replace an existing test command.

## Runtime verification

API and CRM managed workflows restarted successfully. API health and the CRM shell
both return HTTP 200 through the development preview. Schema/required-extension
checks reported in-sync schema and present `pg_trgm`; no C1 DDL was added.

### Browser results and limitations

The documented development test login returned HTTP 401. The browser checker
therefore used intercepted authentication/API responses, not real API-backed
fixtures. It did not change users, application code, or database records.

Verified with browser screenshots/DOM checks:

- Tickets list and By Type board, plus My Tickets list and kanban, display
  `2 invoices · 1 pending`, linked Invoice parent lines, and no relationship
  markup on standalone Invoice cards.
- Parent dots use the Task hue. Relationship elements contain zero anchors or
  buttons; the existing outer card hrefs point to their own ticket IDs.
- Two different Needs scheduling status IDs both render pink indicators, and
  the scheduling count is 2.
- Following a parent card reaches its own ticket URL. The intercepted detail
  payload then caused a TicketDetail error boundary; detail contents are out
  of scope, and that fixture error is not represented as a production defect.
- No comparable DOM-nesting warning appeared in My Tickets. The initial Tickets
  toolbar warning was unrelated to relationship elements and was fixed by
  removing the nested decorative checkbox button, as described above.

The full customer page could **not** be verified in the browser: an incomplete
customer fixture initially caused StatusBadge to throw; a focused follow-up
with corrected customer defaults remained on its loading screen. No further
browser pass was launched. Customer-page console cleanliness and a real
authenticated end-to-end pass remain **verification limitations**, not passing
checks. The single-invoice labels/colors were verified by tests, not browser.

To verify the actual changed customer renderer independently of the unrelated
CustomerDetail fixture setup, four additional rendering tests exercise
TicketListView with its customer-scoped query and the real shared TicketCard.
They pass and confirm summaries survive enrichment, aggregate and single
pending/invoiced labels use the expected universal colors, parent dots/lines
render, standalone cards have no relationship line, each of four cards retains
its own href (exactly four anchors), and both scheduling IDs retain pink rings.

**Total new tests: 27 passed (15 server, 12 client).** No production publishing
or Git synchronization was attempted. C2 is already queued as downstream work;
no duplicate follow-up tasks were proposed.
