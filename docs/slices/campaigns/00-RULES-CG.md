# 00-RULES-CG: Campaigns generated from contract scope

> Read this at the start of **every** CG task, together with the slice file and `STATUS.md` in this folder. Also assumes 00-RULES-O (ownership) and the scheduling rules (00-RULES-P3, 00-RULES-R). Read `docs/scheduling/Master-schedule-design.md` and `.agents/memory/` first. Base: current `main`; find code by its content, not line numbers.

## Goal

This is step 2 of the master schedule build order: **campaigns onto the calendar, generated from contract scope.** Routes (step 1) is done: R1–R3 are live and the old planner is gone.

Every counted seasonal service a property is owed (aeration, clean-ups, shrub trims, fert/chem…) comes from its Contract Center season. Instead of rebuilding campaigns by hand each year, the CRM builds one campaign per round ("2027 Shrub trimming – June") containing every property owed that round, keeps the membership in step with contracts, and lets the office split each round into crew lists that show on the Scheduling board.

## Randy's decisions (Nov 9, 2026)

1. **One campaign per round.** A round is one pass around the customer base for one service in one month: "2027 Shrub trimming – June", then "2027 Shrub trimming – October". This is the shape today's campaign pages already use (Spring Turn-On). There's no rounds layer inside a campaign.
2. **Count and timing:** a season's stated count and months always win, per customer. Where the count is blank, the service's **standard** (set on Settings → Service timing) applies; with no standard it's a gap, never a guess. Where months are blank (most contracts say only "fertilized 3X per season"), the round months come from a **company service program**: per service and per count, which months the rounds fall in (e.g. fert/chem × 3 = Mar, Jun, Sep). The contract owns *how many*; the program owns *when*, only where the contract is silent. **Never write program months into a contract season.**
3. **Membership:** a property joins a round when a **signed, active, renewed or sent** season covers that month and includes the service. Sent seasons show as "Waiting on signature" on the item. Draft, lost and cancelled seasons never put a property in a campaign.
4. **Campaign services:** aeration, clean-ups, shrub trimming, ornamental grass cutback, **tree pruning**, fert/chem (`chemical`), irrigation start-up (`irrigation_open`) and winterization. Everything else is not generated (see the catalog table in CG1).
5. **Rounds are worked from crew lists (Nov 10).** The office splits a round between one or more crews; each crew works its list in a priority order the office can rearrange, within the round's window. No property is pre-dated, except fert/chem, which keeps today's per-property target date, backup date and customer notices exactly as they are. A visit is recorded when a property is completed.
6. **Mowing, pet stations, winter visits and irrigation checks stay on Routes.** Snow stays event-based (not planned yet).

## Ownership (do not break)

| Fact | Owner | Never |
|---|---|---|
| What a property is owed (service, count, stated months) | Contract Center `term_scope_lines` | Copy counts or months onto campaigns, items or the program |
| When rounds fall where the contract is silent | **New:** `service_programs` (CG1) | Write program months back into scope lines |
| Which properties are in a round | Derived from contracts by the CG2 engine; `campaign_items` rows are its materialized result | Hand-maintained membership on generated campaigns (manual add/remove is blocked on them) |
| A finished trip | `visits` (recorded at completion, CG4) | Pre-date round work as planned visits |
| A fert/chem property's promised date | `campaign_items.target_date` / `backup_date` (unchanged) | A second planned date for the same application |
| Which crew works a property, and in what order | `campaign_items.assigned_campaign_crew_id` + `crew_position` (CG4) | A per-round crew roster separate from standing crews |
| Done / skipped for a round item | `campaign_items.status` (existing completion flows) | Infer done from a visit alone before Phase 4 |
| Standing crews | `crews` | New crew lists |

- **Service keys come from `SCOPE_CATALOG`** (`shared/contractCatalog.ts`). Don't add a parallel list of service names; extend the catalog entry.
- **Coverage uses the existing helper.** `lib/contractCoverage.ts` (`coverageResolver`) already answers "which term covers this property for this service", including immediate-parent coverage and "own property wins". Extend it (status set, per-month resolution); don't write a second resolver.
- **Parents never get items.** Items are per property (`assertNotParentCustomer`). A branch covered through its parent's contract gets the item.

## Hard rules

- **Schema: additive only.** Ship DDL as the next free `.migration-backup/migrations/NNNN_*.sql` (the startup runner isn't wired; see `.agents/memory`). Migration numbers below are hints; check the folder.
- **Idempotent and locked.** Generation and reconciliation run in one transaction per company under `pg_advisory_xact_lock(hashtextextended('campaign-gen:<companyId>', 0))`. Running twice changes nothing.
- **Never touch finished work.** A `completed` or `skipped` item, an item with any chemical workflow progress (`chem_pre_sent_at`, `chem_work_completed_at`…), a ticket, or a visit is never deleted or moved by the engine.
- **Hand-built campaigns are left alone.** Existing campaigns (2026 and anything made by hand) keep `source = 'manual'` and `service_key = NULL`; the engine never reads or edits them. Extra-billable campaigns are always manual.
- **No production writes, publishing, or backfill** as part of a slice. The first real "Generate 2027" is run by Randy after he has seen the preview in production.
- **Colorado calendar days** (`companyToday`, `addCalendarDays`). Never the host timezone.
- **Roles:** generate and program edits are admin-only; the preview is admin and office. Use the allow-list style of the Contract Center routes.

## Slices, in order

1. **CG1** – catalog scheduling class, service programs (table + Settings page), campaign/visit columns.
2. **CG2** – the demand engine and the "Generate campaigns" screen (preview, gaps, generate).
3. **CG3** – keep membership in step with contracts (on contract change + nightly).
4. **CG4** – crew lists per round (priority order, split between crews, start round), the round as a window on the board, fert/chem dates from the list, a done visit on completion.
5. **CG5** – the shared owed / done calculation for the customer Services page (and later the step 4 fulfillment report).

Each slice merges and is checked before the next starts. They touch the same files.

## Working rules for every task

- **One slice per task.** Don't start or plan the next slice in the same task.
- **Run the slice's pre-flight first.** If anything fails, stop and report what's missing. Never rebuild a piece an earlier slice owns; that's how duplicates happen.
- **Find before you write.** Before adding a helper, table or endpoint, search for an existing one that does the job.
- **Finish by updating `STATUS.md`** with the exact names you added. These files live in the repo; don't edit the slice files themselves.
