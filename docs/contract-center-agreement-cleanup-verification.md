# Agreement coverage/form cleanup — development verification

## Scope and safety gate

The owner approved the destructive cleanup separately, waived the observation
wait, and explicitly authorized treating the saved root typecheck diagnostics as
a baseline rather than a gate. This change does not publish or modify production.

Before destructive work:

- Searched application/library/script TypeScript and TSX (excluding dependencies)
  for direct agreement line/form access, agreement references/aliases, embedded
  SQL, and every `insert(agreements)` writer, including fixtures and spread objects.
- Lifecycle creation and audit execution write explicit relationship fields only.
  The renewal fixture also writes relationship fields only. Disabled Copy execution
  destructures its planner-only grouping `line` before spreading the relationship.
- Copy planner grouping assertions remain intact. Its grouping type is now
  explicitly independent of persisted `Agreement` fields.
- Three current-table fixtures had obsolete insert keys: current-season, audit,
  and estimate-setup integration tests. The earlier term migration's temporary
  historical schema is intentionally retained.
- Development query `SELECT count(*) FROM agreement_terms WHERE line IS NULL OR form IS NULL;`
  returned **0**, both initially and immediately before implementation.
- Initial schema-drift check passed. All 63 existing SQL files were already tracked
  as applied. Prefix 0053 was occupied by estimate setup; 0054 was unused.

## Migration and preservation

New migration: `.migration-backup/migrations/0054_drop_agreement_line_form.sql`.
Its entire contents are:

```sql
ALTER TABLE agreements DROP COLUMN IF EXISTS line;
ALTER TABLE agreements DROP COLUMN IF EXISTS form;
```

Ran the actual numbered SQL runner twice:

```sh
pnpm --filter @workspace/scripts run migrate
pnpm --filter @workspace/scripts run migrate
```

First run: **1 applied, 0 baselined, 63 already up-to-date**.
Second run: **0 applied, 0 baselined, 64 already up-to-date**.

The runner's second invocation skips by tracked filename/checksum; that alone is
not proof of SQL idempotence. Also executed the migration SQL directly again
against development, successfully. The database regression additionally executes
the file twice against populated temporary tables, asserting both season rows and
the surviving agreement fields remain identical.

Captured ordered column metadata for all **123 public tables** before and after.
Deep comparison matched exactly after excluding only `agreements.line` and
`agreements.form` from the before snapshot, including surviving types, defaults,
and nullability. The agreement-term row count/fingerprint was unchanged. This
development database initially had **zero** terms, so the populated temporary-table
regression and disposable integration fixtures provide the nonempty preservation
coverage; the empty fingerprint is not presented as proof about existing history.

No historical migration was edited or renamed. No data move, startup DDL, season
constraint change, production-targeted script, or frontend stub change was made.

## File inventory and assertion/fixture adjustments

1. `lib/db/src/schema/schema.ts` — removed only the two agreement columns and
   their agreement insert-extension keys; seasonal fields, enums, and types kept.
2. `artifacts/highplains-crm/src/shared/schema.ts` — matching agreement removals;
   frontend Drizzle-stub passthrough remains untouched.
3. `artifacts/api-server/src/lib/contractCenterCopy.ts` — preserved in-memory
   grouping independently of the persisted agreement type; added `bidTicketId: null`
   to generated seasons as explicitly requested.
4. `artifacts/api-server/src/lib/contractCenterCopy.test.ts` — retained grouping
   expectations and added the null bid-ticket assertion.
5. `artifacts/api-server/src/lib/contractCurrentSeason.integration.test.ts` —
   removed agreement insert `line`/`form`; seasonal values/expectations unchanged.
6. `artifacts/api-server/src/lib/contractAudit.integration.test.ts` — removed
   agreement insert `line`; import outcomes and seasonal expectations unchanged.
7. `artifacts/api-server/src/services/estimateSetup.integration.test.ts` —
   removed three legacy agreement `line` hints and updated the test description;
   season values and resolver/scoping expectations unchanged.
8. `artifacts/api-server/src/lib/contractChangingRenewal.integration.test.ts` —
   replaced an aliased relationship's old null-line expectation with absence of
   both obsolete fields; retained returned seasonal coverage/form expectations.
9. `artifacts/api-server/src/lib/contractParent.integration.test.ts` — supplied
   the source season's `line`/`form` in its manually-created season fixture,
   correcting its missing seasonal value without changing production behavior.
10. `artifacts/api-server/src/lib/contractTermMigration.integration.test.ts` —
    retained historical temporary schema/backfill coverage; added actual public
    table existence/column-absence checks and populated repeat-drop preservation.
11. `artifacts/api-server/src/shared/contractCenterSchema.test.ts` — modeled the
    effective migration after the drop without editing historical SQL; removed
    obsolete agreement validation/default assumptions; kept invalid coverage
    validation on the season; proved authoritative server insert parsing strips
    valid or invalid supplied agreement line/form keys and table metadata omits both.
12. `.migration-backup/migrations/0054_drop_agreement_line_form.sql` — two guarded drops.
13. `docs/data-ownership-map.md` — recorded season-only coverage/form ownership.
14. `.agents/memory/contract-center-phase-boundaries.md` — added the requested
    season-only ownership note under existing seasonal history guidance.
15. `docs/contract-center-agreement-cleanup-verification.md` — this evidence report.

## Commands and results

```sh
CONTRACT_AUDIT_DB_TEST=1 CONTRACT_RENEWAL_DB_TEST=1 CONTRACT_SEASON_DB_TEST=1 \
RFP_CONTRACT_DB_TEST=1 ESTIMATE_DB_TEST=1 \
pnpm --filter @workspace/api-server exec vitest run \
  contract contractCenter dashboard rfpContracts estimateSetup
```

**28 files passed, 600 tests passed, 3 opt-in legacy development tests skipped.**
Includes enabled database audit-import, renewal-import, changing-renewal,
current-season, parent-consolidation, RFP-link suites; estimate setup uses
disposable database companies without requiring an opt-in flag. The old audit zip
fixture is parsed and imported into disposable companies by the audit suite.

After strengthening the real-table regression to also assert the table exists:

```sh
CONTRACT_RENEWAL_DB_TEST=1 pnpm --filter @workspace/api-server exec vitest run \
  src/lib/contractTermMigration.integration.test.ts \
  src/shared/contractCenterSchema.test.ts
```

**2 files, 23 tests passed.**

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  contract Contract dashboard Dashboard Renewals rfp Rfp
```

**18 files passed, 1 failed; 158 tests passed, 1 failed.**
Failure: unchanged `rateCardUtils.test.ts`, “groups and counts missing” expects
23 missing defaults, but the unchanged current default catalog yields 42.
Neither the tested helper, test nor catalog changed in this slice. This broader
suite is **not** claimed to pass.

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  src/components/dashboard src/pages/ContractCenter.board.test.tsx
```

**3 files, 23 tests passed**, including pulse rail and section routing.

```sh
CC_CREATE_VERIFY=yes CC_DEV_VERIFY=yes \
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/contractCenterCreateRenewDevelopment.test.ts \
  src/lib/contractCenterDevelopment.test.ts
```

**1 file/test passed, 1 file/test failed.** The create/renew scenarios pass.
The older development smoke test expects the obsolete exact creation-history
note `Renewed from 2026–27 at +3%`; the unchanged lifecycle now emits the
year/range renewal note. Both the test and producer are unchanged in this slice.
This optional suite is **not** claimed to pass. The obsolete
`CC_FREEZE_VERIFY` live-storage smoke suite remains disabled: it assumes the
retired Copy endpoint can execute. Copy was not re-enabled.

```sh
pnpm run typecheck
pnpm --filter @workspace/scripts run check-schema-drift
pnpm --filter @workspace/scripts run check-required-extensions
git diff --check
```

- Root typecheck still exits 2: **730 diagnostics versus saved baseline 731**.
  Compared diagnostic multisets by file, error code and message, ignoring shifted
  source positions: **zero added, exactly one removed**. The removed diagnostic is
  the requested Copy planner missing `bidTicketId` error. This is baseline-relative
  acceptance, not a claim that root typechecking passes.
- Schema drift: **passed** against the migrated development database.
- Required extensions: **passed**, `pg_trgm` present.
- Whitespace check: **passed**.

Both managed API and CRM workflows were restarted after the code changes and
serve successfully; development logs show no agreement-column startup failures.
The unauthenticated login screenshot renders normally.

Local detailed logs/metadata are under ignored `generated-artifacts/cc2-10/`;
they are not application assets or committed/deployed outputs.

## Signed-in development browser verification

One browser pass used a disposable company, user and customer; no real signed
history or passwords were modified. The fixture company and user were removed
afterward.

- Created a Landscape / Our form draft through the UI for 2026–27, with the
  requested dates and correct season/type/form display.
- Before renewal, Landscape filtering showed the Landscape records and Snow
  showed no results.
- Renewed the seeded signed Landscape relationship through the UI to a Both /
  Our form 2026–27 draft. The old 2025–26 Landscape / Our form season remained
  preserved, displayed as expired. After full reload, both seasons' badges,
  new draft coverage/form and the header/current-season summary persisted.
- Dashboard Contracts tile and pulse rail loaded normally with no contract/schema
  error. Two generic dashboard resource 404s were observed, not linked to the
  agreement schema change.
- **Browser pass verdict: failure on a pre-existing board/list inconsistency.**
  The Both renewal draft appears on the Snow renewal board, but All contracts
  filters/displays the older current season, so its Snow table says no matches.
  On Landscape the table shows the older Landscape season rather than the Both
  draft. Inspection confirms the unchanged `boardLogic.ts` explicitly uses
  each draft's season for board placement and `current ?? latest` for table rows;
  the unchanged API includes either current or pending coverage in its filter.
  No board, list, detail, lifecycle or persistence implementation was modified
  to alter this existing behavior. The entire signed-in scenario is therefore
  **not** claimed to pass, and resolving the existing display-policy mismatch
  remains separate work rather than an unauthorized behavior change.

Browser screenshot evidence: reloaded seasonal detail (`miy7ja`), Landscape
board/table (`cl7neh`), Snow board/table (`9vm41l`), dashboard (`ptgdfe`).

## Publish safeguard

The Publish-preview operation is **unavailable in this task environment**; the
documented `explainSchemaDiff` callback is not exposed. No Publish action was
taken to obtain evidence. The development before/after metadata comparison
confirms only the approved two drops, but is **not a development-to-production
Publish preview**. Therefore the actual pending Publish diff cannot be attested
here. When available it must show exactly the two agreement-column drops; any
additional table/column change is a stop condition requiring investigation.

Production schemas and data were not modified.

## Remaining verification limitations

The schema cleanup, server regression checks and enabled database suites pass.
Root typechecking meets the explicitly authorized zero-new-diagnostics baseline,
but is not globally green. Broader verification is not entirely green because of
the unchanged rate-card expectation, older renewal-note assertion and existing
board/table current-versus-pending season mismatch described above. The real
Publish preview is unavailable. These limitations are explicitly reported rather
than waived silently or fixed by expanding this cleanup's approved scope.
