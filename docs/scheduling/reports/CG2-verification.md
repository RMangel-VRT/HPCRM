# CG2 verification and integration handoff

Date: 2026-11-10. Scope: CG2 only. No production writes or publication.

## Source authorization and pre-flight

Initial pre-flight failed and implementation stopped, as recorded in
`CG2-preflight-verification.md`. CG1's actual implementation was subsequently
fetched from GitHub and merged into this task, preserving both status logs.
The following prerequisites then became available:

- CG1 migration `0074_campaign_service_timing.sql`, applied development schema
  and verification in `docs/slices/campaigns/reports/CG1-verification.md`.
- `servicePrograms`, shared `serviceProgramSchema`, both schema copies,
  scheduling metadata and `campaignServices()` in both catalog copies.
- Campaign identity columns, visit campaign-item link, service-program routes
  and Settings → Service timing.
- No pre-existing campaign demand engine, reconciliation engine or generation
  year table was present before CG2 implementation.

The source revision gate was not silently waived: the owner explicitly selected
**“Proceed from reviewed requirements”** after being told the repository CG2
specification was outdated. This task therefore implements the reviewed task
requirements and CG1 handoff, including up-for-renewal eligibility/priority,
explicit zero, invalid/duplicate gaps and all-zero months as unstated.
No numbered slice specification was edited by this implementation.

During the session all five numbered CG slice files were removed externally.
The owner explicitly chose **“Keep them removed”** when asked whether to restore
the originals. That removal is preserved; no agent-authored replacement
specifications were written. This report and ledger record implementation
contracts, not new owner-controlled slice requirements.

## Implemented contracts

Exact names are recorded in `docs/slices/campaigns/STATUS.md`.

- Demand is pure, company-input scoped and calendar-month based. Parents never
  get items; own coverage suppresses inherited service scope even if excluded.
- Firm coverage statuses are signed, active, renewed and up_for_renewal, ahead
  of sent; compare start date/id within each group. Routes keeps its original
  three statuses and year-based resolution.
- Zero means no demand. NULL count needs a standard even with stated months.
  Missing program timing never falls back to catalog or older programs.
- Invalid counts/spreads or ambiguous matching lines produce actionable gaps.
  Valid stated months are not redistributed on a count mismatch.
- Reconciliation and year opt-in use one transaction and the exact company
  advisory lock. Preview uses rollback-only nested transactions, including for
  additions, removals and round deletion; rolled-back IDs are not linked.
- Generation does not modify any manual campaign or item. It never removes
  protected work; additional conservative protection covers dates promised to
  chemical customers, recorded chemical details, assigned crews, pending notes
  and checklist audit history even after a checklist completion is unchecked.
- Past rounds never receive new items. Empty started rounds remain; completed
  or archived rounds retain their status when receiving additional membership.
- No business year is enabled by preview. Explicit successful generation enables
  it once; repeats preserve original opt-in metadata.
- Public writes require an admin, explicit confirmation and an initiating company
  header. No body can supply a company, actor, dry-run flag or arbitrary year.
- The screen distinguishes the saved result from the next pending preview. It
  does not claim CG3 automatic reconciliation already exists.

## Development schema and generated contracts

- `pnpm --filter @workspace/scripts run migrate`: applied only
  `0075_campaign_generation_years.sql`; 0 baselined, 87 already current.
- `pnpm --filter @workspace/scripts run check-schema-drift`: passed.
- `pnpm --filter @workspace/scripts run check-required-extensions`: passed.
- `pnpm --filter @workspace/api-spec run codegen`: passed, including
  `pnpm -w run typecheck:libs`.
- Migration is additive and safe to rerun; integration setup executes its DDL
  twice. Both schema copies include the generation-year table.
- The migration runner warned that the previously applied CG1 migration
  `0074_campaign_service_timing.sql` has a changed checksum. CG2 did not edit,
  reapply, baseline or repair it. Current schema drift validation passes. This
  existing warning is retained as an open issue rather than rebuilding CG1.

## Fixture and database evidence

Commands:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/routes/campaignGeneration.integration.test.ts \
  src/lib/campaignDemand.test.ts src/lib/routeEngine.test.ts \
  src/services/servicePrograms.test.ts
pnpm --filter @workspace/highplains-crm exec vitest run \
  --config vitest.config.ts src/pages/CampaignGenerate.rendered.test.tsx
```

- Pure demand and existing Routes/program checks passed: exact timing,
  standard-count rules, zero, invalid/duplicate scope, mismatch information,
  monthly boundary selection, eligibility/priority, inheritance, property
  exclusion, parent omission, non-campaign omission and multiple-round sequences.
- All 27 PostgreSQL/API cases passed across the integration pass and targeted
  correction described below: identical/repeated rollback previews; preview
  savepoint usability; generation idempotency including timestamps; four
  concurrent writers; removal/deletion rollback; completed/skipped/chemical/
  photo/promised-date protection; visits and checklist history; linked tickets;
  general and both irrigation identities; multiple-round titles; missed demand;
  started/closed rounds; manual immutability; company isolation; actionable gaps;
  role/year/company/confirmation gates; full transaction rollback on failure.
- The final combined server run passed 67 checks and failed only a new ticket
  fixture missing the required status display order. After adding that fixture
  field, its targeted `-t 'retains linked tickets'` rerun passed. The other
  production-code checks were not invalidated by this fixture-only correction.
- Completion review identified two additional retention gaps. Reconciliation now
  checks `campaign_checklist_audit_log` as well as current completions, and protects
  pending notes/skip reasons. Three added database cases passed via:
  `vitest run src/routes/campaignGeneration.integration.test.ts -t 'unchecked checklist history|pending notes'`.
  The history fixture uses the actual storage toggle for complete → uncomplete,
  verifies no current completion remains, removes contractual demand, then proves
  both preview and Generate keep the item, round and both audit entries unchanged.
  Notes fixtures cover meaningful text and whitespace without trimming or rewriting.
  No new browser pass was needed for this strictly server-side retention fix.
- All 6 rendered UI tests passed, including Colorado-year rollover, company
  headers, links, office restrictions, confirmation, POST contract, result and
  campaign invalidation, company/year reset, retry and empty state.
- Integration records use unique disposable companies/users and are cleaned up.
  No Generate request was made against an existing business company.

## Runtime checks

- API and CRM workflows restarted successfully after the coherent code batch.
- Development `/api/healthz` returned 200.
- Vite's transformed `/src/pages/CampaignGeneratePage.tsx` returned 200.
- Workflow logs show the application serving; unrelated existing QuickBooks
  fixture-token decode failures remain outside CG2.
- Full API/CRM leaf typechecks remain non-green in existing project areas.
  No diagnostics were reported for CG2's files after the ticket fixture fix.
  This is not a claim that the full workspace typecheck passed.

## Signed-in browser verification

One signed-in browser pass completed successfully, using only a newly created
disposable company with lowercase admin/office fixtures for Colorado year 2027:

- Admin preview showed one June chemical round/member, Program timing and Waiting
  on signature, one signed no-count contract gap, and one overlapping manual
  campaign.
- Before generation and after Cancel, database counts for generated campaigns,
  items and generation-year rows were all zero.
- First confirmed generation created exactly one round and one item and enabled
  2027. Reload showed Generated, zero pending changes and No change on the round.
- A second confirmed run reported zero changes. Database counts remained one
  generated campaign, one item and one year row. The manual campaign retained its
  active status, original June window and zero items.
- Office saw Preview only and no Generate control. Office-session POST returned
  403; database totals stayed unchanged.
- No horizontal document overflow at 1280px or 768px. The narrow signed-in screen
  was visually inspected with the normal sidebar present.
- Cleanup verified zero remaining fixture company/users, customers, agreements,
  terms, scope, programs, campaigns, items, generation-year rows or visits. The
  temporary seed script was removed. No real user was reset or modified.

Browser evidence identifiers: `pumyh6` (confirmation), `c2l44m` (first result),
`7gkugg` (idempotent result), `n6sw5g` (office at 1280px), `fsnc9u` (office at
768px). No credentials or fixture personal identifiers are retained here.

## Scope and successor handoff

- Migration: `0075_campaign_generation_years.sql`.
- `runCampaignGeneration` is the explicit transaction wrapper; CG3 may call
  `reconcileCampaigns(tx, companyId, year, {dryRun:false,...})` under its own
  correctly scoped transaction. That lower-level reconciliation does **not**
  enable a year; explicit Generate alone owns opt-in.
- Read `campaignGenerationYears` by company; no year should be automatically
  enabled or backfilled by a successor.
- Preserve shared item construction, generated/manual guards, conservative work
  protection, monthly firm-before-sent selection and unchanged Routes defaults.
- Read the exact DTOs from `lib/db/src/campaignGenerationContracts.ts` and current
  API generated contracts rather than reconstructing names from older specs.
- This task adds no CG3 triggers, sweeps or queues; no CG4 crew/board/visit
  completion work; no CG5 owed-versus-done UI. No production migration,
  generation, publishing or historical data repair occurred.
