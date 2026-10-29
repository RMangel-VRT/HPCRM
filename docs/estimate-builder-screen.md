# Estimate builder screen

The builder consumes the Slice 3.1 driver-free DTOs and strict input schemas.
The draft API and all captured snapshot/totals behavior remain unchanged.
Lifecycle actions belong to the following slice.

## Rates preview read metadata

`GET /api/estimates/rates/preview?customerId=…` retains its existing `items`
unchanged and adds `governingContexts`, an array of:

```ts
{ line: string; termId: string | null; seasonLabel: string | null }
```

There is one context for each distinct service line represented by the active,
labor-relevant card rows. Selection uses the same `applies` and
`selectInEffectTerm` functions, and the same Colorado date, as price resolution.
A null term means no eligible governing term for that service line. An empty
array means no labor-relevant card rows, not evidence of a particular contract.
The season label comes from the selected term; it is never inferred from an ID.

This context is deliberately independent of each row's price source. A governing
term can exist while a missing exact key falls back to the rate card. Row source
badges continue to report that fallback accurately. Distinct service-line
contexts are presented separately, rather than choosing one row or implying
that a single season governs every service line.

This is backward-compatible read metadata only: no new endpoint, pricing
precedence, draft API, schema or snapshot changes.

## Plant picker read compatibility

The existing plant-library response previously omitted the catalog size-row
primary key, so it could not safely supply Slice 3.1's `plantCatalogItemId`.
Each `sizes[]` row now additionally exposes `id` and `isActive`. The optional
`activeOnly=true` filter allows active sizes with no current stock to appear
when combined with `inStockOnly=false`; existing stock-filter defaults remain
unchanged. The endpoint also honors an optional initiating `X-Company-Id`
header, rejecting a session-company mismatch before reading any data.
Neither variety keys nor product codes are substituted for size-row IDs.

## Verification

- Frontend: 149 tests pass across seven suites, including 29 builder/list/picker
  checks and the existing navigation, board, hardscape, irrigation, rates and
  quick-list settings checks. Tests cover all seven line types, reference-only
  payloads, free-entry umbrellas, exact edits, authoritative totals, section
  protection, ordering/moves, lock recovery, history, void, failed-save rollback,
  tenant/version switches, late responses, rates contexts and Spanish copy.
- Backend: 115 tests pass across rate resolver, estimate setup, estimate math
  and draft route suites, including three new governing-context tests.
- Forced shared declaration rebuild succeeds. Root `pnpm run typecheck` still
  fails with exactly 730 pre-existing API diagnostics; standalone CRM check
  still reports 221 pre-existing diagnostics. Before/after counts by file and
  diagnostic code are identical. No new diagnostic categories were introduced.
  Full logs are ignored under `generated-artifacts/builder-*.log`.
- API and CRM managed workflows restart successfully. The unauthenticated
  builder route correctly presents sign-in.
- A single real-browser save/reload test was attempted but blocked at sign-in:
  the documented development account was rejected with 401. No estimate data
  was created or modified by that test. Signed-in visual and live persistence
  verification therefore remain unverified; rendered tests use the real page
  components with mocked network responses and mock only the reused customer
  search component.

## Integration notes

Customer names are read from the existing customer endpoint. Linked ticket
number/status come from the existing ticket-details endpoint and its statuses
array, not guessed fields on the bare ticket. These queries carry the same
company/user/role scope and initiating company header as the estimate requests.

Version changes remount editing state, including any open picker. Mutations
install the complete returned document envelope after cancelling obsolete
detail reads, comparing server timestamps so an older response cannot replace
a newer payload. No totals are recomputed in the browser.

No lifecycle, native mobile, schema, dependency or new-artifact work was added.
The only additions to server reads are the metadata compatibility changes above.
