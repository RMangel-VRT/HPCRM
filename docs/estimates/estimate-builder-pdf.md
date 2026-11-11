# Estimate identity and customer PDF contract

## Display reads and ownership

The optional `EstimateDetailDto.display` is a read-through enrichment. Company settings, the estimate's customer, company-member creator, and linked ticket/status are joined with company-scoped predicates. These facts are not copied to estimate storage, and version snapshots and lifecycle mutations are unchanged. No schema migration is required.

Header styles are mirrored with ticket hue/state tokens, not extracted from TicketDetail. The ticket header source is unchanged. The estimate uses the valid `hsl(var(--border))` form for its border fallback. Its version tabs live inside the identity card; lifecycle actions retain their existing guards.

## Reusable PDF interfaces

`services/estimatePdf.ts` exports:

- `buildEstimateDocumentModel(payload, resolvedDisplay, coloradoDocumentDate)`: pure allowlist projection. Display metadata and the explicit `YYYY-MM-DD` Colorado document date are required inputs. No database access or implicit clock occurs inside this function.
- `renderEstimateDocument(model)`: Buffer renderer, also useful for deterministic fixtures.
- `renderEstimatePdf(companyId, estimateId, versionId)`: scoped read-only, repeatable-read resolver plus renderer. Phase 4 can call it directly without invoking an HTTP handler.

The model contains only customer document facts: company, estimate/version/date/status, customer/address, project and distinct linked-ticket title, version-owned nullable scope, ordered sections, safe descriptions, quantities/units, captured unit prices, line/section totals and total. `hasPlants` derives from captured line umbrellas (including custom Plants lines), never live catalogs. `terms: null` remains for compatibility; configured terms now come from the separate `companyDocument` owner. The model also retains tested customer-labeled category aggregates and available ticket work location. IDs, internal costs/margins, unknown-cost counts, pricing provenance, rate-term IDs, raw umbrellas and pricing flags never enter the model.

SKU sanitation is conservative: hardscape/irrigation snapshots have a known `category · SKU` format, whose SKU segment is omitted. Explicit `SKU:` segments are omitted on other types. Ambiguous model numbers and sizes, including `5-GAL`, `2-IN` and `MP-3000`, remain. Names and plant size references remain intact.

Draft totals use the live authoritative total; other versions require the frozen total. Lines use captured quantity/prices with the existing exact rounding helper; section totals come from the payload's authoritative calculations. Catalogs are never re-resolved. Draft dates use the explicitly supplied America/Denver day; sent and later versions use sentAt in Denver. Accepted-on is a calendar date, not a shifted timestamp, and optional PO text is included.

The current renderer uses the shared HTML/Chromium two-pass document kit: Letter
pages, 64px side padding, Inter, full first/short later green bands, repeated
table headings, counted footer, final-page-only mountains and draft-only marks.
Estimate sections retain their grouping and stored unit words. A customer-safe
total-only summary and optional company terms/warranty precede Acceptance.
Scope prints immediately after the project title and optional ticket line, before
pricing. The printed By category box is removed, not the tested `categorySummary`
data. Warranty requires `hasPlants`; configured terms remain independent.
Legal text can continue across pages; only Acceptance plus mountain reserve is
indivisible. Linked proposals reuse these fragments, but retain proposal-owned scope.
See `docs/documents/document-kit.md`.

Estimates use only the shared kit; Chromium unavailability returns the safe
`DOCUMENT_RENDERER_UNAVAILABLE` response, never a legacy-design fallback.
The historical verification notes below describe earlier slices, not current
fallback behavior.

## Authorization and preview

`GET /api/estimates/:id/versions/:versionId/pdf` uses estimateAccess, authenticated company scope and the existing expected-company guard. Both estimate and version ownership are checked. Missing/foreign records return 404; field roles return 403; changed-company requests return the existing 409. Unexpected failures log only a fixed code and return a generic 500.

Responses are application/pdf, no-store, with inline `EST-YYYY-NNNN-vN.pdf`; `download=1` selects attachment disposition. Historical versions are supported.

The dialog previews the viewed version, fetching a blob with the captured X-Company-Id. Loading/error/retry, iframe title, Download/Open and draft hint are translated. Download/Open reuse that authorized blob. Request abort/aliveness guards drop obsolete responses; URLs are revoked on close, replacement and unmount. Company/user/role/version scope changes dispose the old view.

## Proposal preservation

`lib/pdfBrand.ts` mechanically extracts brand constants, logo loading, hills, footer and guarded page decorations. Body font, fill and cursor are explicitly restored; PDFKit graphics save/restore alone is insufficient for text state. Independent proposal exhibit contexts deliberately retain their legacy 7pt gray overflow body state. Normalizing this while extracting the helpers changed caption geometry, so it was not done.

Proposal's optional working-directory logo lookup remains unchanged to avoid changing existing output. Estimate rendering additionally searches ancestor workspace directories, since the managed API workflow starts inside the artifact directory; it fails explicitly if the required estimate logo is missing.

The proposal harness exercises scope overflow plus independently rendered plant schedule, palette, photo appendix and visual scope, and an uploaded estimate page. Raster fingerprints from the original proposal implementation at 72dpi are unchanged: short fixture 7 pages; long fixture 9 pages. Raster tests use the available Poppler `pdftoppm`; estimate pagination text checks use `pdftotext`.

## Verification and known baselines

- Backend estimate math/rates/lifecycle, real-database lifecycle/orchestration, draft API and PDF routes: 205 tests across eight files. An existing five-second loop timeout was rerun after reducing display reads from four queries to one scoped join; the integration file passes at a 20-second per-test budget.
- Additional shared-brand/proposal tests: 3 passing. Real PDF fixtures include draft/sent/accepted 60-line documents, repeated headers, page decorations, draft-only marks, logo and oversized-description pagination.
- Frontend estimate, lifecycle, ticket display and ticket-advance suites passed 118 tests; the final container-query assertions and six-picker arrow coverage extend this to 126 tests.
- Existing TicketDetail visits suite: 32 passing including the new unchanged-header assertion; one unchanged baseline failure remains: “always offers the Overview Conversation card and opens the focused tab when empty.” It expects `button-view-all-comments` in the empty conversation card. This is unrelated to the untouched TicketDetail source and already has separate missing-Overview-card follow-up work.
- Fresh declaration baseline: `pnpm exec tsc --build --force` completes cleanly. Root `pnpm run typecheck` still fails on existing errors; its parallel fail-fast output contains whichever artifact finishes first (initially API, finally CRM). A direct final API check matches all 730 original API diagnostics after removing line/column offsets, with no additions/removals. A read-only compiler-host comparison against the original tracked CRM sources matches all 221 CRM primary diagnostics, including unchanged ProposalDraft/VisualScopeEditor errors. These pre-existing errors include untyped route calls/noImplicitReturns and legacy schema/type mismatches; the root typecheck is **not claimed clean**. Logs are kept locally under ignored `generated-artifacts/estimate-slice/`.

### Browser verification

An isolated temporary company/admin and catalog/customer fixtures were created because the documented development login was unavailable. All fixtures were removed after verification; no existing account password or business record was changed.

All seven add buttons were keyboard-reachable. Every picker and custom/free entry was exercised, including quantities, Enter/Add and double-click exactly once. Draft preview showed the logo, draft mark, correct $477.50 total and captured company request header. Download and Open used the same blob URL. Sent v1 was locked with no add controls or draft mark; after revision, historical v1 remained previewable. Spanish header/history/read-only/preview copy was verified.

Populated natural layout measurements (viewport width; expanded/collapsed navigation):

| Viewport | Navigation | Builder width | Sections width | Rail |
|---|---|---:|---:|---|
| 1041 | expanded | 470 | 470 | stacked |
| 1041 | collapsed | 726 | 726 | stacked |
| 1600 | expanded | 1029 | 685 | 320px alongside |
| 1600 | collapsed | 1152 | 808 | 320px alongside |

All natural states had no root horizontal overflow or clipped row content. A forced 1041px container at a 1600px viewport produced 697px sections plus a 320px rail; a deliberately oversized 1600px container at a 1041px viewport produced 1256px plus 320px with a scroll affordance. Inline test overrides were removed. The CSS replaced an initial measured-width implementation after the real browser caught content-dependent narrow clipping that jsdom cannot measure.

No Phase 4 integration, palette, email/e-signature, legal terms, QuickBooks behavior, mobile app, schema migration or duplicate stored metadata was added.

## Completion safety fix after synchronization

Final review identified browser-cache disclosure in incoming Mentions/notifications work from main, not in the estimate preview. Notification list/count keys previously contained only the filter. The shared notification helpers and all mention/general-bell/page consumers now include captured user/company/role scope, disable queries while signed out, and send the captured company header. Read-one/read-all deduplication, cancellation, optimistic cache writes and invalidation target only the initiating scope.

The notification rendered suite passes 36 tests, including company, user, role, logout/login switches with pending responses and still-populated old caches, plus read-one/read-all mutation isolation. CRM typechecking remains at the same 221 original diagnostics with no additions/removals. This narrowly related security fix was added in response to the completion review; no notification server behavior or lifecycle was redesigned.

## Scope and PDF cleanup

See [Slice 4.5 verification](reports/estimate-scope-pdf-cleanup.md) for the migration,
API contract, test/typecheck delta and repeatable three-scenario PNG evidence.
No historical PDF was regenerated or published. The four target reference PNGs
were not supplied; screenshot parity remains unverified.
