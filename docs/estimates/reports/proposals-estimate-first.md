# Estimate-first proposals — P1 / P2 / P3

## P1 handoff

Acceptance: all three uploaded briefs and the approved Estimate/Proposed and
Proposal/Proposed mockup. Existing estimate scope, lifecycle, exhibits, cover,
shared document renderer and company access predecessors are integrated.

Development read-only count before work: **0** proposals with `estimate_id IS NULL`.
Production needs a separate read-only count **after Publish**. Nothing was
published and no production data was accessed or modified.

Creation derives customer, ticket and number from a non-void, company-owned
estimate. Missing links return `ESTIMATE_REQUIRED`; ticket-only calls use the
existing scoped ticket reader. Defaults use the estimate title and Denver day.
The builder lookup selects only proposal identity/status/title/timestamp for one
estimate and active company, ordered newest timestamp then ID descending.

All proposal nested mutation routes share a legacy guard. Whole-proposal
authorized deletion and GETs are exceptions. Worksheet aliases also guard legacy.
New estimate-PDF registration and signing are retired, stored files retained.
Attachment IDs must belong to the URL proposal. Estimate unlink is forbidden;
switches retain company/customer/ticket checks and cannot replace finalized links.
Finalization's independently committed estimate send remains unchanged.

P1 verification gate: 17 API integration tests passed, covering creation defaults,
foreign/void refusal, narrow lookup, legacy nested writes, retired PDF entry
points and existing send-first/pinned-version/storage-failure lifecycle cases.
Frontend rendered tests cover Make/Open/older/role/void states, entry points,
draft switching and legacy banner/read-only behavior in English and Spanish.
Initial API typecheck exposed stale shared declarations and existing diagnostics;
final typecheck results are recorded below after refreshing declarations.

## P2 handoff

Linked scope writes are **explicitly rejected**, even empty/null, with HTTP 400
`ESTIMATE_SCOPE_OWNED`. No linked proposal-owned scope value is written. Legacy
text remains in place and legacy mutation protection takes precedence.

Shared and unavailable-browser PDFKit paths select scope from the same explicit
estimate version as pricing/exhibits; no linked fallback to proposal text.
`[PAGE BREAK]` remains supported and blank text omits the scope heading/body.
Existing finalized storage objects are never regenerated or modified.

The DML-only boot initializer checks every referenced column through
information_schema and uses dedicated transaction advisory lock 665006. It
locks estimate parents in company/ID order, then their current versions and
candidate proposals. Normal estimate edits and lifecycle transitions use that
same parent lock, so the pointer, draft state and empty scope cannot change
during selection/update. Conditions are repeated in UPDATE. Company and parent
identities are checked on every join. Frozen versions and populated scopes
are untouched; source text remains retained.

For multiple sources, **oldest proposal created_at, then proposal ID ascending**
wins. Reports include each ambiguous estimate/candidate/selected ID, copied
count, populated count and skipped frozen proposal IDs, never scope text.
Two simultaneous initializer runs copied one eligible fixture once; rerun copied
zero. The competing-source fixture chose the oldest deterministically; populated
and cross-company fixtures stayed unchanged; frozen version full row comparison
was byte-for-byte equal. No real ambiguous development rows existed outside the
disposable test fixtures. No schema or deployment DDL was introduced.

P2 API/loader gate: 23 tests passed (19 integration, 4 loader).
PDFKit fallback and decoration suite: 8 passed including selected text, page
break separation and empty omission. Existing shared-renderer suite had four
pre-existing hash assertions out of date (standalone estimate HTML and pricing
page raster hashes); neither estimate renderer nor shared layout was changed.
The semantic/pagination assertions and new P2 cases are recorded in final checks.

The existing Generate Crew Worksheet action now snapshots estimate-owned scope,
rather than the newly retired proposal narrative, for linked proposals. This is
an operational snapshot, not an editable commercial owner. A real storage
integration test confirms stale proposal text is not copied.

## P3 handoff

Reused the real editor, estimate/exhibit components, attachment APIs, finalization
dialogs and version history. No compiled mockup code, simulated data or new
upload API was introduced. The editor is capped at 1480px; the document and
320px sticky action rail use two columns at 1024px, with the rail first below
that width. Cover/Visual Scope and schedule/palette use paired columns at 1280px.
Five numbered strips use accessible expanded-state buttons and hide retained
bodies; optional collapse state is viewer-scoped local storage.

The linked-ticket bar precedes the title/date row. Header contains preview,
download and destructive confirmed deletion. Estimate unlink remains retired;
ticket unlink remains a distinct supported operation. Scope and total checklist
values reuse the same scoped estimate read as the Estimate section, and plant
readiness reuses the existing exhibits query. Missing/loading/error scope is
never marked complete. Palette categories are translated in one three-across
grid. Intro remains three rows with NULL/default versus explicit-empty semantics.

Browse and native file-drop share conversion/compression/upload/notification
logic. HEIC/HEIF files retain conversion support. Non-images produce translated
refusal, file drag highlighting is isolated from pointer/keyboard photo reorder,
and simultaneous uploads are guarded. Existing captions/layout/order survive.
An existing icon import shadowed JavaScript Map in reorder; it was aliased to
restore actual reorder behavior, not merely hide the type diagnostic.

Legacy proposals retain the same page structure, disabled editing/upload paths
and no finalization/worksheet action. Stored-version viewing/download and
confirmed whole-proposal deletion remain available.

## Final verification

- API integration/loader/schema-guard/PDFKit suite: **35 passed** across 4 files.
  Includes direct legacy mutation refusals, authorized deletion and byte-identical
  historical PDF download, incorrect version-parent/company/role refusals,
  scope write rejection, deterministic carry-forward, concurrent initializer
  runs, concurrent editor preservation, frozen full-row equality and worksheet
  scope snapshots. Final create check also covers an entirely absent body.
- Shared-renderer selected scope tests: **2 passed**, including real Chromium
  render + pdftotext proof of explicit page separation and empty heading omission.
- Frontend proposal suites: **43 passed** across 6 files, English/Spanish,
  creation entry points, scope ownership, layout/rail/header/ticket order,
  collapsed state, checklist completeness, upload/drop refusal and reorder
  independence. Existing EstimateBuilder suites passed in the P1 gate.
- Library declaration build: passed. CRM and API typechecks were run after
  refresh; no diagnostics in modified proposal files. Existing unrelated
  auth/shared-schema/other feature diagnostics still prevent clean whole-app
  typechecks. Logs are in ignored `generated-artifacts/proposals/`.
- Existing document suite: four old golden-hash checks remain mismatched
  (standalone estimate HTML and proposal pricing raster pages). A separate
  experiment loaded the committed pre-task proposal renderer and proved its
  nonempty output byte-for-byte equals the current renderer; neither standalone
  estimate renderer nor shared CSS changed in this task. Do not bless new
  golden images without a separate baseline review.
- Both workflows were restarted; API health and Vite-transformed proposal and
  estimate-section modules return 200. One API restart timed out because existing
  startup work iterates hundreds of old fixture companies; a longer bounded
  restart completed. Existing unrelated QuickBooks test-token warnings persist.
- Signed-out screenshot renders normally. The documented admin is absent in this
  development fork (read-only count 0), so the authenticated pass uses isolated
  disposable fixtures instead of resetting or modifying a real user's account.

### Authenticated pass and resulting repairs

Used a fresh isolated development company, canonical disposable admin account,
membership and customer; never reset an existing account. Verified Make proposal
navigation/default title, estimate-owned read-only scope, matching $10 total and
scope checklist, real estimate PDF preview/download, Space-key collapse/expand
for all five sections, caption persistence and confirmed deletion UI.

The pass uncovered two existing photo defects that would have invalidated
preservation of attachment behavior: reorder/bulk-delete called a nonexistent
storage getter, and thumbnail markup doubled registered `/objects/` prefixes.
Both were fixed using the existing getter and object route, with no new API.
A focused continuation confirmed loaded thumbnails (nonzero natural dimensions,
HTTP 200), persistent keyboard reorder (HTTP 200), no upload request during
reorder, and non-image toast/refusal with no file API request.

The 1440px desktop and 900px narrow layouts were inspected. At 390px the palette
intro action row's nowrap buttons caused nested horizontal overflow. Replaced
that row with wrapping actions and individually bounded, wrapping labels; slim
section titles can shrink/wrap too, including longer Spanish titles. Confirmed
these simple CSS repairs with the rendered suites rather than another browser
run. Final affected frontend suites: **14 passed** (P3 and plants). Including the
other unchanged passing proposal suites, **44 frontend cases** are covered.

Added real-route persistence and foreign-parent attachment regression coverage:
**1 additional API test passed**, bringing the targeted backend total to **36**.
Rechecked initializer concurrency/edit preservation plus attachment persistence:
**3 passed**. Carry-forward now explicitly handles newline/tab-only text as
empty in both its selection and guarded update; an older whitespace-only source
cannot defeat the deterministic nonempty candidate rule.

The browser stopped at the mobile finding and did **not** run Spanish or the
finalize/sent/Open-proposal tail. Those cases remain covered by the rendered
Spanish/button/dialog suites and the integration send-first, frozen-version,
stored-PDF, retry/failure and lookup tests described above; they are not claimed
as browser results. No external message was sent. All exact-ID checks confirmed
both isolated browser fixtures and their proposals/versions/estimates/customers/
memberships/users/companies were removed after authorized proposal deletion and
estimate voiding. No production writes or publication occurred.

### Completion-review correction

Restored individually downloadable original estimate-PDF attachments for legacy
unlinked proposals. This is a read-only historical-files block outside disabled
editing fieldsets, not the retired linked-proposal upload/list workflow. It uses
the existing authenticated object URLs and retains filenames, with English and
Spanish headings and accessible download names. No upload, edit or attachment
delete action was restored. The legacy rendered test verifies links, filenames,
translation and disabled mutations in both languages.
