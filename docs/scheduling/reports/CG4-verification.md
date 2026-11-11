# CG4 verification and integration handoff

Date: 2026-11-11. Scope: assigned CG4 plan only. Awaiting task merge.

## Source and pre-flight

The repository CG4 specification was deliberately absent. Work initially stopped
as recorded in [pre-flight evidence](CG4-preflight-verification.md). The owner then
explicitly selected **“Use the assigned CG4 plan”** after confirming CG3's merge.
This CG4-specific exception resolves that source blocker; it does not authorize
CG5 or restoring obsolete specifications.

Read the repository slice workflow, complete Campaigns rules and ledger,
Scheduling rules/master scheduling direction, ownership map and actual CG3
handoff. Fetched `origin/main` contains CG3's merged implementation. Verified
the real producer handoff: `campaignDemand`, `campaignItemProtected`,
`reconcileCampaigns`, `scheduleCampaignMembership`, `withCampaignContractStates`,
standing `crews`, existing `campaignCrews` projections, and the company visit gate.
No predecessor was reconstructed.

Before migrating, inspected development PostgreSQL's installed visit indexes:
`visits_campaign_item_done_unique` is already unique only where
`campaign_item_id IS NOT NULL AND status = 'done'`. The revised CG1 source and
both schema copies agree. The obsolete instruction to replace an open index
does not apply. CG4 preserves the done-only index and CG1 constraints unchanged.

## Migration / integrations

Additive `.migration-backup/migrations/0076_campaign_crew_lists.sql` adds nullable
`campaigns.started_at`, `campaigns.started_by_id`,
`campaign_items.crew_position` and pending-only
`campaign_items_crew_priority_idx`. No new tables, second roster, planned visits
or duplicate chemical date owner. Development migration runner applied it once.
It reported an existing `0074_campaign_service_timing.sql` checksum discrepancy;
that predecessor migration was not edited or reapplied. Schema drift passed.
No production database operation was performed.

Exact endpoints and OpenAPI operations:

| Endpoint | Operation |
| --- | --- |
| `GET /api/campaigns/:id/round-lists` | `getCampaignRoundLists` |
| `PUT /api/campaigns/:id/round-order` | `moveCampaignRoundItems` |
| `POST /api/campaigns/:id/copy-previous-split` | `copyCampaignRoundSplit` |
| `POST /api/campaigns/:id/start-round` | `startCampaignRound` |
| `GET /api/campaign-rounds/calendar?from&through` | `getCampaignRoundCalendar` |

Implementation owners: `campaignRoundWork.ts`, `campaignRoundLists.ts`,
`campaignRoundAccess.ts`, `campaignRoundContext.ts`,
`routes/campaignRoundLists.ts`, existing `storage.updateCampaignItem`.
Generation membership calls `inheritedRoundTeam` only for genuinely new items
and normalizes pending order; finished rows remain unchanged. Calendar output
reads existing windows and target dates; it never writes visits.

The generated default `GeneratedRoundView` uses existing standing crew links.
`RoundProjections` sits outside Scheduling's visit board, queue/capacity math and
DnD context. No change to planned visit ownership. Queries/mutations capture
company identity and mutations invalidate crew lists and calendar projections.

## Completion/reopen writer inventory

All existing `storage.updateCampaignItem` callers retain their route side
effects; only generated rows enter the atomic recorder. Manual/extra-billable
rows retain their pre-existing direct update and do not acquire new visit locks.

| Writer in `routes/routes.ts` | Behavior / verification |
| --- | --- |
| `POST .../checklist/:taskId/toggle` | Generated irrigation uses `toggleRoundChecklist`: checklist/audit/item/visit commit together, recomputed under lock. Tested actual mounted handler. |
| `PATCH /api/campaigns/:id/items/:itemId` general status | Complete, reopen, skip use recorder. Tested actual mounted handler plus concurrent storage transitions and rollback. |
| Same PATCH, chemical `complete_work` | Intermediate work phase, not final status completion; existing weather/work fields retained. |
| Same PATCH, chemical `send_post_communication` / `finish_without_comms` | Final item status enters recorder. Actual handlers tested, including failed/successful delivery with mocked external email boundaries; no real messages sent. |
| Same PATCH, chemical `reset` | Reopens item and cancels done visit. Tested through actual handler. |
| `POST .../complete-work` | Intermediate work phase. Actual handler tested; no visit until item becomes completed. |
| `POST .../send-post-comm` | Actual handler tested with mocked delivery: failure leaves item pending with no visit; success creates one done visit. External delivery deliberately not exercised. |
| `POST .../complete-work-v2` | Existing work phase retained. Actual handler tested. |
| `POST .../send-completion-email` | Updates email references, not item status; cannot duplicate a done visit. No real email sent. |
| Weather, photo, label, billing and reassignment callers | No completion transition means no visit insertion. Existing manual/extra-billable behavior bypasses new recorder. |

Recorder order: company visit advisory gate, `campaign-gen:<companyId>` gate,
round row, item row. Item/visit changes are one transaction. The request actor is
rechecked after locking; stale crew reassignment cannot complete another team's
property. Visit date uses Colorado calendar conversion, not host UTC. Company
agreement includes the property and linked standing crew.

## Checks

Generated API clients/validators and library declaration typecheck passed:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/scripts run migrate
pnpm --filter @workspace/scripts run check-schema-drift
```

Disposable development PostgreSQL checks:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignRoundLists.integration.test.ts \
  src/lib/campaignMembership.integration.test.ts \
  src/routes/crewLinks.integration.test.ts
```

Initial combined pass: **37 passed**. It caught a reconciliation regression
which rewrote finished priority metadata; fixed by normalizing pending rows only.
It also exposed an existing crew-link test fixture missing canonical
`accessRole`; corrected the fixture without changing manual crew behavior.
Final coverage is **95 passing server checks** across the combined predecessor
run and the final 25-check round integration run. Follow-up fixture corrections
were confined to the tests. The final additions cover stale actor authorization,
cross-company property rollback, chemical dates outside round windows and both
post-notice finalization writers with mocked successful/failed email delivery.

Rendered/pure CRM checks:

```sh
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/components/campaigns/GeneratedRoundView.test.tsx \
  src/lib/roundLists.test.ts src/pages/SchedulingPage.rendered.test.tsx
```

**47 passed** in the final coverage (the original 45 plus two drag regressions),
covering priority/history separation, exact insertion targets,
visible-order multi-selection, read-only field lists, start warning/confirmation,
non-draggable calendar links, Mon–Sat inclusive pace, clipping and existing board
behavior. Pending priority operations are additionally verified against actual
PostgreSQL with simultaneous reorders.

API/CRM workflows restarted successfully. API `/api/healthz` returned 200;
signed-out calendar access returned 401. CRM Vite served without compilation
errors. Existing unrelated QuickBooks fixture-token warnings remain in server
background logs; they are not a CG4 failure.

Leaf typechecks remain red in the broad existing project baseline:
`pnpm --filter @workspace/api-server run typecheck` reports 695 diagnostics;
`pnpm --filter @workspace/highplains-crm run typecheck` reports 212. Categories
include existing handler returns, cross-root shared schema imports/stubs and
unrelated pages/tests. No diagnostics named the new round modules or modified
CRM feature modules. These commands are **not claimed as passing**.

Durable test transcripts are in ignored `generated-artifacts/cg4/`.

## Boundaries / interpretations

- New arrivals use the nearest earlier same-service round containing the
  property. Explicit copy uses the immediately previous same-service round and
  affects pending items only. No prior/eligible active link means Unassigned;
  a deliberate Unassigned choice does not revive older assignments.
- Pace is pending properties divided by inclusive remaining Mon–Sat days,
  beginning at the later of Colorado today/window start. An expired window
  reports overdue rather than dividing by zero.
- Final item `status = completed` owns done visits. Chemical work completion is
  still an intermediate phase until the existing finalization action; notices,
  permissions and target/backup ownership were not redesigned.
- Existing assigned-user access is preserved before start. New team-based field
  access requires a started round and active same-company linked standing crew.
- No production writes, explicit Generate runs, generation opt-in, real notices,
  backfills, publishing, mobile-native screens/push or CG5 implementation.

## Browser and final verification

One browser pass used an isolated development company with Office and two Field
users, two supervised standing crews, four aeration properties and an unstarted
chemical round. It confirmed:

- Crew lists is the default; Office added both linked crews through the UI,
  split properties 2/2, and arrow reordering survived refresh.
- The start confirmation explicitly says no customer notifications are sent;
  starting wrote the timestamp/actor and exposed field lists.
- An unstarted chemical round returned 403 to Field. After start each Field
  user saw only its own crew/properties. Other-team direct reads and notes PATCHes
  returned 403 and left the probed records unchanged.
- Existing item-detail completion created one done visit. Reopen cancelled it;
  recompletion retained one cancelled and one done row. Closed work appeared
  outside the open priority list.
- Scheduling's Today view showed crew round projections, the unassigned chemical
  round and chemical target link. No planned campaign visits existed; completed
  work appeared on the board without consuming capacity.
- At 1280 and 768 pixels there was no horizontal overflow. Lanes were too narrow;
  changed the new grid to use available content width with a 22rem preferred
  minimum instead of viewport-based three/two-column breakpoints.

One native drag gesture toward a lane heading did not change order, while arrow
controls did. Follow-up handling now prepends at the heading, distinguishes the
upper/lower halves of a row, retains native payload in a ref, and treats dropping
a multi-selection onto itself as a no-op. Two rendered event regressions passed
for those exact cases. The browser pass was **not** repeated after this fix or
the final backend under-lock guards; those changes were confirmed by rendered
events/PostgreSQL integration checks and a final workflow restart.

Disposable browser fixtures were cleaned up: 2 visits, 1 company, 4 users and
3 sessions. Evidence captions/IDs are retained in ignored
`generated-artifacts/cg4/browser/findings.md` and `evidence-manifest.md`;
the browser screenshots are attached to the test result, not copied into Git.

Final API build (including document-runtime preflight) passed. Both managed
workflows restarted successfully after the final code batch; health returned
200. Vite transformed all four changed feature modules with 200 responses.
The signed-out preview screenshot rendered the login page without a fatal
browser error (the expected unauthenticated auth request returned 401).
The final API leaf typecheck still reports 695 existing diagnostics, with none
in the new round modules; CRM's 212-diagnostic baseline remains as noted above.
`git diff --check` passed.

No identified CG4 functional blocker remains. The missing repository source is
an explicitly approved source exception, not a silently skipped prerequisite.
The older open-index instruction was resolved against actual CG1's done-only
index. No predecessor schema rebuild, production write or CG5 work was done.

### Completion-review correction

The completion review identified a real authorization gap: `irrigation_manager`
could qualify through one started team but was omitted from the shared field
projection predicate, exposing other teams through both round read endpoints.
Added that role to `roundField`, which also consistently scopes crew reads,
item actions and the recorder's under-lock recheck. No legacy all-round manager
privilege existed for this role; explicit campaign-assignee access remains broad
and available before start as required.

The final **24-check** PostgreSQL round suite passed. It mounts the actual legacy
`GET /api/campaigns/:id` handler as well as the new round-list handler and asserts,
for irrigation manager, crew supervisor and field identities: pre-start denial,
own-team-only properties/teams after start, other-team mutation denial, and
preserved broad pre-start reads when explicitly assigned to the campaign.
No second browser pass was needed for this shared predicate correction.

The first API restart after this correction exceeded its readiness budget while
existing legacy startup initialization traversed the large development fixture
population. After inspecting logs (no code/build crash or port mismatch), a
single retry with a longer startup budget succeeded. No startup/backfill code
was changed and no separate backfill was requested or manually run.

### Calendar authorization correction

The final completion review also identified the calendar as a separate read
surface that still allowed company-wide irrigation-manager projections. Fixed
the calendar loop to apply the same explicit-assignee or started-team policy
before emitting any round bar, team, count, unassigned queue entry or chemical
target item. Hidden/unstarted rounds now contribute no projected data.

The final **25-check** round integration suite passed. Its added calendar case
checks unstarted exclusion, another team's round exclusion, own-team-only bars/
counts/chemical dates, and preserved whole-round access for an explicitly
assigned user before start. Both reported completion-review access findings
are addressed in code and covered by real PostgreSQL endpoint assertions.
No additional browser run was launched. The API restarted successfully with
the existing longer startup budget after this final correction.
