# CG3 prerequisite verification — blocked

Date: 2026-11-10. Scope: prerequisite checks only; CG3 implementation not started.

**Historical checkpoint, subsequently resolved:** after this report the owner
instructed “no just run it on the task plan.” The source exception and completed
implementation are recorded in [CG3 verification](CG3-verification.md) and the
pack ledger. The observations below describe the original stop, not current status.

## Required source gate

Read repository pack rules, the complete status ledger, pack/root README,
master scheduling design, applicable workflow memory, assigned task and the
complete CG2 verification/handoff.

The required owner-controlled source
`docs/slices/campaigns/CG3-membership-follows-contracts.md` is missing. It is
also absent from freshly fetched GitHub `origin/main`. Consequently, its
pre-flight and full integration requirements cannot be read or executed.
This is a failed prerequisite, not a passing CG3 pre-flight.

The ledger and durable workflow instructions record that the obsolete numbered
Campaigns specifications were deliberately removed by the owner. CG2's explicit
permission to proceed from reviewed task requirements applied only to CG2.
No obsolete specification was restored, no replacement was invented, and the
task summary was not silently substituted for the required repository source.

## Actual predecessor handoff

`git fetch origin main` succeeded. Fetched `origin/main` matches checkout HEAD
and contains the CG2 implementation and its verification report. Thus CG2's
old awaiting-merge ledger wording was stale, not evidence of missing code.
The ledger now reflects that observed merge.

Content search confirmed these existing integration names:

- `campaignDemand` in `artifacts/api-server/src/lib/campaignDemand.ts`.
- `coverageResolver.forMonth` in `artifacts/api-server/src/lib/contractCoverage.ts`.
- `campaignItemProtected`, `reconcileCampaigns`, `runCampaignGeneration` and
  consumption of `campaignGenerationYears` in
  `artifacts/api-server/src/lib/campaignReconcile.ts`.

The producer handoff says automatic reconciliation must not enable years:
explicit Generate owns opt-in. CG3 must preserve the existing shared lock,
generated/manual boundary, protected work and monthly coverage semantics.
These observations are not a substitute for the missing slice's full pre-flight.
No predecessor work was rebuilt, and no functional tests were run because
implementation stopped at the source gate.

## Changes and next action

- Documentation only: this report and `docs/slices/campaigns/STATUS.md`.
- New migrations, tables, columns, functions, endpoints: **none**.
- No application code, schema, owner-controlled specifications or workflow
  configuration changed. No database writes, Generate runs, backfills,
  production operations or publishing occurred.
- CG3 remains **blocked and incomplete**. Supply the current approved CG3
  repository specification, then rerun its full pre-flight before implementation.
- CG4 was not started. No follow-up tasks were proposed because downstream work
  is already queued and this blocker is part of the current task.
