# SC3 — Customer Contracted Services PDF

Verified November 13, 2026, in development only.

## Preflight and ownership

Read the complete attached SC3 brief, November 13 owner overrides, Five Parks
PDF (including its rendered page), `replit.md`, ownership map, document standards,
SC2.2 report and CC-ATTN handoff. Inspected the actual integrated fulfillment,
loader, demand, calendar replacement, contract-detail/season selection and shared
Chromium/pagination/stamping paths before editing.

SC2.2's standard package and deadline-owned seasons are integrated.
`customerServiceFulfillment(data, customerId, termId)` already makes explicit
season views bounded; only its default view carries renewal-pending demand.
CC-ATTN's contract page uses season hashes and the viewed term independently of
the agreement's currently effective season. These existing interfaces are reused.
No repository specification pack was required or created.

The new pure projection calls that fulfillment function with an explicit term.
Scope, calendar and term rates enrich presentation only. No entitlement table,
count fallback, stored PDF owner, rate-card lookup, demand allocation, Routes
behavior, billing automation or generation behavior was added.

## Reviewable PDFs

These files are intentionally ignored, not committed binaries. Copies were also
delivered as reviewable asset cards in the task conversation.

- [Five Parks initial fixture](../../../generated-artifacts/SC3/five-parks-fixture.pdf)
  — **1 Letter page**, 13 actual supported services, all completions blank.
- [Five Parks completed example](../../../generated-artifacts/SC3/completed-fixture.pdf)
  — **1 Letter page**, Jun 12, 2026 beside **Second application** only; third
  application **Skipped**. PDF text coordinates put the completion and its label
  on the same baseline (less than one point difference).
- [High Plains-form development contract](../../../generated-artifacts/SC3/high-plains-form.pdf)
  — **1 Letter page**.
- [Management-company-form development contract](../../../generated-artifacts/SC3/management-company-form.pdf)
  — **1 Letter page**, with management company shown.
- [Long-contract pagination fixture](../../../generated-artifacts/SC3/long-contract.pdf)
  — **4 Letter pages**; Service/Included/When/Completed headers repeat, with the
  season short header and counted footer on subsequent pages.
- [Initial fixture image](../../../generated-artifacts/SC3/five-parks-fixture.png).
- [Completed fixture image](../../../generated-artifacts/SC3/completed-fixture.png).

The form examples are clearly named **development examples**, not claims about
real signed customer obligations. The checkout initially had one agreement and
no populated company calendar. To produce meaningful form examples without
altering it, the integration test created a disposable company, two properties,
one `ours` and one `theirs` signed season, and their calendar inside one
transaction. It loaded them through the actual fulfillment loader, rendered both
PDFs, rolled the transaction back, and confirmed the company no longer existed.
No Generate or reconciliation was needed for these documents.

## Approved reference differences

- The sample-only bed/hard-surface weed-control row is absent. No catalog key or
  service obligation was invented. The summary is derived from the actual
  document rows: **13**, not the reference's fixed 14.
- **Completed** replaces the sample's Agreement column. There are no agreement
  clause codes, internal calendar names, campaigns, CRM terms or “round” text in
  the rendered fixture.
- Catalog order governs the rows (including winter visits before irrigation);
  this can differ from the sample's manual order.
- The shared document kit's actual logo, footer, short header and mountains are
  retained instead of replacing the shared system with the sample's decoration.
- Under the owner's override, the no-count irrigation inspection prints
  **Monthly** in both Included and When. No-count routes are valid, not blocked.
  A digit-containing pattern cannot supply a count or frequency; without a
  spread or safe nondigit pattern, both fields say **As scheduled**.
- No-count completion is **N done**, never an invented denominator. Counted
  routes show **N of owed done** only after positive completion.
- The boundary note is derived, not copied. For the November–October fixture,
  irrigation winterization opens Oct 1 and is due Nov 30, so it qualifies.
  Fall clean-ups open in November, after Oct 31, and do **not** qualify under
  SC3's explicit opening-window rule. Blank customer labels use the customer-safe
  service wording in this note, never an internal name. Singular grammar is used
  for its single qualifying service.
- The explicit Jan–Dec acceptance case suppresses an off-calendar-season note,
  including a cross-New-Year ornamental-grass window; it does not alter owed
  rounds, dates or the shared deadline rule.

## Migration and calendar labels

The next unused migration number was **0087**. Existing 0080/0086 duplicate
prefixes and every historical migration filename were left unchanged.
`0087_service_calendar_customer_label.sql` adds exactly one nullable text column.
Backfill is restricted to `customer_label IS NULL`, `kind = 'round'`, and exact
service-key/name pairs:

| Service | Exact internal name | Customer label |
|---|---|---|
| cleanups | Spring clean-up | Spring clean-up |
| cleanups | Fall leaf clean-up 1 | Fall leaf clean-up |
| cleanups | Fall leaf clean-up 2 | Final fall clean-up |
| shrub_trimming | Spring shrub trim | Early summer trim |
| shrub_trimming | Fall shrub trim | Fall trim |
| fertilization | Pre-emergent / spring fertilizer | Spring pre-emergent |
| fertilization | Summer fertilizer | Summer |
| fertilization | Fall fertilizer | Fall |
| broadleaf | Broadleaf 1 | First application |
| broadleaf | Broadleaf 2 | Second application |
| broadleaf | Broadleaf 3 | Third application |
| native_areas | Spring full native mow | Spring full mow |
| native_areas | Fall full native mow | Fall full mow |

The development migration runner ran twice: first **1 applied**, second
**0 applied**. It reported an inherited checksum warning for
`0074_campaign_service_timing.sql`; that historical file was neither edited nor
reapplied. The real development calendar had **0 rows before and after**:
**0 labelled**, **0 left null**. No company calendar was loaded persistently.

The direct double-execution test uses a session-local temporary shadow table:
all **13** exact-match rows receive the expected labels; a renamed round and
matching-name recurring/checklist rows remain null (**3** null rows); an existing
customer label remains unchanged (**1** preserved row). Both executions return
identical results. This is separate from the real calendar population above.
[Exact backfill evidence](../../../generated-artifacts/SC3/migration-evidence.json).

Both schema declarations, browser-safe replacement validator, calendar DTO,
starting calendar, OpenAPI contract and regenerated clients/validators carry
`customerLabel`. Validation permits optional/null labels, caps them at 60
characters, and normalizes empty/whitespace input to null. Settings round rows
include Customer name after the internal name, with the requested placeholder.
Save/Discard, stable IDs, per-kind positions and the existing lock/write
semantics are retained.

## Projection, access and UI checks

- Round projections include nullable customer label and Colorado-local completion
  day from campaign-item completion time. Existing Services rendering ignores
  these additions. Existing demand/count/deadline and loader regressions pass.
- Round/checklist blockers: `no_count`, `needs_rounds`, `invalid_count`,
  `duplicate_lines`. Route blockers: only `invalid_count`, `duplicate_lines`.
  Every issue flag is inspected before zero filtering, so a different display
  status or erroneous zero cannot mask a blocker. Null owed is not zero.
- Tests exercise the entire matrix at HTTP level, including constructed
  checklist/route combinations that normal allocation may not produce.
  Blocked services return safe wording and 409 `SCOPE_NEEDS_REVIEW`; renderer is
  not invoked. Valid no-count routes render.
- Spread grouping matches **Weekly May – Sep 2026; twice a month in Apr and Oct**.
  Winter spread follows Nov 2025–Mar 2026 rather than host-local month order.
  Counted route fallback uses the recurring window, never its numeric pattern.
- Owed-zero/excluded and unsupported pool/other rows are absent. Eligible
  scheduling-none pond scope prints Per your agreement with blank When.
  Included snow event lines collapse to one row, with triggers or joined area
  labels. No event lines means no snow-only action.
- Customer names/descriptions/units have one wording constant. Single round/
  checklist count prints 1. Single-visit labels are omitted; multi-visit blank
  labels never fall back to internal names.
- Per-visit date/label and completion are in one nested row grid, so wrapped
  customer labels cannot shift later completion rows. Dates are nowrap, labels
  muted; the shared measured pagination helper keeps service rows together and
  repeats table headers.
- Billed separately and On request sections require included scope metadata.
  Stated rates are selected only from that exact term, in stored order; numeric
  price, price text, unit and minimum remain independently visible. Empty
  sections are omitted; rate-card values are never read or rewritten.
- Commercial privacy matches the existing contract summary: **admin/office**
  receive populated commercial sections. Other authorized Services readers get
  the service schedule without any Billed separately, On request or stated-rate
  section. Their requests do not query term rates. The pure projection defaults
  to service-only even when its supplied data already contains prices.
  Direct-download tests populate scope price cents, billing text, on-request
  pricing and term rates for every reader role; none reaches a non-commercial
  reader's renderer input. Both commercial roles retain the exact stated prices.
- PDF requires a term available to that customer; arbitrary/unavailable terms
  return 404. Existing reader roles, authentication, company-header conflict,
  company-scoped loader and private/no-store behavior are retained. Direct empty
  parent documents are rejected; the parent entry point offers child properties.
- `download=1` gives attachment disposition; default is inline. Filenames remove
  unsafe control/path/quote characters and include customer and season.
  `DocumentRendererUnavailable` returns 503 without a legacy count fallback.
- Customer Services passes its selected term, not a new default. Contract header
  passes its viewed term. Both use initiating-company headers and reserve their
  PDF tab before awaiting a response. Structured failures close the blank tab and
  show the inline **Fix the scope first** contract-season/scope link. Parent
  properties appear in a small menu. New UI labels have English/Spanish entries;
  customer-document wording stays English.

## Commands and outcomes

Evidence logs are under ignored `generated-artifacts/SC3/`.

1. `pnpm --filter @workspace/api-spec run codegen` and
   `pnpm run typecheck:libs` — generated outputs refreshed; library build passes.
   The new parameter names follow the existing explicit api-zod barrel
   disambiguation convention.
2. `pnpm --filter @workspace/scripts run migrate` twice — successful, as above.
3. API SC3 suites:
   `src/services/contractedServicesDocument.test.ts`,
   `src/routes/contractedServices.test.ts`,
   `src/services/documents/contractedServices.render.test.ts`,
   `src/services/contractedServices.integration.test.ts`
   — **44 tests passed**. Real Chromium renders, not mocked PDF bytes, supply
   the one-page, pagination and completion-coordinate evidence.
4. `src/routes/serviceCalendar.integration.test.ts` — **12 tests passed across
   the final run and targeted timeout rerun**. Its inherited transition assertion
   was still expecting pre-SC2.2 package totals; it now measures its explicitly
   tested services and owed members, preserving implicit package and omission-only
   preview rows. Its final slow reconcile test exceeded Vitest's default 5-second
   limit; unchanged-source rerun with `--testTimeout=30000` passed in 5.50 seconds.
   See `api-final.log` and `calendar-timing-final.log`; the timeout is not hidden
   as an all-green original run.
5. Existing API regressions:
   `src/lib/customerServiceFulfillment.test.ts`,
   `src/routes/customerServices.test.ts`,
   `src/services/serviceCalendar.test.ts`,
   `src/lib/customerServiceFulfillmentLoader.test.ts` — passed in the combined
   API regression run. The only failure there was the older calendar transition
   assertion corrected above.
6. CRM:
   `src/pages/ServiceCalendar.rendered.test.tsx`,
   `src/components/contracts/ContractedServicesPdfButton.test.tsx`,
   `src/components/customer/pages/ServicesPage.cp2.test.tsx`,
   `src/pages/ContractScope.rendered.test.tsx`
   — **49 tests passed** (`crm-final.log`), including both parent page prop paths,
   selected-season/company requests, child menu, error note, label Save/Discard,
   stable identity payloads and inherited Services behavior.
7. `pnpm --filter @workspace/scripts exec tsx src/compare-rfp-typecheck-baseline.ts`
   — **zero added diagnostics**; baseline/current API **696/696**, CRM
   **214/214**. Full leaf checks retain inherited errors; this is not a claim
   that the full project typecheck is clean.
8. `git diff --check` — passes. Managed API and CRM restarted. Proxy checks:
   `/api/healthz` **200**, signed-out PDF **401**, Vite-transformed new button
   module **200**. The unauthenticated screenshot capture timed out; changed
   entry points are covered by rendered component tests, not a claimed signed-in
   browser run.
9. Workflow schema/required-extension checks passed. Startup still logs inherited
   QuickBooks fixture token warnings and existing Browserslist/PostCSS warnings;
   no SC3 startup exception was observed. Production logs exposed by the generic
   log viewer were not used as permission to diagnose or modify production.

### Completion-check privacy correction

The completion check identified that the initial PDF path had incorrectly treated
all Services readers as commercial readers. Corrected before completion by sharing
the contract summary's admin/office policy, skipping the rates query for all other
roles, and adding a fail-closed commercial-access option to the pure model.
The additional nine-role route matrix plus the default-access model regression
cover populated prices, not only empty fixtures. See
`generated-artifacts/SC3/commercial-access-tests.log` for the focused verification.
The focused model/route/Services regression run passed **66 tests**; the
post-correction typecheck comparison still has **zero added diagnostics**.
The API's first post-correction restart exceeded the default startup wait while
running inherited company-wide boot backfills over existing test companies;
the same managed workflow started successfully with a longer 600-second wait.
Health returned 200 and the signed-out PDF returned 401 afterward. No startup,
port or database-data change was made to work around that delay.
The service counts, dates, labels and all previously rendered fixture content
are unchanged by this authorization correction.

All commands used `--maxWorkers=1 --no-file-parallelism` for Vitest.
No production query, Generate, calendar load, data/schema write, publication,
deployment configuration change or new document storage occurred.
