# Customer services integration contract

CG5, 2026-11-11. Read-only; no Services-page UI or company report in this slice.

## Entry points

- HTTP: `GET /api/customers/:id/services?termId=<optional-season-id>`.
- OpenAPI operation: `getCustomerServices`; generated React helper
  `useGetCustomerServices`, validator `GetCustomerServicesResponse`.
- Pure server calculation: `customerServiceFulfillment(data, customerId, termId?, today?)`
  in `artifacts/api-server/src/lib/customerServiceFulfillment.ts`.
- Batch loader: `loadServiceFulfillmentInputs(reader, companyId)` in
  `artifacts/api-server/src/lib/customerServiceFulfillmentLoader.ts`.
- Exported input contract: `ServiceFulfillmentInputs`. Response types
  `CustomerServices`, `FulfillmentRow`, `FulfillmentRound` reuse generated API
  types. Later reports can load once, then call the same pure calculation for
  their authorized properties; do not recreate the demand or outcome rules.

The loader makes nine company-scoped reads (eight without any term dates), not
one query per service, round, item or property. Reads cover customers, agreements,
terms, scope, programs, campaigns, items, route stops and date-bounded route
visits. It does not load prices, rates, payments or documents, and never calls
Generate, reconciliation or legacy `storage.getServiceFulfillment`.
Current batching loads company collections; future large-history optimization
must preserve the same calculation and governing competitors.

## Authorization and request handling

Uses the exact exported `CUSTOMER_CONTRACT_READERS` allowlist shared with
contract-summary: admin, office, field manager, chemical manager, field,
irrigation manager, mapping, landscape supervisor and crew supervisor.
Account managers retain their existing `accessRole = admin` projection.
Their customer assignment is attribution, **not an access restriction** in the
existing contract-summary policy; neither endpoint introduces one. Shop manager
and unknown roles are denied. Authentication and active membership/company
context remain owned by existing auth.

The company comes only from the authenticated context. Optional `X-Company-Id`
must agree or return 409. Every loader query has a company predicate.
Unsigned requests return 401, denied roles/missing company 403, missing customer
or unavailable season 404, malformed/repeated/unknown query parameters 400.
Responses use `Cache-Control: private, no-store`.

Consumer queries must include initiating company, customer and selected term in
their cache keys and send the existing company header. Changing companies must
not reuse previous customer results. Consumers are not built in CG5.

## Season selection

Only `signed`, `active`, `renewed`, `up_for_renewal` and `sent` seasons belonging
to the requested customer or its same-company immediate parent are selectable.
Explicit `termId` must be in that set; unrelated/foreign/draft/lost/cancelled
seasons cannot be used to read scope. No fallback from an invalid explicit ID.

Default: current own season, otherwise current inherited season; if none,
nearest upcoming start, then nearest previous end. Current dates are Colorado
calendar dates. Firm terms rank before sent, then use existing
`compareTermPriority`. Available simultaneous agreements are retained in
`availableTerms`; explicit selection allows choosing among them. This endpoint
does not add up commercial values or allocate a parent's quantity to branches.
Monthly campaign coverage is still exclusively the existing demand engine's
governing selection, including own-before-parent exclusions.

## Response fields

| Field | Meaning |
| --- | --- |
| `asOf`, `customerId` | Colorado evaluation day and requested customer |
| `availableTerms` | Eligible seasons with ID, agreement ID, label, dates, raw status and inherited parent ID |
| `selectedTerm` | Same metadata for the selected/default season, or null |
| `rows` | One counted operational row per included campaign/route service |
| `alsoInContract` | Included non-counted services: key, catalog label, scheduling class; no invented done figures |
| `otherWork` | Manual campaign item ID, campaign ID/title and official item status; never applied toward contractual totals |
| `retainedWork` | Generated campaign items not matched to selected-season demand, with IDs/service/status; never silently counted as owed |

With a selected season, manual/retained work is scoped by campaign-window
overlap, not a guessed completion instant. A customer without an eligible
season gets null selection, no owed rows, and its manual/retained campaign
history rather than an invented contract. No work is changed or deleted.

Each counted row includes key, catalog label, scheduling class, `statedQuantity`,
`owed`, `done`, `skipped`, `remaining`, `planned`, `inProgress`, `status`, `issues`,
`next` and `rounds`. `remaining = max(0, owed - done - skipped)` when owed is known;
skipped closes an obligation without claiming it was done.

### Campaigns

Call `campaignDemand` for **every calendar year intersecting the full term**.
Keep only round members matching this property and selected term. Do not
multiply the stated quantity by years, use catalog/editor defaults, copy
program months to scope or write a second count/timing resolver.
Target and immediate-parent inputs prevent the engine's term-level gap
deduplication from hiding one branch's gap behind a sibling.

`owed` is the number of those expected rounds, independent of whether generated
campaigns/items exist. `done`/`skipped` use matching generated item status only;
chemical workflow phases and visits alone do not prove item completion.
`rounds` identifies every expected round, nullable campaign/item links,
contract/program timing, contract/standard count provenance, window and state.
Completed/skipped item history stays closed regardless of today's date.

Blocking demand gaps (`no_count`, `no_timing`, `invalid_count`, `duplicate_lines`)
make owed/remaining **null**, not zero or a fabricated count; `statedQuantity`
remains available for explanation. `count_mismatch` is informational: stated
months win exactly as in demand. Explicit zero remains `not_owed`.

Round states:

- `completed` / `skipped`: official item outcomes.
- `missing_item`: no materialized property item, including past windows.
- `waiting_on_signature`: pending item governed by a sent season.
- `overdue`: pending, non-sent item beyond its deadline.
- `pending`: existing pending item still within its deadline.

The round deadline is window end, except fert/chem with a promised date:
backup takes precedence over target. No appointments or planned visits are
invented. `next.kind = round_window` means the window's start, **not a property's
scheduled appointment**. `chemical_promise` means the item-owned latest promised
date. Earliest unresolved work remains next even if its date is in the past.

### Routes

Owed is the selected scope's stated nonnegative integer quantity. Null/invalid
or duplicate quantities remain unknown; programs/catalog defaults never supply
route demand. Activity is actual company/property/service-matched
`source_type = route` visits whose **visit date** is within the season.
Count done/skipped/planned/in-progress separately; cancelled, ticket and
campaign visits are excluded. Historical done work remains visible when a
term later enters renewal or live coverage changes.

Route visits have no term ID: these are activity counts within the selected
date window, not a claim of exclusive attribution across overlapping agreements.
Later company reports must not blindly sum overlapping seasonal windows.
Active stops with overlapping season bounds establish route setup; absent,
inactive or out-of-window stops yield `no_route` without erasing activity.
`next.kind = route_visit` links the earliest planned/in-progress visit, including
past unfinished work. A past planned visit or a known unfulfilled season-end
deficit is overdue. There is no invented completion percentage for unknown owed.

## Status precedence

Keep the full `issues` list; a single status must not hide secondary problems.
Primary status uses this order:

1. `duplicate_lines`
2. `invalid_count`
3. `no_count`
4. `no_timing`
5. `waiting_on_signature`
6. `overdue`
7. `missing_item`
8. `no_route`

Otherwise: `not_owed` for zero demand, `complete` for all done,
`closed_with_skips` for all closed with skips, or `on_track` for remaining work
without one of those issues. `count_mismatch` remains an informational issue.
Signature waits can coexist with unknown demand and missing items.

## Generated-name detail

Orval uses `GetCustomerServicesParams` for both a path validator and query
interface. The API Zod barrel explicitly exports the path validator and aliases
the query type as `CustomerServicesQuery`; generated files are not hand-edited.
