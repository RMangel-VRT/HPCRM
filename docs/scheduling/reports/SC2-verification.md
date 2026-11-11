# SC2 — Calendar round generation verification

Date: 2026-11-11. Scope: existing CRM/API, development implementation and
disposable development verification. **No production generation or publication.**

## Safety and predecessor evidence

The assigned SC2 plan and uploaded November 11 brief governed implementation.
Inspected the actual SC1 calendar services, stable-ID replacement, schema,
starting constant, catalog and handoff plus the CG2–CG5/CP6 consumers. No SC1
rebuild, obsolete specification reconstruction, SC3 or native-mobile work.

The first required production read was denied because authenticated production
access was unavailable. Work stopped before migration. After the owner reported
publishing, the supported **read-only production** query succeeded:

```sql
SELECT count(*)::integer AS contract_campaign_count
FROM campaigns
WHERE source = 'contract';
-- 0
```

Development inventory also returned **zero contract campaigns** before migration.
Inspected installed campaign checks and inbound FKs: checklist tasks, crews and
items reference campaigns with cascades; the existing check required month/seq.
No cleanup was needed or performed. No production connection string, direct
production runner, DDL, starting load, opt-in or Generate was used.

## Migration and schema parity

New, previously unused filename:
**`.migration-backup/migrations/0083_calendar_campaign_identity.sql`**.
Applied in development with `pnpm --filter @workspace/scripts run migrate`:
**1 applied, 96 already current**. The existing 0074 checksum warning was
reported, not suppressed, repaired, renamed or reapplied.

The strict runner wraps the entire migration in a transaction. A locked guard
refuses existing month-based contract-source work, including a partially
installed identity. It never deletes or converts campaigns or their children.
The real PostgreSQL refusal test used a transaction-local legacy table and
verified the refused row survived.

Installed development schema:

- `calendar_entry_id varchar`, FK
  `campaigns_calendar_entry_id_service_calendar_id_fk` →
  `service_calendar(id) ON DELETE RESTRICT`.
- `round_year smallint`; new identity fields are required by the contract-source
  check, nullable for manual campaigns.
- `round_month date` and `round_seq smallint` remain nullable and unused by new
  rounds. Manual campaigns must keep all generated identity fields NULL.
- Partial unique index **`campaigns_calendar_round_unique`** on
  `(company_id, calendar_entry_id, round_year) WHERE source='contract'`.
  **`campaigns_contract_round_unique`** is absent.
- Both `campaigns_check` historical automatic naming and the explicit
  `campaigns_identity_check` are handled. The installed check and both
  declarations use the complete boolean expression wrapped in **`IS TRUE`**.
- Separate fertilization/broadleaf → chemical; irrigation opening/winterization
  retain irrigation subtypes; all other generated services, including native
  mowing and backflow, → general.

`calendarCampaignMigration.integration.test.ts` compares PostgreSQL's canonical
installed check expression with the shared SQL expression, verifies the
Drizzle check, frontend mirror/index and populated-legacy refusal. Actual
writer integration tests reject absent entry/year, invalid category, legacy
generated chemical, duplicate identity, nonexistent FK, referenced-entry
deletion and generated fields on manual campaigns.

Schema-drift and required-extension checks passed. No new extension was needed.
Production schema changes remain exclusively the owner's later Publish flow.

## Interfaces and ownership

- `coverageResolver.forDate(customerId, serviceKey, date)` adds exact inclusive
  deadline coverage with firm-before-sent priority, normal term priority and
  own-before-immediate-parent precedence, including own exclusion. The yearly
  resolver and `forMonth` are unchanged.
- `campaignDemand(inputs & {calendar}, year, today)` replaces program inputs.
  `DemandCalendarEntry` and `calendarInstance` provide entry/year/name/opens/due.
  Date-only ISO strings keep arithmetic independent of the host timezone.
- Demand identity: **`serviceKey/calendarEntryId/roundYear`**. Count/timing
  provenance: contract/standard and contract/calendar. No catalog count/month
  defaults or copied contract timing.
- Positive stated months map to distinct compatible instances, preferring the
  deadline month then calendar position. This includes prior-year openings
  and two November clean-up windows. No month-keyed substitutes.
- Silent count selects standard entries or all entries only for exact matches;
  otherwise `needs_rounds`. Missing rounds/standard count → `no_count`.
  Duplicates/invalid values/explicit zero retain safeguards. Included backflow
  devices yield one annual deadline obligation, not one round per device.
- `legacy_chemical` blocks only the old combined line when no split lines exist.
  With split lines present it is informational. `count_mismatch` remains
  informational; neither nulls valid new-service obligations.
- `RoundRef`, demand/report/member contracts, OpenAPI, generated React types
  and Zod validators use the new identity; ServiceRound also exposes `name`.
  Old required month/sequence fields and `no_timing` are retired from this flow.

`campaignReconcile` queries year identity under the existing company gate and
uses year + entry name and real dates. It preserves rollback-only preview,
opt-in, idempotency, protected history, elapsed/kept/missed/closed behavior.
Only an unopened, unstarted round without protected work refreshes its name
and dates; started empty rounds are not deleted.

Calendar replacement and starting load acquire the generation company gate
before their calendar locks. Replacement checks omitted entries before any
delete/update and refuses referenced entries with
**“Archive or finish its rounds first”**; the FK is a final backstop. No archive
workflow was added. Concurrent generation/deletion refusal is tested.

Membership refresh now observes calendar writes. Contract-state badges,
previous-round inheritance, fulfillment and item/operations projections use
the same identity. Month/sequence remain only in schema compatibility columns
and engine-owned-field rejection lists.

Backflow is absent from board/queue projections and Start round; direct release
is rejected under the round lock. Its normal item completion/reopen is retained
without generating a crew-day visit. Ordinary generated and manual work flows
are unchanged. Generic visits continue rejecting campaign-owned writes.

Shared fulfillment calls the same demand over all years intersecting the
selected term, matches existing campaign/items by entry/year, and exposes true
snapshot windows, opening-date `round_window` next actions and checklist owed
1/done 0–1. Route visits and chemical item target/backup promises retain their
owners. The client does not recalculate owed obligations.

Generate groups named windows by service and renders the supplied plain gap
wording. Services presents new statuses before operational states, contract
links plus a permission-aware calendar link for `needs_rounds`. English and
Spanish status/timing/gap resources were updated.

## Automated verification

Pure engine tests preceded database integration and rendered verification:

```sh
pnpm --filter @workspace/api-server exec vitest run src/lib/campaignDemand.test.ts
```

**13 passed**, covering:

- Oct 1–Sep 30 fall-shrub/fall-fertilizer/January-grass ownership, and
  Oct 15–Oct 14 owing fall shrub exactly once.
- Clean-ups 3/2/blank, shrub June/October, June clean-up gap, two November
  leaf rounds, December-to-January mapping.
- Legacy-only/coexisting treatment lines and annual backflow independent of
  device count; explicit zero, invalid counts/months, duplicates and mismatch.
- Firm/sent/newer-term priority, inclusive boundaries, own exclusion and
  retained Routes resolution.

Server verification commands (serialized workers; logs in ignored
`generated-artifacts/SC2-*.log`):

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignDemand.test.ts src/lib/customerServiceFulfillment.test.ts \
  src/lib/customerServiceFulfillmentLoader.test.ts \
  src/routes/campaignGeneration.integration.test.ts \
  src/lib/campaignMembership.integration.test.ts \
  src/lib/campaignRoundLists.integration.test.ts \
  src/routes/serviceCalendar.integration.test.ts --maxWorkers=1 --no-file-parallelism

pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignRoundLists.integration.test.ts src/lib/campaignMembership.test.ts \
  src/lib/routeEngine.test.ts src/lib/routeScheduler.test.ts \
  src/routes/customerServices.test.ts --maxWorkers=1 --no-file-parallelism

ROUTES_DB_TESTS=1 pnpm --filter @workspace/api-server exec vitest run \
  src/lib/calendarCampaignMigration.integration.test.ts \
  src/lib/routesR3.integration.test.ts --maxWorkers=1 --no-file-parallelism
```

The initial combined pass exposed obsolete fixture assumptions (generated
`chemical`, monthly identities, empty programs and the retired gap). These
were updated to the real calendar contract, not bypassed. Focused reruns passed
generation/history/edit/refusal protections, shared fulfillment including the
October term, membership, API role/company guards and CG4 completion/reopen,
team scoping, chemical promises and checklist direct-release exclusion.

The enabled Routes integration initially had six failures before reaching
coverage: its unchanged synthetic user omitted the now-required `accessRole`.
The fixture now supplies both role fields, with no production permission change.
**All 19 Routes integration tests passed**, together with **2 migration/parity
tests**. Pure Routes engine/scheduler checks also passed.

Rendered verification:

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  src/pages/CampaignGenerate.rendered.test.tsx \
  src/components/customer/pages/ServicesPage.cp2.test.tsx \
  src/lib/contractCustomerServices.test.ts \
  src/components/campaigns/GeneratedRoundView.test.tsx \
  src/hooks/useContractCustomerServices.test.tsx \
  src/lib/roundLists.test.ts src/pages/CampaignDetail.rendered.test.tsx \
  --maxWorkers=1 --no-file-parallelism
```

**67 passed**, including named-window wording, new gaps, checklist absence from
Start round, Services keys/states/provenance, permissions, drawer preservation,
manual/generated edit restrictions, query company scoping and crew-list flows.

API/CRM managed workflows restarted successfully after the code batch.
Proxy health and the actual Generate Vite module both returned **200**.
Existing development QuickBooks fixture-token warnings, Browserslist and
PostCSS warnings remain; no new startup/backfill behavior was added.

## Baseline-aware typechecking

- OpenAPI codegen and `pnpm run typecheck:libs`: **passed**.
- Canonical `pnpm run typecheck`: **not clean**; existing broad leaf errors
  remain. No assertions, exclusions or typecheck scripts were weakened.
- Existing compiler-host HEAD-source comparison:
  API **744 baseline-context / 695 current**, CRM **219 / 212**, with
  **zero added diagnostic messages** in each. These baseline-context counts
  use the current emitted library declarations; they are not a claim that the
  unchanged historical workspace had those exact counts.
- Current leaf totals agree with prior handoff baselines: API 695, CRM 212.
  Root output and comparison evidence are retained in ignored
  `SC2-root-typecheck.log` and `SC2-typecheck-comparison.log`.

## Development 2027 preview and browser evidence

Created a disposable development-only company/admin/property with a signed
**Oct 1, 2026 – Sep 30, 2027** term. Explicitly invoked SC1's
`loadStartingServiceCalendar` there; no real-company or production calendar
was loaded. The fixture included standard shrubs/grass/fertilization/broadleaf,
clean-ups ×2 without dates, and backflow ×8 devices.

One signed-in browser journey used actual persisted endpoints, not mocked GETs:

1. 2027 preview showed **8 rounds/8 memberships**, clean-ups `needs_rounds`,
   and grass opening **Dec 1, 2026**. Neither fall shrub due Oct 31, 2027 nor
   backflow due Dec 31, 2027 belonged to this term. Preview left campaigns and
   opt-in empty.
2. Confirmed **development fixture only** Generate created 8 rounds/8 items.
   Reload showed **0 pending changes**.
3. Customer Services showed the full selected term, including fall shrub 2026
   plus spring shrub 2027 (**owed 2**), grass 1, fertilizer 3, broadleaf 3,
   backflow 1 and unspecified clean-ups. True windows and endpoint counts agreed.
4. Generated the fixture's **2026** backflow obligation separately. Its round
   page had no Start control. Item-page completion survived reload, yielded
   backflow **owed 1/done 1/remaining 0**, and created **no visit**.
5. Direct start returned 409 and the Scheduling calendar excluded the checklist.
   The browser's direct-start check occurred after completion and therefore hit
   the closed-round guard; the database integration separately proves the
   checklist-specific 409 while active.

Captured screenshot attachments in the task conversation:

| Evidence ID | Capture |
|---|---|
| `hi3axe` | **2027 Generate preview** with starting-calendar grass window and gap |
| `s0wkdm` | Confirmed development fixture generation result |
| `pr8x5a` | Reloaded state with zero pending changes |
| `zzd5jc` | Customer Services selected-term counts |
| `ybvz9t` | Backflow round without Start round |
| `k6qtes` | Persisted checklist item completion after reload |

The browser runner supplies screenshot attachments rather than a filesystem PNG.
The 2027 preview was captured and visually inspected; no local PNG export is
claimed. Disposable fixtures were removed after evidence collection.

## Operational boundaries and remaining limitations

- No production Generate, calendar load, data edits, migration runner or
  publication. The required production count was the only production operation,
  and it was read-only. Merge does not authorize production generation.
- No contract counts/months were rewritten, no legacy chemical auto-split,
  no catalog defaults, no Routes algorithm changes, no SC3/mobile work.
- Calendar reference deletion is refused even for archived/completed rounds
  while a reference exists; the requested message does not imply that simply
  finishing a round removes its FK.
- Optimistic concurrent-editor conflict detection remains explicitly out of
  scope. Company locks serialize calendar/generation writers but do not prevent
  a later stale editor from intentionally replacing a previously saved list.
- Root typecheck remains baseline-failing as reported above. No additional
  browser pass was launched after the one completed journey.
