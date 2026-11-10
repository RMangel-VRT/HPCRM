# CP4 customer layouts and customers list

## Scope and prerequisite baseline

Implementation follows the CP4 brief, customer-page slice pack, customer-pages review and interactive HTML reference, within the existing CRM shell and tokens. No canvas or native-mobile files were changed.

Before implementation, Git ancestry confirmed the integrated prerequisite chain: CQ1–CQ7, AM1 (`1e7ad924`), CP1 (`6f5f73e5`), CP2 (`c722db09`) and CP3 (`037507ab`, the starting revision). No predecessor feature was implemented as part of CP4.

Baseline behaviors preserved:

- Contacts' former **Email** action copied comma-separated contact emails; it did not compose mail. It is now **Copy all emails**, with clipboard success/failure feedback.
- Notes are shared company/customer notes. Existing writers reject the field role, not non-authors. Pinning follows that same boundary, including account-manager authorization. Parent note creation remains disallowed by the existing server policy; unavailable creation actions are hidden, without restricting editing of existing notes.
- List branch groups used to expand on initialization. They now start collapsed. Expansion does not clear eligible selection.
- Customer deletion was previously available inline in the list. Those controls, their mutation and their confirmation flow are removed; the delete API is unchanged.

## Delivered behavior

### Shared customer-page presentation

All eleven regular-customer pages and applicable parent pages use the rail-owned title translation through `SectionTitle`, with at most one primary title action. Shared empty states, content-shaped skeletons, card headers, width helpers, row interaction helpers and localized date formatting cover the page presentation. Contracts, Billing, Notes and Snow detail content is capped at 960px; other tables/lists fill the available width.

Cards use icons and sentence-case titles. Dates use the localized short-month/day/year form; relative dates remain in activity feeds only. The currency formatter preserves fractional amounts, omitting cents only for whole-dollar KPIs. The module-aware status mapping changes display labels/colors only, not stored states, ticket-type hues, filters or transitions.

Header creation actions are not duplicated as page-primary actions. Notes intentionally retains its title **Add note** exception. New contract is a permitted Contracts title action, not a duplicate header Add action.

### Contacts, Notes, Communications and Tickets

- Contacts is read-only: Name/Primary, Role/management-company provenance, multiple copyable emails and multiple phone numbers. Permitted editors use the consolidated editor's `#contacts` anchor.
- Notes show author/date, body, Edit and Pin/Unpin/Delete. The server owns pin timestamps and updates no other note facts when pinning. Ordering is pinned-first, newest pin, newest creation, descending ID for deterministic ties. Dashboard uses the newest pinned note, otherwise the newest note; note mutations invalidate the scoped notes and activity queries.
- Communications uses thread rows, count chips only for multiple messages, sender/first-line preview, right-aligned absolute dates and day grouping for larger lists. Search and direction/source chips use real communication fields. A logged item has no mailbox account, provider message ID, delivery provider or automation rule; server filtering happens before pagination. Existing mailbox narrowing, detail/thread access and logging permissions remain intact. Unsorted candidates remain in the collapsed bottom card.
- Tickets uses compact open and collapsed-completed tables, search/type/assignee filters, type hues, semantic status, assignee and age/done date. Parent tables include Branch. Internal IDs and the page New ticket action are absent.

### Customers list

- Title/count, primary Add customer and up to five company-scoped recent-history cards; no Detail/List toggle.
- Name/address/actual management-contact/AM1 search; status, manager, type, QuickBooks and archived filters.
- Compact rows with customer/type, city or branch count, management, resolved inherited account manager, status, This season, QuickBooks, open-ticket count and menu.
- Row Open/Edit/Archive and supported archived restoration remain permission-aware. Selection and bulk assignment retain AM1 eligibility and inheritance.
- Matching branches are discoverable even when their group started collapsed. Filtering precedes flattening; the flattened visible row list is paged at 50 rows. A page never silently truncates requested summary IDs.
- Loading commercial/count cells have skeletons; failed or omitted summaries show Unavailable, with a batch-level retry. The no-term em dash is not used to hide a failed request.
- The zero-selection bulk bar is hidden. Desktop filters have bounded widths, and fixed compact columns/16px text leading prevent manager/city wrapping from increasing row height. Narrow screens keep the wide table inside its horizontal-scroll container.

### Commercial ownership and batching

`GET /api/customers/list-summary?ids=…` is company-bound and limited to admin/office access, including AM1's projected access role. The displayed page issues one batch, not per-row summary requests.

It reuses CP1 Contract Center selection and CP3 aggregation: every priced in-effect term contributes, including separate landscape/snow agreements; snow T&M is indicated without inventing a monetary amount. A parent's own terms plus all underlying branches' owned terms are deduplicated by governing term ID. Collapsed/off-page branches contribute through the same batch; inherited terms are not allocated or counted twice.

The directory is still loaded in 200-record chunks for client-side filtering. This is not a per-row commercial query waterfall. Server-side directory filtering/paging is a separate scalability improvement, not a missing commercial batch.

## Migration and authorization

- Additive migration: `.migration-backup/migrations/0071_customer_note_pins.sql`.
- Adds nullable `notes.pinned_at timestamp` with `IF NOT EXISTS`; existing rows remain unpinned.
- Authoritative and browser-compatible schemas expose the nullable read fact and exclude it from ordinary note insert input.
- `PATCH /api/notes/:id/pin` accepts only a boolean `pinned`, rejects field writers and stale company headers, scopes by note ID/company, and returns 404 for a foreign/nonexistent note.
- Pin/unpin cannot inject text, author, creation time or client timestamps.
- Migration was applied to development only. Required extensions and schema-drift checks pass. No startup DDL, production migration, production write or publication was performed.

## Field-role differences and delete inventory

The web field list intentionally remains a simpler customer/navigation list. It receives compact approximately 44px row styling while retaining its existing customer-detail, property/map and directions actions. It does not gain management, commercial, QuickBooks, assignment or administrative columns, filters or permissions. Its existing data-loading boundary is unchanged. Native mobile is untouched.

A repository search found **no remaining customer-delete UI entry point** in the CRM or native-mobile customer screens. In particular, CustomerEdit and the merged parent pages have none; CP4 does not add one. The existing `DELETE /api/customers/:id` API and underlying storage deletion remain available under their unchanged authorization rules. Unused legacy translation strings are not UI entry points.

## Automated verification

Use artifact-local Vitest launchers/configuration, not a root launcher that can resolve different Vite peers.

### Passing checks

- Shared library declaration/type build: `pnpm run typecheck:libs`.
- Seven new API/unit/PostgreSQL suites: **52 tests pass**:
  - `routes/customerCommunications.cp4.test.ts`
  - `routes/customerListSummary.cp4.test.ts`
  - `routes/customerNotePins.cp4.test.ts`
  - `services/customerListBatch.cp4.test.ts`
  - `services/customerListSummary.cp4.test.ts`
  - `services/customerListSummary.cp4.integration.test.ts`
  - `services/customerNotePins.cp4.integration.test.ts`
- CP1 projector, CP2 page routes and CP3 dashboard routes: **49 tests pass**, included in the focused API run.
- Additional CP1 contract-summary integration, AM1 migration/integration/roles/parity and CQ customer billing/setup/read regressions pass. The separate legacy QuickBooks harness exception is documented below.
- Final frontend focused run: **34 files / 323 tests pass**:
  `vitest run --config vitest.config.ts src/components/customer src/pages/CustomersList src/pages/CustomerDetail src/lib`.
  This includes CP1's raw-text guard, CP2/CP3 rendered suites, AM1 list selection, new layout/contacts/notes/thread/ticket/list tests, English/Spanish date formatting, currency preservation and final shared-card/keyboard/action regressions.
- Additional customer editor and QuickBooks card rendered suites pass. The four-file CP1/CQ7/editor/QuickBooks run reported **103 tests pass**; counts overlap the focused run above and should not be added together.
- After the density and company-bound note-request corrections, affected detail/shared/QuickBooks suites passed. The AM1/list follow-up reported **11 tests pass**, followed by **9 list tests pass**, including two populated 24-row/five-recent-card English/Spanish fixture cases. These assert one batch, no zero-selection bulk bar, fixed table layout and 44px row classes. Counts overlap earlier runs.
- Required `pg_trgm` extension and schema-drift checks pass.
- API production bundle and CRM production bundle build successfully. The standalone CRM build needs its managed runtime inputs, e.g. `PORT=23878 BASE_PATH=/ pnpm --filter @workspace/highplains-crm run build`; no deployment was performed.
- API health and transformed CRM modules return HTTP 200. Managed workflows start successfully.
- `git diff --check` passes.

### Coverage details

The new suites cover multiple priced in-effect terms; separate landscape and snow; priced plus T&M; T&M without fixed price; no-term display; parent own-plus-branch totals; inherited deduplication; CP3 parity; collapsed/off-page contributions; company isolation; role authorization; strict pin payloads; server-only pin timestamps; unchanged note body/author/creation; migration idempotence and null backfill behavior; deterministic ordering; actual SQL execution against PostgreSQL; fixed batch query count for 12 versus 150 rows; and one browser-side batch for the displayed page.

### Existing baseline failures, not reported as passing

Unchanged source was archived from the starting revision and checked using artifact-local runners:

- `routes/qbo.customers.test.ts`: **70 failures / 17 passes** on both unchanged and CP4 code. Legacy request fixtures omit the current projected access-role context, masking intended outcomes with forbidden responses.
- The unchanged full frontend baseline has **21 failing files / 174 failing tests**. The same 21 failing-file names appear in the broader CP4 run after excluding the intentionally updated, now-passing CP2/CP3 presentation assertions. They concern contracts harness expectations, estimates, scheduling, settings and global communications navigation, not the new focused CP4 suites.
- Whole-artifact TypeScript checks are not globally green: API **697** diagnostics, frontend **210**, matching their unchanged baselines. No new file/error-code categories were added by CP4; changed customer-page files were checked. Shared library typechecking passes.
- Existing development QBO fixture companies emit invalid-token warnings from background jobs. No real credentials, connections or business records were changed to suppress them.

Full-suite baseline failures are not waived or described as successful validation.

## Signed-in browser evidence and limitations

The documented demo account was absent from this development copy. Verification used an isolated temporary company with disposable lowercase accounts and local-only fixtures; existing customer records, account assignments, credentials and communications were not changed. Both fixture attempts were cleaned up by exact identifiers, with zero remaining fixture company/user/session rows.

The completed part of the browser pass confirmed:

- Parent initially collapsed; selecting, expanding and collapsing retained selection. No bulk assignment was saved.
- Name, address and account-manager search; status, manager, type, QuickBooks and archived filters returned the expected fixture subsets.
- Contacts showed Primary, multiple emails/phones and the editor anchor. Copy all emails put the correct comma-separated addresses on the clipboard and showed accurate success feedback.
- Creating one unique test note, pinning it, reloading, displaying it on Dashboard, unpinning and deleting only that test note all succeeded. API responses confirmed body, author and creation instant stayed unchanged on pin/unpin. The original fixture note remained.
- Communications showed the two-message thread/count and local logged item, with unsorted candidates collapsed. No communication was sent.

Representative browser screenshot IDs: selection `owct05`/`aktap5`, archived filter `76rtx2`, Contacts `q88ux0`/`j1omt5`, persisted pin `0zcg36`, Dashboard `w1p84k`, safe note cleanup `3y0qak`, Communications `f6n1na`.

### Density correction

The first populated browser measurement showed **10 full rows at 49px**, below the intended approximately twelve rows at 900px. That observation led to the final compact text leading, bounded desktop filters, fixed column widths and conditional bulk bar described above. Selection regressions pass after the change.

**The corrected row count was not measured in a browser.** A tester-side Playwright request-event callback error (`r.request is not a function`) broke page/context creation. A single focused retry for the density failure could not create a context and was stopped. No second whole-app pass was attempted.

Static HTML evidence can be generated from the actual rendered list component, synthetic records and app CSS with:

```sh
cd artifacts/highplains-crm
CP4_CAPTURE_LAYOUT=1 ./node_modules/.bin/vitest run --config vitest.config.ts src/pages/CustomersList.cp4.rendered.test.tsx
```

It writes ignored output under `generated-artifacts/cp4/`; it is not an application route or sign-in bypass. The English/light/expanded and Spanish/dark/collapsed rendered fixtures pass, including five recent cards and one summary request. Screenshot capture of those fixtures also timed out, so no post-fix screenshot or measured layout result is claimed.

### Remaining browser-only verification gaps

The interrupted pass did not complete ticket filter/navigation checks, parent-note and field-account UI checks, all-page navigation/translation scanning, or interactive English/Spanish/theme/sidebar/narrow variants. Component/API regressions and production builds cover their implemented behavior, but they are **not substitutes for claiming those end-to-end checks passed**. No publication or production migration should be inferred from this report.
