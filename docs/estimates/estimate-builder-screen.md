# Estimate builder screen

## One-page builder (E3)

The estimate detail page drops its Estimates section rail; the builder list,
board, catalogs and settings keep theirs. **All estimates** returns to the
builder list. The page is capped at 1,400px. A native container query puts a
288px sticky review rail beside the editor at 860px of usable builder width
and stacks it below the editor at smaller widths.

- The identity card contains Preview PDF, Download PDF, and the existing
  lifecycle and overflow actions. Customer, ticket, work location, total
  and sent information appear together. Rates, created and acceptance details
  remain in a secondary row. The work-location popover reuses W1's fields,
  permissions, owner selection, property fallback, and cache invalidation.
- Scope, sections, line editing and Add section stay in the main column.
  There is an insertion point after them for E4; no photo or plant-table
  controls ship in E3.
- The review rail shows totals and draft pricing gaps, a read-only PDF
  checklist with a rough page estimate, internal costs/margin with a collapsed
  QuickBooks breakdown, and all versions. Version rows still open the
  read-only history when appropriate. Each row's **PDF** action instead
  previews that version without navigating the editor.
- The direct download waits for queued edits, uses the viewed version's
  company-scoped `GET …/pdf?download=1`, and never marks it sent. Historical
  standalone PDFs are labeled as regenerated; W1 location and other live
  display inputs may differ from what the customer originally saw. Mark as
  Sent records a date and method, but not a recipient or PDF attachment.
  Stored proposal PDFs remain separate.

See the [E3 verification report](reports/e3-one-page-builder.md).

## Faster line editing (E2)

- Drag with a handle to reorder sections or move lines within and between
  sections. For keyboard sorting, focus a handle, press Space or Enter to
  pick up, use the arrow keys, then press Space or Enter to drop. Escape
  cancels. A drop sends one complete order, including empty sections.
- Open the item name to look for a replacement, with its current catalog
  type shown first. When the line had a manual rate, the swap keeps it and
  offers **Use catalog price** in the confirmation. Resetting the rate leaves
  the customer description, plant-table choices and other line details intact.
  The row menu also has duplicate, move, reset (when applicable), and remove.
- Edit descriptions beneath item names. Quantity, rate and description
  commit with Enter or blur; missing rates and amounts are marked **Needs
  price**. One search per section adds eligible items at quantity 1 and
  selects the saved Qty field. More detailed and custom entries use the
  existing forms.
- Draft line edits update the cached detail and totals immediately. A scoped
  queue reconciles each response with later edits and rolls back failures.
  The first edit of a sent or declined version still uses E1 confirmation
  and replays against the new draft only.

See the [E2 verification report](reports/e2-faster-line-editing.md).
The earlier slice descriptions below document how the builder evolved.

The builder consumes the Slice 3.1 driver-free DTOs and strict input schemas.
The draft API and all captured snapshot/totals behavior remain unchanged.
Lifecycle actions belong to the following slice.

## Categorized services (Slice 4.6)

The Service add-line action appears between Labor and Equipment, with Sprout
and a distinct olive tint verified above 4.5:1 on white. Its picker uses the
existing explicit selection/Quantity/Add behavior, with active-category chips
and internal category detail. Inactive services or categories cannot supply a
new referenced line. Free-type remains available without a category.

Referenced service lines send `lineType: "service"` and `quickItemId`, capture
`quick_list` provenance and initially null detail. Free service entries use
`manual` provenance. Draft name/detail/unit/umbrella edits match equipment/fees;
locked/void protections are unchanged. Category edits/deactivation never
rewrite existing lines. Service units extend free-entry choices with `sq ft`,
`1,000 sq ft`, `lin ft`, `visit`; default free-service unit is `1,000 sq ft`.

Services Catalog lives directly above Equipment & Fees in the Estimates rail
at `/dashboard/estimates/catalogs/services`. Equipment & Fees deliberately keeps
its original two-kind filters/options even though the shared store has three.

See [the integration report](reports/services-catalog.md) for browser evidence.

## Version-owned scope of work

Migration `0077_estimate_scope_of_work.sql` adds nullable text to estimate versions.
Every detail envelope includes `version.scopeOfWork`; revisions copy their source.
`PATCH /api/estimates/:id/versions/:versionId` accepts only `{scopeOfWork:
string | null}`, up to 10,000 characters. Whitespace-only text becomes null;
other text is preserved verbatim. `{}` returns 400 `EMPTY_PATCH`; unknown/missing
fields and overlength return 400 `INVALID_REQUEST`. Normal estimate access,
expected-company guard, container-first mutation locking, draft-only
`VERSION_LOCKED` and existing `ESTIMATE_VOIDED` rules apply. Success returns
the normal authoritative detail envelope.

The Scope of work card appears before sections, even with zero sections. It uses
the section-card shell, FileText header/hint and a seven-row vertically resizable
textarea. Changed blur saves once with captured `X-Company-Id`, using the existing
identity/company/version response guards and newest-response cache installation.
Saves are serialized and newer local typing survives older responses. Quiet
Saving/Saved status and retained-text retry handle failures. Locked views show
read-only scope or localized “No scope of work.” All new strings are EN/ES.

## Rates preview read metadata

`GET /api/estimates/rates/preview?customerId=…` retains its existing `items`
unchanged and adds `governingContexts`, an array of:

```ts
{ line: string; termId: string | null; seasonLabel: string | null }
```

There is one context for each distinct service line represented by the active,
labor-relevant card rows. Selection uses the same `applies` and
`selectInEffectTerm` functions, and the same Colorado date, as price resolution.
A null term means no eligible governing term for that service line. An empty
array means no labor-relevant card rows, not evidence of a particular contract.
The season label comes from the selected term; it is never inferred from an ID.

This context is deliberately independent of each row's price source. A governing
term can exist while a missing exact key falls back to the rate card. Row source
badges continue to report that fallback accurately. Distinct service-line
contexts are presented separately, rather than choosing one row or implying
that a single season governs every service line.

This is backward-compatible read metadata only: no new endpoint, pricing
precedence, draft API, schema or snapshot changes.

## Plant picker read compatibility

The existing plant-library response previously omitted the catalog size-row
primary key, so it could not safely supply Slice 3.1's `plantCatalogItemId`.
Each `sizes[]` row now additionally exposes `id` and `isActive`. The optional
`activeOnly=true` filter allows active sizes with no current stock to appear
when combined with `inStockOnly=false`; existing stock-filter defaults remain
unchanged. The endpoint also honors an optional initiating `X-Company-Id`
header, rejecting a session-company mismatch before reading any data.
Neither variety keys nor product codes are substituted for size-row IDs.

## Verification

- Frontend: 149 tests pass across seven suites, including 29 builder/list/picker
  checks and the existing navigation, board, hardscape, irrigation, rates and
  quick-list settings checks. Tests cover all seven line types, reference-only
  payloads, free-entry umbrellas, exact edits, authoritative totals, section
  protection, ordering/moves, lock recovery, history, void, failed-save rollback,
  tenant/version switches, late responses, rates contexts and Spanish copy.
- Backend: 115 tests pass across rate resolver, estimate setup, estimate math
  and draft route suites, including three new governing-context tests.
- Forced shared declaration rebuild succeeds. Root `pnpm run typecheck` still
  fails with exactly 730 pre-existing API diagnostics; standalone CRM check
  still reports 221 pre-existing diagnostics. Before/after counts by file and
  diagnostic code are identical. No new diagnostic categories were introduced.
  Full logs are ignored under `generated-artifacts/builder-*.log`.
- API and CRM managed workflows restart successfully. The unauthenticated
  builder route correctly presents sign-in.
- A single real-browser save/reload test was attempted but blocked at sign-in:
  the documented development account was rejected with 401. No estimate data
  was created or modified by that test. Signed-in visual and live persistence
  verification therefore remain unverified; rendered tests use the real page
  components with mocked network responses and mock only the reused customer
  search component.

## Integration notes

Customer names are read from the existing customer endpoint. Linked ticket
number/status come from the existing ticket-details endpoint and its statuses
array, not guessed fields on the bare ticket. These queries carry the same
company/user/role scope and initiating company header as the estimate requests.

Version changes remount editing state, including any open picker. Mutations
install the complete returned document envelope after cancelling obsolete
detail reads, comparing server timestamps so an older response cannot replace
a newer payload. No totals are recomputed in the browser.

No lifecycle, native mobile, schema, dependency or new-artifact work was added.
The only additions to server reads are the metadata compatibility changes above.

## Slice 3.5 — frontend (header, add buttons, PDF preview, layout, picker)

### Ticket-style identity header: mirrored, not extracted
`TicketDetail.tsx` builds `header-ticket-identity` inline, with extra ticket-only badges such as waiting/needs-action, completed, and the edit button. Pulling a shared card out of it would change TicketDetail, so the builder **mirrors** it instead and TicketDetail is untouched. Primitives are in `components/estimates/EstimateIdentityHeader.tsx` (`IdentityHeaderCard`, `DocumentBadge`, `EstimateStatePill`, `MetadataStrip`, `MetadataCell`). They use the same tokens: `rounded-xl border border-t-4`, the hue top border, a hue border at 20%, an icon-chip badge at 38%, a pill with background 13%, text 80% and border 28%, and a `text-xl md:text-2xl font-semibold` title.
- Hue: `ticketHue({ typeKey: "estimate_request" })`. Icon: Calculator, the same as the Estimates nav.
- Pill states: draft is needs-action (`--ts-active`), sent is waiting (dashed), accepted and invoiced are done, and declined, superseded and void are muted.
- One deliberate difference: TicketDetail mixes the raw `var(--border)` / `var(--foreground)` HSL triplets into `color-mix`. The browser drops those declarations, so the ticket card falls back to the base border. The estimate card uses `hsl(var(--border))` so the hue tint actually shows. The ticket header's visual output is unchanged.
- Metadata comes from `EstimateDetailDto.display` when present (customer name and address, created-by, ticket shortId, title and status). When `display` is missing it falls back to the scoped customer and ticket reads, which are disabled while `display` supplies the data. The Rates cell keeps `distinctContexts`: one chip per context ("Contract · {season}" / "Rate Card").
- This slice originally put version tabs along the bottom of the card. E3 moves version navigation into the review rail and adds Download PDF; the lifecycle and company gates remain unchanged.

### Add-line buttons
`AddLineButtons.tsx` renders seven outlined `Button`s, `h-8` (32px). Each has a tinted icon chip using `LINE_TINT` and a `focus-visible` ring. They are hidden whenever the version is not editable.

### Container layout
`estimateBuilder.css` uses named native CSS container queries, not viewport breakpoints or a measured-width effect. E3 replaces this slice's former 984px split with the 860px threshold described above. E2 still controls the compact line layout by the sections column's own width.

### Pickers
In every picker type:
- A single click selects the row and focuses Quantity. It never adds.
- Enter or Add adds the selected row.
- Double-click adds immediately at the current quantity, and a synchronous ref guard makes it add exactly once.
- Hover no longer moves the selection.

### PDF preview
`PdfPreviewDialog.tsx` fetches `GET /api/estimates/:id/versions/:versionId/pdf` for the version being viewed, as a blob sent with the captured `X-Company-Id`. It shows the PDF in an iframe and offers Download (`{number}-v{n}.pdf`) and Open in new tab.
- Each fetch has an AbortController and an `alive` flag. The object URL is revoked on close, retry, version change and unmount. A company, user, role or version change remounts the builder, which closes the dialog and drops any in-flight blob.
- E1 removed the DRAFT mark. E3 identifies a regenerated historical PDF in the preview.

### Tests
`pages/EstimateBuilder.slice35.rendered.test.tsx` covers:
- Header: badge, every pill state, display-based cells with no fallback reads, the fallback path, linked and unlinked ticket, contract, rate-card and mixed rates, live and frozen totals, sent and accepted dates, created by, the change-order chip, and a historical version.
- Add buttons: role and order, focus, and hidden when read-only.
- Container construction and CSS thresholds; real-browser measurements at 1,041px and 1,600px are recorded in `estimate-builder-pdf.md`.
- PDF: scoped fetch, iframe, open and download, revoke on close and unmount, error and retry, a late response after close, company/user/role switch races, and a version switch.
- Pickers: in all six catalog/rate/quick-item types, click/arrow selection focuses Quantity, Enter adds, double-click adds exactly once, and Add line works. Custom/free-entry validation retains its existing tests.

`pages/EstimateBuilder.rendered.test.tsx` was updated for the new rates copy and the double-click picker semantics.
