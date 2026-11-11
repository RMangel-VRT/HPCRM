# CG4 prerequisite verification — blocked

> Historical blocked-preflight evidence. On 2026-11-11 the owner explicitly
> selected “Use the assigned CG4 plan”; CG3's fetched merge was verified.
> See [CG4 verification and integration handoff](CG4-verification.md) for the
> authorized implementation and current outcome. No obsolete source was restored.

## 2026-11-11 recheck — merge prerequisite cleared

Following the owner's confirmation that CG3 was merged, reran
`git fetch origin main`. Fetched main now resolves to
`3f4beefa249b9ad19390f63adc369ddc92019331`, the CG3 implementation.
`git merge-base --is-ancestor 3f4beefa249b9ad19390f63adc369ddc92019331 origin/main`
returned 0. The merged implementation and its existing verification/handoff
are confirmed; no predecessor rebuild or fresh test run is needed for this check.

The CG4 source check still fails:
`git cat-file -e origin/main:docs/slices/campaigns/CG4-crew-lists.md`
reports the file does not exist. It is also absent locally.
The owner confirmed CG3's merge but did not authorize using the assigned CG4 plan
instead of the missing repository source. CG4 therefore remains blocked solely
on the approved source/source-exception gate.

Updated the ledger's CG3 state and recorded this correction. No application,
schema, database, Generate, workflow or production changes. Next action: provide
the approved repository CG4 specification or explicitly authorize the assigned
CG4 task plan, then rerun the applicable pre-flight before implementation.

## Initial check (historical)

Date: 2026-11-10. Scope: prerequisite gate only, not CG4 implementation.

## Result

**STOP: required repository specification is absent and CG3 is not yet present
on freshly fetched main.** No implementation or migration was attempted.

Read the repository slice workflow, complete Campaigns rules and status ledger,
Scheduling rules, master scheduling design, relevant persistent workflow guidance,
and complete CG3 verification/handoff. The assigned task explicitly requires
the repository CG4 specification and stopping on prerequisite failure.

## Evidence

Commands run:

```sh
git status --short
git fetch origin main
test -f docs/slices/campaigns/CG4-crew-lists.md
git ls-tree -r --name-only origin/main docs/slices/campaigns
git cat-file -e origin/main:docs/slices/campaigns/CG4-crew-lists.md
git rev-parse HEAD origin/main
git merge-base --is-ancestor HEAD origin/main
```

- Initial working tree: clean.
- Required CG4 source file: absent locally.
- Fetched main source check: failed with
  `path 'docs/slices/campaigns/CG4-crew-lists.md' does not exist in 'origin/main'`.
- Checkout HEAD: `3f4beefa249b9ad19390f63adc369ddc92019331`
  (CG3 implementation).
- Fetched `origin/main`: `68a9e6f2c4084cd3ee9f9a5dc351d25c6eb32bec`
  (CG2 implementation).
- Checkout HEAD is not an ancestor of fetched main. Local CG3 presence does not
  establish its required merge. Its ledger correctly still says awaiting merge.
- CG3's existing verification records its own specific authorization to proceed
  from its task plan. It explicitly does not authorize CG4. Earlier numbered
  specifications were deliberately removed; they were not reconstructed.

## Actual CG1 visit-index handoff

Inspected `.migration-backup/migrations/0074_campaign_service_timing.sql`,
`lib/db/src/schema/schema.ts`, `artifacts/highplains-crm/src/shared/schema.ts`,
and the CG1 ledger handoff.

All three implementation sources already declare:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS visits_campaign_item_done_unique
ON visits(campaign_item_id)
WHERE campaign_item_id IS NOT NULL AND status='done';
```

Both schema copies also declare `visits_campaign_item_company_fk` and
`visits_campaign_identity_check`. The migration declares these constraints too.
Thus the predecessor's checked-in invariant is done-only, not an open-visit
uniqueness index needing replacement. No predecessor schema was rebuilt.
No live database inspection was performed, so this is source/migration evidence,
not a claim about currently installed database constraints.

The assignment mentions older CG4 index-replacement wording. Because the actual
CG4 document is absent, its wording cannot be compared or its conflict resolved
against the approved source. Preserve the observed done-only invariant when
implementation becomes authorized.

## Existing predecessor integration observed

CG3 handoff exports are present:
`campaignMembershipStatus`, `reconcileEnabledCampaignYears`,
`scheduleCampaignMembership`, `registerCampaignMembershipReconciliation`,
`runCampaignMembershipSweep`, `startCampaignMembershipSweep`,
`withCampaignContractStates`.

No producer implementation was replaced or reverified by running its tests.
The named CG4 pre-flight cannot be executed without the missing specification.
Completion/reopen writer inventory, live constraints, authorization, concurrent
ordering, dates, pace calculations and two-crew browser workflows remain
unverified; no passing result is claimed.

## Changes and next action

- Changed only `docs/slices/campaigns/STATUS.md` and this report.
- Migrations, tables, columns, functions, endpoints and application changes: none.
- No database writes, Generate runs, backfills, workflow changes, production
  operations, publishing, or CG5 work.
- No follow-up tasks proposed: CG5 is already queued and these blockers belong
  to the current CG4 task, not a new task.
- Required next action: merge CG3 and check the fetched integration handoff;
  provide the current approved repository CG4 specification or explicitly
  authorize a CG4-specific source deviation. Then rerun prerequisites before
  implementing. Do not restore obsolete owner-removed slice documents.

CG4 remains blocked and is not marked complete.
