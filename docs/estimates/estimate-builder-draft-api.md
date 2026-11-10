# Estimate Builder: model and draft API

## Scope and deployment

Server-only draft storage/API. No builder UI, lifecycle transitions, price
refresh, ticket-status changes, QuickBooks calls, PDFs or palette rendering.
No existing tables/columns, board behavior or catalog/rate-preview contracts
were retired or replaced.

`0056_estimates.sql` was the next free migration number. Apply through
`pnpm --filter @workspace/scripts run migrate` in development/post-merge (the
existing post-merge script already does this). It is guarded and re-runnable.
No new extension, startup DDL, seed step or production-targeted script.
Production schema follows the existing platform schema process in `replit.md`;
this task did not publish or modify production.

The ownership map records document identity/number/title, version state,
section grouping/order and captured commercial facts separately. Tickets
still own job lifecycle. `createEstimate` alone allocates numbers and assigns
the ticket's compatibility number in the creation transaction. Catalog, rate
card and signed-term facts keep their existing owners.

## Frontend-safe contract

Import request validation/constants/DTOs from
`@workspace/db/estimate-contracts` (also re-exported by CRM's shared schema).
This subpath loads only Zod, not PostgreSQL, Drizzle or the frontend stub.
The SQL schema is exported by `@workspace/db` from its dedicated estimates
module. Driver-free DTO timestamps are ISO strings; service-internal timestamps
are Dates and Express serializes them.

All endpoints require admin/office, an active session company, the existing
`estimateAccess` guard and `Cache-Control: no-store`. Supply `X-Company-Id` as
the initiating company's expectation, never as authorization.

- `GET /api/estimates`: bare list array, with `customerId`, `ticketId`, `search`
  (title/number/customer-name substring) and `includeVoid=true|false` filters.
  Default excludes voided containers. Updated descending with ID tie-break.
  At most two batched data queries, independent of result count. Draft totals
  use captured lines; non-draft list totals use frozen subtotal (null if an
  externally-created non-draft has not been frozen, never a live fallback).
- `POST /api/estimates`: `{customerId,title,ticketId?}`; status 201.
- `GET /api/estimates/:id?version=N`: current version by default; explicit
  positive integer selects numbered history.
- `PATCH /api/estimates/:id`: `{title}`.
- `POST /api/estimates/:id/versions/:versionId/sections`: `{name}`; status 201.
- `PATCH .../sections/:sectionId`: `{name?,sortOrder?}`.
- `DELETE .../sections/:sectionId`: deletes captured lines in that section.
- `POST .../versions/:versionId/lines`: strict line-type union; status 201.
- `PATCH .../lines/:lineId`: explicit no-default draft fields.
- `DELETE .../lines/:lineId`.

Every create/mutation/detail response is `EstimateDetailDto`: container
fields plus `versions` (descending summaries) and `version` (affected version
for section/line edits, current otherwise). `version.sections` includes ordered
`lines`; `version.totals` is authoritative. Empty sections have zero subtotals.
Sections/lines order by sort order, created time, then ID for stable ties.
Deletes return 200 with that same refreshed envelope, not 204.
Empty PATCH and unknown/lifecycle fields are rejected, never silently stripped.

Static catalog/rate-preview routes are registered first. The existing
ticket-based Estimates board remains separate and unchanged.

## Quantities, money and margin

- Quantities accept decimal strings or plain numeric JSON with at most two
  decimal places; stored/read as canonical two-place strings. Allowed range
  `0.01`–`9999999999.99` (`numeric(12,2)`). Exponents, signs, whitespace,
  unsupported precision and zero are rejected rather than rounded.
- Client money fields are nonnegative integer cents, at most `2147483647`.
  Plant dollar strings are converted exactly; no `parseFloat`, multiplication
  by floating 100, or unsafe Number intermediate arithmetic.
- `calculateExtendedCents` is the only stored extended-amount calculation.
  POST and every PATCH recompute it using BigInt hundredths and half-up
  rounding. `2.5 × 33 cents = 83 cents`. Costs use the same rounding.
- `computeVersionTotals` is exported and pure. It recomputes from snapshot
  values, never trusts stale stored extensions or joins source prices.
  Subtotal/known-cost totals must fit signed integer cents as required by
  future frozen fields. An overflowing write rolls back in full.
- `materialMarginPct` uses percentage points (50 means 50%), rounded half-up
  to four decimals. Only known-cost lines contribute to its revenue
  denominator. Zero known-cost revenue returns **null**, including when a
  zero-price line has known positive cost: margin is undefined, not 0 or NaN.
- Known zero costs remain known. Unknown cost increments `costUnknownLines`;
  it is never treated as zero cost. All six umbrella buckets are always present.

## Source and edit semantics

All source reads happen inside the line-creation transaction. Plant references
are size-row IDs, not variety/product keys. `PLANT_DEFAULT_PRICE` is exported:
twice known wholesale cost (including zero), otherwise sale price, otherwise
zero. Plant palette inclusion defaults true; every other type defaults false.

Hardscape/irrigation snapshot source names, units, category/SKU details, price,
cost and umbrella. Quick-list equipment/fee references must match the line's
kind and snapshot its label, unit, optional rate and umbrella. Inactive/foreign
sources are indistinguishable 404s. Free equipment/fee/custom entries remain
available; reference-plus-client-price requests are rejected.

Labor loads the existing rate context through the transaction and passes
that same context into `resolveEstimateRate`. Existing callers and governing
term/contract-first/exact-key behavior remain unchanged. Active card line
determines irrigation versus landscape labor umbrella; contract term IDs are
captured. Missing rates reject 422. Text-only rates preserve source/detail,
use zero cents and expose `needsPrice`; a missing source unit uses `hour`.

Source deletes only clear provenance FKs. Prices/costs/names/units/umbrellas
on existing lines never refresh, even after source changes/deletion. Later
unit-price edits changing the current price mark `priceSource=manual` and
retain provenance; same-price, quantity and permitted display/palette edits
preserve source. Manual zero prices are valid without `needsPrice`. Other
zero prices expose it.

Names/details/units/umbrellas can change only on equipment/fee/custom;
palette fields are plant-only. Moves are within the version. Explicit null
clears nullable fields; omitted fields remain unchanged.

## Transactions and errors

Every existing-estimate mutation starts by locking the company-qualified
container `FOR UPDATE`, then verifies ownership down to version/section/line.
This serializes line totals and simultaneous section deletes; the last
section cannot be deleted. Version/section/container timestamps are updated
as affected. Retitling affects the container timestamp only.

Creation locks a linked company-owned ticket, validates seeded identity and
matching operational customer, checks live duplicates, atomically upserts the
company/Colorado-year counter, inserts the container/v1/Main, sets current
version and writes the ticket mirror, all in one transaction. A failed create
does not consume a number or leave partial rows. PostgreSQL partial unique
indexes remain the final authority for live ticket, draft and accepted
uniqueness. Source FKs set null; customer deletion cascades, matching tickets.

Errors use `{error}`: 400 invalid/restricted input or parent/mismatched ticket,
401/403 access, 404 inaccessible records, 409 conflicts/voided estimates/
last-section, 422 unset rate or amount overflow. Non-draft section/line edits
return exactly `{error:"VERSION_LOCKED"}`. Duplicate live tickets return 409
with `existingEstimateId`. Other unique conflicts are generic 409. Unexpected
errors log only a sanitized code and return generic 500; no body, customer
data, raw error objects or PostgreSQL detail is logged by these handlers.

## Verification

- Migration applied via strict runner and re-executed twice in real PostgreSQL.
  Required-extension and schema-drift checks pass.
- 31 pure math/strict-contract tests, 35 route tests and 24 real-PostgreSQL
  integration tests cover numbering including Colorado New Year and concurrent
  creates, unique/CHECK constraints, ticket races and mirror rollback, source
  snapshots/deletions, all seven line types, exact totals/overflow, PATCH/null
  safety, moves/ownership, last-section races, lifecycle gates, list/history,
  and admin/office versus all field roles and cross-company IDs.
- Existing catalog, irrigation catalog, estimate setup, real-DB setup, rate
  resolver and ticket-based board suites pass (190 regression tests).
- Final combined run: **280 tests pass across 9 suites**. The bundled API
  workflow rebuilt and started successfully; the proxied health endpoint
  returns 200 and anonymous estimate access returns 401 with no-store.
- Full root `pnpm run typecheck` was run before edits and after refreshing
  library declarations. Libraries pass. The root check still stops at the
  pre-existing API errors: **730 diagnostics before and after, zero change in
  counts by file/error-code category**. Existing areas include legacy route
  handlers (485), frontend stub schema imported by API tests (157), mailbox
  routes, auth, plant/visual-scope and mail services. No diagnostic names the
  new estimates schema/contracts/services/routes/tests or modified rate/
  parent-guard modules. Mobile, sandbox and scripts checks complete; the
  concurrent root run terminates before CRM reports its final result.
  Full ignored logs are under `generated-artifacts/estimate-*.log`.

No scope deviations. Defined wire conventions (quantity normalization,
envelope, null margin and percentage-point representation) are explicit above.
The next UI/lifecycle/ticket slices already exist as separate downstream work.
