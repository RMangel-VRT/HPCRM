# F1 — Preserve every open ticket

## Result and scope

`getTickets(companyId, filters)` now returns every matching ticket whose current
status has `is_final = 'false'`, including tickets with no matching status row,
plus the newest 500 matching tickets with `is_final = 'true'`. One bulk
`UNION ALL` statement reads both disjoint selections in a single snapshot.
Both selections use the same effective company/customer/contract/assignee
predicates. The final order is globally `created_at DESC`, not two independently
ordered arrays. Status primary-key uniqueness and the disjoint predicates prevent
duplicate ticket rows.

The signature and flat Ticket payload are unchanged. The historically unused
`status` and `category` options remain unused. Invoice tickets are not hidden,
converted, or special-cased. No scheduling, invoicing, QuickBooks, Dashboard,
batch-action, API-response, or schema behavior was changed.

Billing says **1 charge waiting**, **0 charges waiting**, and **2 charges waiting**.
The independent pending-invoice read and all Billing interactions are unchanged.

## Changed files

| File | Change |
| --- | --- |
| `artifacts/api-server/src/storage.ts` | Status-joined open/closed selection and PERF contract comment |
| `artifacts/api-server/src/lib/getTickets.openCap.test.ts` | Real storage method and real Drizzle query builder, executed against isolated in-memory SQL fixtures |
| `artifacts/api-server/src/lib/ticketLinkSummary.queryBudget.test.ts` | Also verifies the unchanged five-read summary budget for 1,112 linked rows |
| `artifacts/highplains-crm/src/components/BillingView.tsx` | Singular wording only when count is one |
| `artifacts/highplains-crm/src/components/BillingView.count.test.tsx` | Rendered header and empty-state assertions for zero, one, and two |
| `artifacts/highplains-crm/package.json` | Existing `test:billing` command now includes rendered header regressions |
| `docs/f1-open-ticket-cap-report.md` | Caller, validation, and read-only production audit report |

No dependency, lockfile, schema, migration, or configuration changes. Uploaded
F1/F2 specification files were left untouched. Existing memory was read first;
no new non-code-derived project rule was needed.

## Complete caller inventory

Content searches across the repository found eight executable `getTickets`
calls, all in `artifacts/api-server/src/routes/routes.ts`, plus its storage
interface and implementation. No additional direct callers were found.

| Caller | Effect and preserved behavior |
| --- | --- |
| `GET /api/tickets` | Broader open results for Tickets board/list. Authentication and active-company scoping unchanged. Customer/assignee query filters unchanged. Field, chemical, and irrigation managers still have assignee forced to their own user ID. Bulk invoice-link summaries remain attached to all returned rows. |
| `GET /api/tickets/my` | All matching open work for the current assignee; customer/status enrichment and bulk invoice-link summaries unchanged. Company and assignee restrictions remain server-side. |
| `POST /api/tickets/batch` | Existing duplicate scan now sees older open tickets. Its title/type/customer/non-final-status checks and write workflow are unchanged; missing-status tickets are returned by storage but are not newly made duplicate candidates by that existing status-ID check. Route not invoked. |
| `POST /api/admin/migrate-invoices` | Existing admin scan receives broader open results and up to 500 closed tickets. Ready-for-Billing and legacy final-status invoice creation logic unchanged. Neither dry-run nor execution was invoked. Legacy closed scans still do not promise full closed history. |
| `GET /api/reports/:type`, **only `tickets` / Tickets Summary** | Reports all open plus newest 500 closed. Other report types (`customers`, `contacts`, `equipment`, `contracts`) do not call `getTickets`. Report mapping, columns, and response shape unchanged. |
| `migrateApprovedEstimateRequestTickets` | Still called by interactive `POST /api/ticket-types/init-estimate-request` and `POST /api/migrate-approved-projects`. Its candidate/status/scheduling behavior was not edited or executed. |
| `fixEstimateRequestBillingBehavior` | Still invoked during `registerRoutes` startup. Implementation unchanged; no startup or migration entry point was executed for this slice. |
| `migrateEstimateSentToProposalWorkflow` | Still invoked during `registerRoutes` startup. Implementation unchanged; no startup or migration entry point was executed for this slice. |

### Separate reads, not capped `getTickets` callers

- `GET /api/customers/:customerId/tickets` already calls uncapped,
  company-scoped `getTicketsByCustomerId` and attaches bulk invoice-link
  summaries. No cap fix is required there. Other uses of that separate read in
  customer workflows and automation are unchanged.
- `GET /api/pending-invoices` uses its independent uncapped, company-scoped
  pending Invoice selection, with bulk scoped customer/source reads.
- Contract tickets, equipment linked tickets, detail endpoints, Dashboard action
  queue, and mobile-specific ticket endpoints use independent reads. The mobile
  artifact has no consumer of these general CRM ticket list endpoints.

### Indirect UI consumers

| Consumer | Read and behavior |
| --- | --- |
| `TicketsList.tsx` | `/api/tickets` feeds List / By Type / By User. Open/Closed still split on `completedAt`; completed paging remains 10 per page, with count-derived page bounds. No 500-total assumption or top-level truncation exists. Selection's separate 100-item action limit is unchanged. |
| `MyTickets.tsx` | `/api/tickets/my` feeds list and board; existing completion split and closed paging unchanged, with no 500-total assumption. |
| `TicketListView.tsx` | With customer scope, reads the separate customer endpoint; without it, reads `/api/tickets`. Enrichment retains all rows. Existing closed paging and completion split unchanged. |
| `FieldHomeDashboard.tsx`, `FieldCrewDashboard.tsx`, `ShopManagerDashboard.tsx` | Indirect `/api/tickets/my` consumers receive broader open results, with their existing display filters/preview slices untouched. No Dashboard code was changed. |
| `TicketDetail.tsx` | `/api/tickets` supplies its Follow-up Ticket picker. Its separate newest-200 picker slice remains unchanged, is not a TicketsList 500-row assumption, and is documented as a follow-up. |
| `Reports.tsx` | Requests Tickets Summary through `/api/reports/tickets`; inherits the bounded closed-history contract. |

Queries that only invalidate list keys are not additional read callers.

## Validation and refreshed baseline

Before edits, the root typecheck refreshed emitted library declarations. It
stopped on two existing generated api-zod diagnostics, but refreshed the db
declarations. Explicit API and CRM leaf checks established the post-refresh
baseline. Comparisons normalize line/column coordinates, retaining
file/code/message and diagnostic multiplicities.

| Check | Refreshed baseline | After |
| --- | --- | --- |
| Full API Vitest suite | 700 passed / 7 failed; 39 passing / 2 failing files | 714 passed / same 7 failed; 40 passing / 2 failing files |
| Storage selection plus invoice-summary budget suites, final focused run | Storage suite absent; budget had four cases | **19 passed** across two files, including the subsequently added 1,112-row summary case |
| CRM Billing + ticket relationship suites | 18 passed across four files | **21 passed** across five files |
| Updated `test:billing` command | Six library tests | **9 passed**, including three rendered header cases |
| Root `pnpm run typecheck` | Two diagnostics; stops at generated api-zod | Same two diagnostics |
| API leaf typecheck | 739 diagnostics | Same 739; zero added/removed diagnostics |
| CRM leaf typecheck | 225 diagnostics | Same 225; zero added/removed diagnostics |

The full API run preceded the last addition to the existing summary-budget test;
that modified suite and the storage regressions were subsequently rerun together
and all 19 cases passed. The extra summary case adds no product implementation.

The seven unchanged API failures are one `plantEnrichment.test.ts` partial-run
status assertion (`undefined` instead of `partial`) and six
`mailboxAccounts.oauthReconnect.test.ts` cases blocked by the existing Drizzle
trigram-index import failure (`"undefined" is not valid JSON`).
Root generated api-zod still lacks the `File` and `Blob` types. These baseline
issues were not fixed as part of F1.

The selection suite invokes **real `storage.getTickets`**, with real Drizzle
projection, joins, predicates, union, limit, sorting, and result mapping. Its
PostgreSQL proxy executes the generated selection SQL in Node's in-memory SQLite
database; only UNION operand parentheses and parameter notation are adapted.
No selection/filter/order logic is mocked. Session-store creation and the
external database connection are mocked out.

Coverage:

- 600 newer closed tickets, 10 older open tickets: exact returned identities and
  newest 500 closed identities, global order, uniqueness, flat payload keys, dates.
- Additional old and interleaved missing-status rows both returned as open.
- Every effective filter separately and all pair/triple combinations on both
  selections, including no matches and unused status/category option preservation.
- Foreign-company open, closed, and missing-status tickets excluded.
- More than 500 open tickets themselves (610 known open plus two missing-status
  rows): no open cap.
- Invoice-type older open rows retained.
- Exactly one SQL read regardless of ticket count or an empty company.
- Existing invoice summaries remain five SQL reads, including above 500 rows.
- Rendered Billing count for one, two, and zero, including its zero empty state.

Commands:

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/highplains-crm typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server exec vitest run src/lib/getTickets.openCap.test.ts src/lib/ticketLinkSummary.queryBudget.test.ts
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts src/lib/billing.test.ts src/components/BillingView.count.test.tsx src/components/TicketListView.ticketLinks.test.tsx src/components/TicketLinkDisplay.test.tsx src/shared/ticketLinks.test.ts
pnpm --filter @workspace/highplains-crm run test:billing
git diff --check
```

The current proxied CRM preview returned HTTP 502, so a live screenshot could
not be captured. No API restart was attempted: its startup migration calls are
expressly out of scope. Billing rendering was verified with static React
component tests. No browser fixtures, production fixtures, or server startup
were needed.

## Current read-only production audit — 2026-10-12

The exact C1 cap SELECT below was executed unchanged against the production
read-only database, including again after implementation. Historical C1 counts
are **not** being presented as a new measurement.

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

| Measurement | Company | total | open | open_beyond_cap |
| --- | --- | ---: | ---: | ---: |
| Historical C1 (2026-10-08) | `b49cba01-b667-4e4f-87ec-2f65d5937a12` | 545 | 155 | 8 |
| Current F1 (2026-10-12) | `b49cba01-b667-4e4f-87ec-2f65d5937a12` | **547** | **155** | **8** |

The original cap SELECT uses an inner join and cannot count missing statuses.
This supplemental read-only comparison uses a left join, counts missing rows,
and compares every open identity with the new union selection:

```sql
WITH classified AS (
  SELECT t.company_id, t.id, t.created_at, s.id AS status_id, s.is_final
  FROM tickets t LEFT JOIN ticket_type_statuses s ON s.id = t.current_status_id
), closed_ranked AS (
  SELECT company_id, id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC) AS rn
  FROM classified WHERE is_final = 'true'
), selected AS (
  SELECT company_id, id FROM classified
  WHERE is_final = 'false' OR status_id IS NULL
  UNION ALL
  SELECT company_id, id FROM closed_ranked WHERE rn <= 500
)
SELECT c.company_id, COUNT(*) AS actual_total,
       COUNT(*) FILTER (WHERE c.is_final = 'false') AS known_open,
       COUNT(*) FILTER (WHERE c.status_id IS NULL) AS missing_status,
       COUNT(*) FILTER (WHERE c.is_final = 'false' OR c.status_id IS NULL) AS effective_open,
       COUNT(*) FILTER (WHERE (c.is_final = 'false' OR c.status_id IS NULL) AND x.id IS NOT NULL) AS open_covered,
       COUNT(*) FILTER (WHERE (c.is_final = 'false' OR c.status_id IS NULL) AND x.id IS NULL) AS open_omitted,
       COUNT(*) FILTER (WHERE c.is_final = 'true') AS closed_total,
       COUNT(*) FILTER (WHERE c.is_final = 'true' AND x.id IS NOT NULL) AS closed_selected,
       COUNT(x.id) AS selected_total
FROM classified c
LEFT JOIN selected x ON x.company_id = c.company_id AND x.id = c.id
GROUP BY c.company_id;
```

| actual_total | known_open | missing_status | effective_open | open_covered | open_omitted | closed_total | closed_selected | selected_total |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 547 | 155 | **0** | 155 | **155** | **0** | 392 | 392 | 547 |

**Every currently open production ticket is covered by the new selection.**
There are zero current missing-status tickets, and none were repaired.
Production has fewer than 500 closed tickets currently, so all 392 fit;
the 600-closed fixture proves the future closed-history bound. These are
selection-coverage results for unpublished code, not a claim that production
is already running F1.

## Follow-ups and exclusions

Proposed separately:

1. Confirm and support older closed-history requirements for Tickets Summary
   with a dedicated reporting read, rather than removing shared history limits.
2. Make older tickets searchable in TicketDetail's independently limited
   Follow-up Ticket picker.

The admin invoice scan and startup billing fix also remain bounded for closed
history. Full closed-history migration/repair requirements are not implemented
or inferred from this UI fix.

No schema changes, migrations, admin scans, startup migrations, data repairs,
production writes, publishing, or API restarts were performed.
