# E2 delivery: faster estimate line editing

The merged E1 builder now supports pointer and keyboard sorting, row actions,
in-place catalog swaps, inline descriptions, and direct catalog adds. The
estimate page layout, pricing and rounding rules, document generation, and
sent/accepted locking did not change. No migration is required.

## Changed files

| Area | Changes |
| --- | --- |
| Shared contracts and arithmetic | `lib/db/src/estimateContracts.ts`, `lib/db/src/estimateMath.ts`, `lib/db/package.json` |
| Draft API and metadata | API `routes/estimates.ts`; `services/estimates.ts`, `estimateMath.ts`, `estimateSnapshots.ts`, `estimateRates.ts`, `estimateCatalogSaves.ts` |
| Builder | CRM `pages/EstimateBuilder.tsx`; `components/estimates/{EstimateSectionCard,EstimateSorting,InlineEstimateInput,SectionSearch,AddLineDialog,CustomLineForm}.tsx`, removal of `AddLineButtons.tsx`, and `estimateBuilder.css` |
| Scoped edits, catalog projections, and copy | CRM `lib/{estimateEditQueue,estimateRevision,pickerSources,customLine,estimateLifecycleActions,estimateSettings}.ts` and `i18n/locales/{en,es}.ts` |
| Verification | API estimate routes/rates tests and estimate/catalog-save integration tests; CRM estimate builder rendered suites, Services Catalog rendered suite, revision replay tests and shared rendered test interactions |

## Verification

- The approved mockup's **Proposed — one page** view was exercised for row
  actions, swap, add and keyboard handles.
- 192 API tests passed, including PostgreSQL-backed checks for complete
  order writes, malformed/foreign orders, reload persistence, duplicate
  placement, in-place replacement across types, manual price reset, and
  description-only catalog edits. Rate resets preserve saved descriptions
  and plant-table choices and reject stale catalog references. Database
  suites ran serially with a 20-second per-test timeout to account for the
  development database latency.
- 175 CRM tests passed across the four builder rendered suites, revision
  replay and lifecycle-feedback unit tests, and Services Catalog rendered tests. Coverage includes
  five rapid edits, a failed write with later edits still queued, and
  quantity selection after a direct add.
- Chromium confirmed keyboard moves across sections and focus restoration,
  keyboard section reorder, pointer moves within and across sections,
  one request per drop, reload, rejected-order rollback, a same-row swap
  with manual-price reset from the toast, and direct add with Qty selected.
  These browser checks used controlled responses; persistence and company
  constraints were validated separately against PostgreSQL.
- The archived E1 rendered baseline passed 138 of 142 tests. Four assertions
  still expected current sent/declined versions to be read-only; E2's
  regressions distinguish their confirmed-revision controls from accepted
  and historical read-only versions.
- `pnpm run typecheck:libs` passed. Artifact typechecks retain the E1
  baseline of 694 API and 186 CRM diagnostics, with no added diagnostics
  after normalizing source positions.
- The fork's managed API workflow did not open its port before the deadline
  while existing per-company startup backfills were running. This matches
  the E1 verification limitation. The database-backed API suite and the
  Chromium checks of the running CRM with isolated response fixtures do
  not depend on that workflow. No production changes were made.
