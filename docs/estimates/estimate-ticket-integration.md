# Estimate Builder: ticket integration

## Contracts and boundaries

This extends the merged model/draft API, builder screen, and lifecycle/versioning
contracts documented in `estimate-builder-draft-api.md`,
`estimate-builder-screen.md`, and `estimate-lifecycle.md`. None were replaced.
The estimate owns document lifecycle; tickets own operational lifecycle.
Estimate actions never perform a server-side ticket status update.

`GET /api/estimates/by-ticket/:ticketId` is a dedicated admin/office,
company-scoped, no-store read. An inaccessible/nonexistent ticket is 404;
an owned ticket without a live estimate returns null. It returns the driver-free
`EstimateTicketSummaryDto`: container identity, current version identity/status,
version history (including an older accepted version), and authoritative
`subtotalCents`. It does not change estimate-list semantics. A draft uses
captured-line math; a non-draft uses its frozen subtotal, including null rather
than substituting a live calculation. Existing static board/catalog routes
remain registered before dynamic estimate routes.

The ticket Overview reference column mounts the estimate panel only for
admin/office and seeded Estimate Request identity. It does not use the projected
Project display identity. Other roles/types issue no panel request. Creation
uses the ticket's customer/title and follows the documented duplicate-live
409 ID. No-customer tickets have an accessible explanatory tooltip.
Accepted metadata remains visible alongside a current change-order draft.
Closed-lost tickets without an accepted estimate offer the existing void action,
with the exact reason `Ticket closed lost`.

All new estimate reads/writes carry the initiating `X-Company-Id` expectation.
The existing ticket/ticket-type APIs also honor that optional header before
their handlers run; header-scoped type reads additionally verify company
ownership. The session remains the authorization source. Client keys include
company/user/role, and late panel operations are dropped on unmount/scope change.
Lifecycle success also installs the authoritative panel summary immediately,
so navigating back during ticket orchestration does not briefly reuse the
previous estimate status while the mount refetch runs.

## Orchestration and state-derived recovery

Only successful send/accept/decline actions invoke `advanceLinkedTicket`.
It reloads the authoritative estimate and linked ticket, statuses, fields and
field values through existing GET APIs. It resolves target statuses by
`statusKey`, fields by `fieldKey`, and direction by `displayOrder`. It never
PATCHes a final ticket, one already at the target, or one beyond the target.
Missing custom-workflow targets produce a notice rather than a name-based guess.

When a move is needed, the **only** status write is:

```
PATCH /api/tickets/:id { currentStatusId }
```

Only after that succeeds do configured field-value PUTs run. Missing fields
and select values not present in configured options are skipped. Each field
write first checks that the ticket is still at the target, avoiding a replay
against a ticket manually stepped back to Decision Received. This is
client-orchestrated, not an atomic multi-request transaction; a concurrent
actor can still interleave between requests. No existing PATCH behavior was
refactored or bypassed.

Send uses the stored audit instant projected to America/Denver, not the browser
or host calendar. Email maps to Email, hard_copy to Hard Copy, portal/other to
Other. Acceptance uses the persisted `acceptedOn` calendar string and supplied
PO; audit `acceptedAt` is not substituted for that date.

The shared amber notice is derived from authoritative state in both builder and
ticket panel. It checks **field values as well as status**, so a committed PATCH
followed by a failed PUT remains recoverable across reloads:

- Behind target: retry status PATCH, then the mismatched configured fields.
- At target: repair only mismatched fields; **do not replay PATCH**. This also
  works for decline's final Closed Lost target.
- Past target or at another final status: leave the ticket alone, including
  historical fields. Never step back to replay an old estimate event.
- Missing target/current status or failed reads: keep an explanatory notice.
- No linked ticket, no committed event, or voided container: no orchestration.

At-target field reconciliation is intentional: without a stored failure flag
the app cannot distinguish a failed field PUT from a manually missing/changed
field. It treats the persisted estimate event as the desired value for available
mapped fields only while the ticket remains at that event's target. A changed
workflow/status is refreshed on every retry. Resolved state removes the notice.
There is no estimate rollback, failure flag, or automatic background write.

**Event/version precedence:** choose the latest persisted send/accept/decline
audit instant across the version history, preferring decisions over send on an
equal timestamp (and the higher version on other ties). A new draft has no
event, so an older accepted version remains the recovery source beside a
change-order draft. Sending that draft establishes a new send event; accepting
or declining it establishes the newer decision. Superseded versions retain
their lifecycle audit facts in the merged contract. Revise, discard and void
do not themselves trigger ticket movement.

**Decline payload reconciliation:** the merged lifecycle stores a single
`declineReason`, not separate chip and notes fields. The existing bilingual chip
buttons put their label into that string; users can also type arbitrary prose.
The integration copies that reason to denial reason and loss notes and matches
exact known English/Spanish chip labels to the seeded loss options. It does not
guess a chip from free prose or expand lifecycle storage/input contracts.

Tickets have UUID IDs, not a separate ticket-number column. The success toast
and builder link use the existing Tickets/My Tickets convention `#<first 8>`.

## Board and migration

Only Estimate Request board responses add nullable `estimate` summaries.
One company-qualified estimate/version/line join query loads every card's
summary, then reuses `computeVersionTotals` for draft snapshots and frozen
subtotal for non-drafts. Query count does not grow with cards. Bids/RFP payloads
do not gain this property. The builder-number link is a sibling of the original
ticket/owner link, never a nested anchor; cards lacking estimates retain their
existing rendering. The CRM continues to use its manual API contracts, not
OpenAPI/Orval.

`0059_legacy_qb_estimate_number.sql` was the next unused number. It is
idempotent **DML only**: only `qb_estimate_number` fields on keyed
`estimate_request` types become optional and receive the label
`Legacy QuickBooks Estimate #`. It does not delete fields or captured values,
touch custom exact-name types, rename historical migrations, or add startup DDL.
The new-company seed definition matches it.

Apply through the existing strict runner:

```
pnpm --filter @workspace/scripts run migrate
```

It has been applied in development. The existing post-merge setup uses the same
runner. Production operations continue to follow `replit.md`; this work did not
publish or target production.

## Known side path and future direction

The legacy field-value endpoint can still auto-transition a ticket directly
when `decision_outcome=Approved/Denied` is written while it is at
`decision_received`. That path bypasses PATCH billing/history/scheduling side
effects. It is deliberately unchanged and **must not be used by estimate
orchestration**. PATCH-first ordering and fresh before-PUT status checks keep
the normal integration off that path.

A future reusable **server-side PATCH workflow helper** should centralize all
existing validation, locking, history, billing, invoice, delegation, scheduling
and step-back effects. Only after preserving those behaviors should it enable
atomic estimate-and-ticket orchestration and retire the decision-field side
path. This slice does not perform that extraction.

## Validation

- **229 backend unit/route tests pass in six suites**, including dedicated
  by-ticket authorization/no-store/expectation/precedence coverage, single-query
  company-qualified batch summaries for 1 and 1001 tickets, exact live/frozen
  totals (including null frozen totals), Bids regressions and lifecycle/math.
- **Five disposable-company PostgreSQL integration tests pass**: endpoint
  tenant/role boundaries and null reads; draft/frozen/void totals; accepted
  history beside newer draft; real transactional PATCH from Proposal Sent to
  Ready to Schedule with `invoice_required` and status history followed by
  Approved field PUT; migration reruns/scope/custom-type/value preservation.
  These mount the actual unchanged PATCH/PUT handlers without unrelated boot
  backfills, using the real transaction and storage.
- **113 client helper/rendered tests pass in six suites**: role/type fetch
  gates, missing-customer tooltip, create/409 navigation, summaries/void,
  bilingual copy, scope changes, event precedence, status-before-fields order,
  missing fields/options/statuses, final/past-target skips, Denver dates,
  committed estimate on failure, and reload-persistent partial-field recovery
  without repeating PATCH. Existing builder/list and both board suites pass.
- The broader TicketDetail visits suite has **one pre-existing failure**:
  `always offers the Overview Conversation card and opens the focused tab when empty`
  expects an empty-conversation View All button that is not rendered. It
  reproduces against the pristine HEAD TicketDetail via a temporary load-only
  baseline config; the other 31 tests pass. That unrelated behavior was not
  changed to make this slice's tests pass.
- Fresh shared declarations build. The full root typecheck still reports the
  same **730 pre-existing API diagnostics**; comparison by file/code/message
  finds **zero additions or removals**. Standalone CRM typecheck reports the
  same **221 pre-existing diagnostics**, also zero additions/removals.
  There are no diagnostics in this slice's contracts, services, routes,
  components, helper or tests. Mobile, scripts and sandbox checks complete.
- Required extensions, schema drift and `git diff --check` pass. API/CRM
  workflows restarted successfully, health is 200, and new Vite-transformed
  panel/builder modules return 200. The unauthenticated preview correctly
  shows sign-in rather than private ticket data.
- One signed-in browser journey on an isolated disposable company passed
  ticket-panel creation, custom-line total, email send and Colorado send fields,
  Phone acceptance with exact accepted-on/PO, `ready_to_schedule` with
  `invoice_required`, reload persistence, and separate board builder/owner
  destinations. All fixtures and the temporary session were removed. The
  browser observed a transient old panel label immediately after navigation
  (it did not wait for that panel's refetch); lifecycle success now seeds the
  scoped panel cache directly, confirmed by a rendered regression. The optional
  browser PUT-failure injection was not run; partial-field failure and reload
  recovery are covered by the helper/rendered tests.

Ignored command logs and preview evidence are under
`generated-artifacts/ticket-integration-*`.
