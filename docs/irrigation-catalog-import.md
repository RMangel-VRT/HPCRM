# IrrigoPro CSV mirror contract

IrrigoPro owns all irrigation part facts. The sole CRM mirror writer is
`irrigationCatalog.import`; there are no item-level editing endpoints.

## Import semantics

- Multipart `file`, at most 5 MiB. No CSV file bytes are retained.
- Header normalization trims, lowercases, and removes spaces, `_` and `-`.
  `fitting_type` and `fittingType`, and `is_active` and `isActive`, are aliases.
  `active` is also accepted. Required headers: sku, name, category, price.
  Extra named columns are ignored; malformed, blank and duplicate normalized
  headers are rejected before any item changes.
- SKU is trimmed, case-sensitive, unique within the company. The first occurrence
  in file order wins, even if invalid; later occurrences are skipped. This avoids
  choosing an arbitrary conflicting value. Category/name must be nonblank.
- Optional blank strings and blank price/cost become null; zero remains zero.
  Unit defaults to `ea`. Money uses the shared exact nonnegative decimal parser.
  Missing/blank active defaults to true. Explicit true/yes/1 and false/no/0 are
  accepted case-insensitively; other values skip the row.
- Rows with malformed quoting, wrong column counts or invalid business values are
  skipped with physical start line and a value-free reason. A valid header and at
  least one valid row are necessary for replacement. Row-level structural errors
  are distinct from an invalid file/header; they produce a partial import.
- Each SKU identifiable at its header position on any row is considered present,
  including invalid and duplicate rows. An existing item for an invalid SKU is
  left untouched, including its lastSeenAt. A missing/shifted SKU cannot protect
  an unidentified item. Every active SKU truly absent from the file is deactivated,
  including during partial imports. Explicit inactive rows stay inactive.
- Counts: `itemsUpserted` is inserts plus business-changed accepted rows, not
  all seen rows. Identical rows update only lastSeenAt. `itemsDeactivated` counts
  previously active absent items transitioned to inactive, not explicit inactive
  values on accepted rows (those count as upserts). `itemsSkipped` counts rejected
  physical records including later duplicates. Already-inactive absences are no-ops.
- The brief's full-file replacement is preserved, with one deliberate safety
  deviation: empty, header-only or wholly invalid files finish as error, without
  replacing/deactivating anything. Valid partial files still deactivate absences.

## Persistence and retained history

The brief is extended with `skipped_rows jsonb`, an array of `{line, reason}` only.
No CSV field values or original file payloads are retained. This minimal addition
allows historical skipped-row details after reload. Runs are company-scoped;
importing-user references become null when the user is removed.

A running run is committed before parsing. All item changes and the successful/
partial terminal run update share one transaction, serialized using a PostgreSQL
transaction advisory lock keyed by company and irrigation namespace. Persistence
failure rolls back all item changes and records a separate error terminal update
with a non-sensitive message. If the database itself is unavailable, neither
history nor a terminal update can be guaranteed until connectivity is restored;
the API returns an explicit failure, never a false success.

## Migration and handoff

`0052_irrigation_catalog.sql` was the next free prefix when allocated; the two
historical 0050 files and 0051 remain unchanged. Run the normal dev SQL migrator.
No startup DDL or dependencies were added. Production schema changes go through
Publish; the already-required pg_trgm extension must exist there first.

No real IrrigoPro export is available in this project. The expected headers and
aliases are tested with synthetic fixtures only; compatibility with a real export
has not been verified.

## Verification

The focused server run passed 181 tests covering the irrigation parser, routes,
real PostgreSQL import/rollback/concurrency, shared CSV/hardscape behavior and QBO
route/parser regressions. The focused frontend run passed 100 tests covering the
irrigation and hardscape rendered pages, Estimates board and navigation config.
One signed-in browser pass with a disposable company verified real upload,
reload/history, identical re-import counts, partial replacement (including
protected invalid SKUs and omitted-SKU deactivation), skipped physical lines,
search/chips/inactive filters, missing-header safety, and navigation back to
Hardscape, Plant Library and Estimates. All disposable records were removed.

`pnpm run typecheck` was run after refreshing shared-library declarations.
Declaration build succeeds, but the root check still fails on existing diagnostics
outside the irrigation implementation (including legacy routes, auth, mailbox
routes and the frontend Drizzle stub imported by server code). No diagnostic
names a new irrigation file or the changed catalog route. Full output is kept
locally at ignored `generated-artifacts/irrigation-typecheck.log`; the root check
must not be represented as passing.
