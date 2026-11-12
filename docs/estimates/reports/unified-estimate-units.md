# Estimate Builder Slice 4.9 — unified units

## Scope and integration

Implemented the assigned plan and attached unit brief in the existing CRM,
API and database package. Categorized Services, transactional custom saves and
the guarded category initializer were present and preserved. Irrigation remains
a read-only IrrigoPro mirror; validation is in CSV parsing, not a new editor.
No contract/term-rate unit data, Plant Library container sizes, pricing math,
lifecycle rules, QuickBooks imports or migration-runner behavior was changed.
Nothing was published; no manual production writes or production queries ran.

### Contract and writers

`lib/db/src/estimateUnits.ts` is a driver-free shared module, imported directly
by both browser and server. It exports exactly:

`SF, LF, 1,000 SF, HR, DAY, WEEK, EA, FLAT, GAL, CU. YD, LB, BAG, TON, IN. DBH`

The old quick/free/custom/suggested constants derive from this list. There is
no independent frontend mapping or list. The schema barrel re-exports the
contract for server callers; browser imports never traverse that barrel.

The normalizer trims and matches case-insensitively, accepts canonical values,
and implements every specified alias. Notably `visit → FLAT`, `week → WEEK`,
`yd3 → CU. YD`; `pallet` is unmapped. The formatter preserves original unknown
strings, including their whitespace, instead of hiding them or guessing.

Services, category defaults, Equipment & Fees, free/custom builder entry,
inline editable lines and Hardscape use the ordered canonical list. Hardscape
is now a select rather than free text. EN and ES labels are under
`estimateBuilder.unit`; Spanish labels never change stored values. Catalogs,
picker/search rows, match dialogs, historical builder rows and the actual PDF
template use the formatter. Long canonical PDF units are kept on one line.

New quick/category/hardscape/custom/free writes reject noncanonical units.
Hardscape and irrigation imports normalize aliases before validation and use
their existing row-level errors. Irrigation still collects identifiable SKUs
before validation, retaining skipped-row protection, first-occurrence precedence
and all-invalid replacement rejection. Hardscape exports normalize mapped
values and retain unknown values literally; they do not certify unknowns as
canonical.

Reference snapshots normalize units from catalogs and labor-rate sources
without changing those source contract rates. New plant estimate snapshots use
`EA`; plant container sizes remain unchanged. Newly revised draft copies
normalize mapped units, never their frozen source. Unknown reference/revision
units produce a safe `422 INVALID_CATALOG_UNIT` rather than a guessed unit or
a new noncanonical snapshot. Existing unknown rows are retained. This can block
revision of a frozen estimate containing an unmapped unit until a separately
authorized resolution exists.

The existing company-qualified estimate locks, catalog-save transaction,
category share lock and company binding remain in place. Catalog insertion,
reference capture and line insertion still share one atomic transaction.

## Schema and boot relabel

New migration **0085_estimate_units.sql** was unused when selected.
All pre-existing migration files, including 0053, 0078, 0079 and both 0080 files,
remain byte-for-byte unchanged in this branch.

The guarded migration drops the known historical automatic
`*_default_unit_check` and explicit `*_unit_check` names on the two setup tables.
It installs fresh `estimate_quick_items_unit_v2_check` and
`estimate_service_categories_unit_v2_check`, accepting the union of the original
nine legacy values and fourteen canonical values. No unrelated checks are
dropped; no Hardscape/Irrigation unit CHECK is added. Quick-item database default
is `HR`; Hardscape and Irrigation database defaults are `EA`. Category runtime
defaults, including both new-company initialization and the Slice 4.8 boot
initializer, are `1,000 SF`.

Historical category seed consistency now compares normalized historical values
against live defaults. The test executes actual historical SQL; it does not
rewrite applied seeds to force obsolete spelling to match.

`normalizeStoredEstimateUnits` is awaited in actual route registration immediately
after category initialization, not in the unused migration runner. It performs
**DML only**, in one READ COMMITTED transaction, under dedicated transaction-scoped
advisory lock **665005** (no previous use found). Every referenced table/column is
checked through `information_schema` before work. Missing schema logs the exact
missing dependencies and a skip; other SQL errors propagate and roll back all
targets.

Targets are quick-item/category defaults, Hardscape/Irrigation units (including
inactive rows), and draft estimate lines. Draft eligibility uses the owning
version's ID, company and status; it does not consult an estimate's
current-version pointer. The line UPDATE obtains its eligible version identities
from a materialized `SELECT ... WHERE status='draft' ... FOR UPDATE` CTE in
that same statement. PostgreSQL rechecks status after a lock wait, and only the
locked identities can supply lines to UPDATE. Locks remain held until commit.
This includes drafts created while earlier catalog targets are being processed;
an earlier standalone lock sweep would leave a concurrency gap and is not used.
Prices, quantities, totals, audit timestamps and all non-draft line units are
untouched. Completion is logged only after commit, with actual changed-row
counts per table plus remaining unknown strings/counts by source, including
draft-line unknowns. Second runs report zero changes but continue to report
unknowns.

### Observed inventory and limitations

Read-only **development** observations before restart:

| Source | Stored values/counts | Unmapped values |
|---|---|---|
| Quick items | no rows | none observed |
| Service categories | `1,000 sq ft`: 514 | none observed |
| Hardscape | `ea`: 4 | none observed |
| Irrigation | no rows | none observed |
| Draft lines | no rows | none observed |

After the shipped initializer ran during the development API restart, read-only
queries observed `1,000 SF`: 514 and Hardscape `EA`: 4. Other targets remained
empty. No shared development rows were manually relabeled. The development
migration command applied only 0085. It also reported a **pre-existing checksum
warning for 0074_campaign_service_timing.sql**; that file and its tracking were
not edited or reapplied.

These observations are not a production inventory. Production values, unknowns,
installed check definitions and eventual Publish diff remain uninspected.
Structured startup logs were flooded out of the bounded log capture by existing
QuickBooks fixture-token warnings; shared-development changed-row log counts
are therefore not claimed as captured evidence. The before/after reads and
compiled awaited boot call verify development execution. Actual changed-count
and unknown-report correctness is asserted in the isolated PostgreSQL tests.

In isolated synthetic data, observed unmapped values were Hardscape `pallet`
(two rows), Irrigation `mystery` (one), and draft lines `unknown draft` (one).
They remain unchanged and are reported with those exact source/count pairs.

## Verification and baselines

Evidence is retained locally in ignored `generated-artifacts/estimate-units/`.
Broad historical seed and API suites ran in disposable databases cloned
**schema-only** from development. Broad seeds were never run against unrelated
shared company data. New relabel/category tests use the committed disposable
database helper and clean up their databases.

| Check | Result |
|---|---|
| New mapping/write/import contracts plus actual Chromium PDF | **41 passed** |
| New isolated PostgreSQL relabel/check suite | **23 passed**, including concurrent new-draft/send races |
| Existing CSV, irrigation parser, PDF model and category initializer suites | **86 passed** |
| New actual HTTP Hardscape canonical-unit suite | **17 passed** |
| Existing eight API/setup/storage/lifecycle suites | **112 passed, 13 pre-existing failures** / 125 |
| Same eight unchanged-source API suites | **111 passed, 14 failures** / 125 |
| Existing builder, Slice 3.5/4.7, Services and parity suites | **117 passed** |
| New rendered picker/order/EN/ES suite | **12 passed** |
| Added frozen historical-builder assertion | **1 passed** (other cases excluded by focused filter) |
| Added legacy-unit revision/source-preservation assertion | **1 passed** (other cases excluded by focused filter) |
| Existing Hardscape rendered suite | **12 passed, 11 pre-existing failures**, reproduced in unchanged HEAD |
| `pnpm run typecheck:libs` | Passed |
| Refreshed API typecheck | **695 existing diagnostics**, no additions/removals by file/error-code multiset |
| Refreshed CRM typecheck | **212 existing diagnostics**, same unchanged-source baseline |
| Managed API and CRM restart | Both served successfully |
| Proxied health and Vite builder transformation | Both **200** |

The thirteen API failures are the existing `routes/catalog.test.ts` fixtures
that supply `activeRole` but not the gate's `accessRole`; they receive 403.
New HTTP coverage supplies both and exercises the actual gate, canonical CRUD,
invalid writes, CSV alias/unknown handling and tenant rejection. No application
authorization was weakened to satisfy those older fixtures. The extra
unchanged-source API failure was its randomized similarity tie-order assertion;
it did not fail in the changed-source run.

The older Hardscape rendered suite has eleven identical failures in both
unchanged and changed source. New focused rendered coverage independently
verifies its real select and exact ordered values. Old unit expectations in
affected suites were updated; legacy source fixtures remain where compatibility
is being tested. The initial overlapping CRM capture was discarded as a
baseline; an unchanged HEAD archive provided the valid 80/80 early-suite
baseline and 212-diagnostic typecheck baseline. An archived API typecheck with
mixed workspace links produced 722 diagnostics and was not used for comparison;
the pre-edit refreshed API capture and delivery check both produced 695.
Whole-project typechecks and the old failing suites are **not green**.

Real PostgreSQL coverage executes 0053 and 0078 to reproduce both historical
quick-item unit CHECKs, then applies 0085 twice and inserts every legacy and
canonical unit. It checks retired names, unrelated checks, defaults and rejected
unknowns. Relabel coverage includes all required missing columns/tables,
inactive rows, mixed companies, every non-draft status (plus a future status),
unknowns, exact unchanged rows/timestamps on rerun, rollback of unrelated SQL
errors, and two independent transactions observed waiting in `pg_locks`.
The concurrency results are eight changed rows for one transaction and zero
for the other. Source snapshots and commercial values are explicitly compared.
Two additional real-transaction regressions create a draft after boot has begun:
when sending wins the lock, boot waits, rechecks status and leaves the sent
line byte-for-byte unchanged; when relabeling wins, the sender waits until
normalization commits and then freezes that already-normalized line. Both tests
observe the actual waiting backend through `pg_stat_activity`, rather than
depending on timing alone.

The PDF test uses the production HTML template and actual Chromium rendering,
extracts the resulting PDF text with `pdftotext`, and verifies FLAT, CU. YD,
WEEK, 1,000 SF, IN. DBH and literal pallet without changing the source model.
The signed-out screenshot shows a working sign-in page, not authenticated
estimate content. Signed-in unit interactions were checked with rendered
component tests; no authenticated end-to-end browser journey is claimed.

Reproducible standalone safe checks:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/estimateUnits.test.ts src/lib/normalizeEstimateUnits.integration.test.ts \
  src/routes/catalogUnits.test.ts src/services/documents/estimateUnits.test.ts \
  src/lib/initializeEmptyServiceCategories.integration.test.ts --maxWorkers=1 --no-file-parallelism
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/EstimateUnits.rendered.test.tsx src/shared/estimateSetup.parity.test.ts
```

## Authorized post-publication checks — not performed here

After the user later publishes normally, an authorized operator should:

1. Before publication, retain a read-only export of non-draft
   `(line.id, line.unit)` values and the owning version status. Compare unchanged
   historical versions afterward; avoid conflating normal user edits/new
   lifecycle transitions with this relabel.
2. Inspect the Publish schema diff. Expect the fresh two v2 checks and canonical
   defaults; reject any unrelated drop or same-name narrow leftover. Do not
   manually run development migrations, startup DDL or migration tracking repair
   in production.
3. Observe startup's completion (not missing-schema skip), per-target actual
   counts and source/count unknown inventory. A subsequent normal instance
   start should report zero changed rows. Do not force a restart by this report.
4. Inspect both checks read-only:

   ```sql
   SELECT conrelid::regclass AS source, conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid IN ('estimate_quick_items'::regclass,
                     'estimate_service_categories'::regclass)
     AND contype = 'c'
   ORDER BY 1, 2;
   ```

5. Inventory remaining unknowns with this read-only query (catalogs include
   inactive rows):

   ```sql
   WITH units(source,unit) AS (
     SELECT 'quick items',default_unit FROM estimate_quick_items
     UNION ALL SELECT 'service categories',default_unit FROM estimate_service_categories
     UNION ALL SELECT 'hardscape',unit FROM hardscape_catalog_items
     UNION ALL SELECT 'irrigation',unit FROM irrigation_catalog_items
     UNION ALL SELECT 'draft lines',l.unit FROM estimate_lines l
       JOIN estimate_versions v ON v.id=l.version_id AND v.company_id=l.company_id
       WHERE v.status='draft'
   )
   SELECT source,unit,count(*) FROM units
   WHERE lower(trim(unit)) NOT IN (
     'sf','lf','1,000 sf','hr','day','week','ea','flat','gal','cu. yd','lb','bag','ton','in. dbh',
     'hour','each','visit','sq ft','sqft','1,000 sq ft','lin ft','cu yd','yd3','gallon'
   )
   GROUP BY source,unit ORDER BY source,unit;
   ```

6. In each intended active company, check Services/Equipment/Hardscape and
   read-only Irrigation labels, category defaults, a new draft line, and an
   existing historical estimate/PDF in EN/ES where applicable. Confirm every
   picker has the fourteen canonical values in order. A missing price or an
   unmapped-unit error must not be treated as permission to guess a unit.

### Deferred constraint tightening

New-only setup CHECKs are deliberately **not** shipped. After authorized
production evidence confirms relabeling and unknown resolution, a separate
approved slice can retire the transitional checks under fresh names, testing
Publish compatibility and canonical/legacy insertion behavior again. Do not
tighten checks on frozen estimate lines, add Hardscape/Irrigation checks, or
include a manual production repair in that follow-up without separate approval.
