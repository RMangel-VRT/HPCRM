> Planner import cancelled; planner removed in R3.

> Historical R1 evidence below. For the November 3 named-template selection,
> intentional source-only fingerprint change, current access blocker and approval
> state, see [named import verification](scheduling/routes-named-import-verification.md).
> The old conditional alternatives and old fingerprint semantics are not current
> production approval evidence.

Import would create 0 route stops (0 with a 2027 mowing contract); 0 need a decision.

## Production dry run — read only, release blocked

Observed **2026-11-02 20:09:08.302195 UTC**, against the authorized production
read replica, using only SELECTs in `scripts/src/routes-production-audit.sql`.
This is production evidence, not development data. The inputs were evaluated
with the same `planPlannerRoutes` and `coverageResolver` used by the importer.
No production schema/data changes or publication occurred.

**Seven templates are active. The importer requires exactly one, so all 224
blocks are blocked and the actual proposal contains zero stops.** The opening
decision count refers to duplicate-property placements within a selected
template; template selection is a separate unresolved release blocker.

| Production template | Active | Blocks |
| --- | --- | ---: |
| Mike - Perfect Try | Yes | 42 |
| New Schedule Template | Yes | 0 |
| RANDY - FIRST TRY 2026 | Yes | 42 |
| RANDY - FIRST TRY 2026 (Copy) | Yes | 42 |
| Randy And Luciano | Yes | 41 |
| Randy And Luciano (Copy) | Yes | 42 |
| TREE DAMAGE | Yes | 15 |
| **Total** | **7** | **224** |

Actual proposed stops per crew/day, before template selection:

| Crew | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hugo Crew | 0 | 0 | 0 | 0 | 0 | 0 |
| Luciano Crew | 0 | 0 | 0 | 0 | 0 | 0 |
| Manuel Crew | 0 | 0 | 0 | 0 | 0 | 0 |
| Rolando Crew | 0 | 0 | 0 | 0 | 0 | 0 |
| Sergio Crew | 0 | 0 | 0 | 0 | 0 | 0 |

Skipped blocks: **all blocks of every template above**, for the explicit reason
“Template selection blocked: exactly one active template is required.”
No duplicate placement has been imported; no covering-contract count is
attributed to a real import that is not allowed to run.

### Conditional alternatives — not import authorization

Each row below evaluates **only that template**, as if it were the sole active
one. These are independent alternatives, never a combined route or a recommendation
to choose the largest template.

| If this alone were active | Eligible stops | With 2027 mowing coverage | Without | Other skipped blocks | Duplicate decisions |
| --- | ---: | ---: | ---: | ---: | ---: |
| RANDY - FIRST TRY 2026 | 37 | 25 | 12 | 5 | 0 |
| RANDY - FIRST TRY 2026 (Copy) | 37 | 25 | 12 | 5 | 0 |
| Mike - Perfect Try | 37 | 25 | 12 | 5 | 0 |
| New Schedule Template | 0 | 0 | 0 | 0 | 0 |
| Randy And Luciano | 37 | 25 | 12 | 4 | 0 |
| TREE DAMAGE | 13 | 6 | 7 | 2 | 0 |
| Randy And Luciano (Copy) | 39 | 27 | 12 | 3 | 0 |

Coverage means a qualifying signed/active/renewed Contract Center term that
includes mowing. Missing/zero month spreads still prevent generation; catalog
defaults are not substituted for missing contract-owned timing.

Conditional crew/day placements:

| Alternative | Crew | Mon | Tue | Wed | Thu | Fri | Sat |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FIRST TRY and its Copy | Luciano Crew | 9 | 2 | 2 | 2 | 0 | 0 |
| FIRST TRY and its Copy | Manuel Crew | 2 | 2 | 2 | 2 | 1 | 1 |
| FIRST TRY and its Copy | Rolando Crew | 2 | 2 | 0 | 0 | 0 | 0 |
| FIRST TRY and its Copy | Sergio Crew | 0 | 2 | 1 | 2 | 2 | 1 |
| Mike - Perfect Try | Luciano Crew | 9 | 3 | 2 | 2 | 2 | 0 |
| Mike - Perfect Try | Manuel Crew | 2 | 2 | 1 | 2 | 1 | 0 |
| Mike - Perfect Try | Rolando Crew | 2 | 2 | 0 | 0 | 0 | 0 |
| Mike - Perfect Try | Sergio Crew | 0 | 2 | 1 | 3 | 1 | 0 |
| Randy And Luciano | Luciano Crew | 9 | 3 | 2 | 1 | 2 | 0 |
| Randy And Luciano | Manuel Crew | 1 | 1 | 2 | 2 | 1 | 0 |
| Randy And Luciano | Rolando Crew | 2 | 1 | 2 | 0 | 0 | 0 |
| Randy And Luciano | Sergio Crew | 2 | 2 | 1 | 2 | 1 | 0 |
| TREE DAMAGE | Luciano Crew | 0 | 0 | 0 | 3 | 0 | 0 |
| TREE DAMAGE | Manuel Crew | 0 | 0 | 0 | 4 | 0 | 0 |
| TREE DAMAGE | Sergio Crew | 0 | 0 | 0 | 6 | 0 | 0 |
| Randy And Luciano (Copy) | Hugo Crew | 9 | 0 | 0 | 0 | 0 | 0 |
| Randy And Luciano (Copy) | Luciano Crew | 2 | 3 | 2 | 0 | 1 | 0 |
| Randy And Luciano (Copy) | Manuel Crew | 2 | 1 | 1 | 2 | 1 | 0 |
| Randy And Luciano (Copy) | Rolando Crew | 2 | 1 | 2 | 0 | 0 | 0 |
| Randy And Luciano (Copy) | Sergio Crew | 2 | 2 | 3 | 2 | 1 | 0 |

All unlisted crew/day combinations are zero. There are **no within-template
duplicate-property decisions** in any alternative. Properties repeated across
different templates are not merged or arbitrarily deduplicated: selecting a
template is required first.

Conditional skipped placements, all because the property is inactive:

| Alternative | Property alias | Crew | Day |
| --- | --- | --- | --- |
| FIRST TRY and its Copy | Property 48 | Sergio Crew | Monday |
| FIRST TRY and its Copy | Property 9 | Sergio Crew | Monday |
| FIRST TRY and its Copy | Property 33 | Sergio Crew | Wednesday |
| FIRST TRY and its Copy | Property 26 | Sergio Crew | Thursday |
| FIRST TRY and its Copy | Property 62 | Manuel Crew | Friday |
| Mike - Perfect Try | Property 26 | Sergio Crew | Monday |
| Mike - Perfect Try | Property 9 | Sergio Crew | Monday |
| Mike - Perfect Try | Property 48 | Manuel Crew | Wednesday |
| Mike - Perfect Try | Property 33 | Sergio Crew | Wednesday |
| Mike - Perfect Try | Property 62 | Manuel Crew | Friday |
| Randy And Luciano | Property 9 | Manuel Crew | Tuesday |
| Randy And Luciano | Property 26 | Sergio Crew | Tuesday |
| Randy And Luciano | Property 33 | Sergio Crew | Wednesday |
| Randy And Luciano | Property 48 | Luciano Crew | Thursday |
| TREE DAMAGE | Property 26 | Luciano Crew | Thursday |
| TREE DAMAGE | Property 48 | Luciano Crew | Thursday |
| Randy And Luciano (Copy) | Property 9 | Manuel Crew | Tuesday |
| Randy And Luciano (Copy) | Property 26 | Sergio Crew | Tuesday |
| Randy And Luciano (Copy) | Property 48 | Luciano Crew | Friday |

Property aliases are assigned inside the production SELECT; actual customer
names, addresses, contact details and note text never leave production.
Crew/template names are the only business names shown. Notes are represented
only by a digest in the audit input so approval can detect changed snapshots.

The reserved `maintenance` source has **0 production visits**, independently
verified before replacing the unused validation value with `route`.

## Release prerequisites and approval

1. Randy must identify the intended template. Making it the sole active template
   is a separate, explicitly authorized production action; this task did not
   change any planner table, even to resolve this blocker.
2. Run a fresh SELECT-only production audit after template/crew decisions. Review
   the names-only placements, skipped blocks, duplicate decisions and 2027 coverage.
3. Randy must explicitly approve that actual production dry run. Approval of this
   task, its code, a merge, or deployment is **not** approval to import.
4. Only then add the reviewed company/fingerprint to `routeImportApprovals`.
   The registry is empty by default. The fingerprint is derived from the same
   import plan, including note digests and selected coverage, not customer labels.
   A later changed plan is rejected and requires renewed review.
5. Approved startup DML runs after `linkCrewsByName`, under crew and scheduling
   gates. Stops and `routes_imported_at` commit together. Zero/multiple templates,
   missing schema and unapproved/changed plans never set a success marker.
6. Publish/schema rollout is separate and requires the user's approval. No
   production writes or publication were performed here.

## Ownership and implementation

- `route_stops` owns property/service/crew/weekday/cadence/minutes and manual season
  overrides. Planner block provenance and notes are deliberate one-time snapshots.
- Contract Center `agreement_terms` / `term_scope_lines` owns coverage, contractual
  quantities and January–December month spreads. No quantities or crew names were
  copied into stops.
- `visits` owns dated trips and durable `(route_stop_id, route_occurrence_date)`
  identity. Its title/property/service/duration/notes are occurrence snapshots.
  Pattern edits do not rewrite existing trips, including cancelled or moved trips.
- `crews` remains the standing identity/hours owner. Route visits never create or
  synchronize tickets. Existing ticket mirrors remain solely
  `syncTicketFromVisits`' responsibility.
- Property deletion retires stops instead of deleting their occurrence identities.
  Only inactive historical stops may have a null property reference; active stops
  are checked to require one. Deletion cancels future planned route trips but
  preserves completed, in-progress, skipped and past-planned trips. A database
  trigger protects SQL/cascade callers too. The app takes the scheduling gate
  before its customer row lock, not from inside the row trigger.
- `routes_last_filled_on` is a company-owned operational completion marker, not
  another scheduling pattern. It makes once-per-Colorado-night behavior durable
  across instance restarts. The advisory lock is held for the actual transaction.

The owner approved property-contract precedence during implementation: use the
property's qualifying contract first; use its direct parent's contract only if
no qualifying property contract exists. An excluded property service cannot be
restored from parent scope. A snow-only contract does not govern landscape work.
Within qualifying terms, reuse Contract Center's latest-start/ID priority and
signed/active/renewed eligibility, not its display fallback to old/unsigned terms.

### Files and call sites

| Area | Files / call sites |
| --- | --- |
| Additive schema | `0061_route_stops.sql`, `0062_route_customer_history.sql`; `lib/db/src/schema/schema.ts`; client `shared/schema.ts`; stub `check` support |
| Driver-free validation | `lib/db/src/routeContracts.ts`; exported through shared schema |
| Shared operational coverage | `lib/contractCoverage.ts`; bounded `loadContractCoverage` in `contractCenterPersistence.ts` |
| Fill / slide | `lib/routeFill.ts`, `lib/routeSlide.ts`; all writers take `lockVisitCompany` |
| R2 API contracts | `routes/routeStops.ts`; registered beside visit routes |
| Import / approval | `lib/importPlannerRoutes.ts`, `routeImportApproval.ts`; `registerRoutes` after crew linking |
| Nightly lifecycle | `lib/routeScheduler.ts`, `routeSchema.ts`; start/close in `index.ts` |
| Existing board deletion | `routes/visits.ts`: route DELETE cancels rather than physically deleting occurrence identity |
| Existing customer deletion | `storage.ts`: company gate before deletion; database trigger retires stops and cancels future planned route trips without losing dated identity |
| Existing visit response contract | Visit enum/nullable route fields in existing OpenAPI schema and regenerated existing outputs; no new frontend code-generation layer |
| Verification | `routeEngine.test.ts`, `routeEngine.integration.test.ts`, `routeScheduler.test.ts`, `routeTestFixture.ts`, client `shared/visits.test.ts` |
| Production SELECT | `scripts/src/routes-production-audit.sql` |

No mobile/Today, campaign, navigation, Contract Center UI, planner writer or
Scheduling UI redesign was made. Existing generic board cards and Move actions
work without R2 UI. Planner tables remain editable and unchanged by this slice.

## Verification results

### Baseline and diagnostic delta

Library declarations were rebuilt **before** measuring baseline diagnostics.
API: **730 before / 730 after**, CRM: **221 before / 221 after**.
Comparing diagnostic file/error-code counts, ignoring moved line/column positions
and display ordering inside long inferred structural types, gives **zero new
diagnostics**. Shared library declaration build passes.

The measured test baseline is **7 API failures and 10 CRM failures**, not the
attachment's historical counts. Baseline suites were reproduced from an isolated
pre-change source archive with the same dependencies and uploaded fixtures:

- API baseline: **2305 passed, 7 failed, 74 skipped**.
- CRM baseline: **892 passed, 10 failed**.
- Full API after the final fixes: **2370 passed, 7 failed, 96 skipped**; the 22
  real route database tests are explicitly enabled in the focused runs below,
  not misrepresented as passing in the default skipped suite.
- Full CRM initially found the same 10 baseline failures plus an outdated visit
  column expectation. That expectation was updated to include both route columns;
  the changed client-contract suite is separately verified.

Inherited API failures: plant enrichment partial-state expectation and six
mailbox OAuth reconnect cases. Inherited CRM failures: two CrewAssignmentBoard
selection cases, two conversation Overview/composer expectations, five
`useTabParam` router cases and one rate-card grouping expectation.
Initial unrestricted runs also encountered unrelated database-suite hook
timeouts; bounded-worker baseline/final runs remove those timing failures.
No unrelated baseline failures were changed or hidden.
The final full run also includes independently merged main-branch updates; the
baseline and final API failure set remains identical.

### Focused checks

Final result: **48 API checks and 43 client/Scheduling checks pass under each
of UTC and America/Denver**. The development SQL migration and schema-drift
check pass, as does `git diff --check`. Both restarted workflows are serving;
there are no new startup errors.

The final corrections were verified with real PostgreSQL tests:

- Winter coverage uses the existing `[2,2,2,0,0,0,0,0,0,0,2,2]` month spread.
  A June–July fill creates zero visits; fills across March–April and
  October–November generate only in the positive contract months. A manual season
  override remains an explicit exception to contract-owned timing.
- Both the existing application customer deletion and direct SQL customer
  deletion succeed after route visits exist. Stops become inactive tombstones;
  all visit IDs, stop IDs and occurrence dates survive. Future planned trips are
  cancelled, other statuses/past trips retained, refill creates nothing, and
  neither orphan reactivation nor physical deletion of a referenced stop is allowed.
- The follow-on guarded migration corrects only the newly introduced R1 foreign
  keys; no pre-R1 table/column/constraint is dropped or renamed. Readiness now
  requires this lifecycle guard, so a database between the two R1 migrations is
  not used by automatic fill/import.

Focused commands (both must pass):

```sh
ROUTES_DB_TESTS=1 TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  src/lib/routeEngine.test.ts src/lib/routeEngine.integration.test.ts src/lib/routeScheduler.test.ts
ROUTES_DB_TESTS=1 TZ=America/Denver pnpm --filter @workspace/api-server exec vitest run \
  src/lib/routeEngine.test.ts src/lib/routeEngine.integration.test.ts src/lib/routeScheduler.test.ts
```

Coverage includes season clipping/overrides/missing contracts/parent coverage and
approved precedence; spring/fall DST and New Year; weekly/fortnightly and inclusive
pause boundaries; real uniqueness; cancelled/moved/completed identities; constant
read-query count for 1 versus 201 stops; concurrent fill/board move; filtered
day/week slides, Sunday skipping, append ordering and rollback; all route roles,
foreign references and duplicate conflicts; PATCH defaults, exact-group reorder,
soft deletion and board deletion tombstones; contractual progress after slides;
default-off, unchanged-planner, template-blocked, fingerprint-invalidated,
concurrent, one-time and rollback import; schema rollout guards, timer lifecycle
and real advisory-lock/once-per-night scheduling.

Development migration applied successfully; schema drift and whitespace checks
are required before completion. Logs, sanitized production input/report, typecheck
signatures and disposable browser setup live under ignored
`generated-artifacts/routes/`, excluded from Git and deployment. The temporary
baseline source archive was removed, including its duplicate Drizzle config.

### Signed-in development demonstration

A randomly generated disposable development company/user was used; no real
account password or real customer schedule was changed.

1. Imported the copied planner shape: six stops.
2. Filled the default horizon: **19 visits** visible as individual generic cards.
3. Browser inspected property names and “Weekly turf service”; no route card
   links to a ticket.
4. Existing Move action moved Monday's visit to the second crew on Tuesday.
   API evidence confirmed its original Monday occurrence identity was unchanged.
5. Tuesday week-slide moved **5** planned visits. Real database verification also
   proves ticket visits and their ticket mirror remain unchanged.
6. Refill created **0** visits. Browser confirmed 19 unique visit IDs and 19
   unique stop/occurrence pairs; the moved visit remained moved.

The populated board screenshot was examined. API/CRM workflows restarted and
served requests successfully. No R2 Routes page, rain UI, mobile change, planner
freeze or production import is claimed.
