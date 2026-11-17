# P4 — compact proposal PDF and white cover

Verified November 16–17, 2026. Scope: existing linked-proposal HTML composition,
internal Plants projection and English/Spanish copy. No production access,
publication, new assets, endpoints, database/schema changes or historical PDF
regeneration was performed. Existing test setup reruns its already-established
idempotent migrations against development; P4 introduces no migration.

## Integrated baseline and references

Inspected the integrated P1–P3 handoff in `proposals-estimate-first.md`, shared
proposal handoff, selected-version loader, scoped plant joins, exact shared
pricing fragment, geometry paginator, prefix stamping and real finalize routes.
Estimate ownership, irreversible send-before-render, immutable version storage,
selected-version pins and the legacy unlinked path are retained.

Both uploaded approved PDFs were rendered and visually inspected, including all
six pages through contact sheets:

- `attached_assets/Sample_Proposal_-_white_cover_1794872348120.pdf`
- `attached_assets/Sample_Proposal_-_no_cover_photo_1794872348119.pdf`

Both are six-page US Letter PDFs. P4 supersedes the older green-cover and
one-large-photo descriptions. No user-owned specification was rewritten.
The separately named before-ten-pages PDF was not available; **no comparison
against it is claimed**.

The first baseline command inadvertently passed the target after a literal `--`
to the package script and ran the full API suite, rather than just one file.
Its retained log reports 174 passing / 27 failing / 15 skipped files and
3713 passing / 229 failing / 117 skipped tests. This is not a clean whole-project
baseline. It reproduced the four predecessor document hash failures: two
standalone estimate HTML hashes and two proposal pricing-page raster hashes.
Subsequent commands use artifact-local `pnpm exec vitest run` with one worker.

## Implementation

- Opening details and estimate-owned scope, pricing, Plants, terms, warranty and
  acceptance are one flowing, continuation-padded region. No section-level forced
  breaks remain between these sections. Cover, individual Visual Scope figures,
  attachment pages and authored `[PAGE BREAK]` markers retain their boundaries.
- Pricing uses the **unchanged estimate fragment and styling**. The measured
  proposal region begins at the opening rather than a new pricing-only page.
  The proposal-only origin accounts for flow across pages and resets after
  explicit breaks/Visual Scope figures. Callers without that opt-in retain the
  old paginator calculations. Headers repeat, and the final three lines travel
  with totals. No estimate or invoice renderer/layout/stamp source was changed.
- The acceptance/signature/reserve group is unchanged and indivisible. Legal
  paragraphs can paginate, with proposal-local three-line widow/orphan control.
  The final attachments-free prefix page remains `endOfDocumentPage`; tests
  prove it is the signature page, not a preceding legal page or attachment.
- White covers use the existing white logo, standard-color header and 6px rule.
  Image covers have a 520px cropped hero, prepared-for information, 28pt title,
  number and date. Missing/corrupt/removed images fall back to the 36pt type-only
  title, 18pt customer, divider, work location and authoritative total.
  Settings supply the address footer. Both covers have no page number and the
  existing full-width mountains in an 84px top-cropped strip, 60% opacity,
  aligned to the 1.5px footer line. `coverPages: 1` remains unchanged.
- `proposalPlants.ts` adds an **internal-only** rendering projection of the
  company-scoped lines for the same selected estimate version. It reuses schedule
  quantity aggregation and size-item identities, preserves distinct/deleted item
  rows, and carries derived/overridden type labels in ordered identity maps.
  First explicit override wins (including an explicit empty label).
  No name joins, public exhibit changes or snapshot changes were introduced.
- Either include toggle prints one Plants table. Palette inclusion adds
  thumbnails/type labels and the resolved intro; schedule-only omits them.
  Palette-only still uses all schedule rows. The existing NULL/default versus
  explicit-empty intro semantics remain intact. Thumbnails are 84×62px crops.
  Missing/corrupt/unauthorized images leave rows/cells intact.
- Company-qualified line/catalog/enrichment joins, local-storage-only paths,
  Sharp's bounded decode/re-encode, image data-URI allowlisting, CSP and offline
  browser request interception are retained.
- Large attachments print two captioned photos per page; grid retains four.
  Editor page-divider hints use those same counts (legacy remains one/six).
  Existing controls, ordering, permissions and editor structure remain in place.
  Plants and cover helpers explain the new output in English and Spanish.
  The linked large-layout label now states two per page; the legacy one-per-page
  label is intentionally still correct for the unchanged legacy path.

## Reconstructed sample and visual review

`proposalP4.fixture.ts` reconstructs the **visible** sample:
Cherry Hills Office Park, P-0042, November 16, 2026, the printed address/scope,
three pricing sections and ten lines, $19,531.90, three named/typed/sized plants,
the printed terms/warranty and three captioned photos.

Both generated samples have exactly:

1. White image or type-only cover.
2. Opening/scope and initial pricing section.
3. Continued pricing, one Plants table and terms.
4. Warranty and intact acceptance, with mountains.
5. First two large captioned photos.
6. Third large captioned photo.

The original source estimate/proposal records, source image files and experimental
implementation were not supplied. Placeholder gradients/labels are recreated
only in the test fixture. Original commercial inputs beyond visible PDF text
cannot be recovered from these references. Thus these are faithful **visible
sample reconstructions**, not a byte-identical original-source render.

Visually compared both cover variants, all six pages in each reference/output
contact sheet, full-size Plants/terms and acceptance pages, two-photo attachment,
and representative long-pricing/overflow/acceptance pages. The six-page structure,
cover hierarchy, mountain crop, flowing pricing/Plants/legal layout and caption
placement match the approved references. Minor differences are the recreated
placeholder colors/aspect ratios/text, Plants column allocation/spacing and
shared unit normalization; P4 does not change the unit renderer.

New **proposal-only** reviewed visual goldens are recorded in
`documents/proposalP4.goldens.json`: six 900px PNG raster hashes for each sample,
in addition to semantic and page-structure assertions. All twelve match the
reviewed renders. Their five body pages are identical between cover variants.
PNG/PDF evidence remains in ignored generated output, not application assets or
Git history. No estimate golden was changed.

## Verification results

Evidence root: ignored `generated-artifacts/proposals-p4/`.

| Check | Result / evidence |
|---|---|
| Scoped loader, internal Plants model, existing exhibit model and real-route lifecycle integration | **42 passed** across four files, `proposal-final.log` |
| Existing shared proposal suite | **19 passed**; **2 inherited estimate-only HTML hash failures retained**, `proposal-final.log`, `inherited-goldens.log` |
| P4 real Chromium suite | **16 passed**, `protected-and-p4.log` |
| Legacy PDFKit branding/raster, estimate model, standalone render and paginator suites | **37 passed**, same log (53 including the 16 P4 cases) |
| Final sample goldens + photo-count/clearance/overflow checks after last layout edit | **13 passed**, `final-layout.log` |
| CRM proposal/P3/Plants rendered checks | **29 unique passed**, `frontend.log` plus updated `frontend-dividers.log` |
| Composite library declarations | Passed, `lib-types.log` |
| API typecheck | 694 existing diagnostics; no changed proposal/P4/paginator file diagnostics, `api-types-final.log` |
| CRM typecheck | 186 existing diagnostics; none in modified editor/component/locales/tests, `client-types-final.log` |
| Whitespace/error-marker check | `git diff --check` passed |

Whole-app typechecks are **not globally clean**. The first observed typecheck in
this task was after core implementation; it and the final checks have the same
694 API / 186 CRM diagnostic counts. The older handoff's 721/223 counts describe
an earlier checkout and are not presented as this checkout's measured baseline.

The two retained estimate assertions still expect `24df2126…` and `ff8c41be…`;
current standalone HTML remains `2abc0ad5…` and `465e7562…`, exactly as in the
initial pre-edit document baseline. Only obsolete proposal raster expectations
were removed/replaced.

### Real render coverage

- All four Plants toggle combinations, missing image, corrupt bytes, no remote
  URI embedding, exact selected-version ID and privacy projection.
- Real database enrichment collision across two companies: only own-company
  images are downloaded; removing own enrichment cannot expose the foreign
  company's image, and schedule rows remain.
- Same-size-item quantities sum exactly; different size-item identities and
  deleted-catalog line identities remain distinct despite identical names.
  First explicit label override, including empty text, is deterministic.
- None/photo/Visual Scope covers and missing/corrupt cover fallback; no cover
  numbering, correct settings footer and retained image dimensions/crop CSS.
- Short/long legal × warranty on/off × photos present/absent. Long cases use
  **85 priced rows and substantial opening scope**. The saved long case has
  **six pricing pages**, twelve pages overall, acceptance on full-PDF page 10,
  and photos on pages 11–12. Every priced row appears once, headers repeat,
  rows 83–85 and $21,250 totals stay together. Bounds checks exclude body text
  from headers/footers/mountains. Nested PDF image resources are inspected.
- Counts **0, 1, 2, 3, 5** in large and grid output: large counts produce
  **0, 1, 1, 2, 3** attachment pages; grid **0, 1, 1, 1, 2**. No extra blank
  pages, clipped captions or image-box overflow were observed. Captions remain
  above images. Three-photo editor dividers agree for both layouts.
- Explicit scope page breaks, nonempty Visual Scope figures, one acceptance,
  overflow legal text and draft stamping remain covered.
- Real finalization route renders/stores the compact PDF **after** sent/frozen
  state is observed. Later estimate revision and historical download return the
  same bytes without another render. Existing retry, storage failure, concurrent
  revision, immutable-path and legacy-byte-download checks pass.
- Existing legacy proposal raster fingerprints remain unchanged.

### Protected estimate/invoice comparison

An initial comparison against the reused output folder found 33/36 identical
PNGs. The three differences were pre-existing `estimate-group-crossing` images
from an older lowercase-unit fixture; that mixed folder is **not** a reliable
before/after oracle and is not used to claim parity.

Instead, `protected-compare.mts` captures the committed pre-P4 paginator with
`git show HEAD:…/pagination.ts`, executes old and new scripts on the same current,
unchanged standalone HTML in the same browser, stamps identically, then rasterizes
at 96dpi in a fresh comparison directory:

- 12-line estimate: **3/3 pages pixel-identical**.
- 60-line estimate: **5/5 pages pixel-identical**.
- Issued 13-line invoice: **1/1 page pixel-identical**.

`protected-exact/comparison.json` and `protected-exact.log` record the result.
The shared pricing, estimate, invoice, layout and stamping implementations are
otherwise untouched. Fixed-input default-stamp compatibility also still passes.

### Runtime and limits

API and CRM managed workflows rebuilt/restarted once after the code batch.
Proxied API health and Vite-transformed `ProposalDraft.tsx` return **200**.
Existing unrelated fixture QuickBooks token warnings and frontend
Browserslist/PostCSS warnings remain. The screenshot service timed out while
capturing the signed-out page; no authenticated browser interaction is claimed.
Changed editor copy/dividers are verified by rendered component tests; the
customer-facing deliverable is verified by actual Chromium PDFs and inspected
rasters. No external email was sent by the fixture finalization.

Representative commands (run from the named artifact where applicable):

```sh
cd artifacts/api-server
pnpm exec vitest run src/services/documents/proposalP4.test.ts \
  src/services/documents/proposal.test.ts src/services/proposalDocument.test.ts \
  src/services/proposalPlants.test.ts src/services/proposalExhibits.test.ts \
  src/services/proposalEstimates.integration.test.ts \
  --maxWorkers=1 --no-file-parallelism
pnpm exec vitest run src/services/documents/pagination.test.ts \
  src/services/documents/render.test.ts src/lib/pdfBrand.test.ts \
  src/services/estimatePdf.test.ts --maxWorkers=1 --no-file-parallelism
```

Retained review outputs: `sample-white-cover.pdf`, `sample-type-cover.pdf`,
matching page PNGs/text and contact sheets, both reference contact sheets,
`long-pricing-legal.pdf` and per-page PNGs, plus final test/typecheck logs.
No missing requirement was deferred. The unavailable original source fixtures
and before-ten-pages comparison are the disclosed verification limitations.
