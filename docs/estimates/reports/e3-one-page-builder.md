# E3 — One-page estimate builder verification

E3 changes the estimate builder only, on top of E2 line editing and W1 work
location. There are no schema, production API, invoice PDF, lifecycle, or send
changes. No E4 photo, plant-table, or worksheet controls were added.

## What changed

| Area | Files |
| --- | --- |
| Builder shell, header, and review rail | CRM `pages/EstimateBuilder.tsx`, `components/estimates/{EstimateIdentityHeader.tsx,EstimateReviewRail.tsx,estimateBuilder.css}` |
| Scoped PDF preview/download and W1 editor placement | CRM `components/estimates/PdfPreviewDialog.tsx` and `components/workLocation/EstimateWorkLocation.tsx` |
| English and Spanish | CRM `i18n/locales/{en,es}.ts` |
| Regression checks | CRM `pages/EstimateBuilder.{rendered,lifecycle.rendered,slice35.rendered}.test.tsx`; API `services/estimates.integration.test.ts` |

The checklist gives an approximate page count based on scope and pricing rows
plus the signature page. Actual pagination varies with wrapped text and
configured terms. A version row uses only the recorded sent date, method,
and frozen total. Mark as Sent doesn't record a recipient or archive a
standalone PDF. Historical PDFs use frozen version content and live display
inputs; the builder identifies them as regenerated, not original sent files.

## Verification

Chromium exercised **Proposed — one page** in the approved mockup and then
measured the running CRM with an expanded sidebar and a fixture of 30 lines
in five sections. The widths below are the actual usable builder widths,
excluding outer padding:

| Viewport | Builder width | Result |
| --- | ---: | --- |
| 1440px | 1136px | 288px rail beside editor; sticky while scrolling; six representative names fit on one line without clipping |
| 1280px | 976px | 288px rail beside editor; sticky while scrolling |
| 1024px | 720px | Rail below editor, with no horizontal overflow |
| 768px | 464px | Rail below editor, with no horizontal overflow |
| 1024px, sidebar collapsed | 976px | 288px rail beside editor again |

The **All estimates** link opened the builder list with the existing
Estimates rail. Browser geometry used isolated responses; PostgreSQL and
actual Chromium-rendered PDFs were exercised separately.

- **CRM:** 163 builder, lifecycle, preview, and proposal-action tests passed.
  Coverage includes W1 fallback and save/refresh in the header, version-specific
  PDF requests, non-mutating download, draft and historical version display, and
  the EN/ES checklist and collapsed QuickBooks categories.
- **API:** 64 estimate route/document tests and two targeted PostgreSQL
  integration tests passed. PDF text verified ticket-owned and standalone
  estimates use their updated location. Draft and historical downloads used
  the correct version and filename, preserved saved state, and rejected a
  foreign company or estimate.
- **Baseline:** The separate Estimates navigation suite had four plant-page
  failures in both the unchanged branch and this branch; the other 25 tests
  passed. E3 doesn't change those routes.
- **Typecheck:** `pnpm run typecheck:libs` passed. The CRM artifact stayed at
  186 existing diagnostics, and the API artifact stayed at 694. No new
  diagnostics were introduced.
