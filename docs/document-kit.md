# Shared customer document kit

## Ownership and boundaries

Estimates and invoice **draft previews** share one HTML/Chromium → pdf-lib kit.
Version snapshots own estimate prices, captured invoice lines own billed values,
and existing company settings own company name. `company_document_settings` owns
only document contact details, remit-to, payment instructions, estimate terms,
warranty, and invoice footer text. It does not copy company name. Models are
explicit, read-only allowlists, not editable copies of commercial records.

Migration `0063_company_document_settings.sql` is additive, guarded and rerunnable.
0061 and 0062 were already allocated to Routes. Apply using the normal development
migration runner, never startup DDL. Existing companies get a row; absent rows
read as empty/default settings, and saving a new company's settings upserts its
single row. PATCH omits defaults and preserves absent fields; empty strings clear.
Only active-company admins may GET/PATCH `/api/settings/documents`; captured
`X-Company-Id` expectations prevent queued requests crossing a company switch.
No feature flag is required to configure documents or use estimate PDFs.

## Two passes

1. `services/documents/layout.ts` supplies pure, escaped HTML helpers and embedded
   Inter fonts/assets. The estimate and invoice builders each produce one flow.
   Chromium prints Letter pages using CSS pagination, not screenshots.
2. `stamp.ts` opens that PDF, embeds Inter TTF, and knows the final page count.
   It adds every-page footer/rule/count, short headers on pages 2..N, and
   top-cropped mountains only on N. Drafts have a first-band pill and diagonal
   6%-opacity stamps on every page. The legacy hills watermark is not used.

`renderDocumentPdf({html, footerLabel, shortHeaderNumber, draft?})` is the sole
render interface. A lazy browser is shared, with two slots covering both passes,
FIFO queued work, 20-second per-active-render deadlines and a five-minute idle
shutdown. The deadline starts after admission, not during the queue wait.
Pages always close, including failures/timeouts. Only data URLs are allowed by
request interception; JavaScript is disabled and HTML has a restrictive CSP.
No browser error text, customer data, executable paths or SQL detail is logged
by the new PDF fallback/settings handlers.

## Layout contract and future proposal composition

Approved tokens: #37443D headings/bands, 6px #8CC640 header rule, green/white
8pt caps table headings, 1.5px lime group separators, #e4e6e2 row hairlines,
#EEF6E3 key-figure fill, 1.5px lime border and 8px radius. Body is 10.5pt Inter,
secondary #4f5a53, labels 8.5pt caps, tabular figures.

Use `@page {size:letter; margin:96px 0 76px}` and first-page top margin zero.
The full first band flows inside HTML; the later band is stamped into reserved
space. Put content inside 64px side padding, never page side margins, so full
bands and footer rules reach the edges. First header logo is 80px tall; later
logo 48px. Footer line is 47px from bottom, footer baseline 22px.

Every flowing line table uses a repeating `thead`, fixed column widths,
unbroken row protection and wrapping descriptions. Currency signs appear only
on totals; units are captured words, not normalized. Estimates group by
estimator section and show customer-labeled category aggregates. Invoices group
by QuickBooks umbrella category, with the label only on the first group line.
No raw category keys enter models. Null draft prices show dashes, not zero.

Use `.keep` around the entire final block plus `.mountain-space` (100px), so
totals/payment or acceptance and the mountain allowance move together.
Estimates place their category/total summary with terms/warranty/acceptance on
the final new page, preventing an otherwise isolated summary-only page.
Empty Terms/Warranty text creates no block. Never invent legal text.
Very long user content can naturally require more pages. A final block taller
than the 884px printable area fails explicitly with
`DOCUMENT_FINAL_BLOCK_TOO_LARGE`, rather than splitting legal/payment content.

Future proposal work must reuse the **same estimate-version pricing HTML and
totals**, and record acceptance on that estimate version, never duplicate
commercial records or introduce a second pricing template. Future composition
can supply a cover, narrative flow and legacy exhibit PDF merge around these
pricing pages. Covers may deliberately omit footer/mountains; that requires an
explicit future composition/page-range decoration option, not another template.
No proposal page, acceptance behavior, narrative, cover or exhibit is changed
here. `pdfBrand.ts` and the proposal generator remain legacy/pixel-sensitive.

## Assets and portability

Committed under API `src/assets/documents/`:

- White horizontal and badge logos: supplied `LOGO_-_SPREAD-07` and
  `LOGO_-_SPREAD-06`, alpha-preserving content crops at 720px width.
- Mountains: supplied `Mountains_1773354108536.png`, trimmed, resized to
  2000px, recolored RGB (55,68,61) while retaining alpha. Stamp pass clips the
  top 84px display area, preserving aspect ratio and peaks.
- Inter Latin 400/500/600/700 WOFF2 from `@fontsource/inter`, SIL Open Font
  License included as `Inter-LICENSE.txt`. Corresponding TTFs are lossless
  decompressions of those fonts using fontTools (`TTFont(...); flavor=None;
  save(...)`), not a different face. Older pdf-lib/fontkit WOFF2 subsetting
  produced an asynchronous glyph-encoding error; TTF subsetting avoids it.

`scripts/prepare-document-assets.mjs` reproduces image/WOFF2 preparation from
the supplied originals (optional development-only asset preparation).
TTFs are committed; fontTools/Brotli are only needed to regenerate them.
Production does not depend on Python, attached-assets or the working directory.
`assets.ts` resolves module-relative source or built asset directories and
caches each buffer once. The API build copies the entire assets directory to
`dist/assets/documents`. Bundling smoke verification runs a standalone render
entry from `/tmp`, using only that copied asset directory.

## Chromium provision and failure behavior

The supported Nix package setup is `[nix].packages` in `.replit`:
`chromium` for rendering and `poppler-utils` for development verification.
The nodejs-24 module remains in use. This records the system dependency in
project configuration for development and the autoscale build/runtime
environment; it is not a downloaded Puppeteer browser or an npm postinstall.
Executable precedence is:

1. `PUPPETEER_EXECUTABLE_PATH`
2. `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`
3. `which chromium`, then `which chromium-browser`

These optional overrides must point to an executable present in that runtime.
Development can verify `which chromium` and a real fixture render. Autoscale
must retain the Nix packages and API runtime dependencies and copy
`dist/assets/documents` with the API bundle. Do not assume a development
override path exists in autoscale. No deployment was published to verify the
production runtime; availability there is configuration-backed, not live-tested.

If Chromium is unavailable **at launch**, estimates log only
`DOCUMENT_RENDERER_UNAVAILABLE` and use the preserved
`renderEstimateDocumentLegacy`. Content, stamping and timeout failures do not
silently use another design. Invoice previews fail through the existing safe
generic error handler; they never pretend to have generated an issued PDF.
The legacy renderer's original brand-logo loading behavior is retained.

## API and data reads

Estimate URL, dialog, auth, error mappings, no-store, disposition and filename
are unchanged. The repeatable-read read-only resolver now also loads document
settings and linked ticket location labels/descriptions, without storing copies.
The live draft total/frozen non-draft total and safe-detail filtering are unchanged.

`GET /api/invoices/:id/pdf` runs invoiceAccess before the company flag,
then validates ID and reads the invoice/lines/display/settings in one
repeatable-read read-only transaction. Foreign IDs are 404. Non-drafts are 409
`INVOICE_NOT_DRAFT`: later issued PDF storage/regeneration has not been authorized.
Draft billing address prefers the company-qualified QBO customer cache, falling
back to the company-qualified customer's address. IC1 has no draft property
link, so missing work location is displayed as a dash rather than inferred.
The pure model can project explicit frozen display fields for future issued
work, but this endpoint does not issue documents or populate snapshots.

Responses are inline application/pdf, `Cache-Control: no-store`, nosniff;
`download=1` selects attachment. Filename `MA-1001.pdf` or `MA-1001-rev1.pdf`.
Draft total language is always **Subtotal before tax**, never a final payable
total. Tax says it is calculated by QuickBooks. Dates without txnDate use
America/Denver today. Payment-name substitution uses a callback then HTML
escaping, so replacement-string metacharacters and markup remain literal text.
No invoice/event writes, QBO calls, object storage, sending or lifecycle work
occurs when previewing.

## Evidence

`generated-artifacts/ic4/` is ignored by Git and deployment. It contains
baseline/final logs, real rendered PDFs, pdftotext output and per-page PNGs for
12-line (two-page) and 60-line estimates and the 13-line invoice. See
`docs/document-kit-verification.md` for results and file inventory.
No approved canvas screenshots were supplied; written-spec implementation is
verified, **screenshot parity is unverified**. Randy must compare the PNGs
with the approved mockup before treating visual approval as complete.
