# Two-Publish rollout: stage one prepared

Date: 2026-11-11.

The user explicitly approved the staged fix after being informed that it
temporarily removes two new same-company foreign-key guards in development.
No rows are deleted. No production mutation or publishing was performed.

## Current stage

**Awaiting the first successful Publish. Do not restore the composite foreign
keys until production has both prerequisite unique constraints.**

Applied the normal development migration:

`.migration-backup/migrations/0082_publish_company_key_stage_one.sql`

It verifies that both exact, non-deferrable composite unique constraints and
the existing single-column relationship foreign keys are installed, then removes
only:

- `campaign_items_campaign_company_fk`
- `visits_campaign_item_company_fk`

The server schema and frontend mirror temporarily omit the same two declarations,
with comments pointing here for restoration. Both composite unique declarations
remain in both schema sources.

The following were verified still present and validated in development:

- `campaigns_id_company_unique`: `UNIQUE (id, company_id)`
- `campaign_items_id_company_unique`: `UNIQUE (id, company_id)`
- `campaign_items_campaign_id_fkey`: single-column relationship, cascading delete
- `visits_campaign_item_id_campaign_items_id_fk`: single-column relationship

No other foreign keys, primary keys, unique keys, CHECK rules, indexes, rows,
authentication logic, or application company-scoping checks were removed.
This temporary state does **not** enforce the two additional same-company
relationships at the database layer; that is the approved staging tradeoff.

## Verification

- Recomputed the actual Publish diff after applying stage one: **38 statements**.
- Neither deferred composite FK appears in that diff.
- Both prerequisite unique constraints remain in the diff.
- No structural data loss is reported.
- Replayed **all 38 statements, in their emitted order**, successfully against
  the isolated PostgreSQL production-schema reconstruction. This is the actual
  recomputed diff, not a manually reordered substitute.
- Independently proved the development removal migration is idempotent and
  retains the prerequisite keys.
- The earlier full final-state test still proves both composite company guards
  reject cross-company relationships once restored.
- `pnpm run typecheck:libs`, JavaScript syntax checking, and `git diff --check`
  passed. Both application workflows restarted successfully.

Reproduce the expanded offline test with the captured evidence and a dedicated
local PostgreSQL test instance:

```sh
node scripts/src/verify-publish-fk-order.mjs /tmp/hp-publish-checks/socket --stage-one
```

Ignored evidence:

- `generated-artifacts/publish-fk-order/stage-one.json`
- `generated-artifacts/publish-fk-order/stage-one-test-results.log`
- `generated-artifacts/publish-fk-order/stage-one-typecheck.log`
- `generated-artifacts/publish-fk-order/results.json`

## Before Publish one

SC1's source merge was waiting for the current editing lock when this stage
was prepared; SC1 has already changed the shared development database. Let that
merge finish before publishing the application. Preserve this stage-one removal
if resolving any source conflict, and check the combined declarations still
omit the two deferred FKs while retaining both unique keys.

Publish one must contain both unique-key additions and neither deferred FK:

```sql
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_id_company_unique" UNIQUE("id","company_id");
ALTER TABLE "campaign_items"
  ADD CONSTRAINT "campaign_items_id_company_unique" UNIQUE("id","company_id");
```

The preview may ask about truncating populated tables for those additions.
Read-only production checks found zero duplicate key pairs, and `id` is already
globally unique. **Keep existing data. Do not choose truncate or overwrite.**
If the newly recomputed Publish diff reintroduces either deferred composite FK
before its key exists, stop and recheck staging rather than attempting production
DDL or proceeding through an unexpected destructive prompt.

## Stage two — only after Publish one succeeds

Stage two is intentionally **not** present as an executable SQL migration yet,
so the normal runner cannot silently restore the guards before Publish one.

1. Confirm the first Publish succeeded.
2. Use read-only production catalog queries to confirm both exact composite
   unique keys exist, are valid and non-deferrable. Do not infer this only from
   development or a UI success message.
3. Recheck development for campaign items lacking a same-company campaign and
   visits lacking a same-company campaign item. Both counts must be zero;
   stop rather than repairing or deleting business data automatically.
4. Restore the declarations in both:
   - `lib/db/src/schema/schema.ts`
   - `artifacts/highplains-crm/src/shared/schema.ts`

   In `campaign_items`:

   ```ts
   campaignCompany: foreignKey({
     name: "campaign_items_campaign_company_fk",
     columns: [table.campaignId, table.companyId],
     foreignColumns: [campaigns.id, campaigns.companyId],
   }).onDelete("cascade"),
   ```

   In `visits`:

   ```ts
   campaignCompany: foreignKey({
     name: "visits_campaign_item_company_fk",
     columns: [table.campaignItemId, table.companyId],
     foreignColumns: [campaignItems.id, campaignItems.companyId],
   }).onDelete("no action"),
   ```

5. Allocate the next unused migration filename, and add guarded normal
   development SQL for these exact foreign keys inside a transaction:

   ```sql
   ALTER TABLE campaign_items
     ADD CONSTRAINT campaign_items_campaign_company_fk
     FOREIGN KEY (campaign_id, company_id)
     REFERENCES campaigns(id, company_id) ON DELETE CASCADE;
   ALTER TABLE visits
     ADD CONSTRAINT visits_campaign_item_company_fk
     FOREIGN KEY (campaign_item_id, company_id)
     REFERENCES campaign_items(id, company_id) ON DELETE NO ACTION;
   ```

   Each ADD must be guarded with a matching `pg_constraint` existence check.
   Do not mark constraints `NOT VALID`, disable checks, or target production
   with a custom migration runner.
6. Apply through the normal development migration command, verify both
   constraints are validated, and recompute Publish's actual diff.
7. With production's keys already installed, verify the two FK additions execute
   successfully on an isolated schema copy, then ask the user to retry Publish.
8. After Publish two succeeds, verify the production constraints read-only.
   Update this report to record completion and remove temporary source comments.

Nothing in this report authorizes direct production DDL, automatic publishing,
business-data cleanup, or a permanent weakening of company boundaries.
