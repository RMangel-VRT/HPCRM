# PDF engine status and reliability — verification report

## IC4.3 — resilient discovery (2026-11-04)

This section supersedes IC4.2's invalid-override and startup-manifest behavior
below. Document templates, typography, pagination, Acceptance geometry,
admin-entered terms/warranty, schemas, legal fixtures and production settings
were not changed. No publishing or production database access was performed.

### Current behavior

- One shared resolver searches the three environment hints, build manifest,
  four PATH command names and bounded deterministic Nix candidates. Invalid
  hints are skipped, not terminal failures. The startup wrapper no longer turns
  the build hint into `PUPPETEER_EXECUTABLE_PATH`; optional manifest failures
  cannot stop API startup.
- Existing admin/company-guarded, no-store
  `/api/settings/documents/renderer` still renders/stamps a real PDF. Additive
  `attempts` contains only fixed source/outcome codes. It comes from the actual
  browser launch (including reused browsers), not a second resolution.
  Exhaustion, launch and render failures retain their three fixed top-level
  reasons; selecting a path alone is never Ready.
- Discovery is bounded to 1500ms, 64 PATH directories, 8192 store entries and
  16 sorted Nix candidates (at most 26 attempts), inside the existing overall
  20-second readiness deadline. Shared reuse, admission, cancellation and
  cleanup remain covered. Launch/content/render failures do not trigger another
  executable search. Estimate failures retain 503/no legacy PDF.
- The selected source/path is logged once per process. Exhaustion logs safe
  attempts; launch logs retain bounded name/first-line fields and add a
  sanitized underlying code. Public status contains no paths or raw errors.
  See [the current contract](../document-kit.md#admin-readiness-contract).

### Reproducible development/build/runtime checks

Evidence is local development/build evidence, **not an autoscale observation**.
Generated logs and synthetic PDFs are ignored under `generated-artifacts/ic4-3/`.

1. `pnpm --filter @workspace/api-server run build` passed, including two real
   concurrent bundled render/stamp probes from `/tmp`. The final managed API
   restart rebuilt and launched successfully with truthful `BUILD_MANIFEST`
   provenance in that probe. Browser: `Chrome/156.0.8078.4`; PDFs of 560,265 and
   560,264 bytes. No executable override is manufactured by the wrapper.
2. `node artifacts/api-server/scripts/verify-document-bundle.mjs` passed after
   that rebuild. It bundles an isolated synthetic entry, copies the **unchanged
   production start wrapper** and copied document assets, then executes that
   wrapper from `/tmp` in six separate processes. Every case performs the real
   status render and a 12-line sample estimate render, validates the expected
   selected source, and uses `pdftotext` to verify Acceptance and BY CATEGORY:

   | Deliberately unusable hints | Recovery source | Result |
   | --- | --- | --- |
   | All three environment hints; restricted PATH; valid build hint | `BUILD_MANIFEST` | Ready + sample PDF |
   | All environment hints and stale build path | `PATH` | Ready + sample PDF |
   | All environment hints and malformed manifest | `PATH` | Ready + sample PDF |
   | All environment hints and absent manifest | `PATH` | Ready + sample PDF |
   | All environment hints and unreadable-as-file manifest directory | `PATH` | Ready + sample PDF |
   | All environment hints and stale build path; restricted PATH | `NIX_STORE` | Ready + sample PDF |

   Build-hint browser: `Chrome/156.0.8078.4` (624,936-byte sample). PATH/Nix
   browser: `Chrome/138.0.7204.100` (approximately 645 KB samples).
   `bundle-smoke.log` records the ordered safe attempts. The isolated layout
   intentionally excludes normal API boot/database access: it proves the
   wrapper and bundled rendering/discovery path, not signed-in production HTTP.
3. The same verifier passed two simultaneous 60-line estimates with all three
   explicit hints stale and PATH restricted, selecting **BUILD_MANIFEST**:
   645,472 bytes each. Sampled summed process-tree RSS was 1519 MiB (shared
   mappings double-counted). This is not a minimum production memory size;
   no deployment memory setting was changed.
4. API/document regressions:
   `pnpm --filter @workspace/api-server exec vitest run src/services/documents src/routes/documentSettings.test.ts src/routes/estimates.test.ts src/services/proposalDocument.test.ts src/services/proposalExhibits.test.ts`
   passed **14 files / 153 tests**, including real Chromium pagination, offline
   resources, preserved oversized-final-block rejection, geometry, stamp,
   fragments, estimate no-fallback and proposal regressions.
   After the final diagnostic changes, the focused discovery/browser/health and
   document-settings/estimate route suites passed **5 files / 95 tests**.
   Hermetic discovery covers every source, precedence, stale hints, files,
   permissions, symlinks, deterministic Nix selection, limits and stalled I/O.
   Lifecycle tests cover shared selection on reuse/concurrent slow launch,
   once-per-process logging, cancellation, deadlines and two-job admission.
5. `pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts src/components/DocumentSettingsCard.test.tsx src/components/estimates/PdfPreviewDialog.engine.test.tsx`
   passed **2 files / 14 tests**: Ready/Unavailable, company scope, Check again,
   exact estimate 503 guidance, Retry and cleanup. No client changes were needed
   for the additive response field.
6. `pnpm run typecheck:libs` passed. API-wide typecheck remains blocked by
   unrelated diagnostics; unchanged HEAD was checked in an isolated source
   archive against the same built libraries/dependencies for comparison.
   Baseline/current both have 716 identical diagnostic locations/codes, with no
   added or removed diagnostic locations/codes. Raw messages differ only in
   equivalent inferred object-property ordering in the isolated archive.
   There are no diagnostics in changed renderer files. See local
   `typecheck-comparison.txt` for the baseline/current comparison.
7. Managed API startup reached Server listening. A signed-out development
   request to the existing status endpoint returned **401 / no-store**.
   Startup also reports unrelated existing QuickBooks fixture token-decode
   warnings; renderer build/startup succeeded. These warnings are not evidence
   of a Chromium fault and no QuickBooks changes were made.
   The running CRM's signed-out login page was also visually checked; this
   does not claim a signed-in Settings browser test.

### Production remains unverified

No production executable, dependency closure, launch result or memory capacity
was observed for this change. Prior fallback logs below do not prove its cause.
No system package, deployment configuration or secret correction is justified
by the successful local evidence; the existing Nix packages remain declared.
Different installed local browsers demonstrably work via different sources,
but this does not establish which browser a future autoscale process has.

After a separately approved merge/release, Randy should sign in as an
active-company admin and open **Settings → Documents → PDF engine**:

1. Require **Ready**; click **Check again** and require Ready again.
2. If unavailable, record only reason and safe attempt codes from the existing
   `/api/settings/documents/renderer` response, then have an administrator
   inspect the bounded launch log. `SELECTED` with `LAUNCH_FAILED` is not Ready.
3. Preview the sample and an authorized representative estimate. Confirm the
   green header, Inter, sections/category summary and the company's existing
   Settings terms/warranty/Acceptance. Do not insert sample legal content.
4. Confirm two representative simultaneous previews and observe actual runtime
   memory before drawing capacity conclusions.
5. After any approved provisioning correction, use **Check again**, then the
   preview's **Retry**. Estimates must remain 503 while unavailable, never an
   old-design PDF. A still-running shared browser retains its actual original
   source until it closes/relaunches; changed hints do not rewrite its history.

No new health endpoint, legacy response headers or fallback notices were added.

## Historical IC4.2 evidence (superseded where noted above)

## Delivery and findings

- Added the guarded, no-store `GET /api/settings/documents/renderer`. Its real
  shared-kit render reports only fixed status/reason/source codes, browser
  version and ISO check time. Invalid configured paths are distinguished from
  launch failures; render/queue/deadline failures have their own fixed code.
  Launch logging preserves only the error name and first trimmed message line,
  capped at 200 characters, not a stack or arbitrary error object.
- The health check has one overall 20-second deadline, including queue wait,
  executable discovery, launch, version, render and stamping. Cancelled queue
  entries are removed; pages close on expiry/failure and late creation.
  Non-cancellable work retains its slot until settled, so a timed-out caller
  cannot admit a third background render. The two-render limit is unchanged.
- Estimates use only the shared kit. The PDFKit estimate renderer, its fallback,
  and its four legacy-only rendering tests were deleted. Unavailability maps
  to safe JSON 503 `DOCUMENT_RENDERER_UNAVAILABLE`; existing guards, company
  isolation, 404/403/409, download filename/disposition, no-store and safe generic
  errors remain. The PDF route explicitly adds nosniff on success and failure.
- Documents settings checks on mount with company/user/role-scoped keys,
  cancellation and no retained old-scope result. Loading/request errors hide
  prior readiness. EN/ES Ready, Unavailable, reasons and Check again are covered.
  The exact 503 shows translated admin guidance and Retry in estimate preview;
  other errors and request/object-URL cleanup remain intact.
- Shared Acceptance now has a keep-together wrapper containing the bordered
  signatures followed immediately by the reserve outside the border. Estimate
  reserve remains 71px; proposal reserve remains 116px. Real DOM geometry finds
  only 15.5px normal padding/border below signatures, zero gap before reserve,
  no reserve inside the border, and `break-inside:avoid` on their common group.
  Proposal legal text remains outside that group and may overflow as before.

**What live evidence proves:** read-only production telemetry shows a successful
autoscale build and two old fallback warnings on 2026-11-04, at 16:42:38Z and
16:43:31Z. Those warnings discarded the launch cause. They do not distinguish
missing executable, runtime PATH, missing libraries, stale processes or memory.
No production shell/runtime executable probe was available. No deployment cause
is claimed proven.

## Provisioning correction and live limitation

Replit documentation consulted:

- https://docs.replit.com/features/project-setup/configuration
- https://docs.replit.com/features/project-setup/dependency-management
- https://docs.replit.com/features/publishing/deployment-types

The first documentation response described the conventional `replit.nix` form;
the more specific configuration query confirmed that `[nix].packages` is also
supported. The supported system-dependency installer confirmed Chromium and
Poppler installed, without a dependency/config change. No unsupported assertion
that the existing Nix declaration was invalid is made.

The correction is explicit **build-to-runtime executable provisioning**:

1. The existing Nix dependencies stay declared.
2. API build bundles the shared renderer, uses its own resolved executable,
   renders two PDFs concurrently from `/tmp` using copied assets/fonts and
   writes `dist/document-runtime.json`. A failed probe fails the build.
3. Package start and the schema-validated production artifact command now invoke
   `scripts/start.mjs`. Unless explicitly overridden, it sets
   `PUPPETEER_EXECUTABLE_PATH` to the executable resolved by **that build** before
   importing the server. No development store path is committed or configured
   for production. The runtime no longer relies on matching the build shell PATH.
4. Missing runtime executables remain diagnosable through the status endpoint.
   Keep the manifest, copied assets, dependencies and Nix closure with the image.

Proven in development:

- Full API bundle build and normal API startup through the new wrapper passed.
  Build probe: `Chrome/140.0.7339.16`, two valid PDFs about 560 KB each.
- A real standalone bundled `checkDocumentRenderer()` from `/tmp` returned
  `ready`, reason null, source `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`, browser
  `Chrome/140.0.7339.16` and a valid ISO check timestamp.
- The different-working-directory portable check produced 559,493 bytes.
  Two simultaneous **60-line estimates** also passed with PATH set to
  `/usr/bin:/bin`, using the build-resolved explicit executable: 666,685 bytes
  each. No source-working-directory or attached-assets dependency is needed.
- Sampled summed process-tree RSS peaked at about **1502 MiB**, with shared
  mappings double-counted. This is an observation, **not** a minimum production
  memory setting or proof of autoscale sizing. No memory setting was changed.
- API/CRM workflows restarted and serve normally. Public preview shows the
  expected sign-in screen. Unauthenticated status request returns 401/no-store.
  Existing development QBO test-token decode warnings remain unrelated.

**Randy's post-publish check:** sign in as an active-company admin and open
**Settings → Documents → PDF engine**. Require **Ready** with a browser version,
click **Check again**, and preview an estimate to confirm the new design. Then
run two representative previews concurrently and observe actual deployment
memory. If unavailable, use the displayed fixed reason and bounded launch log;
do not assume PATH or memory is the cause. Live readiness/capacity remains
unverified until Randy publishes and performs these checks.

## Tests and typecheck baseline

Logs and generated evidence: `generated-artifacts/ic4-2/` (ignored by Git and
deployment). Library declarations were refreshed before the in-place typecheck
baseline. No full-suite green/typecheck-green claim is made.

| Check | Unchanged baseline | Final |
|---|---:|---:|
| Focused API/PDF/model/settings/estimate/invoice routes and legacy proposal exhibit/raster tests | 165 passed, 12 files | 177 passed, 14 files |
| Focused CRM Documents/estimate builder/preview | 35 passed, 2 files | 45 passed, 3 files |
| API typecheck diagnostics | 716 | 716 |
| CRM typecheck diagnostics | 223 | 223 |
| Normalized per-file/error-code diagnostic additions/removals | — | zero / zero |

The API baseline is the verified union of the unchanged archived 110-test kit/
estimate/settings run and 55-test invoice/exhibit run. Archive fixture repairs
are explicit: a missing migration link was repaired and its 3/3 tests passed;
a missing ignored logo attachment link was repaired and its 7/7 exhibit tests
passed. The initial in-place test attempt overlapped file replacement and is
not treated as a valid product baseline. The first archive UI attempt used the
root runner's different Vite peer/JSX transform and did not collect; using the
artifact-local runner against unchanged sources passed 35/35. Raw failed
attempts remain in the evidence directory rather than being hidden.

Final API log: `verified-api-tests.log` (177/177). After adding explicit proposal
border-only raster/clearance assertions, `verified-proposal-regression.log`
passed 15/15 (the same proposal cases, not additional tests to add to 177).
CRM: `final-ui-tests.log` (45/45).
Typechecks: `baseline-{api,crm}-types.log`, `verified-api-types.log`,
`final-crm-types.log`; `typecheck-delta.json` records the normalized comparison.
The archive typecheck is not used for this delta because archive dependency/
root-directory diagnostics differ; the clean pre-edit in-place baseline is used.

The completion schema guard initially found the baseline archive's copied Drizzle
configuration, even though generated evidence is ignored. That duplicate config
was removed after the baseline checks; the real `lib/db/drizzle.config.ts` remains
the only active configuration. This was not database schema drift, and required
extensions were present. No database migration or production change was needed.

Coverage includes admin/role/company/no-store, safe fields and timestamps,
invalid executable precedence, bounded launch logs, launch/render failure,
readiness/version, real shared estimate success and no-fallback 503, existing
estimate access/errors, FIFO/two-slot admission, queued cancellation/timeout,
overall launch+render budget, late page cleanup, held non-cancellable stamping
slots, bilingual UI refetch/error/scope/retry and object-URL cleanup, real DOM
Acceptance geometry, print pagination boundaries and final-body clearance.

Reproduce:

```sh
pnpm exec tsc --build --force
pnpm --filter @workspace/api-server exec vitest run src/services/documents src/services/estimatePdf.test.ts src/routes/documentSettings.test.ts src/routes/estimates.test.ts src/routes/invoices.test.ts src/lib/pdfBrand.test.ts --maxWorkers=2
pnpm --filter @workspace/highplains-crm exec vitest run src/components/DocumentSettingsCard.test.tsx src/components/estimates/PdfPreviewDialog.engine.test.tsx src/pages/EstimateBuilder.rendered.test.tsx --maxWorkers=2
pnpm --filter @workspace/api-server run build
node artifacts/api-server/scripts/verify-document-bundle.mjs
node artifacts/api-server/scripts/document-review-sheets.mjs
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/highplains-crm typecheck
```

Authenticated UI interaction was verified by rendered component tests, not a
signed-in live browser run. The public preview and transformed frontend are
healthy; this is not claimed as signed-in browser coverage.

## Refreshed visual evidence

- `estimate-12-{1,2,3}.png`, `estimate-12.pdf`, `.txt`, `.bbox.html`,
  `.checks.json`, `estimate-12-all-pages.png`: still three pages; final three
  pricing lines/totals on page 2, legal/Acceptance/mountains on page 3.
  Final body bottom 333.55pt is above the required 681.75pt limit.
- The full pagination fixture set, including the 60-line estimate, invoices,
  one-pixel boundaries and short tables, is refreshed here. `inventory.json`
  lists the six review sheets and rejects stale page counts.
- `proposals/` contains refreshed real PDFs, page PNGs and bounding boxes.
  Comparing **56 PNG pages** against unchanged-source fixtures finds **48
  identical** and **eight changed**, exactly the Acceptance page in each of six
  photo-count/layout fixtures, the overflowing-legal fixture, and populated
  cover/Visual Scope/palette/schedule fixture. Page counts and all other pages
  are unchanged. `proposal-raster-comparison.json` retains both hash sets.
  Committed regression hashes assert unchanged cover/pricing/photo pages and
  the intentionally shortened border, plus real signature/mountain clearance.
- Existing legacy 7-/9-page proposal cover/exhibit fingerprints pass unchanged;
  `pdfBrand.ts`, legacy exhibit code and proposal page structure are untouched.
- The estimate review sheet and proposal Acceptance PNG were inspected. Missing
  approved mockups remain missing: screenshot parity/visual approval is not
  invented.

## Changed files

- Runtime: `artifacts/api-server/.replit-artifact/artifact.toml` (validated),
  `artifacts/api-server/{build.mjs,package.json}`,
  `scripts/{prepare-document-runtime,start,verify-document-bundle,document-review-sheets}.mjs`
  under the API artifact.
- API routes: `src/routes/{documentSettings,estimates}.ts` and their tests.
- API services: `src/services/estimatePdf.ts` and its model tests;
  `src/services/documents/{browser,render,health,estimate,proposal}.ts`;
  `browser.test.ts`, `health.test.ts`, `acceptanceGeometry.test.ts`,
  `estimateEngine.test.ts`, `pagination.test.ts`, `proposal.test.ts`.
  Deleted `documents/fallback.test.ts` and the legacy-only estimate render tests.
- CRM: `src/components/DocumentSettingsCard.tsx` and its test;
  `src/components/estimates/PdfPreviewDialog.tsx` and
  `PdfPreviewDialog.engine.test.tsx`; `src/i18n/locales/{en,es}.ts`.
- Documentation: `docs/{document-kit,document-kit-verification,proposal-shared-template}.md`,
  `replit.md`; project memory records the non-obvious artifact-local test-runner
  requirement for valid archive comparisons.

**Nothing was published. No production records were changed and no customer
communications were sent.** No schema, invoice lifecycle, ownership, mobile,
cover/exhibit design, concurrency-limit or memory-setting change was made.

---

# Historical IC4.1 PDF layout corrections — verification report

## Current delivery

The IC4.1 written brief supersedes the IC4 rule that put estimate pricing totals
on the legal page and reserved a fixed 100px for mountains.

- Estimate category summary/total follow the table. Terms, warranty and the
  bordered Acceptance box remain on a separate new page.
- Print-width embedded-font measurement explicitly paginates tables, preserving
  the final three rows with totals, repeated headings and section/category
  context, even across groups. Short tables retain every row. Same-page tail
  rows merge into the existing table with no duplicate heading.
  Continuation section headings are explicitly marked `(continued)` and omit
  the amount; real-PDF assertions conserve each section subtotal as well as rows.
- Invoice payment instructions are compact; the full-width single-line remit
  display follows them without overlapping totals. Settings stay multiline.
- Contact is in the first header below the date, not in the body. Human dates,
  trimmed/grouped quantities and tight band numbers are display-only changes.
- The 71px derived reserve is inside invoice totals / estimate Acceptance.
  Every-page counts, short continuation bands, draft pill/stamps and final-only
  mountains remain. Oversized legal blocks, indivisible rows/tails and over-wide
  single-line remit displays fail explicitly rather than violating layout.
- No model, route guard, schema, settings storage, proposal renderer or
  commercial behavior changed. Issued PDFs are synthetic renderer fixtures
  only; the live invoice PDF endpoint still rejects non-drafts.

## Current checks and baseline

Evidence/logs: `generated-artifacts/ic4-1/` (ignored by Git/deployment).

| Check | Before | After |
|---|---:|---:|
| Focused shared kit/model/fallback/browser, estimate, invoice routes, proposal exhibits and raster fingerprints | 130 passed, 10 files | 147 passed, 11 files |
| API typecheck after library declaration refresh | 721 existing diagnostics | 721 existing diagnostics |
| Normalized typecheck file/error-code differences | — | zero |

The unchanged-source baseline typecheck was run from an archived source tree
with the same refreshed library declarations and dependencies, including the
CRM sources imported by API tests. An initial incomplete archive was missing
those sibling sources and was repaired before comparison. No document-kit
diagnostics remain. Typecheck is **not** claimed green. Library declaration
build, API bundle build and different-working-directory bundled offline render
passed (559,493-byte portable PDF). Existing 7-/9-page proposal raster
fingerprints still match. No focused baseline failures or skipped real-render
tests occurred. Raw intermediate failures from layout development are retained.

New real-PDF checks cover one-pixel fit/move boundaries for both types,
0/1/2/3-row tables, wrapped multiline rows, section/category-crossing tails,
row identity/count conservation, no duplicate same-page headings, repeated
group context, issued one-page fit, oversized-content rejection and final-page
body-text clearance. `pdftotext -bbox` asserts body text ends at or above
681.75pt (mountains start at 693.75pt, a 12pt/16px separation).
Intentional footer/count and diagonal DRAFT decoration are excluded.
HTML checks cover Colorado instants/unshifted calendar dates and suffixes,
precise decimal quantity formatting, escaping/contact omission, original remit
storage, Acceptance border/title and the 71px geometry-derived reserve.

## Current PDF evidence

Every named fixture has a `.pdf`, `.txt`, `.bbox.html`, `.checks.json`, full-size
96dpi page PNGs and `-all-pages.png` review sheet in `generated-artifacts/ic4-1/`.
Both boundary fixtures also retain `-fits` PDFs/PNGs and `.boundary.json`
identifying adjacent spacer values. `inventory.json` lists the six sheets;
`document-review-sheets.mjs` refuses stale/missing PNG page counts.

| Fixture | Pages | Review sheet |
|---|---:|---|
| 12-line estimate | 3 | `estimate-12-all-pages.png` |
| 60-line estimate | 5 | `estimate-60-all-pages.png` |
| 13-line draft invoice, one unpriced line | 2 | `invoice-13-draft-all-pages.png` |
| 13-line issued invoice, all priced, $3,250 + $260 tax = $3,510 | 1 | `invoice-13-issued-all-pages.png` |
| Estimate at the move boundary | 3 | `estimate-boundary-all-pages.png` |
| Invoice at the move boundary | 2 | `invoice-boundary-all-pages.png` |

The 12-line estimate now moves its final three lines with the pricing summary
to page 2; legal/Acceptance occupies page 3. The 60-line estimate prices finish
on page 4, legal on page 5. The draft invoice moves its final three rows with
totals; the issued example fits all thirteen lines/totals/mountains on page 1,
with its final body text ending at 667.30pt (35.27px above the mountain top).
All six review sheets were inspected. All data is fictional.

**Visual limitation:** `pdf-fit-check.png` and `ic4-review-*.png` were not
included. Written geometry/behavior has been checked, but screenshot parity
and visual approval against the missing mockups are not claimed.

**Nothing was published and nothing was written to production.** No migrations,
issuing, sending, QBO synchronization or production access were performed.

---

# Historical IC4 delivery and verification report

The following preserves the earlier delivery record, not current IC4.1 layout
rules or page counts.

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
order. See `docs/documents/document-kit.md` and `replit.md` for autoscale preservation
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
  `docs/ownership/data-ownership-map.md`, `docs/estimates/estimate-builder-pdf.md`,
  `docs/invoicing/invoice-center-draft-api.md`, `docs/documents/document-kit.md`, this report.
- Memory: the document-font compatibility lesson and its index pointer.

No invoice compose/list, source feeder, issuing, sending, storage, payment,
statement, proposal integration, lifecycle mutation, new application,
design-canvas or mobile functionality was added.

**Nothing was published, and nothing was written to production.** Migration,
fixtures and read-only/no-mutation verification used development only.
