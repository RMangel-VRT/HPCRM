# Shared customer document kit

Linked proposals also consume this kit. See
[the proposal extension contract](proposal-shared-template.md) for additive
cover-page stamping, acceptance-page detection, fragment compatibility and
render evidence. Default estimate/invoice stamping remains unchanged.

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
   Chromium measures the embedded-font flow, then prints Letter pages, not
   screenshots. `pagination.ts` constructs explicit table page segments before
   printing, repeating the same column widths and group context.
2. `stamp.ts` opens that PDF, embeds Inter TTF, and knows the final page count.
   It adds every-page footer/rule/count, short headers on pages 2..N, and
   top-cropped mountains only on N. Drafts have a first-band pill and diagonal
   6%-opacity stamps on every page. The legacy hills watermark is not used.

`renderDocumentPdf({html, footerLabel, shortHeaderNumber, draft?})` is the sole
render interface. A lazy browser is shared, with two slots covering both passes,
FIFO queued work, 20-second per-active-render deadlines and a five-minute idle
shutdown. Ordinary document deadlines start after admission. The admin health
check instead has one overall 20-second budget, including executable resolution,
queue wait, launch, browser version, rendering and stamping.
Pages always close, including failures/timeouts. Only data URLs are allowed by
request interception; JavaScript is disabled and HTML has a restrictive CSP.
Expired/cancelled queue entries are removed. Pages close on failure/expiry,
including late-created pages. Non-cancellable launch/stamp work retains its slot
until it settles; a caller timeout never falsely admits a third render. Chromium
launch and protocol operations are separately bounded to 20 seconds.
Health logs use fixed reason codes. Launch diagnostics alone additionally include
the error name and first trimmed message line (each capped at 200 characters).
No raw errors, stack traces, customer data or paths are returned to clients.

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

Estimate category/total summaries follow the pricing table directly. Only the
Terms/Warranty/Acceptance block has `.terms-page` and starts a new page.
Invoice payment instructions and totals follow the table. A measured print-width
preflight keeps the last three line rows (all rows if fewer) with the totals;
when necessary, it moves that tail to a new table page. Every segment repeats
the header and its applicable estimate section or invoice category. If tail and
prefix fit together they are a single table, never two visible same-page headers.
Estimate continuation headings say `(continued)` and omit the monetary section
subtotal; each section subtotal is displayed only at that section's first row.
Actual wrapped row heights, group headings, total margins and embedded fonts
are measured, not approximated from line counts. This trusted renderer-owned
DOM evaluation does not enable page scripts or external resources.

Mountain reserve is derived from stamp geometry: `(47 + 84 + 16) - 76 = 71px`,
not a fixed 100px. It belongs inside invoice totals. For estimate Acceptance it
is immediately **after** the bordered box, inside `.acceptance-group.keep`.
The border hugs the signature content with only its normal 14px body padding.
Proposals reuse this same fragment and keep their existing 116px reserve outside
the border; their Terms/Warranty text remains free to overflow before the group.
The latter is a 1.5px #37443D border, 8px-radius box with a green title bar,
white bold 12.5pt Acceptance title and total, followed by sentence/signatures.
Contact information appears only below the date inside the first band, 8.5pt
#c9d6cd, middle-dot joined with empty fields omitted. Band dates/numbers have
normal numeric/letter spacing. Calendar dates are formatted without timezone
shifts; actual instants are projected to America/Denver. Quantities trim decimal
zeros and group thousands for display only; money keeps two decimal places.
Payment instructions precede a comma-joined, single-line `Mail to:` display
without changing multiline Settings storage.

Empty Terms/Warranty text creates no block. Never invent legal text.
Very long user content can naturally require more pages. A final block taller
than the 884px printable area fails explicitly with
`DOCUMENT_FINAL_BLOCK_TOO_LARGE`, rather than splitting legal content.
An indivisible line or final-three-rows/totals group that cannot fit fails with
`DOCUMENT_ROW_TOO_LARGE` / `DOCUMENT_TOTALS_GROUP_TOO_LARGE`. A remit line wider
than the full content area fails with `DOCUMENT_REMIT_TOO_WIDE` rather than
overlapping or clipping. Existing safe route error handlers remain unchanged.

Future proposal work must reuse the **same estimate-version pricing HTML and
totals**, and record acceptance on that estimate version, never duplicate
commercial records or introduce a second pricing template. Future composition
can supply a cover, narrative flow and legacy exhibit PDF merge around these
pricing pages. Covers may deliberately omit footer/mountains; that requires an
explicit future composition/page-range decoration option, not another template.
The sole shared proposal layout change here is Acceptance reserve placement.
No proposal cover, exhibit, legal overflow, commercial acceptance behavior or
page structure is changed. `pdfBrand.ts` remains untouched/pixel-sensitive.

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
3. `CHROMIUM_PATH`
4. The optional `dist/document-runtime.json` executable hint
5. PATH lookup, in order: `chromium`, `chromium-browser`, `google-chrome`,
   `google-chrome-stable` (directories retain PATH order)
6. Existing `/nix/store/*-chromium-*/bin/chromium` candidates, sorted by store
   directory name using deterministic code-unit ordering

Every candidate must be an executable regular file (symlinks to such files are
allowed). Missing, non-file and non-executable candidates are recorded and
**skipped**, including explicit overrides and build hints. Missing, unreadable,
malformed or invalid manifests are optional unusable hints, never API startup
failures. Exhaustion is `EXECUTABLE_NOT_FOUND`; selecting an executable is not
proof it can launch. Discovery has a single 1500ms budget, at most 64 PATH
directories, 8192 store entries and 16 sorted Nix candidates, with at most 26
fixed-code attempts. An oversized store listing is not partially sorted/used;
it reports `LIMIT_REACHED`. No browser is downloaded. The supported Nix
declaration is retained; no provisioning/dependency changes were made in IC4.3.

The API build now runs `scripts/prepare-document-runtime.mjs`: it resolves
Chromium **in that build environment**, bundles the renderer, renders/stamps two
PDFs concurrently from `/tmp` using only copied assets, and records
`dist/document-runtime.json`. A failed probe fails the build. The production
artifact run command and package `start` both use `scripts/start.mjs`. It imports
the API without reading the optional manifest or changing executable environment
variables. Build probes and real browser launches use the same discovery rules;
the renderer reads the recorded executable as `BUILD_MANIFEST`, after the three
explicit hints. A stale hint falls through to PATH/Nix. No development store
path is committed or copied to deployment settings. Keep the manifest, assets, Nix closure and
runtime dependencies with the bundle. Missing executables are still reported
by the admin check, not silently substituted with another PDF design.

**Estimates have no legacy fallback.** They use only the shared kit and live
Documents settings. Missing/invalid executables or launch failures return 503
`{error:"DOCUMENT_RENDERER_UNAVAILABLE"}`; content/stamp/render failures retain
their safe 500 behavior. Invoice previews and linked proposal kit pages use the
same design/settings. This slice does not change existing proposal route fallback
behavior or legacy exhibits; that separate proposal code remains out of scope.

### Admin readiness contract

`GET /api/settings/documents/renderer` has the same active-company admin guards
and captured `X-Company-Id` expectation as settings, with `Cache-Control: no-store`
on success and authorization errors. It performs a real `renderDocumentPdf`
check, launching or reusing the two-slot shared browser, not just `which`.
Only these public fields are returned:

```
{ status: "ready" | "unavailable",
  reason: null | "EXECUTABLE_NOT_FOUND" | "LAUNCH_FAILED" | "RENDER_FAILED",
  executableSource: null | "PUPPETEER_EXECUTABLE_PATH" |
    "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE" | "CHROMIUM_PATH" |
    "BUILD_MANIFEST" | "PATH" | "NIX_STORE",
  attempts: [{ source: SOURCE_CODE, outcome: OUTCOME_CODE }],
  browserVersion: string | null, checkedAt: ISO }
```

`attempts` is additive and ordered, ending at selection or exhaustion. Source
codes are the three environment variable **names**, `BUILD_MANIFEST`,
`PATH_CHROMIUM`, `PATH_CHROMIUM_BROWSER`, `PATH_GOOGLE_CHROME`,
`PATH_GOOGLE_CHROME_STABLE`, and `NIX_STORE`. Outcomes are `NOT_CONFIGURED`,
`NOT_FOUND`, `NOT_EXECUTABLE`, `NOT_FILE`, `INVALID_HINT`, `SELECTED`,
`LIMIT_REACHED`, and `TIMED_OUT`. Multiple Nix candidates may produce multiple
`NIX_STORE` attempts; the list is bounded and contains no paths. An absent
manifest is `INVALID_HINT`, as are malformed or unreadable manifests.
`executableSource` identifies the selected executable, or is null on exhaustion.
Invalid configured sources remain visible only in their skipped attempts.
Health uses selection metadata from the **actual shared-browser launch**; reuse
does not re-resolve a different executable after hints/environment change.
Checks timing out in the queue, before selection, have null source/empty attempts.
Once selected, attempts survive launch failures and render/deadline failures.
Render/queue/deadline failures are `RENDER_FAILED`; actual launch failures are
`LAUNCH_FAILED`. Request disconnect cancels queued/page work. The bilingual
Documents row checks on mount, hides stale readiness while checking or on errors,
and supplies **Check again**. Unavailable means estimates cannot be generated,
not that they use an old design. Preview shows admin guidance and **Retry** for
the exact 503, preserving cancellation and object-URL cleanup.

Private process logs record the first selected source/path once per process,
and fixed attempt codes on discovery exhaustion. Launch failures log only a
bounded name and first message line (200 characters each), plus `errorCode`
matching `[A-Z][A-Z0-9_]{0,39}` or `UNKNOWN`. No error object, stack, HTML,
document contents or subsequent stderr/message lines are logged. Executable
paths and environment **values** never appear in this status response.
Launch flags, shared reuse, two-job admission and the overall 20-second health
deadline are unchanged; discovery does not retry launch/content/render errors.

### Proven versus still unobserved

Read-only production logs contain two old `DOCUMENT_RENDERER_UNAVAILABLE` warnings
on 2026-11-04 at 16:42:38Z and 16:43:31Z, but no underlying launch reason. They
prove fallback execution, **not** missing packages, PATH, dependencies, stale
processes or memory exhaustion as its cause. Deployment metadata reports a
successful autoscale build. No production shell/runtime executable inspection
was available, and no deployment was published for this slice.

Development proved build-time two-render success, runtime-PATH-independent
bundled renders and two simultaneous 60-line estimates. Sampled process-tree
RSS was about 1502 MiB (shared mappings counted more than once), **not** a minimum
memory requirement or a production sizing measurement. No memory setting was
changed or invented. Randy must confirm capacity in his actual deployment.

**After Randy publishes:** sign in as an active-company admin, open
**Settings → Documents → PDF engine**, and require **Ready** with a browser
version; use **Check again**, then preview an estimate and confirm the new design.
If unavailable, use the fixed reason and bounded launch log to diagnose rather
than assuming a cause. Also confirm two concurrent representative previews and
watch the deployment's actual memory use. This is the remaining live validation.

## API and data reads

Estimate URL, auth, existing 404/403/409 behavior, no-store, disposition and filename
are retained. Renderer-unavailable adds the safe 503 above; PDF routes also
set nosniff. The repeatable-read read-only resolver also loads document
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

`generated-artifacts/ic4-2/` is ignored by Git and deployment. It contains
baseline/final logs, real rendered PDFs, pdftotext text/bounding boxes,
per-page PNGs and review sheets for the 12- and 60-line estimates, 13-line draft
and synthetic issued invoices, and one-pixel fit/move boundary fixtures. Run
`pagination.test.ts`, then `node artifacts/api-server/scripts/document-review-sheets.mjs`
to reproduce these sheets. The synthetic issued fixture does not enable issued
PDFs through the draft-only API. Earlier evidence remains in `generated-artifacts/ic4/`. See
`docs/document-kit-verification.md` for results and file inventory.
Neither `pdf-fit-check.png` nor `ic4-review-*.png` was supplied; written-spec implementation is
verified, **screenshot parity is unverified**. Randy must compare the PNGs
with the approved mockup before treating visual approval as complete.
