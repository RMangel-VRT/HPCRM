# Publish foreign-key dependency ordering

Date: 2026-11-11.

## Finding

The uploaded validation diagnostic was read as data. Its failure is independent
of the earlier CHECK-constraint issue:

```sql
ALTER TABLE "campaign_items"
ADD CONSTRAINT "campaign_items_campaign_company_fk"
FOREIGN KEY ("campaign_id","company_id")
REFERENCES "public"."campaigns"("id","company_id")
ON DELETE cascade ON UPDATE no action;
```

PostgreSQL rejects this statement with `42830` because production does not yet
have a unique constraint/index on precisely the referenced column pair. The
generated diff includes the prerequisite, but **after** this foreign key.
The same ordering defect affects `visits_campaign_item_company_fk` and its
referenced `campaign_items(id, company_id)` unique constraint.

Development already has both unique constraints and both validated foreign keys.
Production has neither new composite unique constraint or foreign key. Its
existing primary keys and single-column foreign keys remain intact.

Read-only production checks found:

- Duplicate campaign `(id, company_id)` keys: 0.
- Duplicate campaign-item `(id, company_id)` keys: 0.
- Campaign items without a matching same-company campaign: 0.

Development checks found zero invalid item/campaign and visit/item company pairs.
This is an SQL dependency ordering failure, not evidence of duplicate rows.

## Full-diff proof

Recomputed the actual development-to-production diff with `explainSchemaDiff`.
It still contains 40 statements in the failing order.

Used a separate local PostgreSQL 16 instance, reconstructed from the schema-only
production catalog captured earlier the same day. No production rows were copied.
The actual target constraints were independently rechecked read-only.

`scripts/src/verify-publish-fk-order.mjs`:

1. Replays the **complete, unmodified** current diff inside a transaction.
   Reproduces the exact uploaded failure and rolls back.
2. Moves only the following prerequisite statements before their dependants,
   leaving every statement's SQL otherwise unchanged:

```sql
ALTER TABLE "campaigns"
ADD CONSTRAINT "campaigns_id_company_unique" UNIQUE("id","company_id");

ALTER TABLE "campaign_items"
ADD CONSTRAINT "campaign_items_id_company_unique" UNIQUE("id","company_id");
```

3. Executes **all 40 statements successfully** in the isolated database.
4. With every foreign-key trigger active, inserts synthetic same-company
   campaign items and visits successfully. Both attempted cross-company
   relationships fail with `23503`.
5. Also proves a two-stage sequence locally: all other statements first,
   followed by the two new composite foreign keys.
6. Rolls back all test changes.

Raw current diff and results are in the ignored
`generated-artifacts/publish-fk-order/` directory.

## Why a simple source edit is not sufficient

The source declarations express the correct integrity rules. The installed
Drizzle diff generator orders references for existing tables before their new
indexes and before their new UNIQUE constraints; the actual Publish output
independently confirms that order. Merely changing the UNIQUE declarations to
unique indexes would not resolve the dependency.

Do not change primary keys, remove company isolation, truncate rows, patch
installed dependencies, edit historical migrations, or run production DDL to
work around this.

## Safe paths forward

**One Publish:** Publish's generator must produce the prerequisite unique
constraints before both foreign keys. The corrected sequence was proven locally,
but the current recomputed managed diff still has the wrong order. No supported
Agent callback used here can submit a replacement statement order to Publish.
The evidence is suitable for investigating the Publish generator.

**Two Publishes, requiring approval:** temporarily omit the two *new* composite
foreign keys from development and its schema declarations while keeping their
unique constraints, existing primary keys, and existing single-column foreign
keys. The first Publish then creates the unique constraints. After it succeeds,
restore both composite foreign keys through a new normal development migration
and matching source declarations, recompute the diff, and retry Publish.

This alternative deletes no rows but temporarily removes two additional
same-company guards in development. The first production stage retains the
current production relationship protections, and the second adds the new ones.
Therefore explicit approval is required before staging it. Confirm application
source and the concurrent SC1 schema are integrated before either Publish.

## Changes made during this investigation

Only the isolated verification script, this report, and reference notes were
added. No application schema declarations, development constraints, production
data/schema, deploy settings, or startup behavior were changed.

Do not retry the unchanged failing diff expecting a different result. Either
correct the Publish generator ordering or approve the staged development change,
then verify the freshly generated diff before retrying Publish.
