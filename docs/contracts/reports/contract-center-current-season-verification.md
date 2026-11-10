# Current-season selection verification

Verified in development on 2026-10-19. No production requests/writes, publication,
imports, migrations, dependencies, UI changes or real customer audit edits.

## Implementation and call-site inventory

- `artifacts/api-server/src/lib/contractCenterService.ts`: `selectCurrent(terms,
  today = companyToday())` prefers an inclusive in-effect signed/active/renewed
  season, ordered by descending start date then descending ID. Otherwise it uses
  the previous latest-start rule. Both paths retain the old eligibility rules:
  no cancelled terms or linked draft/sent/lost renewals. Arrays/statuses are not
  mutated. `selectRenewalSource(terms)` retains exactly the previous selector.
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: `listSummary`
  calls `selectCurrent(terms, today)`. `fullDetail` still calls `listSummary(terms)`
  and retains all seasons; its `currentTermId` therefore identifies the season in
  effect. No redesign of latest/recentSigned or progress.
  Pending draft lookup uses `selectRenewalSource(terms)`, retaining the old
  final-season association independently of the new display choice.
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: the shared
  dry-run/real Renew transaction now calls `selectRenewalSource(terms)`.
  Authorization, company scoping, locks, pending-renewal guards, price rounding,
  date calculation, writes and history are unchanged. The list route still uses
  `listSummary`; the detail route still uses `fullDetail`.
- `artifacts/api-server/src/lib/contractRenewalPlan.ts`: unchanged; import looks
  up its source using the explicitly supplied `renews_term_id`. It calls neither
  selector.
- Repository-wide `selectCurrent` / `selectRenewalSource` search found no other
  production callers: persistence calls the display selector for current and
  renewal-source selector for pending association; Renew calls the renewal-source
  selector. The display selector also delegates ordering/eligibility internally.
  Other occurrences are regression tests.

Completion review identified that retaining `current.id` for pending association
would hide a newly created year-5 renewal while year 1 is current. The minimal
correction uses the renewal source for that lookup, not the displayed current.
The draft ordering, eligible statuses, board rules and editing guards are
unchanged. This is a deliberate narrow deviation from the task's literal
instruction not to change pending association code, required to preserve the
existing find/edit/continue workflow after separating the two selectors.

In-effect signed/renewed seasons display Active on both boundaries. Direct
signed/active/renewed successors suppress `renewalDue`. Stored statuses and the
other existing display rules remain intact, including expired signed/active
seasons without a signed successor and historical renewed seasons.

The attachment's example saying all future years display Signed conflicts with
its explicit "everything else stays" rule and the task's requirement to retain
realistic renewed predecessors. A future season stored as renewed remains
Renewed; only an in-effect renewed season displays Active. Tests do not rewrite
future renewed seasons into signed seasons to satisfy that example.

## Client audit (no client edits)

- `pages/ContractPage.tsx`: defaults selection to server `currentTermId`, unless
  an explicit valid season hash was supplied. Timeline maps **every** term and
  highlights the selected term; initial highlight is therefore the in-effect
  season, but users can still select historical/future seasons.
- Its edit guard uses server `editable`, falling back to **stored** status and
  current/pending IDs. Underlying renewed/lost/cancelled terms remain read-only,
  even when an in-effect renewed term's display status is Active. The server's
  detail guard and mutation `assertEditable` retain the same restrictions.
  A final-season draft remains editable via renewalDraftId; the existing Renew
  button is disabled when that ID is present, even while year 1 is displayed.
- `components/contracts/boardLogic.ts`: renewal cards use server current plus
  renewalDue/expired; drafted cards use renewalDraft; signed cards use
  recentSigned and the signing window; lost cards use latest and the lost window.
  These are workflow placements, not a new board of all Active contracts.
  In particular, a recent-signed card can intentionally represent a future final
  season. No placement/progress changes were made to force a different result.
- The table uses `rowTerm` (current, then latest), server displayStatus and price.
  Existing price presentation is annual; monthly figures below are annual / 12.
- `ContractBadges.tsx` retains its Renewed pill for historical seasons and its
  Active pill for the computed status. `AuditImportCard.tsx` has import-status
  styling; the shared schema declares the enum; a rendered-test fixture includes
  a renewed historical term. No other production client renewed-status guard
  needs changing.
- The existing read-only text says "Past season, read only" even for an in-effect
  renewed season. Permissions are correct; wording is a separate UI follow-up.

## Tests changed and why

All paths below are under `artifacts/api-server/src/`.

### `lib/contractCenterService.test.ts`

One existing test was updated: **"starts active today, expires after end, and
becomes renewal due at exactly 60 days"**. Its selector calls now specify a
deterministic day. The obsolete expectation that a future signed renewal
immediately replaces the in-effect source was changed to select the source;
an additional assertion selects the successor on its first day. Its existing
expiration/status expectation was preserved.

New regression groups:

- Default day is Colorado December 31 at `2027-01-01T06:30:00Z`, not host UTC day.
- Year 1 and year 3 of a realistic five-season renewed→signed chain, final-season
  renewal selection, displayed status, due suppression, and no input mutation.
- After year 5, fallback is the final season and its display is Expired.
- Inclusive start/end boundaries for signed and renewed terms.
- Early-signed single renewal: source Active until end, successor Signed until
  start, then source Renewed and successor current.
- Direct signed/active/renewed successors suppress due inside 60 days;
  unrelated successors do not.
- Linked draft/sent/lost/cancelled renewals remain excluded from both selectors
  and do not suppress due.
- Gaps, before-all-seasons fallback, eligible unlinked draft/sent/lost terms,
  empty sets and cancelled-only sets preserve previous behavior.
- Overlaps, descending-ID ties, latest-start fallback ties and input order.

### `lib/contractCenterBoard.test.ts`

Added **"passes its explicit day to display selection while associating pending
drafts with the final renewal source"**. Covers year 1/year 3/final expiration,
stepped prices, stored versus displayed statuses, due suppression, latest,
recentSigned, unchanged progress and final-season pending-draft association.
All pre-existing board tests remain unchanged.

### `lib/contractCurrentSeason.integration.test.ts` (new)

Opt-in with `CONTRACT_SEASON_DB_TEST=1`, prohibited in production. Creates a
UUID-owned disposable development company/user/customers, then removes them and
their dependent records in `afterAll`, including on assertion failure.

1. **"returns the in-effect prices/statuses and complete timelines through
   persistence, list and detail without writes"**: uses real PostgreSQL records,
   `listSummary`, `fullDetail`, and authorized Supertest list/detail endpoints;
   asserts current IDs, prices, labels, statuses, due flags, complete timelines,
   stored renewed read-only guards and unchanged term/billing/history snapshots.
2. **"previews and creates renewal from year 5 dates/prices, never the displayed
   year 1"**: real PostgreSQL + HTTP handlers, year-5 source ID/date/payment
   assertions, no-write dry-run snapshots, real creation from the same source,
   preserved year-1 current selection, pending draft discovery in list/detail
   and renewalDraftId, editable/allowedMoves, PATCH editing, transition to Sent,
   and duplicate-pending rejection for both subsequent dry-run and real Renew
   with unchanged snapshots. The in-effect renewed year 1 remains uneditable.

### `artifacts/highplains-crm/src/pages/ContractCenter.rendered.test.tsx`

Added **"shows a final-season renewal draft on the board, keeps it editable, and
disables another Renew while year 1 is current"**. Checks Drafted placement,
draft-specific navigation hash, disabled Renew on the in-effect season,
unchanged renewed edit guard, and Edit/status controls on the year-6 draft.
No existing client assertion was changed and no client implementation changed.

No existing renewal import, lifecycle, copy, audit or parent tests were changed.
In particular, `contractRenewal.test.ts` and
`contractRenewal.integration.test.ts` passed without assertion changes.

## Explicit-day development verification

Data: disposable, production-like fixtures, **not imported customer records**.
Verification day: **2026-11-15**, explicitly supplied/mocked as Colorado today.
The actual runtime day was **2026-10-19**; results below do not claim verification
against the runtime date or real customer agreements. All prior seasons in a
chain were stored renewed and the final season signed, matching import behavior.

| Fixture | Current season | Monthly equivalent | Display | Renewal due |
|---|---|---:|---|---|
| Huntington Trails | 2026 | $4,600 | Active | false |
| Summerfield North | 2026–27 | $13,500 | Active | false |
| Third Villa West | 2026–27 | $34,950 | Active | false |

Huntington detail retained all five seasons, 2026–2030, with 2026's ID as
currentTermId. Preview used **2030's $4,980/month**, not 2026's $4,600:
source ID = year 5, dates **2031-01-01 through 2031-12-31**. At 3% with dollar
rounding, annual price is **$61,553**; eleven payments are $5,129 and the final
payment is $5,134. Snapshot equality proves dry-run wrote no terms, billing or
history. Real Renew was tested only on the disposable fixture, then cleaned up.

Board behavior was checked by its existing rendered/logic tests plus inspection
of its consumer contract, not a signed-in browser session with these fixtures.
List/detail results above are actual endpoint assertions, not screenshots.
The unauthenticated CRM screenshot renders the normal login page. API workflow
was restarted after each coherent backend batch and logs confirm a clean build and listener
on port 8080. No browser tester was needed for the backend-only change.

## Validation

- API: `cd artifacts/api-server && CONTRACT_SEASON_DB_TEST=1
  CONTRACT_AUDIT_DB_TEST=1 CONTRACT_RENEWAL_DB_TEST=1 pnpm exec vitest run
  src/lib/contract*.test.ts src/routes/contract*.test.ts`
  — **368 passed, 3 skipped**, 14 files passed. The skipped tests are the existing
  explicit development setup suites (`CC_DEV_VERIFY`, `CC_CREATE_VERIFY`,
  `CC_FREEZE_VERIFY`); these can seed existing-company data or apply DDL and were
  deliberately not enabled. Disposable audit, parent, renewal import and new
  current-season PostgreSQL suites were enabled and passed.
- CRM: `pnpm --filter @workspace/highplains-crm run test:contract-center`
  — **97 passed**, 12 files. Additional
  `pnpm --filter @workspace/highplains-crm exec vitest run --config
  vitest.config.ts src/pages/CustomerContracts.rendered.test.tsx`
  — **16 passed**, one file. Total CRM Contract Center/consumer tests: **113 passed**.
- `pnpm --filter @workspace/scripts run check-required-extensions` — passed,
  pg_trgm present.
- `pnpm --filter @workspace/scripts run check-schema-drift` — passed, in sync.
- `pnpm run typecheck` — **blocked by pre-existing errors**. Untouched HEAD was
  extracted outside the workspace with the same installed dependencies and
  checked: API baseline and final report **735 diagnostics with identical
  file/line/column/error-code multisets**. The final root run also emitted CRM
  errors before pnpm bailed; separate baseline/current CRM checks both report
  **221 diagnostics, again with identical locations/codes**, for **956 total**
  across those packages. Root's parallel fail-fast output may omit the CRM
  diagnostics depending on timing. Type text can differ because Drizzle
  formats inferred property order differently. No diagnostic points to a changed
  file. Existing blockers include auth missing returns/seedAllTicketTypes,
  unrelated ticket/plant/mailbox tests/routes, and the CRM shared schema's untyped
  calls/rootDir imports. Shared library declaration build passed. Baseline source
  copy was deleted; ignored verification logs remain in
  `generated-artifacts/cc-season/`.
- `git diff --check` — passed.

## Complete changed-file inventory

Production (3): `artifacts/api-server/src/lib/contractCenterService.ts`,
`artifacts/api-server/src/lib/contractCenterPersistence.ts`,
`artifacts/api-server/src/routes/contractCenterLifecycle.ts`.

Tests (4): `artifacts/api-server/src/lib/contractCenterService.test.ts`,
`artifacts/api-server/src/lib/contractCenterBoard.test.ts`,
`artifacts/api-server/src/lib/contractCurrentSeason.integration.test.ts`,
`artifacts/highplains-crm/src/pages/ContractCenter.rendered.test.tsx`.

Documentation: this report and the durable imported-season note appended to
`.agents/memory/contract-center-phase-boundaries.md`. The supplied requirements
attachment is unchanged input, not a generated implementation file.
