# CC2-13 development verification

## Implementation and boundaries

- One nullable document FK owns additional coverage. Reads derive intervening seasons by start date within the already-loaded agreement; no copied document rows, link table, coverage backfill, or imported renewal-set inference.
- Company-scoped admin/office coverage PATCH supports explicit-null clearing, strict payload validation, agreement serialization and document locking, and source-season history attributed to the acting user.
- Signed uploads to the first year of a recognized renewal set default to its last year. Later years can upload their own independent signed copy. The old signed-document fallback is absent from application responses and client logic.
- Audit `documents.csv` accepts optional `covers_through_ref`; renewal CSV behavior is unchanged. Audit document writes occur after all agreement season identities exist.
- Field editability is independent from status ownership. Draft/sent are editable; signed/active/renewed are editable through the inclusive Colorado end date, including future seasons; lost/cancelled are closed. Renewed edits receive attributable post-signing history.
- Own and covered document rows provide View/Download; covered rows navigate to their source. Coverage controls persist through the API and invalidate agreement queries. The shared accessible dialog previews PDFs/images, provides a translated unsupported-format message and footer actions, and leaves object serving and download attributes unchanged.
- No production reads or writes, publication, production migration scripts, startup DDL, legacy-contract behavior changes, reporting/revenue changes, mobile changes, or dependency updates.

## Existing-season write-path audit

The only existing-season **field-edit guard call sites** are:

1. `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: `PATCH /api/contract-center/terms/:termId` calls `assertEditable(term)`.
2. The shared handler in the same module for all three routes calls `assertEditable(term)`:
   - `PUT /api/contract-center/terms/:termId/scope`
   - `PUT /api/contract-center/terms/:termId/rates`
   - `PUT /api/contract-center/terms/:termId/payments`

All four writes retain agreement locking and `writeTerm` history. `fullDetail` uses the same `isTermEditable` server rule and one Colorado day per detail response. Client edit permissions use only `editable === true`.

Other audited writers intentionally do **not** use a field-edit guard:

- `contractAuditExecution`: constructs historical replacement seasons with `previous = null`; existing ownership, eligible-replacement, transaction and historical-data safeguards remain. It does not PATCH existing season fields.
- `contractRenewalExecution`: constructs new imported seasons and changes the predecessor's **status** to renewed; this lifecycle operation is not a field edit and must remain possible for historical predecessors.
- `contractCenterStatusChange`: lifecycle/status propagation retains year-one-only renewal-set ownership; later-year moves still return 409.
- Legacy Copy execution constructs new seasons only and remains frozen to real writes. Its document projection explicitly supplies null for the new nullable field.
- Document upload and document coverage routes write document metadata rather than season fields; coverage must remain configurable on historical imported source documents.

## Migration and intended Publish schema diff

Migration: `.migration-backup/migrations/0055_document_covers_through.sql`.

0055 was rechecked as the next free number. The guarded migration was applied with the normal development migration runner. The authoritative schema diff contains only:

```sql
ALTER TABLE term_documents
  ADD COLUMN covers_through_term_id varchar
  REFERENCES agreement_terms(id) ON DELETE SET NULL;
```

The live development FK definition was verified as `FOREIGN KEY (covers_through_term_id) REFERENCES agreement_terms(id) ON DELETE SET NULL`. There are no new indexes, tables, defaults, inferred values, startup schema writes, renamed historical migrations, or other authoritative schema changes. This is the **intended** Publish diff, established from this branch's schema changes; Publish was not opened or run and a production-wide pending diff was not claimed.

## Baseline and automated checks

Baseline was recorded before editing in ignored `generated-artifacts/cc2-13/` logs:

- Root `pnpm run typecheck`: exit 2 with **730 existing diagnostics**, all emitted by API-server typecheck, including cross-artifact frontend schema/stub imports and unrelated existing route/type errors. Shared declarations were refreshed by root `typecheck:libs`.
- Relevant API tests: **127 passed; 19 database tests skipped** because opt-in flags were initially unset.
- CRM `test:contract-center`: **107 passed**.
- Schema drift: passed.

After implementation:

- Root `pnpm run typecheck`, with refreshed shared declarations: exit 2, **the same 730 diagnostic signatures**, no additions or removals after ignoring line-number shifts. Existing failures were not repaired outside this slice.
- The eight requested/related API files have **192 passing tests** across the recorded passes, with database opt-ins enabled. One obsolete upload-rejection fixture initially lacked a session; after the route's missing-session lookup was made explicit, the complete changing-renewal integration file passed **14/14**. The other seven files had already passed and were not unnecessarily rerun.
- Additional legacy-copy/schema/audit regression check: **106 passed across three overlapping files**, including `contractCenterCopy.test.ts`.
- CRM contract-center suite: **113 tests pass across the recorded passes**; the updated billing file passed **13/13** after initializing the test's translation resources.
- New document-view/coverage component suite: **5/5 passed** (PDF iframe, image, Word fallback, footer/download attributes, source navigation, empty state, coverage set/clear/error and refresh).
- Required extensions: `pg_trgm` present.
- Schema drift: passed after migration.
- `git diff --check`: passed.
- Both affected development workflows restarted and served requests. Existing SSL-mode, concurrent pg query deprecation and PostCSS warnings were observed; no dependency or unrelated startup behavior was changed.

API regressions cover strict set/clear payloads, roles/company boundaries, invalid/self/equal-date/earlier/cross-agreement targets, bounded derived coverage and source labels, own-only non-leakage, target deletion nulling, signed three-year upload defaults, separate later-year copies, old fallback removal, valid/invalid/legacy audit CSVs and out-of-order persistence. Editability tests cover every status before/on/after the inclusive end date across detail/PATCH/scope/rates/payments, future signed/active/renewed seasons, Colorado midnight, renewed attribution and later-year status rejection.

## Requested customer examples — development only

Both exact-name and broader partial-name read-only development searches returned no matching customers.

| Customer | Requested end season | Coverage control / preview result |
|---|---|---|
| Summerfield North | 2027–28 | Unavailable: customer/seasons/files absent in this fork. Neither season's Edit controls nor its PDF could be checked against this customer. |
| Huntington Trails | 2030 | Unavailable: customer/seasons/files absent in this fork. No coverage setting or preview was attempted. |
| Third Villa West | 2026–27 | Unavailable: customer/seasons/files absent in this fork. No coverage setting or preview was attempted. |
| Fallbrook Farms 2 | 2027–28 | Unavailable: customer/seasons/files absent in this fork. No coverage setting or preview was attempted. |

No similarly named substitute customer or production record was created or changed. Equivalent renewed/future-editable and ended-read-only behavior is covered with isolated fixtures; this does not count as verification of the four absent customers.

## Browser verification

One browser pass completed successfully using only an isolated development company and canonical disposable account:

- Ended original season: “Past season, read only,” no Edit.
- Three-year renewal creation returned 201. Year-one Sent and Signed returned 200; the first year became renewed/displayed Active, middle year Renewed and final year Signed.
- All three unended seasons exposed Edit without a past-season note. A first-year notes edit saved and History showed “Edited after signing: notes” attributed to the disposable admin. Later-year status controls remained absent and its status move returned 409.
- Actual signed PDF upload through the UI defaulted to the third year. Clearing coverage removed the inherited row; restoring the third-year endpoint persisted after reload and showed the same document on both covered seasons. Source tags navigated correctly.
- A separate middle-year signed upload coexisted with the inherited row, remained own-season-only, and did not appear on the final year.
- The real PDF rendered in the dialog iframe. Its file request returned 200 `application/pdf` with **no Content-Disposition header**; footer actions and row `download="signed.pdf"` remained present.
- The uploaded image rendered a loaded `<img>` (the intentionally tiny 1×1 fixture is visually blank). The Word-type fixture showed the no-preview message and both footer actions. An actual Word download completed with the expected filename and no failure.
- Screenshot evidence: the browser verification captured the embedded signed PDF and footer controls; it was visually inspected.
- Two initial GET `/` resource/probe 404s occurred before the CRM loaded; all contract/upload/object requests then succeeded. The later-year 409 was intentional. No other server-side errors were reported for the pass.
- All disposable browser-company records, user and uploaded objects were cleaned up afterward, and the ignored temporary credential file was removed.

The absent named-customer checks above remain unavailable; disposable verification is not presented as a substitute for inspecting those real customers.

## Changed files

- `.migration-backup/migrations/0055_document_covers_through.sql`
- `lib/db/src/schema/schema.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.ts`
- `artifacts/api-server/src/lib/contractAuditFiles.ts`
- `artifacts/api-server/src/lib/contractAuditPlan.ts`
- `artifacts/api-server/src/lib/contractAuditExecution.ts`
- `artifacts/api-server/src/lib/contractAudit.test.ts`
- `artifacts/api-server/src/lib/contractAudit.integration.test.ts`
- `artifacts/api-server/src/lib/contractChangingRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/contractEditability.test.ts`
- `artifacts/api-server/src/shared/contractCenterSchema.test.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `artifacts/highplains-crm/src/components/contracts/contractTypes.ts`
- `artifacts/highplains-crm/src/components/contracts/DocumentViewDialog.tsx`
- `artifacts/highplains-crm/src/components/contracts/SeasonDocuments.tsx`
- `artifacts/highplains-crm/src/components/contracts/SeasonDocuments.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/ContractPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractCenter.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/ContractBilling.rendered.test.tsx`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`
- `artifacts/highplains-crm/src/i18n/locales/es.ts`
- `docs/data-ownership-map.md`
- `docs/cc2-13-verification.md`
- `.agents/memory/contract-center-phase-boundaries.md` (superseded renewed-edit restriction corrected)
