# Linked proposals on the shared document kit

## Ownership and migration

`docs/documents/document-design-system.md` is the supplied governing standard, including
the approved November 3 cover and attachment updates. It is preserved as supplied,
including its historical implementation-status notes.

Migration **0066_proposal_cover.sql** was free when allocated (0065 remains the
existing plant-exhibit migration). It adds only `cover_source` (text, not null,
default `none`, CHECK `none/photo/visual_scope`) and nullable
`cover_photo_file_id` (varchar, proposal-files FK, ON DELETE SET NULL).
Both columns and constraints are guarded and the migration is rerunnable.
The development runner applied one migration; a regression executes its SQL twice
and checks deletion and the CHECK constraint. No startup DDL, production schema
operations, historical PDF regeneration or production publication was added.

The authoritative Drizzle schema uses an explicitly typed deferred column
reference to avoid the proposal/proposal-files circular-inference problem.
The browser-safe schema declares the same fields without loading database code.
PATCH has no defaulted fields: omitted presentation settings stay unchanged.
Photo references are checked against company, proposal, file type and MIME type;
scope references are checked against company and customer. An unrelated PATCH
still succeeds after a selected image is deleted or a scope is detached.

Cover presentation is proposal-owned. Commercial values, category labels and
acceptance stay estimate-owned. The ownership map documents this distinction.

## Additive shared extension contract

`StampInput` adds:

- `coverPages?: number`, default **0**. These leading pages receive no short
  header, footer, mountains or draft mark and are excluded from page counts.
  The first content page keeps its HTML full header; short stamping begins on
  the next content page.
- `endOfDocumentPage?: number`, default **last full-PDF page**. This is a
  zero-based index including covers. Only that page receives mountains.

Invalid indexes fail explicitly. Existing callers need no changes. Fixed-time,
fixed-metadata fixture output was compared directly with the original stamping
function, and its SHA-256 is retained as an immutable regression oracle.
Explicit zero covers/last page also agree with omitted options byte-for-byte.
The HTML-kit CSS, assets, font encodings and invoice renderer are unchanged.

Estimate exports customer/contact, pricing table, category/total summary,
combined pricing, and terms/warranty/acceptance fragments. After reconciling the
concurrently merged shared-layout corrections, the standalone renderer retains
that updated layout and whitespace exactly: header contact, formatted dates and
quantities, pricing pagination hooks, summary before terms, and the single
bordered acceptance title bar. The two HTML hashes (12 and 60 lines) are updated
only for the intended shared Acceptance spacing correction: the reserve is now
outside the border, immediately after it in the same keep-together group.
Proposals use the combined pricing fragment once, without an estimate header.
The settings fragment is used once; its shared `.acceptance-group.keep` wraps
the bordered signatures and adjacent reserve, so long terms can paginate
separately. The proposal's existing 116px clearance is retained; estimates retain
71px. Cover, pricing, exhibits, overall page structure and legal overflow are
unchanged. IC4.2 evidence compares all 56 fixture PNG pages against the unchanged
source: 48 are identical and only the eight Acceptance pages change.
No settings text is replaced with invented legal boilerplate.

## Composition and acceptance-page detection

The pure allowlisted proposal model accepts resolved inputs, not ORM records,
and performs no I/O or clock reads. Nested commercial data and settings are
projected again, so extra caller fields cannot leak into a customer document.
The loader reads one explicit estimate version, including authoritative live
draft or frozen sent/accepted totals. It consumes the already selected exact
version's exhibit model; finalize uses that same model for its stored schedule
snapshot and its same version ID for the immutable pin.

One self-contained HTML flow contains:

1. Full-bleed undecorated green cover with logo, project and customer, optional hero.
2. Scope, full Proposal header, number/date, customer/location and estimate total.
3. Available selected Visual Scope figures.
4. The shared estimate pricing fragment.
5. Included, nonempty plant palette then schedule.
6. Company terms/warranty and one estimate acceptance/signatures block.
7. Nonempty Attachment A, full-page images or 2×2 grid with captions above.

Acceptance detection renders the **attachments-free prefix** through the same
Chromium function and takes `pageCount - 1`. If photos exist, the complete HTML
flow is rendered and stamped with that full-PDF index. Attachments always start
on a new page, so they cannot repaginate the identical preceding content.
With no photos the prefix bytes are reused. This is two pagination passes,
not a merge of separately decorated document sections. Covers are included
in both counts; printed numbering excludes them.

The merged kit measures and segments pricing tables in Chromium. A proposal-only
`data-pricing-region` on the containing section supplies the local first-page
origin, because a table after the cover/narrative cannot use its document-wide
DOM top as a first-page print coordinate. The shared paginator checks for that
region; without it, the existing estimate/invoice measurement is unchanged.
The proposal uses the exact shared table/summary markup, including its pagination
hooks, and inherits the final-three-lines-plus-totals keep rule.

The signature wrapper reserves 116px below signatures for the mountain region
and clearance. Terms/warranty can overflow before it. The scope's named opening
page uses cloned top padding for continuation-page short-header clearance.
Do not move that header with a negative relative position through a print
margin: Chromium can clip it or paint it onto the previous cover.

## Images, failures and finalize behavior

Only company-scoped existing proposal image records, scoped attached Visual Scope
and exact-version palette projections supply images. Object storage paths are
downloaded directly; remote URLs are never fetched. Sharp decodes with an
80-megapixel input limit, auto-rotates, bounds both dimensions to 1600px without
upscaling, strips metadata, flattens and JPEG-compresses at quality 75 before
data-URI embedding. A per-operation cache avoids decoding an image twice.
Missing/corrupt individual images are omitted; missing heroes use logo-only.
The shared CSP and Chromium network interception remain offline.

The linked HTML path catches **only** `DocumentRendererUnavailable`, logs
`DOCUMENT_RENDERER_UNAVAILABLE`, and enters the existing linked PDFKit
composition using the same selected version/exhibits. HTML, PDF, storage,
timeout and other rendering errors remain real failures. Unlinked proposals
do not enter the new path; their upload validation and PDFKit composition are
unchanged. Existing legacy raster fingerprints still pass.

No changes were made to the irreversible send-before-render sequence,
partial-success response, independent ticket advancement, attempt-unique object
storage paths, immutable history or retry semantics.

## UI

Linked proposals have English/Spanish Cover controls: Logo only, attached Visual
Scope, or Photo with thumbnails, plus Use as cover on each photo tile.
Selection saves through the existing initiating-company request wrapper and
invalidates proposal data; failures show translated actionable copy. The
identity-keyed editor rejects late responses after a scope change. Preview is
disabled while cover selection is saving and each preview loads a fresh PDF.
Linked copy is Attachment layout / Full page / Grid and the page dividers use
four images for grid. Unlinked copy/layout behavior remains legacy (six grid
images per page).

## Verification and retained evidence

All outputs below are in ignored `generated-artifacts/proposal-shared/`, not
checked-in binaries:

- `compatibility.json`: original HTML and default-stamp hashes.
- `merged-compatibility.json` and `merge-compatibility.log`: exact equality
  against the concurrently merged shared-layout renderer and its new HTML hashes.
- `final-tests.log`: 63 passing API regressions across eight files (before the
  final populated-document test was added).
- `final-render-tests.log`: 15 passing final document tests, including the
  additional populated-document case; 64 unique pre-merge focused API tests.
- `merged-tests.log` and `merged-legacy-tests.log`: **86 unique API tests**
  checked after incorporating the concurrently merged layout/paginator.
  The combined run passed 83 and hit the existing five-second timeout in three
  legacy raster tests under parallel CPU load; all seven legacy tests then
  passed in an isolated 3.6-second run. New/shared render and pagination checks
  passed in the combined run.
- `client-tests.log`: 12 passing rendered UI tests, including persisted scoped
  cover requests, unavailable scope choice, unlinked absence and Spanish copy.
- `proposal-{0,1,10}-{large,grid}.pdf`, matching `.txt` and numbered `.png`:
  full-page raster evidence for each photo count and layout.
- `proposal-overflow.pdf` and per-page PNGs: overflowing narrative/settings,
  draft stamping, separate acceptance/signatures and subsequent attachments.
- `proposal-populated.pdf` and per-page PNGs: hero, Visual Scope, pricing,
  palette, schedule, acceptance, then photos.
- `proposal-20-grid.pdf` and `image-size.json`: 20 distinct high-detail
  deterministic synthetic camera images, initially 3200×2400, embedded at
  **1600×1200**, final merged PDF **14,750,611 bytes (14.1 MiB)**. This intentionally
  avoids the unrealistically small result from deduplicated flat-color photos;
  no real customer photos were used.

Tests cover model privacy, authoritative selected totals, exact-version
orchestration, inclusion flags/empty intro, ordering/captions, missing images,
hero deletion/detachment, renderer-unavailable-only fallback, one acceptance,
continuous numbering, mountains XObjects only on acceptance, zero/one/ten-photo
page counts, draft marks, long scope/settings, migration/PATCH, shared HTML
equality and fixed-metadata default stamp byte compatibility. Existing
estimate fallback/render, legacy decoration/raster, exhibit, send/finalize
and recovery regressions pass.

Required-extension and schema-drift checks passed. API and CRM workflows
rebuilt/restarted successfully; API health and the proxied transformed proposal
JSX module returned HTTP 200. The first preview screenshot attempt timed out;
a subsequent root-page capture succeeded (`app-login.jpg`) and shows the normal
sign-in screen. Signed-in browser interaction is **not claimed**. UI verification
used the rendered component suite and PDF verification used real Chromium plus
inspected PNGs.

The initial asynchronous test baseline overlapped additive schema edits before
the migration ran and therefore reported missing-column failures; it is not
presented as an inherited failing-test baseline. The immutable original HTML/
stamp oracles and existing fixed legacy raster hashes are the compatibility
baseline instead. Test setup now reruns the guarded cover migration.

### Typecheck

Forced workspace declaration refresh passed. The root baseline had **721**
pre-existing API TypeScript diagnostics, including the frontend-safe Drizzle
stub and existing route/storage typing. Root checking stops at that API failure;
it is not globally clean. The final comparison and any changed-code diagnostics
are recorded in `final-types.log` and `typecheck-delta.json`. The refreshed,
post-merge root run (`merged-types.log`, `merged-typecheck-delta.json`) also has
**721** diagnostics, with no changed-code service/component errors
and no increase in normalized file/error-code counts. The separate client check
has **223** inherited diagnostics and none in ProposalDraft. Its output is
retained in `client-types.log`; do not hide inherited failures behind a
successful focused test run.

### Boundaries and deviations

No production writes, publishing, new application, mobile/canvas work, invoice
restyle, estimate lifecycle/pricing change or historical regeneration.
Sharp is the already-installed equivalent image compressor rather than the
optional native canvas helper, guaranteeing bounded dimensions even where
canvas is unavailable. Photos with missing bytes and Visual Scope renders that
cannot be produced are skipped rather than failing commercial document rendering.
Overflowing settings are allowed to paginate while signatures and mountain
clearance stay together.

## Randy's after-merge checklist

1. **Publish.** Expect the additive two-column cover change and constraints.
2. Fill **Settings → Document settings** with the address/contact information,
   warranty and estimate terms as desired.
3. Inspect a **linked proposal in Chrome**: cover selection, scope/full header,
   selected exhibits, estimate pricing/total, one acceptance, mountains on that
   page only, then captioned attachments with continuing page numbers.
