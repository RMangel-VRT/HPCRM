# Standalone plant palette retirement (Estimate Builder Slice 4.3)

## Replacement and compatibility

Slices 4.1 and 4.2 were present before retirement. Proposals linked to an
estimate use the existing selected-version exhibit adapter, inclusion switches,
intro controls, and exact finalization pin. Those contracts and the PDF drawing
loops are unchanged. Estimate lines, not standalone palettes, own new palette
content.

Plant Library retains Library and Matches. The Palettes rail entry, Tools card,
standalone list/editor modules, lazy imports, public `/api/plant-palettes`
endpoints (including items and duplication), and proposal pickers/editor links
are removed. Canonical list/detail bookmarks and both former Tools alias
families redirect directly to `/dashboard/estimates/catalogs/plants`, preserving
the raw query string. A translated toast explains the replacement once per
bookmark navigation, including React StrictMode effect replay.

An unlinked proposal with an existing legacy reference shows:

> Legacy palette attached. It will render until this proposal is linked to an estimate.

“Remove legacy palette” PATCHes null, disables duplicate submission while
pending, refreshes proposal/editor and linked-ticket caches, and exposes a
translated retryable error without discarding the reference on failure. Opening
the draft PDF preview requests a fresh server render. No attachment picker
reappears afterward. This action clears only the reference, not palette records.
Legacy proposal plant schedules remain unchanged.

POST and PATCH reject every explicit non-null `plantPaletteId` with HTTP 400
and `PLANT_PALETTES_RETIRED`. PATCH null clears; omission preserves the reference
on an unlinked proposal. Unrelated writes remain supported. Estimate linking
clears the reference in the same UPDATE. Internal storage writes also reject
attachments, clear on linking, and force null on creation, including the
ticket-derived automatic estimate link. Company/role and initiating-company
guards remain in place.

Only proposal-owned, company-scoped palette and item reads remain in storage.
There were no separate tool-only storage methods to remove. Linked renders
ignore legacy references; unlinked renders retain their original geometry.
Existing finalized version rows and stored PDF bytes are never rewritten.

## Dormant schema — do not drop

Keep both `plant_palettes` and `plant_palette_items`, all their columns, indexes
and foreign keys, `proposals.plant_palette_id`, the Drizzle definitions and the
frontend-safe compatibility types. The dormant definitions are marked:

> Dormant since Slice 4.3. Drop in a dedicated, reviewed migration once no unlinked draft proposal references a palette.

No migration, table/column/foreign-key drop, legacy-data cleanup, backfill,
production query, deployment or Publish is part of this retirement. The schema
source diff must contain comments only. A future drop requires a separate
reviewed migration and Randy's confirmation that no remaining unlinked draft
proposal needs its palette; it must not be inferred solely from removing UI.
Retain finalized PDF bytes and review any other historical dependencies before
that later drop.

### Read-only pre-flight SQL for Randy

This is handoff guidance only; it was **not executed against production**.

```sql
SELECT p.id, p.title, p.proposal_number, c.name AS customer
FROM proposals p JOIN customers c ON c.id = p.customer_id
WHERE p.plant_palette_id IS NOT NULL AND p.estimate_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id = p.id);
```

## Verification

Evidence is retained in ignored `generated-artifacts/palette-retirement/`.
A forced library declaration rebuild and root typecheck were captured before
edits. The baseline library rebuild passed; root typecheck reported 730
inherited TypeScript diagnostics. This was not a clean root baseline.

The unchanged prerequisite proposal/model/PDF suite passed before adding the
retirement regressions, including the pre-existing short/overflow legacy PDF
raster fingerprints. Final checks cover:

- Real proposal POST/PATCH handlers and storage: rejected non-null values,
  null/omission, automatic/manual/internal estimate linking, scoped legacy
  reads, role/company denial, unchanged finalized bytes and exact pinning.
- Rendered editor: bilingual read-only note, safe pending/removal/refetch,
  retryable failures, no attachment/editor controls, linked exhibit continuity.
- Navigation: canonical/Tools aliases, encoded raw query preservation,
  translated one-time notices, unchanged Library/Matches active states and
  authorization.
- Real PDFs: unlinked raster/decoration preservation; explicit removal drops
  only the palette page and retains all other page fingerprints; linked
  estimate-derived exhibits and selected-version behavior.
- Schema guards: both tables, complete column lists, retained foreign keys,
  compatibility types and the exact deprecation comment.

### Final results

- Focused retirement checks: **29 API/PDF/schema tests** and **89 rendered
  client/navigation tests**, all passing.
- Full relevant API suites (estimate routes/services, proposal integration,
  ticket-estimate integration, PDF and schema guards): **381 tests across 17
  files, all passing**.
- Full relevant CRM suites (navigation, estimate components/builders, proposal
  editor and exhibits): **282 tests across 14 files, all passing**. No separate
  standalone-tool test files existed; navigation regressions were retained and
  updated rather than deleted.
- Forced library declaration rebuild passes. Root `pnpm run typecheck` still
  exits 2: **730 baseline API diagnostics → 721 final API diagnostics**, zero
  additions after normalizing line offsets, with nine inherited TS7030 errors
  removed along with the nine retired endpoint handlers. Existing API errors
  include missing returns, stub-related implicit/untyped values, cross-package
  root-directory errors, and existing property/import mismatches. The root
  command stops on that API failure; it is **not a clean root result**.
- An independent CRM typecheck also exits 2 with **222 inherited diagnostics**.
  To account for the root command's early exit, the original committed CRM
  source was checked in an ignored isolated baseline checkout against the same
  freshly rebuilt libraries: **222 baseline → 222 final**, zero additions or
  removals after normalizing line offsets and the checkout prefix. No working
  source was rolled back. The independent client check is not clean either;
  its existing stub/type and missing-return failures were not expanded into
  unrelated cleanup.
- Required extensions and schema-drift checks pass. A source-equality check,
  stripping only the added deprecation comments, confirms **identical
  executable Drizzle and frontend compatibility schema**. No migration file or
  Drizzle configuration changed. The no-DROP assessment is based on those
  unchanged definitions, not on running Publish or comparing production.
- Both changed workflows restart and serve successfully. A development-proxy
  matrix of GET/POST/PATCH/DELETE across the retired list, detail, item-list,
  item-detail and duplication paths returns **20 genuine HTTP 404s**, never SPA
  HTML. Express's standard unmatched-route 404 is used; no replacement palette
  endpoint or successful fallback was added.
- Vite-transformed `ProposalDraft`, `QueryPreservingRedirect`, and `App` modules
  each return HTTP 200. The application smoke screenshot shows the working
  sign-in page. Signed-in browser interaction was not performed; the changed
  editor/redirect behavior is verified by rendered React tests and actual
  route/storage integration tests, not by that unauthenticated screenshot.
- Development-only existing integration suites replay their previously merged,
  idempotent prerequisite migrations as part of their established setup; no new
  migration was authored. Production was not queried or migrated.

No functional scope was deferred or expanded. Shared-document redesign remains
the separately planned Slice 4.4; schema removal requires its own later review.
