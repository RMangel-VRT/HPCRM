# Estimate-derived plant exhibits

## Ownership and compatibility

Estimate lines own plant selections, `includeInPalette`, and explicit palette-label
overrides. Proposals own only exhibit inclusion and intro presentation. The
finalized schedule JSON is a printed snapshot, not an editable plant source.
See the data-ownership map.

Migration `0065_proposal_plant_exhibits.sql` is the next unused number after the
merged proposal-estimate relationship migration. It adds guarded boolean
`include_plant_schedule` / `include_plant_palette` columns, both NOT NULL with true
defaults, and nullable `palette_intro_text`. Existing migration filenames are
unchanged. It was applied only to development and tested twice for rerunnability.
There is no startup DDL, production migration, deployment, historical linking, or
historical PDF regeneration in this slice.

The approved intro is used **only for linked proposals whose intro is NULL**:

> Every plant in this palette is Colorado-hardy and was selected for this site’s sun exposure, soil, and water needs. Final selections may be substituted with comparable varieties based on nursery availability at the time of installation.

Explicit empty text suppresses the intro. The default is not written into legacy
palette records. Omitted PATCH fields remain omitted; switches and intro are not
reset by unrelated saves.

## Reusable model contract

`services/proposalExhibits.ts` exports the one-query, company-qualified plant
loader, pure schedule/palette builders, and the shared default-label rule.
Frontend-safe contracts and the rule live in `lib/db/src/plantExhibitContracts.ts`;
the browser does not import API artifact code.

- Loader: ordered sections and lines, size-specific catalog data and enrichment;
  company-qualified joins at every boundary, including coinciding variety keys.
  No price resolver and no commercial fields in its projection.
- Schedule: first occurrence of each non-null live size-item ID; exact
  hundredths arithmetic for summed quantities. Quantities are decimal strings,
  not floating-point sums. Different sizes stay distinct. Missing catalog rows
  use captured name/detail, with no botanical name or image; unrelated missing
  rows never combine.
- Palette: selected lines only; variety deduplication across sizes. First
  occurrence owns display metadata. The first explicit label override in
  estimate order beats a category default; later conflicting overrides do not
  replace it. Missing variety keys fall back to a size-item identity, then the
  individual line identity. Known category order is preserved, with sorted
  unknown categories afterward. The optional evergreen distinction is unchanged.
- Neither model contains prices, costs, or totals. Empty models produce no
  exhibit page.

The estimate read response exposes live label defaults in a separate
`version.plantPaletteDefaults` projection. These are deliberately **not** added to
commercial line payloads: deleting a catalog row may change a live display
default, but cannot change an immutable commercial snapshot.

## Rendering and finalization

The merged Slice 4.1 selected-version contract is reused, not recreated.
Draft preview selects the current version once; finalize passes its exact
selected, sent/pinned ID. Finalize loads one exhibit model and passes that same
model to PDF rendering and `plantItemsSnapshot`, including record-creation
retries. Concurrent revisions cannot substitute a different version for pricing,
exhibits, snapshot, or pin. A PDF/storage failure never reverses the already
committed estimate send.

The models are adapted into the existing PDFKit inputs. Drawing loops, overflow
typography, and decorations are not restyled. Linked order is cover/scope,
Visual Scope, estimate pricing, palette, schedule, then the existing remaining
pages. The two switches independently suppress their exhibit. Linked rendering
ignores legacy plant items and attached palettes. Unlinked sources, order,
historical stored PDFs, and raster fingerprints remain unchanged.

The named `document-design-system.md` reference was unavailable. The supplied
brief and recorded shared-document/legacy-decoration constraints in
`docs/document-kit.md`, `docs/proposal-estimate-integration.md`, and project memory
were followed instead; no missing design reference was invented.

## Editor API and isolation

`GET /api/proposals/:id/exhibits` returns:

```text
{ schedule: [...], palette: { introText, groups: [...] },
  provenance: { estimateId, estimateNumber, versionId, versionNumber } }
```

It uses the existing proposal role/company gate, is not cached by HTTP, and
never renders a PDF. Missing proposal: 404; unlinked: 422; missing linked
version: 409; unauthenticated: 401; denied role: 403; stale initiating company:
409. Provenance is returned with the models instead of selected independently
by the editor.

The linked editor provides the read-only table/cards, estimate links,
independent switches, persisted intro save/clear/default, explicit loading and
error states, and English/Spanish copy. Legacy attach/detach and plant editing
remain available only on unlinked proposals. Draft estimate lines support
inline label save and null reset; read-only versions show labels without input
or reset controls.

Preview keys include company/user/role identity, proposal, estimate, and the
editor's version hint. The response provenance remains authoritative. Estimate
edits/revisions invalidate exhibit previews; mount/focus and finite polling also
refresh them. Pending intro state remounts across identity/estimate boundaries.
Photo previews use initiating-company-qualified fetches and disposable blob
URLs; they do not reuse another company's browser-cached variety photo.

**Subsequent Slice 4.3:** standalone palette attachment/editing has now been
retired, including on unlinked proposals. Existing unlinked references remain
render-only with an explicit removal action. See
[retirement and dormant-schema handoff](plant-palette-retirement.md).

## Verification

Verification logs are retained under ignored `generated-artifacts/slice42/`.

- Before edits: forced library declaration rebuild, root typecheck baseline,
  and 45 passing proposal/PDF/math tests.
- Final focused API/model/PDF checks: **87 passing tests across six files**,
  including the existing real-PostgreSQL estimate suite. Coverage includes model ordering, exact sums, fallbacks, explicit
  label precedence, empty/price-free models, one-query tenant isolation,
  authenticated endpoint behavior, settings omission, finalization snapshot,
  concurrent revision, inclusion switches, actual PDF merge order, and unchanged
  unlinked decoration fingerprints.
- Focused rendered client checks: 76 passing tests across the builder, linked
  proposal, exhibit component, and existing lifecycle UI; saves, null reset,
  read-only states, intro clearing/default, independent switches, isolation,
  translated errors, and unchanged legacy proposal finalization.
- Forced library declaration rebuild succeeded before the final root
  `pnpm run typecheck`. Baseline and final each report **730 existing
  diagnostics**, with **zero additions or removals** after normalizing line
  offsets. This is not a clean root typecheck, and no unrelated cleanup was
  folded into the slice.
- Full API suite (two workers): 2,418 passed, 17 failed, 125 skipped. Failures
  outside the changed slice are Contract Center board/copy/schema, mailbox
  reconnect, and plant-enrichment tests. One estimate integration test hit its
  existing five-second timeout under the full run; the focused result is recorded
  separately and **all 25 estimate integration tests pass** in that single-worker
  focused run. The earlier immutable-line payload regression found during the
  first full run was fixed without weakening its assertions.
- Full CRM suite (two workers): 962 passed, 10 failed. The failures are unchanged
  crew-selection, tab-query, rate-card grouping, and ticket-conversation/Overview
  tests. All changed-feature client tests pass. Full-suite failures are reported,
  not silently treated as green.
- Required extensions and schema-drift checks pass. Both changed workflows
  build/start successfully. The first API restart overlapped disposable database
  fixtures and was rejected by existing scheduling bootstrap validation; after
  fixture cleanup it started cleanly without changing scheduling data or code.
- Both changed Vite-transformed modules return HTTP 200. Signed-in browser
  verification passed using an isolated development company and canonical
  disposable admin: label edit/blur/reload/reset, linked read-only previews and
  provenance, both switches/reload, empty/default intro/reload, legacy editors,
  and sent-version read-only labels. Sending used `hard_copy` for the disposable
  estimate only; no external communication was sent. All disposable company/user
  records were removed and verified absent afterward. At 1366×900 there was no
  horizontal page overflow. Screenshot evidence covers the populated schedule,
  grouped palette/default intro, draft label edit, and sent read-only builder.
  After inspecting the builder screenshot, the label/toggle group was moved
  together under line details so the added controls do not squeeze plant names;
  the same rendered interactions and transformed module were checked afterward.
  Two initial resource 404s/loading during navigation resolved on retry; no
  runtime exception was observed. Real PDF behavior was verified by the API/PDF
  tests, not by generating another PDF in the browser.

No scope was deferred to the palette-tool retirement or shared-template redesign.
Those remain separate downstream slices.
