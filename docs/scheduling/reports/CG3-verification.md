# CG3 verification and integration handoff

Date: 2026-11-10. Scope: CG3 only; no production operations.

## Prerequisites and source authorization

The initial prerequisite check stopped because the named repository CG3
specification had been deliberately removed. See `CG3-preflight-verification.md`.
The owner subsequently instructed **“no just run it on the task plan.”**
Implementation therefore follows the assigned CG3 plan and actual merged CG2
handoff, rather than inventing or restoring a user-controlled specification.
This explicit exception applies only to CG3.

Fetched GitHub `origin/main` and confirmed checkout HEAD contains merged CG2.
Read pack rules, complete ledger, README workflow, master design, relevant memory,
ownership map and complete CG2 verification. Confirmed the producer names
`campaignDemand`, `coverageResolver.forMonth`, `campaignItemProtected`,
`reconcileCampaigns`, `runCampaignGeneration`, `campaignGenerationYears`.
No predecessor engine, schema, guards or item constructor was replaced.

## Delivered behavior

- Relevant successful writes enqueue after response completion, with initiating
  company captured before asynchronous response work. Reads, non-2xx responses,
  campaign edits and Generate do not enqueue.
- Independent per-company promise chains never discard later commits behind an
  in-flight reconciliation. Different companies proceed independently.
- Only explicitly enabled, non-ended years are selected, in ascending year order.
  Each uses one transaction and the exact existing company advisory lock; opt-in
  is rechecked while locked. CG3 never enables a year.
- Each year's failure is logged and recorded without poisoning the queue or
  blocking later years. Startup/hourly sweeps use that same queue. Colorado
  calendar dates, not host dates, govern year bounds and missed demand.
- Latest run summaries live only in a bounded 500-entry process-local map. The
  database enabled timestamp is the honest fallback after restart or eviction.
  Errors are sanitized in responses; detailed errors stay in server logs.
- Generated round item reads compute current contract state in one batch through
  the demand engine. There are no stored membership/warning flags and no second
  coverage resolver. Manual rounds bypass projection and reconciliation writes.
- List/kanban cards and item detail show Waiting on signature and retained
  No longer in contract warnings. Links open the governing contract where one
  exists, otherwise Contracts; permitted pending items can open/focus the existing
  skip form. Completed/skipped/archived items receive no new skip capability.
- Company-scoped campaign queries poll every 30 seconds. Generate polls latest
  check status and refreshes preview after a check completes. It exposes last
  attempt/success, retry errors, restart fallback, kept-not-owed decisions and
  missed work, including links into retained item review.

## Exact integration contracts

See `docs/slices/campaigns/STATUS.md` for registrations and path inventory.

- Server exports: `campaignMembershipStatus`, `reconcileEnabledCampaignYears`,
  `scheduleCampaignMembership`, `registerCampaignMembershipReconciliation`,
  `runCampaignMembershipSweep`, `startCampaignMembershipSweep`,
  `withCampaignContractStates`.
- Shared read-only types: `CampaignMembershipStatus`, `CampaignContractState`.
- New endpoint: `GET /api/campaign-generation/:year/status`;
  OpenAPI operation `getCampaignMembershipStatus`;
  generated validator `GetCampaignMembershipStatusResponse`.
- Status access is admin/office with the existing super-admin override, current
  or next Colorado year, optional consistent `X-Company-Id`, no-store.
- Existing campaign detail response items now optionally include `contractState`.
  Manual items do not gain the field. The existing GET also checks a supplied
  company header.
- CRM component: `CampaignContractNotice`; existing `CampaignDetail`,
  `CampaignItemDetail`, `CampaignGeneratePage` consume the projections.
- Migrations, tables, columns: **none**. No change to generation opt-in ownership.

## Verification

### Queue, engine integration and regressions

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignMembership.test.ts \
  src/lib/campaignMembership.integration.test.ts \
  src/lib/campaignDemand.test.ts src/lib/routeEngine.test.ts \
  src/services/servicePrograms.test.ts
```

**Passed: 5 files, 64 checks.** Covers rapid queue ordering and independent
companies, after-response company capture, excluded requests, empty opt-in,
fallback, failure recovery and continued year processing. Real PostgreSQL cases
prove disabled/ended-year exclusion, opt-in timestamp preservation, generated
idempotency, manual preservation, sent → signed transitions without item rewrite,
draft/lost/cancelled removal, protected notes, changed program and contract months,
parent coverage/unlinking and parent omission, missed work, company isolation,
transaction failure/retry and status authorization/no-store/company/year gates.
Existing demand/Routes/service-program fixtures passed unchanged.

After adding explicit timer and finished-work cases, ran:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/campaignMembership.test.ts src/lib/campaignMembership.integration.test.ts \
  -t 'startup and hourly|never deletes or moves|without enabled years|status is company-bound'
```

**Passed: 6 checks; 18 unselected.** Includes startup/hourly/stop behavior and
completed, skipped and chemical-progress item retention with live warnings.
No unselected case is claimed as newly rerun. Existing shared protection for
tickets, visits and checklist history is unchanged and covered by CG2's recorded
database verification.

Integration setup created only unique disposable development companies and
direct opt-in fixtures; teardown deleted those companies. It ran no migrations,
no Generate endpoint or `runCampaignGeneration` calls, and no real-company
generation. Unit-test sweeps use a mocked database, not a real global sweep.

### Rendered client checks

```sh
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/CampaignGenerate.rendered.test.tsx \
  src/components/CampaignContractNotice.test.tsx
```

**Passed: 2 files, 11 checks.** Existing Generate roles/confirmation/company/year
behavior, restart fallback, failure and last-success display, kept/missed decision
links, absence of warnings on manual/owed items, signature contract links and
permission-gated existing skip action. Generate POSTs in these tests are mocked;
no real generation occurred.

### Build and runtime

- `pnpm --filter @workspace/api-spec run codegen`: passed, including
  `pnpm -w run typecheck:libs`; generated client and validators are synchronized.
- API/CRM leaf typechecks remain non-green (694 / 211 diagnostics respectively).
  Existing CG2 handoff already records broad leaf failures. No diagnostics named
  the new membership/state/component modules or changed campaign pages. This is
  not a claim that the full workspace typecheck passes or a complete baseline
  comparison of unrelated files.
- Restarted API and CRM managed workflows after the implementation batch.
  Both started and served requests. Existing QuickBooks fixture-token decode
  warnings persist; no membership startup failure was observed.
- Schema/extension workflow passed: required `pg_trgm` present and schema in sync.
- Proxied `/api/healthz`: 200; signed-out `/api/campaign-generation/2027/status`:
  401. The four changed Vite page/component modules all transformed with 200.
- App screenshot confirmed the signed-out route presents the normal sign-in page,
  without a blank screen. It cannot verify signed-in exception layouts. Rendered
  UI tests and real database/API assertions, not a new signed-in browser journey,
  provide the changed-flow evidence.
- `git diff --check`: passed. Verification logs retained in ignored
  `generated-artifacts/cg3/`.

## Boundaries and open issues

No schema, engine replacement, opt-in writes, production writes, explicit Generate
runs, publication, migrations or backfills. No manual membership changes,
crew-list work, board changes or customer Services work. Runtime startup/hourly
reconciliation of already-enabled years is the requested CG3 behavior.

Existing leaf type failures, the prior CG1 migration checksum warning recorded by
CG2, and unrelated QuickBooks fixture warnings remain outside this slice. No CG3
functional issue is open. CG4 was not started or newly proposed; it is already
queued separately.
