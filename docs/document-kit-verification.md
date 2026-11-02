# IC4 delivery and verification report

## Delivered

- One offline HTML/Chromium → pdf-lib kit for estimate and invoice draft PDFs.
- Existing estimate URL/dialog/headers/filename and safe-error/access behavior
  retained. Estimate models remain read-only and allowlisted; section groups,
  stored units, frozen commercial totals and `customerSafeDetail` remain intact.
- New company-flagged `GET /api/invoices/:id/pdf`, inline or `download=1`,
  revision-aware filenames, no-store/nosniff, access-before-flag and company
  isolation. Draft pill/stamp, unpriced dashes, subtotal-before-tax and
  QuickBooks tax notice prevent presenting a final payable total.
- Admin-only bilingual Documents settings card with 13 contact/boilerplate
  fields, scoped requests/caches, save/error handling and an authorized live
  estimate preview using the unchanged preview dialog.
- Committed logos, alpha-preserving recolored mountains, licensed Inter weights
  and module-relative source/bundle asset loading.

## Migration and runtime

Migration: **`0063_company_document_settings.sql`**. Both 0061 and 0062 had
already been allocated to Routes, so IC4 used the next unused number. No
historical migration was renamed. It applied in development, the runner rerun
reported no pending work, and an isolated PostgreSQL schema test executes the
SQL three times, retaining configured data. Isolation avoids contending with
other suites replaying historical DDL. Drizzle schema drift and required
`pg_trgm` extension checks passed. No startup DDL was added.

Nix `.replit` packages provide **chromium** and development **poppler-utils**.
The executable resolver tries `PUPPETEER_EXECUTABLE_PATH`,
`REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `chromium`, `chromium-browser`, in that
order. See `docs/document-kit.md` and `replit.md` for autoscale preservation
requirements. Production availability was **not verified by deployment**.
`puppeteer-core`, `@pdf-lib/fontkit` and `@fontsource/inter` are API dependencies;
no browser download/install postscript is needed.

An explicit pnpm package extension binds the existing hookform resolver to its
required Zod 3. It imports Zod without declaring the dependency; adding the
browser's Zod 4 dependency otherwise changed hoisting and introduced 22 unrelated
CRM errors. This compatibility binding restores the baseline without changing
form code, libraries or the existing `autoInstallPeers: false` policy. Original
frontend testing peers and Vitest importer versions are retained.
Frozen-lockfile installation passed.

The lazy browser reuses one process, admits two active render/stamp jobs, queues
excess work, applies 20-second deadlines and shuts down after five idle minutes.
Pages close after success and failure. Requests other than data URLs are blocked.
Final blocks taller than the printable page fail explicitly instead of splitting
acceptance/payment content. Only a launch-unavailable estimate falls back, with
the sole fixed diagnostic `DOCUMENT_RENDERER_UNAVAILABLE`; render/content/stamp
errors do not silently select a different design.

`node artifacts/api-server/build.mjs` succeeded. The standalone bundle verifier
runs from **`/tmp`** using the actual copied `dist/assets/documents` and generated
a **559,493-byte PDF**. It closes its browser. The main API and CRM workflows
were restarted successfully; the mobile watcher, disturbed by dependency
installation, was restarted without any mobile code changes. API settings and
invoice-PDF requests without a session both returned 401. Public CRM preview
loaded the expected sign-in screen, not the authenticated settings card.

## Tests and baseline comparison

Durable logs are in ignored `generated-artifacts/ic4/`.

- Focused final API/PDF run: **129 tests passed, 10 files**.
- Focused final Documents/navigation run: **21 tests passed, 3 files**.
- Includes model privacy, safe text/units, category arithmetic, impossible dates,
  captured amounts, explicit snapshot allowlists, default-name substitution,
  authentication/roles/company binding/flag order, settings defaults/partial
  updates/attribution, migration replay, invoice read-only behavior, real browser
  pagination/offline behavior, shared-browser lifecycle and legacy fallback.
- Invoice database verification compares the invoice detail before and after
  rendering, including events, issue snapshots and QBO mirror columns, and
  confirms foreign-company 404 and issued-invoice 409.
- Actual Chromium was available: **no real-render tests were skipped**.
- Library declaration refresh (`pnpm exec tsc --build --force`) passed.
- API typecheck baseline/final: **730 → 730 diagnostics**.
- CRM typecheck baseline/final: **221 → 221 diagnostics**.
  Comparing normalized file/error-code counts yields **zero added diagnostics**.
  The existing project typechecks remain red; neither is claimed clean.

Full API and CRM suites were run sequentially with two workers. An unchanged
source archive was also tested from its own working directory. The first archive
run lacked Git-ignored source logo/template assets, so it was not treated as a
clean product comparison: after linking the original assets, its three affected
fixture suites passed **71/71**, the affected estimate display/ownership case
passed, and the CRM Mentions suite passed **45/45**. Raw logs, including failed
attempts, are retained rather than presenting a falsely green baseline.

| Check | Unchanged-source baseline, with missing-fixture repairs verified | Final full run |
|---|---|---|
| API | 2 failed files, 109 passed, 11 skipped; 7 failed tests, 2,330 passed, 96 skipped (2,433) | 2 failed files, 115 passed, 11 skipped; 7 failed tests, 2,405 passed, 96 skipped (2,508) |
| CRM | 5 failed files, 68 passed; 10 failed tests, 902 passed (912) | 5 failed files, 69 passed; 10 failed tests, 906 passed (916) |

The baseline columns are the union of the complete unchanged-source run and
the explicit repaired-fixture reruns, not a claim that the raw archive run was
green. Raw archive API counts were 14 failed/2,302 passed/96 skipped (2,412),
with one missing-template suite not collected. Raw archive CRM counts were
10 failed/857 passed (867), with the missing-logo Mentions suite not collected.
Adding the recovered template/Mentions tests and replacing only verified
asset-related failures gives the baseline above.

The **same existing failure sets** remain:

- API: six OAuth mailbox reconnect tests in
  `routes/mailboxAccounts.oauthReconnect.test.ts`; the partial-status assertion
  in `lib/plantEnrichment.test.ts`.
- CRM: five URL-tab tests in `hooks/useTabParam.test.ts`; two selection-reducer
  assertions in `components/CrewAssignmentBoard.test.ts`; one empty-conversation
  assertion each in `components/TicketConversation.rendered.test.tsx` and
  `pages/TicketDetail.visits.rendered.test.tsx`; one missing-group count in
  `components/contracts/rateCardUtils.test.ts`.

Thus the final suite adds **75 passing API tests and four passing CRM tests**,
with no new failure names. Logs: `clean-baseline-{api,crm}-tests.log`,
`repaired-baseline-fixtures.log`, `repaired-baseline-estimate-display.log`,
`repaired-baseline-crm-assets.log`, `verified-{api,crm}-tests.log`.
The final evidence-only footer-label alignment was confirmed by a separate
**8/8 real-render/HTML test pass**, without application-code changes.

## PDF evidence and visual limits

Full-resolution PNG pages, matching PDFs and extracted text:

| Fixture | Pages | Files under `generated-artifacts/ic4/png/` |
|---|---:|---|
| 12-line estimate, sent version 2 | 2 | `estimate-12-{1,2}.png`, `estimate-12.pdf`, `estimate-12.txt` |
| 60-line estimate | 5 | `estimate-60-{1..5}.png`, `estimate-60.pdf`, `estimate-60.txt` |
| 13-line invoice, draft revision 1, one unpriced line | 2 | `invoice-13-{1,2}.png`, `invoice-13.pdf`, `invoice-13.txt` |

Each fixture also has an `*-all-pages.png` contact sheet for comparison. The
fixtures are fictional and contain no actual customer information. Tests check
Page i of N, repeated table headings on pages with line items, short later bands,
last-page mountain resources, and acceptance/payment content together on the
final page. PNGs were inspected directly for layout. The kit's golden tokens and
written guide were implemented; **no approved canvas screenshots were supplied,
so screenshot parity and Randy's visual approval remain unverified**.

The proposal generator and `pdfBrand.ts` are unchanged. Their original
72-dpi raster fingerprints still match for the actual **7-page short** and
**9-page long** proposal fixtures, including exhibits. No proposal page, cover,
narrative, acceptance, hills branding or exhibit composition was altered.

## Changed files

- Database: `.migration-backup/migrations/0063_company_document_settings.sql`;
  `lib/db/src/documentContracts.ts`, `schema/companyDocumentSettings.ts`,
  `schema/index.ts`, `estimateContracts.ts`; `lib/db/package.json`.
- API services: `estimatePdf.ts`, `estimateDisplay.ts`, `invoicePdf.ts`,
  `documentSettings.ts`, `documentSettings.integration.test.ts`;
  `estimatePdf.test.ts`.
- Shared kit under `artifacts/api-server/src/services/documents/`:
  `assets.ts`, `browser.ts`, `categories.ts`, `layout.ts`, `stamp.ts`,
  `render.ts`, `estimate.ts`, `invoice.ts`, `fixtures.ts`, `browser.test.ts`,
  `render.test.ts`, `fallback.test.ts`, `invoiceModel.test.ts`.
- API routes: `routes.ts`, `invoices.ts`, `invoices.test.ts`,
  `documentSettings.ts`, `documentSettings.test.ts`.
- API assets/scripts: `src/assets/documents/*` (two logos, mountains, four
  WOFF2 and four TTF weights, SIL license); `scripts/prepare-document-assets.mjs`,
  `scripts/verify-document-bundle.mjs`; `build.mjs`, `package.json`.
- CRM: `components/DocumentSettingsCard.tsx` and its rendered test,
  `components/nav/settingsNav.ts` and its test, `pages/SettingsPage.tsx`,
  `shared/schema.ts`, `i18n/locales/en.ts`, `i18n/locales/es.ts`.
- Runtime/docs: `.replit`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `replit.md`,
  `docs/data-ownership-map.md`, `docs/estimate-builder-pdf.md`,
  `docs/invoice-center-draft-api.md`, `docs/document-kit.md`, this report.
- Memory: the document-font compatibility lesson and its index pointer.

No invoice compose/list, source feeder, issuing, sending, storage, payment,
statement, proposal integration, lifecycle mutation, new application,
design-canvas or mobile functionality was added.

**Nothing was published, and nothing was written to production.** Migration,
fixtures and read-only/no-mutation verification used development only.
