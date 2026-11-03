# High Plains document system: proposals, estimates, invoices

**Created Nov 2, 2026, from the Invoice Center design.** This is the shared look and page rules for every customer-facing PDF the CRM produces. Any chat working on proposals, estimates, invoices, statements or contract documents should start here.

- **Approved reference:** the "Invoice Center Mockup" canvas: estimate PDF pages 1–2 and invoice PDF.
- **Full PDF spec:** `invoice-center-design-spec.md` §6 (in the High Plains CRM folder, and as `claude/invoice-center-design.md` in the project).
- **This guide is also in the project** as `claude/document-design-system.md`. This copy sits in the High Plains CRM folder so Replit agents can be given it; commit it to the repo's `docs/` folder so it lives with the code.

## The idea

There's one family of documents. The estimate is the priced core. A proposal wraps it with a cover, narrative and exhibits. An invoice bills it.

| Document | Pages |
|---|---|
| **Estimate** (short form) | Header + pricing; then terms, warranty and acceptance |
| **Proposal** (long form) | Cover → scope narrative → Visual Scope/renderings → **pricing (the estimate pages, same renderer)** → plant palette + plant schedule (built from estimate plant lines) → terms, warranty and acceptance |
| **Invoice** | Header + lines + totals + how to pay |

A small job or a change order gets the estimate PDF by itself. A design-build job gets the full proposal. Either way, the pricing pages are identical.

## Data rules

- **A proposal references exactly one estimate version.** It never stores its own prices or totals. When the estimate changes, the proposal gets a new version.
- **One acceptance.** Signing the proposal records acceptance on that estimate version. There's never a second signature block.
- **Grouping:** proposals and estimates group pricing by the estimator's **sections**, with a small "By category" summary under the table. Invoices group by **category** (the QuickBooks umbrella items).
- **Totals are read from the estimate's frozen subtotal,** never recalculated in the proposal.

## Visual tokens (approved Oct 29–Nov 2)

**Colors**
- Header band `#37443D` (app sidebar green), with a 6 px `#8CC640` rule under it.
- Section headings and category names `#37443D`.
- Table header row: `#37443D` background with white text in 8pt caps.
- Category separators: 1.5 px `#8CC640`. Row hairlines: `#e4e6e2`.
- Key-figure box (estimate total / amount due): `#EEF6E3` fill with a 1.5 px `#8CC640` border.

**Type**
- Inter, with tabular figures.
- Body 10.5pt in `#161616`; secondary text `#4f5a53`; labels 8.5pt caps.
- Dollar signs on totals only. Units in plain words: each, ton, lin ft, sq ft, hr, lot, load.

**Assets** (in the CRM repo history under `attached_assets/`)
- White horizontal logo `LOGO_-_SPREAD-07`: 80 px tall in the first-page header, 48 px on later pages.
- Round badge logo: available for covers.
- Mountains line art `Mountains_…`, recolored to `#37443D` at 60% opacity.

## Page rules

- **Size:** US letter, 64 px side margins.
- **First page:** full header band (logo, document title, number, date).
- **Later pages:** a short header band (small logo + document number).
- **Every page:** a full-width 1.5 px green footer line 47 px from the bottom, with the document number, customer and "Page X of Y" below it.
- **Last page only:** full-width mountains sit on the footer line. Content stops at least 16 px above the mountains, or above the footer line on other pages.
- **Tables:** the header row repeats on every page. Totals and payment/acceptance blocks never split across pages.
- **Proposal cover (approved Nov 3):** a full-bleed `#37443D` page with the large white logo, project name, "Prepared for" and a hero image chosen per proposal: one of the proposal's photos or the Visual Scope rendering. When none is chosen it falls back to the logo-only cover. No header band, no footer, no mountains. The cover isn't numbered: "Page X of Y" counts from the first page after it.
- **Attachments (approved Nov 3):** proposal photos are an attachment after the acceptance page, never inline.
  - They open with an "Attachment A: Photos" heading, and each photo has its caption above the image.
  - Two layouts, chosen per proposal: **full page** (one photo per page, fitted inside the margins) or **grid** (2×2 per page).
  - Attachment pages carry the short header band and the footer, and their page numbers continue the document's.
  - **The mountains mark the end of the signed document,** so they sit on the acceptance page, never on attachment pages. "Last page only" means the last page of the document before any attachments.
- **Exhibits:**
  - The plant schedule uses the same table style.
  - Palette cards use the same colors and type.
  - Photos run full-width, with captions placed above the image.

## How they get drawn

- **The new documents are drawn as HTML pages and turned into PDFs by a built-in browser** (puppeteer-core + Chromium, as in IrrigoPro). One shared template module renders every document type. **That's Invoice Center slice IC4. Build it once, for both projects.**
- **Current state:**
  - The proposal PDF and the Oct 30 estimate PDF use `pdfkit` with the older proposal look (hills watermark, 72pt margins). `docs/estimate-builder-pdf.md` and `.agents/memory/pdf-decoration-preservation.md` note that the proposal output is pixel-sensitive.
  - **Moving proposals over:** rebuild them page by page on the shared template. During the switch, legacy exhibit pages can be merged into the new PDFs with `pdf-lib` (already a dependency).
  - **The Oct 30 estimate PDF:** its data model (`buildEstimateDocumentModel`), its route and its preview dialog are reusable. Only the drawing part gets replaced.

## Coordination between chats

- **The Invoice Center chat owns the shared template (IC4)** and the invoice PDF.
- **The proposals chat owns** the proposal structure, the cover, the narrative and exhibits, and the move off `pdfkit`.
  - It builds on IC4 rather than creating a second template.
  - If IC4 isn't built yet when proposal work needs it, agree which chat writes it first, so it's only built once.
- **Changes to the shared look go back into this guide first**, so both chats stay in sync.
