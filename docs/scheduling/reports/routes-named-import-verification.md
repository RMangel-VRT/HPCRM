> Planner import cancelled; planner removed in R3.

# Named-template Routes import — verification and blocked approval

Verified November 3, 2026. **Named-import support prepared; production approval
blocked and absent. Not imported or published by this work.**

## Production gate: stopped before approval

The authorized production read-only query was attempted through the production
database interface:

```sql
SELECT c.id AS company_id, t.id AS template_id, t.name, t.is_active
FROM companies c
JOIN weekly_schedule_templates t ON t.company_id=c.id
WHERE t.name=$1
```

Parameter: `Randy And Luciano (Copy)`. Result: **“Production database access
requires an authenticated user.”** No result rows or production snapshot were
returned. No alternative connection, development fixture, changed active flags,
or old conditional report was substituted.

| Required fresh production fact | Current evidence |
| --- | --- |
| Intended company and unique selected template ID | Unavailable; selection query denied |
| Timestamp of actual production snapshot | Unavailable; no snapshot obtained |
| Selected-source SHA-256 fingerprint | Unavailable; no approvable fingerprint |
| Proposed stops, required **39** | Unavailable, not zero |
| Duplicate decisions, required **0** | Unavailable, not zero |
| Live 2027 mowing covered / uncovered | Unavailable; historical **27 / 12** is not fresh evidence |
| Skipped blocks and individual reasons | Unavailable; historical three inactive properties are not reverified |
| Approval registry | **Empty** |
| Import / marker / planner freeze in production | Not inspected; no import or marker write performed |

Consequently **no Randy approval entry was added**. A future authenticated
read-only session must resolve the intended company and exactly one template
with the authorized name, select the snapshot, evaluate it with the shared
planner, and record ID, `observedAt`, fingerprint, stops, duplicate decisions,
coverage split and every skipped placement/reason **before** editing the registry.
Only 39 proposed stops and zero decisions permit approval. Any coverage split
is informational, not an additional gate.

`scripts/src/routes-production-audit.sql` is a company-parameterized SELECT-only
snapshot. It now includes template company identity and actual active existing
stops rather than assuming none. It requires the Routes schema to exist; do not
replace missing schema/data with an empty fixture. Feed the returned company
object to `planProductionRouteAudit(input, selectedTemplateId)`. That adapter
checks the authorized template name and company, then calls the actual
`coverageResolver` and `planPlannerRoutes`; it contains no import or approval
mutation. Its `approvalGatePassed` is a report result, not an automatic approval.

The live application URL was obtained from deployment metadata:
`https://app.highplainsprop.com` (existing successful public autoscale build).
The `/dashboard/routes` capture showed **sign-in**, not an authenticated Routes
page. This proves reachability only. No production sign-in, write, import,
template edit or Publish was attempted.

## Selection contract and intentional fingerprint change

Approvals support `{ approvedBy: "Randy", templateId, fingerprint }`.

- A supplied template ID must resolve uniquely within that company's template
  inventory. Empty, missing, foreign and ambiguous explicit IDs fail closed.
  There is **no fallback** to another active template.
- An explicitly selected valid template need not be the sole active template.
  The importer does not change its active flag or any other template.
- Approvals without `templateId` retain the original exactly-one-active rule.
- Dry-run callers may select a template with no approval entry. Boot selects
  from the registry entry; a mismatched caller override is refused.
- Nonselected templates and their blocks remain legacy history. The existing
  company marker activates R2's freeze for the legacy planner after cutover;
  no new freeze mechanism is introduced.

**Approval fingerprint semantics intentionally change to
`selected-planner-source-v2`.** The prior hash included every template's
inventory, proposed stops with coverage-derived/date-dependent anchors, plus
contract term ID, quantity, window and positive months. Signing a renewal could
therefore invalidate reviewed planner placements even though their source had
not changed. Old fingerprints are intentionally not compatible.

The shared fingerprint now binds:

- company and selected template identity/name/activity;
- **all** selected blocks, including skipped ones, with IDs and referenced IDs,
  weekday, order and optional start-time ordering input;
- each referenced config's property, activity, duration and notes digest;
- each referenced planner column's link and name, and its linked standing
  crew's identity, activity, name and display order;
- referenced property identities and active/status eligibility;
- the import's fixed mowing service and weekly cadence.

Arrays are canonicalized by stable block ID; irrelevant inventory and source
array ordering do not affect the hash. Missing references are represented
explicitly. Production note digests and in-process raw-note digests produce the
same result without exporting notes or actual customer labels.

It excludes contracts, governing term IDs, quantities, signatures, coverage
windows/months/counts, unrelated templates/configs/columns/crews/properties,
customer display labels, wall-clock dates and computed proposal anchors.
Selected placement, duration, notes, property eligibility or relevant crew-link
changes still invalidate approval. Standing crew activity remains authoritative;
a historical planner column's inactive flag does not override its linked crew.

**Coverage remains live.** Anchor construction and route-fill behavior were not
changed. Stops keep null contract season overrides; there is no coverage snapshot
on a stop. A database regression reviews an uncovered draft, signs a new renewal
before boot, imports with the same fingerprint, and confirms fill excludes March,
honors the April 15 window, then observes a subsequent zero-May month spread.

## Guarded startup and publication handoff

The existing startup call remains after crew linking. Schema readiness,
default-off approval, crew gate **before** scheduling gate, company row lock,
fingerprint revalidation, transaction rollback, unique stops, atomic decision
snapshots and marker commit are preserved. Concurrent approved startup attempts
produce one import and one `alreadyImported`; repeated calls do not reimport.
The named-import marker itself is used in the R2 freeze regression.

There is no ad hoc production import command, manual marker setting, migration,
schema change, route-fill change or Routes UI change in this work.

**Post-Publish verification has not run:** these changes have not been published,
and approval remains absent. Once authorized approval is recorded and normal
Publish actually occurs, read-only verification must confirm:

1. The intended company's 39 stops, selected-block provenance and zero duplicate
   decision snapshots, with no provenance from another template.
2. The single committed `routes_imported_at` marker.
3. Repeat startup preserves counts, IDs and marker (use normal startup evidence;
   do not manually invoke the production importer).
4. Readiness reports imported/planner-read-only, and legacy planner reads remain
   available. Verify the existing mutation guard through its read-only readiness
   state and existing request evidence; do not issue a production write probe
   merely for this check.

## Reference archive and visual inspection limits

The supplied text was copied **byte for byte**, without redesign, to
`docs/scheduling/mockups/R-mockup-routes.html`.

Both source attachment and archive SHA-256:
`789c4e744574610e5f468314166d8d85e2d1bb0f4b6e6d9800f3f49c2befb015`.

The archived reference was actually rendered at **1440 × 1000, light theme**.
The screenshot is retained in ignored
`generated-artifacts/routes-named/reference-light.jpg`. Observed reference:
216px dark navigation, service segmented controls, compact season/filled chips
and fill button, two underline tabs, 320px needs queue including a contract-ending
warning group, and tinted crew lanes with numbered green-rail stop rows and
capacity bars. At this viewport the rightmost board content needs horizontal
scrolling; the screenshot clips the far right rather than proving full fit.

**No matched signed-in implementation screenshot was obtained.** The browser
comparison session rejected the disposable development login with 401; direct
development HTTP checks accepted that same isolated fixture. A local capture
attempt reached populated Routes (five visible weekday stops) but stalled before
producing images. No cause for that context discrepancy is asserted. Production
capture showed only sign-in; no real production credentials were tried.

Therefore the following matrix is **not verified**: matched light/dark rendered
Routes layout/typography, populated queue and service changes, calendar/tab
transition, open drawer, and narrow screen. No source-only deduction below is
presented as a verified published-page visual difference:

| Source-review comparison only | Reference | Current implementation |
| --- | --- | --- |
| Calendar affordance | “On the calendar” renders the example calendar inline | Routes links to Scheduling with service selection |
| Pattern controls | Fixed five-weekday example | Current board has additional crew/day/filter controls |
| Queue | Example “Route ends with contract” group | Live needs and import-decision workflow, not that hardcoded example list |
| Drawer | Example property, fixed spread/progress and simple action row | API-derived contract/progress plus editable pattern and explicit apply-calendar action |

Example property names, repeated example stops, crew counts, capacities,
durations, coverage counts and October calendar dates are **data differences**,
not evidence of layout regressions. No fidelity fix or product UI edit was made.
The supplied reference's full dark/drawer comparison must not be claimed as
completed merely because its CSS and script are readable.

## Full CRM baseline and exact ten failures

Command, after `pnpm run typecheck:libs`:

```sh
TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run \
  --config vitest.config.ts --maxWorkers=2 --reporter=json \
  --outputFile=../../generated-artifacts/routes-named/crm-baseline.json
```

**979 tests: 969 passed / 10 failed / 0 skipped, 83 files.**
No CRM production source, test or configuration was changed in this slice.

| File under `artifacts/highplains-crm/src/` | Exact failing full test name | Assertion / cause |
| --- | --- | --- |
| `hooks/useTabParam.test.ts` | `useTabParam returns the default tab when no tab param exists in the URL` | `document is not defined` |
| same | `useTabParam reads the active tab from the URL search string` | same node-environment error |
| same | `useTabParam preserves all non-tab query params when switching tabs` | same |
| same | `useTabParam only updates the tab key and leaves every other param untouched` | same |
| same | `useTabParam adds the tab param without disturbing existing params when no tab was present` | same |
| `components/CrewAssignmentBoard.test.ts` | `CrewAssignmentBoard.selectReducer shift click in a different column does not range-extend; falls back to add` | expected `['b','y']`, received `['y']` |
| same | `CrewAssignmentBoard.selectReducer prune removes ids no longer present and clears lastClicked if it was pruned` | expected null, received `{id:'b', col:'u'}` |
| `components/contracts/rateCardUtils.test.ts` | `rateCardUtils groups and counts missing` | expected 23, received 42 |
| `components/TicketConversation.rendered.test.tsx` | `Shared ticket conversation preserves the empty state and always offers the main composer and compact navigation` | cannot find old “No tickets found” text |
| `pages/TicketDetail.visits.rendered.test.tsx` | `TicketDetail conversation locations always offers the Overview Conversation card and opens the focused tab when empty` | cannot find `button-view-all-comments` in the empty compact conversation |

### Eight → ten: origin, not attribution to Routes

The earlier [display-filter audit](display-type-filter-audit.md) documented
the first eight failures by exact identity, matching its P3-3 baseline. The
[invoice-center baseline](../../invoicing/reports/invoice-center-ic1-verification.md) already recorded
ten before its changes, and R1/R2 and
[estimate exhibits](../../estimates/estimate-plant-exhibits.md) also recorded the same
conversation-related pair. The two added failures are the final two table rows,
not additional route assertions.

Evidence from actual history:

- `654c2ff3` / October 27, 2026 21:04 UTC, **“Add shared threaded ticket
  conversation and validate parent ancestry”**, introduced the shared
  conversation implementation and both expectations. That version rendered
  `tickets.noTicketsFound` and always rendered compact “View all”, even at zero
  comments. An isolated historical run of both full test files is **40/40 pass**.
- `13c3b7f9` / October 27, 2026 22:27 UTC, **“Contain ticket Overview rail,
  share URL-keyed photo fallbacks, and correct localized Conversation empty
  states”**, changed the production component to the localized
  `ticketDetail.noComments` empty state and changed the navigation condition from
  `compact` to `compact && comments.length > 0`. It did not update those old
  assertions. The same two historical files on this revision give **38 pass /
  the exact 2 failures**.
- The standalone conversation test file has **zero diff** from its introducing
  revision to the current baseline. Current Ticket Detail still renders the
  Overview Conversation card; its failure occurs at the missing zero-comment
  navigation button, **not** because Routes removed the card.

Both historical runs used the original source/config from `git archive`, current
identical installed dependencies, one worker and UTC. They were focused history
checks, **not fabricated full historical-suite counts**:

```sh
# In each archived artifacts/highplains-crm directory, for each revision above:
TZ=UTC ./node_modules/.bin/vitest run --config vitest.config.ts \
  src/components/TicketConversation.rendered.test.tsx \
  src/pages/TicketDetail.visits.rendered.test.tsx --maxWorkers=1 \
  --reporter=json --outputFile=<retained-result-path>
```

No unrelated failure was repaired, hidden, skipped or reattributed.

## Importer, R2 and typecheck verification

```sh
ROUTES_DB_TESTS=1 TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  src/lib/plannerRouteSelection.test.ts src/lib/routeEngine.test.ts \
  src/lib/routeEngine.integration.test.ts src/lib/routeScheduler.test.ts \
  src/lib/routesR2.integration.test.ts --maxWorkers=1
# Same command with TZ=America/Denver.
```

In **each timezone**, the five-suite run had **90 passed / 1 failed**, with no
skips. The failure was in the new lock-order test: it searched all SQL text for
`'visits'`, accidentally matching the earlier schema-readiness SELECT. The test
was corrected to compare only `pg_advisory_xact_lock` statements, preserving the
real crew-before-scheduling assertion. Its isolated rerun passed **1/1 in UTC
and 1/1 in America/Denver**. Thus all 91 test identities are verified in each
timezone, but a single all-green full command after that test-only correction
is not claimed.

Regression coverage includes named selection among active templates; missing,
foreign and ambiguous IDs; legacy unnamed behavior; unchanged nonselected
history; nonselected edits between review/boot; selected block, property and
crew-link/activity invalidation; audit/live notes-digest parity; date, signature,
renewal identity, quantity, window and month-spread independence; the 39/0-only
report gate with **0/39 coverage accepted**; zero-write read-only dry runs;
concurrent/repeated imports; atomic rollback including duplicate snapshots;
live post-renewal fill; and actual named marker-driven R2 planner freeze.

| Check | Measured before | Measured after |
| --- | --- | --- |
| `pnpm run typecheck:libs` | pass | unchanged library sources |
| `pnpm --filter @workspace/api-server run typecheck` | 721 errors | 721 errors |
| `pnpm --filter @workspace/highplains-crm run typecheck` | 222 errors | 222 errors |
| Normalized diagnostic file/code multisets | baseline captured | zero additions or removals for both apps |
| API bundle/workflow and CRM workflow | restarted after runtime edits | serving; no new startup errors |
| `git diff --check` | — | pass |

These are the **fresh measured** diagnostics, not R1/R2's historical 730/221.
Raw JSON/logs, test-origin diffs and failed capture observations live in ignored
`generated-artifacts/routes-named/`. Temporary historical source archives and
disposable development credentials/data are removed after verification.

## November 3 follow-up: stale conversation assertions corrected

The owner subsequently authorized updating both conversation test files, without
changing `TicketConversation.tsx` or any production behavior. The mock now defines
`ticketDetail.noComments`; the empty compact test expects the comments-specific
message, composer and no View all button. The Ticket Detail empty case uses the
Conversation tab for navigation. Populated “View all 5” coverage remains intact.

The complete CRM command above, with results written to
`generated-artifacts/conversation-assertions/crm-full.json`, now reports **971
passed / 8 failed / 0 skipped (979 tests)**. Fixing two previously failing tests
increases passes from 969 to 971; no test was removed to obtain 969/8.
The remaining failures match the earlier eight by exact file and full test name:
five `useTabParam`, two `CrewAssignmentBoard.selectReducer`, and one
`rateCardUtils groups and counts missing`. These are pre-existing, unchanged
failures. The focused shared-conversation file also passes **8/8**.
This CRM test correction does not alter the blocked production approval or
the visual-verification limitations recorded above.

### Startup safety follow-up: route writes between review and import

A selected-source fingerprint deliberately excludes existing route inventory.
However, the ordinary Routes API permits a pre-import mowing stop to be added.
If it references a selected source property, planning turns that placement into
a duplicate decision, reducing the number of proposed stops without changing
the source fingerprint.

Named startup now independently refuses those existing-stop collisions **under
the existing scheduling gate**, before inserting any stop, decision snapshot or
marker. The fingerprint remains strictly source-only; unrelated active stops
do not block import, and unnamed legacy selection is unchanged. The real API/DB
regression reviews a six-stop/zero-decision fixture, adds a selected property's
stop through the normal API, confirms the same fingerprint now reports five
stops/one decision, and verifies startup is disabled with no import writes or
marker. Its companion confirms an unrelated property stop remains untouched
and does not block the selected import. The same invariant protects a production
39-stop/zero-decision review without hardcoding production counts into fixtures
or snapshotting contractual coverage.

Follow-up verification command:

```sh
ROUTES_DB_TESTS=1 TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  src/lib/routeEngine.integration.test.ts src/lib/routesR2.integration.test.ts \
  --maxWorkers=1
# Also run with TZ=America/Denver; result logs retained alongside crm-full.json.
```

Both UTC and America/Denver passed **44/44 tests, zero skips** across these two
integration files, including both new inventory-change cases.

The API typecheck remains at the same **721** diagnostics, with no new
file/code signatures. The API workflow was restarted once after the guard
change, built successfully and is serving; the CRM sign-in preview renders.
