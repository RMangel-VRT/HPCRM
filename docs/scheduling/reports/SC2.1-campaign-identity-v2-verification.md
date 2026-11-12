# SC2.1 production compatibility: campaign identity CHECK

## Scope and finding

Production was inspected read-only. It still had `campaigns_identity_check`
with the old month-based rule requiring `round_month` and `round_seq` for
contract-generated campaigns. Production had **zero** `source='contract'`
campaigns.

Development already had the current SC2 calendar-based expression under the
same name. The actual Publish schema diff before this fix contained **zero
statements**, despite the differing CHECK bodies.

This change versions only the constraint identity. It does not change SC2's
commercial, generation, scheduling, or validation semantics.

## Changes

- Added `campaignIdentityCheckName = "campaigns_identity_v2_check"` in
  `lib/db/src/campaignSql.ts`. Left `campaignIdentityCheckSql` unchanged.
- Both Drizzle declarations use that shared constraint name:
  - `lib/db/src/schema/schema.ts`
  - `artifacts/highplains-crm/src/shared/schema.ts`
- Added and applied the normal development migration
  `.migration-backup/migrations/0084_campaign_identity_v2_check.sql`.
  It transactionally drops the old name if present and adds the new CHECK only
  if absent, with the current SC2 expression.
- Updated the schema-parity integration test and added a regression covering
  legacy-name replacement, idempotency, calendar-only identity, manual identity,
  and invalid calendar/service/category combinations.

PostgreSQL's canonical development constraint definitions before and after the
migration were compared. They were **identical except for the constraint name**.

## Actual Publish diff

The recomputed actual Publish diff contains exactly two statements:

```sql
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_identity_check";
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_identity_v2_check"
  CHECK (
    -- Actual statement contains the unchanged, fully expanded SC2 predicate.
    -- Its exact SQL is retained in the ignored evidence directory below.
    (source IN ('manual','contract') AND (
      (source = 'manual' AND service_key IS NULL AND calendar_entry_id IS NULL
        AND round_year IS NULL AND round_month IS NULL AND round_seq IS NULL)
      OR (source = 'contract' AND service_key IS NOT NULL
        AND service_key IN ('aeration','cleanups','shrub_trimming','ornamental_grass',
          'tree_pruning','native_areas','fertilization','broadleaf',
          'irrigation_open','irrigation_winterization','backflow')
        AND calendar_entry_id IS NOT NULL AND round_year IS NOT NULL
        AND category = CASE WHEN service_key IN ('fertilization','broadleaf') THEN 'chemical'
          WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation'
          ELSE 'general' END
        AND subtype IS NOT DISTINCT FROM CASE
          WHEN service_key = 'irrigation_open' THEN 'spring_turn_on'
          WHEN service_key = 'irrigation_winterization' THEN 'winterization'
          ELSE NULL END)
    )) IS TRUE
  );
```

The ADD above presents the shared expression in readable form; the exact
PostgreSQL-deparsed SQL returned by Publish is captured at
`generated-artifacts/campaign-identity-v2/publish-generated.sql`.
Publish reported **no warnings and no structural data loss**. It flags possible
non-backwards compatibility while the CHECK is replaced; the user controls
publishing and its normal validation.

## Requested FK/index verification

All three requested index/foreign-key transitions have **already reached
production**, independently verified against its live catalogs:

| Object | Development | Production |
| --- | --- | --- |
| `campaigns_calendar_entry_id_service_calendar_id_fk` | Present, references `service_calendar(id)`, `ON DELETE RESTRICT` | Same |
| `campaigns_calendar_round_unique` | Present, unique on `(company_id, calendar_entry_id, round_year)` for contract campaigns | Same |
| `campaigns_contract_round_unique` | Absent | Absent |

Consequently these are correctly **absent from the new Publish diff**: there
is nothing left to add/drop for them. They were not artificially recreated to
force redundant migration statements.

## Verification

- Normal development migration runner: applied only 0084; no row cleanup.
- `pnpm run typecheck:libs`: passed.
- Artifact-local Vitest:
  `src/lib/calendarCampaignMigration.integration.test.ts`: **3 passed**.
- Compared canonical installed SQL before/after: predicate unchanged.
- Replayed both **actual generated Publish statements** against a temporary
  PostgreSQL probe with the old constraint name. A contract campaign identity
  with a calendar entry/year and no month fields was accepted. Everything was
  rolled back; application records were untouched.
- Migration idempotency and invalid-value rejection were checked in the
  temporary-table integration test.
- Both application workflows restarted successfully.
- `git diff --check`: passed.

The existing historical 0074 checksum warning remains; this work did not edit,
reapply, or baseline that migration.

## Evidence and next step

Ignored evidence is under `generated-artifacts/campaign-identity-v2/`:
`dev-before.txt`, `publish-before.json`, `publish-after.json`,
`publish-generated.sql`, and `publish-replay.log`.

**Retry Publish to apply the constraint replacement to production.**
No production data/schema was modified directly, no deployment/startup DDL
was added, and no publishing was performed by the Agent.
