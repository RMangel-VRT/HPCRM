# Invoice Center IC1 verification

## Scope and migration

Migration: `.migration-backup/migrations/0060_invoices.sql`.

The strict development migration runner applied one new migration. Its next run
reported **0 applied, 0 baselined, 70 already up-to-date**. The PostgreSQL
integration suite executes the SQL twice more and compares index definitions
before/after. Required-extension and schema-drift checks pass.
No historical migration changes, startup DDL, seed step, production writes or
publication. Real test data uses disposable companies and is removed afterwards.

The new company-scoped `invoiceCenter` flag defaults off. No real-company
settings were enabled. Only new `/api/invoices` routes are registered; existing
estimate, ticket, pending-invoice, campaign and snow billing behavior is
unchanged. No visible UI was added.

## Numbering evidence

The first three **committed disposable development fixture** numbers were:

| Prefix | First | Second | Third |
|---|---|---|---|
| MA | MA-1001 | MA-1002 | MA-1003 |
| SN | SN-1001 | SN-1002 | SN-1003 |

The next ten simultaneous MA creates produced distinct contiguous sequences
1004–1013. Cancellation retained its assigned number, and the next committed
create incremented rather than reusing it. Failed creates rolled back the
counter. These are fixture results, not seeded invoices in an actual company.

## New tests

**107 passing tests across four new files:**

| File (relative to `artifacts/api-server/src`) | Count |
|---|---:|
| `services/invoiceMath.test.ts` | 26 |
| `services/invoiceFeature.test.ts` | 10 |
| `routes/invoices.test.ts` | 42 |
| `services/invoices.integration.test.ts` | 29 |

Focused command:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/services/invoiceMath.test.ts src/services/invoiceFeature.test.ts \
  src/routes/invoices.test.ts src/services/invoices.integration.test.ts \
  --maxWorkers=1
```

Coverage includes nullable pricing, half-up decimal extensions, int32 extension/
subtotal overflow and full transaction rollback, explicit null clears and
omission preservation, strict PATCH/create/list input, real calendar dates,
readiness problems/line IDs, all ten routes' role/auth/company/flag/no-store/error
boundaries, fail-closed database/settings failures, independent and parallel
number allocation, cancelled-number retention, parent bill-to acceptance,
customer changes only with zero lines, invoice/company line membership, both
prefix mismatch directions, complete reorder membership and event rollback,
concurrent line order/totals, all status/liveness targets through the single
writer, source uniqueness/release, frozen/QBO field non-writes, list query
budget/search/filtering, deterministic line/history ordering, JSON serialization
and the complete server-side HTTP draft CRUD/cancel/history flow.

Browser tests were not needed: this is a server-only change with real HTTP and
PostgreSQL coverage, not a changed browser journey.

## Existing-suite baseline

The baseline was started before editing existing modules. Root typecheck,
the full API suite and the full CRM suite ran sequentially, with at most two
Vitest workers. Final suites use the same order/worker limit.

| Check | Before | After |
|---|---|---|
| Full API suite | 2184 passed, 7 failed, 74 skipped; 113 files | 2291 passed, 7 failed, 74 skipped; 117 files |
| Full CRM suite | 816 passed, 10 failed; 71 files | 816 passed, 10 failed; 71 files |
| Root `pnpm run typecheck` | 730 pre-existing diagnostics; fails in API package | 730 diagnostics; zero new file/error-code categories |

Both final suites have the **identical individual failing-test set** as their
recorded baseline, not merely the same failure counts. The API's additional
107 passing tests are exactly the four new invoice suites. All existing
estimate and legacy billing tests preserve their baseline results.

Recorded API failures:

- `src/lib/plantEnrichment.test.ts`: 1 failure, partial failure run status.
- `src/routes/mailboxAccounts.oauthReconnect.test.ts`: 6 failures: reconnect
  resets `syncErrorCount`, explicitly persists that field, avoids update on code
  exchange failure, shared-mailbox email mismatch, personal email auto-correction,
  and rejection when the corrected address is already claimed.

Recorded CRM failures:

- `src/components/CrewAssignmentBoard.test.ts`: 2 failures, cross-column shift
  selection and pruning selected IDs.
- `src/components/TicketConversation.rendered.test.tsx`: 1 failure, empty-state
  composer/navigation.
- `src/hooks/useTabParam.test.ts`: all 5 tests, default tab, reading tab,
  preserving other parameters, updating only tab, adding tab.
- `src/pages/TicketDetail.visits.rendered.test.tsx`: 1 failure, Overview
  Conversation card.
- `src/components/contracts/rateCardUtils.test.ts`: 1 failure, missing-rate
  grouping/count.

Raw baseline/final logs and machine-readable final results are retained under
ignored `generated-artifacts/ic1/`, outside Git and deployment inputs.

## Typecheck and driver-free contract

`pnpm run typecheck` refreshes composite library declarations first.
The database library passes, and root diagnostics remain **730 before and 730
after**, with **zero delta by source file and TypeScript diagnostic code**.
None names any new invoice file. The root command still exits nonzero because
of existing API/legacy/frontend-stub diagnostics; this is not reported as a clean
root check. Mobile, sandbox and scripts checks finish successfully; the root's
recursive fail-fast output does not establish the CRM leaf's final status.

`@workspace/db/invoice-contracts` also bundles successfully for a browser.
The bundle input graph contains **no PostgreSQL or Drizzle modules**.

## Running API and cleanup

The bundled API rebuilt and restarted successfully. Proxied `/api/healthz`
returns 200 `{"status":"ok"}` (also visually captured); anonymous
`/api/invoices` returns 401 with `Cache-Control: no-store`.

An earlier restart while the full API suite's temporary workflow fixtures
were active hit the existing scheduling-startup consistency check. Restarting
after that suite finished succeeded without changing scheduling code or
business data. This did not add any test failures.

Post-verification development counts confirmed zero invoices, zero disposable
invoice companies, and zero settings rows containing the new flag. No real
company was enabled and no fixture invoices remain.

## Changed files

- `.migration-backup/migrations/0060_invoices.sql`
- `lib/db/src/schema/invoices.ts`
- `lib/db/src/schema/index.ts`
- `lib/db/src/invoiceContracts.ts`
- `lib/db/package.json`
- `artifacts/highplains-crm/src/shared/schema.ts` (driver-free re-export only)
- `artifacts/api-server/src/lib/invoiceAccess.ts`
- `artifacts/api-server/src/services/invoiceErrors.ts`
- `artifacts/api-server/src/services/invoiceFeature.ts`
- `artifacts/api-server/src/services/invoiceMath.ts`
- `artifacts/api-server/src/services/invoiceReads.ts`
- `artifacts/api-server/src/services/invoices.ts`
- `artifacts/api-server/src/routes/invoices.ts`
- `artifacts/api-server/src/routes/routes.ts` (new import and registration only)
- `artifacts/api-server/src/services/invoiceMath.test.ts`
- `artifacts/api-server/src/services/invoiceFeature.test.ts`
- `artifacts/api-server/src/services/invoices.integration.test.ts`
- `artifacts/api-server/src/routes/invoices.test.ts`
- `docs/data-ownership-map.md`
- `docs/invoice-center-draft-api.md`
- `docs/invoice-center-ic1-verification.md`
- `.agents/memory/invoice-center-direction.md` (scope precedence clarification)
