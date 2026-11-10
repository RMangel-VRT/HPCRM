# Estimate lifecycle and versioning

## Prerequisite contracts retained

The builder extends the merged draft API and screen. Estimates remain project
opportunities, not Contract Center agreements. These operations do not change
ticket workflow, send messages, generate documents or write to QuickBooks.
The document title remains container-owned and its existing API behavior is
unchanged; the builder only offers title editing on the current draft.
Commercial values remain line-owned snapshots, never live catalog/rate joins.
All lifecycle and content writes serialize on the company-qualified estimate
row before reading mutable state. Lifecycle responses use the detail envelope,
with `version` holding the current version and `versions` carrying history.
Draft content mutations keep their existing affected-version response contract.

## Rules

- Only drafts can be sent; at least one line is required. Sending captures every
  defined frozen total. Nonmanual zero-priced lines return `LINES_NEED_PRICE`
  with IDs; explicit confirmation permits sending without modifying any line.
- Only sent versions can be accepted or declined. Acceptance supersedes the
  previous accepted version and all sent siblings. Audit actors/timestamps and
  original sent snapshots remain available on superseded versions.
- Sent, accepted **and declined** versions can be revised. Revision alone never
  supersedes the source. A revision copies sections and lines, including source
  references, pricing/costs, ordering and palette settings, with new IDs.
  It resets all lifecycle/frozen fields and performs no rate/catalog lookup.
- Sending the revision supersedes sent siblings, but does not replace an
  accepted contract. Only acceptance replaces the accepted version.
  Declined historical versions retain their state.
- One draft exists at most. `DRAFT_EXISTS` identifies the existing draft.
- Only extra (non-v1) drafts can be discarded. Owned children cascade and the
  pointer falls back to the highest remaining version.
- Voiding requires a reason and is blocked by any accepted version. It retires
  all draft/sent versions without deleting history. The existing partial unique
  releases the ticket for a new estimate; void does not write the ticket.
- `currentVersionId` is the newest nondeleted version, even if a historical
  accepted version remains the contract. Historical UI views are read-only.

## Accepted-on representation and migration deviation

The prerequisite schema supplied `accepted_at`, an audit timestamp, but no
separate place for the user-selected accepted-on calendar day. Overloading it
would lose either the audit instant or the customer's date. The narrow guarded,
rerunnable migration `0058_estimate_accepted_on.sql` adds nullable SQL `date`
`accepted_on`, represented as a `YYYY-MM-DD` string. Historical filenames are
unchanged. There is no startup DDL and no inferred historical date backfill.

The action records `acceptedAt` as its audit instant and `acceptedOn` as the
validated supplied date, defaulting to America/Denver today. Date inputs preserve
selected calendar components; they are never converted to instants. The version
owns both facts, consistent with the data-ownership map.

## Builder list filter convention

Filtering applies to the **current version**, not any historical accepted
version. `open` means a nonvoid estimate whose current version is draft or sent,
including a change-order draft whose older version is still accepted.

- No status selected: existing Show void behavior applies.
- Open: always excludes void, regardless of Show void.
- Sent/Accepted/Declined: current status must match; Show void additionally
  controls whether voided containers with that historical current status appear.
- Void: explicitly selects voided containers regardless of Show void.

Customer, ticket and search filters intersect these rules. Both list and detail
include lifecycle history without extra per-version requests. The list uses at
most three batched queries. The ticket-based Estimates board is unchanged.

## Verification

Focused unit/route tests cover state/action pairs, strict payloads, exact method
enums, leap/calendar validation, permission/company guards, safe errors and
structured conflicts. Disposable-company PostgreSQL tests cover frozen snapshots,
catalog changes, deep copies, superseding, zero confirmation, accepted-on/audit
semantics, discard children/pointer fallback, void/ticket reuse and actual
competing accepts, revisions and send/discard/void races.

Rendered builder tests cover lifecycle presentation and interaction alongside
the prerequisite builder and navigation regressions. Verification command
results and any unchanged root-typecheck baseline failures are recorded in the
delivery notes, not suppressed.

Run migration/integration suites with `--no-file-parallelism`: the prerequisite
tests rerun multi-table DDL, which can otherwise contend with independent
lifecycle fixtures even though application mutations are serialized correctly.
The actual sibling-accept and other race tests still use competing transactions
inside the tests; suite serialization does not remove that concurrency.

### Delivery checks

- **375 backend tests across 14 suites pass**: lifecycle unit/routes/real PG,
  prerequisite estimate math/draft/routes, estimate setup/rate resolver, ticket
  board, hardscape catalog and irrigation CSV/routes/real PG regressions.
  The lifecycle PG suite includes competing sibling accepts, competing
  revisions, send/discard, revise/send, revise/void, accept/void, discard/void,
  send/void, revise/discard and content-edit/send races.
- **132 rendered UI/regression tests across seven suites pass**, including
  current and historical lifecycle states, dialogs, stale company/version
  responses, strict read-only controls, filters, Spanish copy, prerequisite
  builder/setup/catalog/board/navigation coverage.
- One signed-in browser pass on an isolated disposable company verified:
  send method, read-only sent state, acceptance date/PO/method persisted through
  reload, source-preserving change order, historical controls absent, discard
  fallback, server-identified zero-price warning and override, declined revision,
  void reason/history and Open/Void filters. All disposable records and the
  temporary account were removed afterward; no real customer or ticket changed.
- The browser initially found a development JSX-transform incompatibility
  which esbuild-rendered tests did not detect. The final Vite modules return
  HTTP 200 and the signed-in pass succeeded after correction.
- Required extensions and schema drift pass. The guarded accepted-on migration
  was applied and rerun twice in PostgreSQL. API/CRM workflows run; proxied API
  health returns 200, anonymous estimates return 401 with `Cache-Control:
  no-store`. `git diff --check` passes.
- **Full root typecheck is not clean:** fresh shared library declarations build
  successfully, but the root check still stops on exactly the same **730 API
  diagnostics** as before implementation. Comparison by file, code and message
  found no additions or removals. The largest existing groups are legacy route
  handler signatures (485) and frontend-stub schema imported by API tests (157),
  followed by mailbox/auth/storage/plant/visual-scope/email diagnostics.
  A separate final CRM typecheck reports **221 diagnostics**, all outside the
  estimate files, matching its earlier standalone run (App, shared schema stub,
  scheduling/service/contract/legacy UI). There are no diagnostics in the
  lifecycle schema/contracts/services/routes/tests/components/pages/helpers.
  Mobile, sandbox and scripts completed successfully in the root run.

Ignored verification logs are in `generated-artifacts/lifecycle-*.log` and
`generated-artifacts/typecheck-*.log`. No root check was skipped or its failure
hidden. Unrelated baseline type errors were not broadened into this slice.
