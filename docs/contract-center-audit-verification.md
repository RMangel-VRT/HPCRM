# Audit export and validated contract import: development verification

## Release status

Development implementation and verification only. No production export, signed
document audit, correction, import or publication was performed. The merged
implementation baseline already contained create/renew and the legacy freeze.
See [the current rollout note](contract-center-audit-rollout.md) before any manual
production audit; it supersedes the historical immediate-Copy instructions.
The Design & Impact Map remains unavailable; the rollout note records its required
Phase 7 shared-object retention rule.

## Migration and packages

`0048_agreement_import_ref.sql` was the next free migration after `0047_visits.sql`.
It guards the nullable column and named
`agreements_company_import_ref_unique` constraint. Development migration, schema
drift and required `pg_trgm` extension checks passed. Both agreement schemas and
insert schemas match; ordinary create/renew flows omit the nullable reference.

Exact API pins: `archiver@7.0.1`, `csv-parse@6.1.0`, `yauzl@3.2.0`;
development types `@types/archiver@6.0.3`, `@types/yauzl@2.10.3`.
Existing lockfile package/snapshot resolutions were compared semantically with
the baseline and retained. A frozen-lockfile install passed.

## Passing checks

- Focused API/schema/export/parser/import/Copy-preview suites: **153 tests passed**
  across four files.
- Opt-in real PostgreSQL audit suite: **8 tests passed**. Disposable companies and
  users are cleaned up. It covers authorization and tenancy, default no-write
  Preview, invalid real request no-write behavior, import/reimport, unchanged
  legacy sources, document metadata, customer management company, renewed term
  links, history, by-legacy navigation, null-ref preservation, outside-link
  conflicts, concurrent reimports, and one-customer rollback while another commits.
  The combined focused/real-DB retention pass had **160 passing tests**. It additionally
  renews an imported agreement through the real lifecycle API and attaches
  disposable document metadata, then verifies that Preview and real reimport
  block replacement and leave the renewal, documents and complete agreement
  detail unchanged. A separate direct attachment on an imported season is
  protected in the same way. Both checks are re-evaluated after write locks.
- Customer provenance rendered suite: **15 tests passed**.
- Canonical library declaration build passed; neither API nor CRM typecheck
  reported errors in the changed audit, Settings, provenance or schema-test files.
- Schema drift, required extensions, API bundle/startup and CRM startup passed.
- Streaming checks cover original bytes/all versions, sanitized/truncated
  filenames, generic missing-file diagnostics, metadata-only no object reads,
  archive contents and storage-stream destruction on client disconnect.
- A subsequent focused export/schema rerun also covers spreadsheet formula
  injection: formula-leading editable text, including whitespace/control prefixes,
  is apostrophe-prefixed before RFC quoting. IDs and decimal money retain their
  audit values; negative legacy cents format correctly. All eight CSVs share
  this cell encoder.
- Parser checks cover exact decimal money, required/unknown/duplicate headers,
  malformed CSV, unsupported/duplicate files, nested template/README handling,
  unfilled placeholders, multipart aggregate bounds, ZIP traversal, expansion
  and entry-count limits.
- Planner checks cover required values, enums, dates, booleans, bounded integers,
  same-company/non-parent ownership, agreement consistency, unique season refs,
  renewal ordering/cycles, every child ref, canonical snow/payments/rates/scope,
  zero-valued snow T&M payment rejection, rate metadata/overrides, cross-customer
  and reused legacy/doc links, outside replacement ownership and all specified
  warnings.

## Authoritative worked template

The original supplied ZIP's README and all five CSVs are reused, including their
safe nested folder. Tests substitute **only ID placeholders**, never business
values. The canonical results are:

- Renewed 2025–26: **$19,500**.
- Sent/needs-review 2026–27: **$30,000 + $11,515 = $41,515**.
- Apr 2026–Sep 2027 billing: **18 grounds and 13 chemical rows**, no Mar 2026 row.

## Signed-in browser verification

A single browser pass used only a disposable admin/company/College Hills fixture:

- Size 10, batch counts/size, include-documents on by default, both downloads;
  ZIP integrity, manifest, all eight CSVs, two missing-object diagnostics only
  when document reads were enabled.
- Corrected nested ZIP Preview: zero errors/warnings, correct agreement/season
  totals and prices; inline confirmation and first import succeeded.
- Reimport Preview showed Replace; reimport left one agreement with two seasons.
- File reselection cleared Preview and Import eligibility. The original unfilled
  ZIP showed 13 grouped errors and disabled Import. Corrected five-CSV Preview
  succeeded with the same totals.
- Copy remained disabled with the required wording; Copy Preview remained usable.
- Customer Open and a legacy-ID contract URL resolved to the imported agreement;
  billing counts, rate snapshots, populated scope, document metadata and imported
  history were visible.

There was no company-switch control in that fixture's navigation, so the optional
interactive switch check was not performed. The Settings component remounts on
active-company change, clears all file/report state, keys batch queries by
company, and discards stale responses; server tenancy was exercised against a
different active company. Brief navigation 404/502 responses did not prevent
the imported agreement or detail tabs from loading.

## Existing failures, kept separate

Canonical `pnpm run typecheck` exits 2 on **735 existing API diagnostics**; the
independent CRM typecheck exits 2 on **221 existing diagnostics**. Representative
API failures are return paths in auth/routes, the absent `seedAllTicketTypes`
export, storage response types and existing test mocks. CRM failures include its
existing untyped shared schema and legacy component/query typing. No unrelated
type repairs were included.

The final full API suite had **1,245 passed, 8 failed, 9 skipped**. Seven failures
are the unchanged plant-enrichment partial-run test and six mailbox OAuth
reconnect/mismatch tests. An unchanged visits integration test also hit its
5-second timeout in that run (it passed in the earlier full run).
The full CRM suite had **184 passed, 8 failed**: two crew-selection reducers,
five tab-query routing tests and one rate-card group/count expectation. Those
files were not changed. Complete logs are ignored generated output under
`generated-artifacts/contract-audit/`, not committed assets.

## Changed files

- Migration, both agreement schemas: `.migration-backup/migrations/0048_agreement_import_ref.sql`,
  `lib/db/src/schema/schema.ts`, CRM `src/shared/schema.ts`.
- API `src/lib/contractAudit{Files,Data,Plan,Execution,Export}.ts`;
  `src/routes/contractAudit.ts`; registration/Copy gate in `src/routes/contractCenter.ts`.
- API `src/lib/contractAudit.test.ts`, `contractAudit.integration.test.ts`,
  `contractAuditFixture.ts`, `contractAuditBrowserFixture.ts`;
  `src/shared/contractCenterSchema.test.ts`, `src/routes/contractCenterCopy.test.ts`.
- CRM `src/components/contracts/{AuditImportCard,ContractSettings,LegacyCopyCard,CustomerContracts}.tsx`;
  `src/pages/CustomerContracts.rendered.test.tsx`.
- API package manifest, workspace lockfile, this report, audit rollout,
  revised switch-over verification, `replit.md` pointer and the durable
  Contract Center phase-boundary memory note.
