# Contract widget view verification

## Scope and prerequisite

The merged CC2-13 implementation was present before this work. Its
`SeasonDocuments` own/covered rows, explicit coverage updates, preview dialog,
downloads, uploads and server-provided season `editable` flag are retained.
Customer Contracts and RFP Contracts implementation files are unchanged. There
are no API, schema, migration, endpoint or payload-contract changes.

The authoritative CC2-14 attachment was read in full. A search of the existing
mockup artifact did not find the approved “Contract Page Widgets” reference.
The implementation therefore follows the attachment's specified layout using
existing app components and theme tokens.

## Changed files

- `artifacts/highplains-crm/src/pages/ContractPage.tsx`: six-panel composition,
  season/header/tiles, independent editing, scoped saves and transition guards.
- `artifacts/highplains-crm/src/components/contracts/ContractWidgets.tsx`: panel
  shells, compact billing/details/scope/rates/history views and display helpers.
- `artifacts/highplains-crm/src/components/contracts/ScopeEditor.tsx`: optional
  `hideSnowTriggers`; the contract page edits triggers in Details so Scope saves
  remain scope-only. Other callers keep their existing behavior.
- `artifacts/highplains-crm/src/pages/ContractWidgets.rendered.test.tsx`: widget,
  season/hash, documents, scoped-save, validation and unsaved-transition coverage.
- `artifacts/highplains-crm/src/pages/ContractBilling.rendered.test.tsx`: migrated
  global-edit/tab interactions to panel editing.
- `artifacts/highplains-crm/src/pages/ContractCenter.rendered.test.tsx`: migrated
  global Edit assertions to panel Edit controls.
- `artifacts/highplains-crm/package.json`: includes the new rendered suite in
  `test:contract-center`; no dependencies changed.
- `docs/cc2-14-verification.md`: this report.
- `.agents/memory/contract-center-phase-boundaries.md`: the user-specified
  distinction between billing-cycle order and fixed calendar service timing.

## Migrated tab/global-editor tests

`ContractBilling.rendered.test.tsx` no longer clicks `tab-billing` or
`tab-documents`. Billing tests open `button-edit-billing`; document tests inspect
the already-visible `panel-documents`. The four redundant global Done save
permutations were retired; the four Snow remove/rename validation permutations
now use the Billing panel's single Save. Valid flat-price derivation still uses
the existing `button-save-payments`.

`ContractCenter.rendered.test.tsx` checks each of Billing, Details, Scope and
Rates for server-controlled Edit visibility rather than the removed global Edit.
The similarly named IDs in Customer Contracts and Settings tests refer to other
pages and were intentionally left unchanged.

## Test-ID changes

Removed:

- `tab-scope`, `tab-rates`, `tab-billing`, `tab-documents`, `tab-history` triggers.
- `button-edit-contract`, `button-done`, `button-cancel-edit` global controls.
- `table-schedule` (replaced by compact billing bars).
- Page-level `error-save-{validation,fields,scope,payments,rates,snowprice}`:
  failures are now inside the active panel as `error-panel-{panel}`.

New:

- `panel-{billing,documents,details,scope,rates,history}`, `grid-panels`,
  `text-panel-meta-{panel}`.
- `button-edit-{billing,details,scope,rates}`,
  `button-cancel-{billing,details,scope,rates}`, `button-save-details`,
  `button-save-and-continue`, `error-panel-{billing,details,scope,rates}`.
- `breadcrumb`, `link-breadcrumb-contracts`, `text-coverage-context`,
  `text-term-status-words-{termId}`.
- `tiles-at-a-glance`, `tile-{annual-price,monthly,season-ends,signed,snow}`,
  `text-tile-{tile}`, `text-tile-{tile}-sub`.
- `strip-billing-months`, `bar-billing-{0..11}`, `text-billing-summary`,
  `form-billing`.
- `list-contract-details`, `text-detail-{seasonLabel,startDate,endDate,legalName,
  managingAgentName,projectContact,contactPhone,contactEmail,projectAddress,po,
  snowTriggers,notes}`, `input-field-snowTriggers`.
- `table-scope-summary`, `button-scope-show-all`, `empty-scope`.
- `list-rates-diff`, `rate-diff-{rateKey}`, `text-rate-card-{rateKey}`,
  `button-rates-show-all`, `empty-rates-diff`.
- `button-history-see-all`, `empty-history`.

Preserved with changed placement:

- `button-save-payments`, `button-save-scope`, `button-save-rates` now save/close
  their own panel.
- `text-annual-price`, `text-monthly` now appear in tiles; `text-season` is
  retained as hidden selected-season metadata.
- `tab-billing-body` and `tab-documents-body` remain compatibility IDs on ordinary
  content containers, **not** tabs or tab-content components.
- `text-snow-billing` now uses the requested per-event wording for snow-only T&M.
- `scope-row-{serviceKey}` now identifies compact summary rows when not editing.
- All status, renewal, season-card, review, upload, document coverage, source
  navigation, View, Download, history-row, existing editor-input, and discard /
  keep-editing IDs remain available in their appropriate states.
- `input-snow-triggers` remains unchanged for other ScopeEditor callers; on this
  page its field is instead `input-field-snowTriggers` in Contract details.

## Automated results

- Before edits: `pnpm --filter @workspace/highplains-crm run test:contract-center`
  passed: 12 files, 113 tests.
- After edits: the same command passed: 13 files, 130 tests.
- Preserved surfaces: targeted `SeasonDocuments.rendered.test.tsx`,
  `RfpContracts.rendered.test.tsx`, `CustomerContracts.rendered.test.tsx` passed:
  3 files, 31 tests.
- Shared declaration prerequisite `pnpm run typecheck:libs` passed.
- Client `pnpm --filter @workspace/highplains-crm run typecheck` has 221 existing
  TypeScript diagnostics. Its post-change output matches the recorded baseline
  byte-for-byte; there are **no new diagnostics**. The unchanged baseline
  includes `SeasonDocuments`' unsupported `variant="link"` and unrelated app
  errors. No unrelated type/dependency repairs were made.
- `git diff --check` passed.
- Development web and API workflows start successfully. The initial unauthenticated
  390px screenshot renders the sign-in page, so signed-in verification uses the
  browser tester rather than treating that screenshot as contract-page evidence.
- Local baseline/check output is in ignored `generated-artifacts/cc2-14/`.

## Browser verification

The signed-in development pass used disposable isolated company/admin/customer/
agreement fixtures. Both fixtures were cleaned up; final counts were zero for
their company, user, membership, customer, agreement, seasons, active card items,
rates, scope, payments, documents and history. No real customer agreement was
mutated, no real password was reset, and production data was not accessed.

- Rates-only editing sent exactly one `PUT .../rates`. The edited price survived
  reload, history recorded the fixture administrator, and scope/payment rows
  were unchanged.
- The initial fixture omitted active company rate-card items, causing the
  unchanged server to interpret unmatched keys as custom rates. The tester's
  initial apparent card-metadata regression was corrected as a fixture error.
  Continuing the same tester with matching active company card items confirmed
  that both card-price snapshots and the two-difference summary survive saving.
  No API/payload workaround was introduced.
- Details → Billing dirty transitions showed Save / Discard / Keep editing.
  Keep editing retained the PO draft; Save persisted it and opened Billing;
  Discard did not persist a separate draft or carry it into Billing. Clean Cancel
  closed Billing without another write.
- Dirty Billing → another season prompted; explicit discard switched all panels
  and the hash while leaving the original season's stored amount unchanged.
  Returning restored the original season's billing/scope/rate summaries.
- The past renewed season showed “Past season, read only” with no panel Edit.
  The future signed season updated its dates/prices/status/hash correctly.
- Dirty customer-link navigation and Renew were both guarded. Keep editing
  preserved drafts; no renewal term was created by opening the guard.
- Both existing light and dark modes were inspected. At **390×844**, document
  scroll width and client width were both **390** in both themes; tiles and all
  six panels formed one column. Season cards and the scope table can scroll
  inside their own containers without overflowing the page.
- At **1600×900**, the panel grid had three 411px columns in two rows; document
  width remained 1600. The narrower desktop view showed two columns.
- Screenshots of the light desktop, dark desktop and light phone layouts were
  inspected. A tester noted possible clipped text in the existing mobile drawer
  while open; this was not confirmed as persistent and the unobstructed contract
  page passed the measured overflow checks. Navigation/drawer changes are out of
  scope.
- Covered-document View/Download and coverage editing were verified by rendered
  regression tests, not by uploading external files during the browser pass.

### Unavailable reference/data

Summerfield North does not exist in the development database, so its exact
two-season acceptance walkthrough was unavailable. Current/future/past seasons
were instead exercised using isolated fixtures, with no production-data lookup
or modification. The approved mockup was also absent as noted above. These are
reference/data limitations, not unimplemented widget behaviors.
