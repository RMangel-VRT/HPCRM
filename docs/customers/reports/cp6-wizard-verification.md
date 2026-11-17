# CP6 — New Customer wizard fixes

This report covers the New Customer wizard brief, not Contract Services CP6.
Verified against the checked-out CQ7 editor, CP1–CP5 customer-page code and
their existing verification reports. No predecessor was rebuilt.

## Delivered

- Property now supplies the existing shared `ManagementFields` slot using the
  wizard's existing company-scoped company and manager queries. The shared
  company-change handler still clears the previous manager. Contact snapshot
  behavior and the create request contract are unchanged.
- Billing no longer mounts management pickers. Management billing reads the
  Property selection for the existing c/o preview, or displays a localized
  instruction to select a company on Property. The editor uses “Property
  section”; the wizard uses “Property step.” Editor controls and saves were
  not moved or changed.
- Added the exact English/Spanish street and city examples; ZIP example is
  `80602`. Extras is “Size and complexity” / “Tamaño y complejidad.”
- Searched TS/TSX callers for `customerWizard.property.snow` and
  `property.snow`: no readers. Removed only that obsolete locale entry.
- Existing `customerPages.groups.money` is “Sales & money” / “Ventas y dinero.”
  Page definitions, permissions, grouping and destinations are unchanged.
- No model, server behavior, ownership, schema, migration, mobile, QuickBooks
  synchronization, live QuickBooks write, production data or publishing changes.

## Coverage and safety

Rendered wizard tests select management on Property, retain property-address
billing through submission, check both IDs in the actual submitted envelope,
verify the scoped manager request, and preserve the one-manager contact preview
without a duplicate manual contact. Changing company clears the manager.

English/Spanish rendered guards walk all five steps with English fallback
disabled and check visible text plus every placeholder, accessible label and
title attribute for raw translation keys. They assert exact address examples,
ZIP, heading, localized empty management guidance, Property-driven c/o preview,
absence of duplicate billing pickers, and the custom-address variant. Rail
tests assert both localized group labels and the unchanged three destinations.
The CQ7 editor test additionally checks the empty prompt after company clear
and that only its original Property picker remains.

The PostgreSQL integration test POSTs a synthetic prospect with property billing
and both selected IDs. It checks the response, a direct scoped storage reread,
and setup GET; all retain both IDs. Exactly one linked manager contact is
persisted. Remote QuickBooks and geocoding calls are mocked; no QuickBooks
request is made. Existing unique-company fixture cleanup removes its rows.

## Verification

Artifact-local launchers were used, serialized with
`--maxWorkers=1 --no-file-parallelism`. Raw evidence is ignored under
`generated-artifacts/cp6-wizard/`.

| Check | Before | After |
|---|---|---|
| Customer frontend sweep, 20 files | 260 passed, 2 failed | 265 passed, same 2 failed |
| Setup/billing/CP1 API sweep, 5 files | 80 passed | 80 existing cases passed; new case initially expected HTTP 201 instead of existing 200 |
| Corrected setup API file | 29 existing cases | 30 passed, including persisted management IDs |
| Additional frontend predecessors, 8 files | Existing code | 67 passed |
| Additional API predecessors, 17 files | Failed files reproduced from unchanged source | 170 passed, 3 existing failures |
| Shared library declarations | Pass | No library source changes |
| CRM typecheck | 186 diagnostics | 186, identical file/code/messages ignoring insertion offsets |
| API typecheck | 694 diagnostics | 694, identical file/code/messages ignoring insertion offsets |
| Whitespace check | — | `git diff --check` passed |

The complete frontend sweep command, from `artifacts/highplains-crm`:

```sh
./node_modules/.bin/vitest run --config vitest.config.ts \
  src/components/customer src/pages/CustomerDetail \
  src/pages/CustomerSetupWizard.rendered.test.tsx \
  src/pages/CustomerEdit.rendered.test.tsx src/components/customerWizard \
  --maxWorkers=1 --no-file-parallelism
```

The extra frontend sweep covers `src/pages/CustomersList`,
`src/components/qbo/QboCustomerCard.rendered.test.tsx`,
`src/components/CustomerLocationEditor.cp2.test.tsx`,
`src/pages/CustomerEdit.access.test.tsx`, and
`src/lib/{customerServices,recentCustomers,contractSummaryInvalidation}.test.ts`.

The five-file API sweep covers
`src/services/{customerSetup.integration,customerBilling}.test.ts`,
`src/lib/{customerContractSummary,customerContractSummary.integration}.test.ts`
and `src/routes/customerSnowWrite.test.ts`. After correcting the test-only
HTTP expectation, reran the changed setup suite: all 30 pass; the other four
files' passing results remain valid.

Additional API coverage includes CP2 routes, CP3 dashboard, CP4 communications,
list-summary and note-pin routes/services/integrations, CP5 document
routes/services/content/object/raw-access/contracts/integration, billing routes,
and QBO customer reads. See `api-predecessors.log` for the exact file inventory.

### Existing failures, not claimed as passes

- `CustomerDetail.cp3.rendered.test.tsx`: services KPI/attention test expects
  `chip-attention-serviceSetup`. Same failure before and after.
- `cp4.acceptance.rendered.test.tsx`: localized service date/keyboard test expects
  `text-round-window-s1-2026-04-01-1`. Same failure before and after.
- `customerListBatch.cp4.test.ts`: two fixed query-count expectations still
  expect 11/6 reads, but current code makes 13/8.
- `customerListSummary.cp4.integration.test.ts`: expected parent annual amount
  300000, received null.

The last three API failures were separately reproduced using the starting
revision's API source and artifact-local dependency launcher. Shared libraries
are unchanged. Initial archive harness attempts lacked the root/referenced
TypeScript configs; only the final run with those dependencies available is
baseline evidence (`api-predecessors-baseline.log`).

## Preview and limitations

Restarted the CRM workflow once after implementation. Vite started successfully
with existing Browserslist/PostCSS notices. The wizard and changed shared
sections' transformed modules return HTTP 200 through the preview proxy, with
no JSX transformation error. Schema/required-extension workflow reported in sync.
API workflow logs contain existing synthetic-connection QBO token warnings;
those unrelated records/settings were not changed.

The stateless screenshot attempt timed out. No signed-in browser journey or
visual screenshot success is claimed. Rendered interaction tests and the
real PostgreSQL setup HTTP test provide the changed-flow verification; no
browser test account or real customer was modified.

## Changed files

- CRM `src/pages/CustomerSetupWizard.tsx`
- CRM `src/components/customerWizard/sections/{BillingSection,PropertySection}.tsx`
- CRM `src/i18n/locales/{en,es}.ts`
- CRM `src/pages/{CustomerSetupWizard,CustomerEdit}.rendered.test.tsx`
- CRM `src/components/customer/CustomerSubNav.test.tsx`
- API `src/services/customerSetup.integration.test.ts`
- This verification report and the existing test-runner memory guidance.
