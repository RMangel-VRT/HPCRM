# E1 delivery: clean PDFs and estimate revisions

## Shipped behavior

- Draft previews and downloads use today's Colorado date and no draft marks.
  Both use the same read-only PDF endpoint. The builder state pill, PDF
  headings, footer, signature sentence, and filename omit the version while
  only one version exists.
- Current sent and declined versions offer the usual scope, section and line
  editing controls. The first committed edit asks before revising. Cancel
  restores the value; confirming revises and replays against the copied IDs.
  Manual **Start Version N** is available in the overflow menu. Accepted
  versions and historical content stay locked. Accepted change orders and
  **Mark as Sent** are unchanged.
- The send banner can show the existing audit date and delivery method.
  **Mark as Sent** does not capture a recipient; the banner does not guess
  one from the customer or sender. Recipient capture belongs to E5.
- On a competing draft, replay requires the same source and a known surviving
  target. Older drafts have no backfilled mapping. If a target cannot be
  resolved, the builder opens the draft, explains that the edit did not apply,
  and does not write to the source or guess a target.

Historical standalone PDFs are regenerated, not retrieved from an archive.
The PDF regression compared a test estimate rendered directly after send
against the same version rendered after revising and editing its successor.
The extracted text agreed after removing the newly visible version labels;
the original persisted scope, prices, quantities, subtotal and version state
also agreed. This does not imply byte equality or that a re-render can recover
the original attachment: render timestamps and live metadata such as the W1
work location, company settings and linked ticket details can differ. Existing
stored proposal PDFs, invoice document rendering and the shared stamping
rules are unchanged.

## Changed files

| Area | Changes |
| --- | --- |
| Persistence and contracts | `.migration-backup/migrations/0090_estimate_revision_id_map.sql`, `lib/db/src/schema/estimates.ts`, `lib/db/src/estimateContracts.ts` |
| Scoped reads, revise, and PDF route | API `services/estimateReads.ts`, `services/estimateLifecycle.ts`, `services/estimatePdf.ts`, `routes/estimates.ts` |
| Document rendering | API `services/documents/estimate.ts`; `services/documents/proposal.ts` retains the legacy proposal projection and versioned acceptance wording |
| Builder and preview | CRM `pages/EstimateBuilder.tsx`, `lib/estimateBuilder.ts`, `lib/estimateRevision.ts`, `components/estimates/ScopeOfWorkCard.tsx` and `PdfPreviewDialog.tsx`, preview callers in `DocumentSettingsCard.tsx`, `ProposalEstimateSection.tsx` and `EstimatesBoardPage.tsx`, plus `i18n/locales/en.ts` and `es.ts` |
| Regression checks | API `routes/{estimateLifecycle,estimates}.test.ts`, `services/{estimatePdf.test,estimateLifecycle.integration.test,estimates.integration.test}.ts`, `services/documents/{estimateEngine,proposal}.test.ts`; CRM `pages/EstimateBuilder.{lifecycle,slice35}.rendered.test.tsx`, `components/estimates/{PdfPreviewDialog.engine.test,ProposalEstimateSection.rendered.test}.tsx` |

Migration `0090` is additive and guarded. It was applied to the isolated
development database. There is no startup DDL or production data change.

## Verification

- CRM: 108 passing tests across the lifecycle and builder rendered suites, the PDF preview and linked-estimate preview suites, and lifecycle actions.
- API: 137 passing focused route, model and renderer tests, 22 passing
  PostgreSQL lifecycle tests, and one passing PostgreSQL-backed PDF route
  regression.
- Real Chromium and Poppler verified clean multi-page draft PDFs, short headers,
  footers and version labeling. PostgreSQL-backed PDF checks also verified the
  download filename, Colorado date, unchanged draft state, the original frozen
  version after editing a revision, and scoped read access.
- Before editing, the focused API baseline had two failing standalone estimate
  HTML hashes in `documents/proposal.test.ts`. E1 intentionally changes that
  HTML. The tests now compare the recomposed structure and check that linked
  proposal acceptance language retains its version. Renderer suites run
  serially in this workspace to avoid concurrent Chromium failures.
- `pnpm run typecheck:libs` passed. Artifact typechecks still report the same
  694 API and 186 CRM diagnostics as before E1, with no additions or removals
  after normalizing line and column offsets. The checked-in application
  baseline is not typecheck-clean.
- The CRM dev server served the transformed builder module. The API built,
  but the fork's managed preview did not open its port before the startup
  deadline while existing per-company startup jobs were running. Verification
  used the focused test harnesses; startup jobs were not changed.
