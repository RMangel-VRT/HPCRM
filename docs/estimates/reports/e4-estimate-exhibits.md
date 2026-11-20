# E4 — Estimate exhibits and crew worksheets

E4 builds on the E3 estimate builder. It adds version-owned photos, a
default-on plant table, and worksheet generation from the selected version.
It does not migrate or rewrite proposal files, change invoice output, add
a cover or Visual Scope, or send email.

| Area | Changes |
| --- | --- |
| Database and contracts | `0091_estimate_version_exhibits.sql`, `lib/db/src/schema/{estimates,schema}.ts`, `lib/db/src/estimateContracts.ts`, worksheet mirror in CRM `src/shared/schema.ts` |
| Estimates API and private photos | API `routes/estimates.ts`, `objectStorage.ts`, `services/{estimatePhotos,estimatePhotoStorage,estimateReads,estimates,estimateLifecycle}.ts` |
| Estimate PDF | API `services/estimatePdf.ts`, `services/documents/{estimate,estimateExhibits,exhibitImage}.ts`; shared image helper re-exported without changing the proposal renderer |
| Builder | CRM `pages/EstimateBuilder.tsx`, `components/estimates/{EstimatePhotosCard,EstimateReviewRail,EstimateSectionCard}.tsx`, edit queue/revision/photo upload helpers and EN/ES strings |
| Crew worksheets | API `services/{estimateCrewWorksheet,crewWorksheetNumber}.ts`, `lib/crewWorksheetAccess.ts`, `routes/routes.ts`, `storage.ts`; CRM draft/print pages and `CrewWorksheetEstimateSnapshot.tsx` |

The guarded additive migration was applied to development only. Required
extension and schema-drift checks passed. Estimate photo metadata belongs
to a version; each revision gets new rows, and both rows can refer to the
same immutable private image. Worksheet rows also retain those references.
Removing or discarding metadata does not delete accepted images. A lost
response on registration can be retried without duplicating a photo; a late
upload against a locked version is rejected. Unfinished uploads are distinct
from accepted private files. Out-of-band cleanup of unused bytes is not
part of E4.

The PDF groups included catalog plant lines at the same size, uses a
thumbnail column only when an image is available, and leaves priced lines
and totals unchanged. Photos follow the acceptance page, two per page.
Worksheet snapshots include scope, ordered working descriptions, quantities,
units, photos, and the source label. They omit commercial pricing and costs.
If the draft that supplied a worksheet is later discarded, the attribution
remains but the deleted version is no longer linked.

## Verification

- **CRM:** 154 rendered builder tests passed, including multiple-file drop,
  version-specific upload, plant switch PATCH, first-edit caption mapping,
  pagination markers, and worksheet creation from a historical version.
- **Chromium gallery:** at desktop width, three cards shared a row.
  Space, Right Arrow, then Space sent one order update, moved the page marker
  with position two, renumbered the photos, and kept focus on the moved photo.
- **PostgreSQL/API:** 131 tests passed across the targeted API and document
  suites. The exhibit lifecycle regression checks locked writes,
  cross-company/session isolation, bad and late uploads, retry, ordering,
  caption, hidden plants and unchanged totals, the off switch, new IDs on
  revise, copy deletion/discard, and worksheet content and attribution.
  An independent development object-store smoke check verified signed PUT
  through normalized private read and denial through the generic reader.
- **Chromium PDFs:** three photos produce two pages; six photos produce
  three. A 108-line estimate keeps pricing headers repeating, every line in
  order, and its total unsplit. A PDF image inspection verifies that the
  mountains are confined to the acceptance page. The existing estimate,
  proposal P4, and invoice rendering regression suites passed.
- **Typecheck:** shared libraries passed. The API and CRM retain the
  pre-existing 694 and 186 diagnostics, respectively, with no new errors.
- **Preview limitation:** the full signed-in development workflow could not
  be verified because the API did not finish an existing startup backfill
  before the workflow timed out. The isolated route, storage and browser
  checks above do not depend on that backfill.
