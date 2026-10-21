# N4 — Invoicing labels and safe status rename

## Scope and invariants

Implemented in the existing CRM and API Server, using the merged shell and section rails and the supplied N4 slice/shared rules. No DDL, schema migration, column/key changes, native-app or mobile-authentication changes, production writes, or publishing.

- `/dashboard/invoicing` renders the existing `BillingPage` behind the unchanged `canViewBilling` access predicate.
- `/dashboard/billing` redirects with the original query string, including encoded delimiters.
- The sidebar still uses `showBillingSidebar`, not route access. Its `billing` key, `nav-billing` test ID, badge population and Platform Admin branch are preserved.
- Billing-tagged office users still land at `BILLING_LANDING` (My Tickets → To invoice). They have no Invoicing sidebar link but retain direct Invoicing access.
- The Settings rail says **QuickBooks invoicing / Facturación de QuickBooks**; its tab/URL key remains `billing`.
- Dashboard queue labels/link destinations changed, not its key, aggregation, actions or populations.
- `/api/pending-invoices`, billing settings keys, page/component IDs, invoice creation/completion identities and charge populations remain unchanged.
- Ticket return navigation accepts both Billing and Invoicing origins under the existing restrictive query allowlist.
- Customer Financial → **Billing** (contracts) and RevenueOverview's billing-frequency **Billing** column were explicitly left unchanged.
- New/changed client copy is in both locale files. Status rows remain English. No existing Spanish status-name display map was found that needed an alias.

## Status update and workflow compatibility

`renameReadyForBillingStatusLabel()` is called directly from `registerRoutes()` immediately after `migrateTicketTypeRename()`, not from the unwired startup migration runner.

It checks `information_schema.columns` for `status_key` in the current schema, skips cleanly when absent, and executes only:

```sql
UPDATE ticket_type_statuses
SET name = 'Ready to invoice'
WHERE status_key = 'ready_for_billing'
  AND name = 'Ready for Billing';
```

The structured startup log includes `changedCount`. Custom names, differently cased names, unkeyed rows and rows with other keys are not changed.

All three seeded workflows—Estimate Request, Task and Project—seed **Ready to invoice**, find existing rows by stable status key and retain both old/new name-to-key aliases. Estimate Request and Project field associations resolve through key-indexed status IDs even when a company customizes the stored name. Their existing returned definition-name maps remain compatible. The legacy Project ordering map retains the old label and adds the new one.

TicketDetail's pending-invoice advancement guard uses the stable key for every type. Only unkeyed rows fall back to either exact legacy/new label. Invoice auto-creation similarly accepts both unkeyed aliases; a conflicting non-null key never falls back to a display label. Extra-billable generation already resolved its status by key and remains unchanged apart from the approved user-facing error wording.

Residual-name audit: retained old labels are limited to intentional compatibility aliases/fallbacks, the exact updater predicate, the retained ordering map, comments, logs and regression fixtures. No affected workflow guard remains dependent on the old label alone.

## Development-only before/after evidence

Captured the pre-update read-only status query before restarting the API. The real development startup reported **changedCount: 1**. A subsequent invocation of the same updater reported **0** changes.

| Development company | Type / stable status key | Before | After | Rows changed |
|---|---|---|---|---:|
| High Plains Property Maintenance (`effcea3b-b3c8-428a-96ff-d429c9f134db`) | `estimate_request` / `ready_for_billing` | 1 × Ready for Billing | 1 × Ready to invoice | **1** |
| High Plains Property Maintenance | Task / Project invoice-ready statuses | No matching rows | No matching rows | 0 |
| Contract Center Disposable QA (`cc43f78d-bd97-45f7-bde7-41b5b9581877`) | All types / `ready_for_billing` | No matching rows | No matching rows | 0 |
| **Total existing development data** | | **1 eligible old-label row** | **0 eligible old-label rows** | **1** |

The before query grouped every matching status by company/type/key/name. The after query included companies with zero matches. The zero-match company in the table is absent from the before result precisely because that result only contains matches.

Evidence in the ignored `generated-artifacts/n4/` directory:

- `dev-before.json`: pre-startup read-only counts.
- `dev-after.json`: post-startup company/status counts, captured before browser fixtures.
- `dev-startup.log`: actual route-registration startup with `changedCount: 1`.
- `dev-repeat.log`: subsequent actual updater invocation with `changedCount: 0`.
- `dev-cleanup-evidence.json`: zero disposable companies/users/tickets remaining and zero exact old keyed labels.
- `typecheck-comparison.json` and baseline/after logs: diagnostics and test evidence.

The documented demo admin was absent from this task fork. Browser verification therefore used a separate disposable development company, three temporary accounts (admin, office, billing-tagged office), a customer, and linked Estimate Request/Invoice tickets. These fixtures were created **after** the before/after evidence above, did not alter the existing companies, and were removed after verification. They are not counted as label-update changes. Database regression fixtures ran inside rolled-back transactions. **No production database query or write was used for this evidence.**

## Validation

Workspace declarations were refreshed **before edits** with `pnpm run typecheck:libs` (pass).

### Vitest

| Check | Pre-edit baseline | Finished result |
|---|---:|---:|
| API named billing/auto-create/dashboard/campaign suites | 4 files, 85 tests pass | Same 4 files, 89 tests pass |
| API, expanded with Task billing and real PostgreSQL label/seed tests | Not in original focused baseline | **6 files, 211 tests pass** |
| CRM billing/access/return/landing/handoff suites | 6 files, 30 tests pass | Same 6 files, 30 tests pass |
| CRM, expanded navigation/settings/contracts/TicketDetail checks | Not in original focused baseline | **14 files, 161 tests pass**, combined as described below |

The expanded CRM run passed 13 files (110 tests); an incorrectly placed newly added navigation test row failed. After correcting that test row, the affected `navConfig.test.ts` suite passed all 51 tests. The unchanged 13 passing suites plus that targeted rerun cover the final 14-file/161-test set; no browser rerun or unchanged-suite rerun was needed.

The API's final six-file run is recorded in `after-api-tests.log`. CRM expanded and targeted results are in `after-crm-tests.log` and `after-nav-tests.log`. The additional named ContractCenter board, CustomerContracts, Settings QBO and Settings navigation checks passed. Stable test IDs were preserved.

Regression coverage includes:

- Real PostgreSQL exact-name/key update, custom-name and case preservation, unrelated/unkeyed-row preservation, changed count and repeat zero.
- Missing-column guard skips without issuing UPDATE.
- Real PostgreSQL new-company seeding and repeated seeding for Estimate Request, Task and Project; no duplicate keys/statuses, custom label preservation, and correct recreated field associations.
- Renamed keyed Estimate Request pending-invoice advancement protection; Task/Project/custom-name variants; both unkeyed aliases; completed invoice and conflicting-key exceptions.
- Keyed Task invoice auto-creation at **Ready to invoice**, both unkeyed aliases and conflicting-key rejection.
- Query-preserving `/dashboard/billing?x=1&encoded=a%26b` redirect.
- Both safe ticket return destinations, all-role navigation matrix, original billing visibility/access separation and landing behavior.
- Updated named regression fixtures without changing charge, queue, campaign or completion behavior.

### Typechecks against refreshed baseline

| Package | Baseline diagnostics | After diagnostics | New | Removed |
|---|---:|---:|---:|---:|
| API Server | 735 | 735 | **0** | 0 |
| CRM | 221 | 221 | **0** | 0 |

Both leaf-package checks still exit 2 due to existing errors. Comparison normalizes line/column offsets and compares the complete diagnostic text as a multiset; it does not hide new error categories or locations. Existing categories include missing return paths (`TS7030`), untyped generic calls (`TS2347`), implicit-any parameters (`TS7006`) and existing type/property mismatches. This is not a claim of a clean typecheck.

Both managed development services restarted successfully after the implementation batch. API build/startup completed; no startup migration error was observed. Existing PostgreSQL SSL-mode and Vite/PostCSS warnings remain.

## Authenticated browser evidence

One development-only browser pass verified the changed journey and its role/language/theme variants, without completing invoices or contacting QuickBooks.

| Screenshot ID | Authenticated state / evidence |
|---|---|
| `cn24my` | Admin, desktop, English/light: Invoicing page, waiting charge, preserved legacy query; sidebar key/href/badge verified |
| `p085he` | Admin, desktop, English/light: Estimate Request at **Ready to invoice**, linked **Pending invoice**, advance button absent |
| `ktt6sa` | Admin, desktop: Settings rail **QuickBooks invoicing**, stable billing settings route |
| `agfv2g` | Admin, desktop, Spanish/dark: **Facturación** page and badge |
| `7anu32` | Admin, 390×844, Spanish/dark: Invoicing page |
| `6arnfa` | Admin, 390×844, Spanish/dark: open sidebar with **Facturación** and badge **1** visible |
| `kzy9ob` | Untagged office: Invoicing page and visible sidebar entry |
| `p7woq9` | Billing-tagged office: direct Invoicing access with no Invoicing sidebar entry |
| `hpg0w7` | Billing-tagged office: preserved `/dashboard/tickets/my?tab=invoice` landing URL; ticket panel still loading at capture |

The browser exposed screenshot IDs rather than downloadable file paths; the page, ticket and mobile-sidebar images were also opened in the task conversation. The substantive tagged-office access screenshot is `p7woq9`, not the still-loading landing capture.

The browser noted unauthenticated 401s before sign-in, non-blocking resource 404s during initial dashboard/settings loads and an autocomplete advisory. The changed Invoicing views settled successfully. Existing partially untranslated toolbar copy and horizontally scrolling charge tables were not redesigned in this label-only slice.

## Changed files

API Server (`artifacts/api-server/src/`):

- `routes/routes.ts`
- `shared/ticketCapabilities.ts`
- `lib/rfbInvoiceAutoCreate.ts`
- `routes/extraBillableBilling.ts`
- `routes/invoicingRename.integration.test.ts` (new)
- `lib/billing.test.ts`
- `routes/ticketPatchRfbInvoice.test.ts`
- `routes/dashboardQueue.test.ts`
- `routes/extraBillableCampaign.generateTickets.test.ts`

CRM (`artifacts/highplains-crm/src/`):

- `App.tsx`
- `components/nav/navConfig.ts`
- `components/nav/navConfig.test.ts`
- `components/nav/routes.regression.test.tsx`
- `components/nav/settingsNav.test.ts`
- `components/dashboard/NeedsYouQueue.tsx`
- `components/BillingView.tsx`
- `components/BillingView.count.test.tsx`
- `components/BillingAccess.regression.test.tsx`
- `pages/BillingPage.tsx`
- `pages/TicketsList.tsx`
- `pages/TicketDetail.tsx`
- `pages/TicketDetail.visits.rendered.test.tsx`
- `pages/BillingHandoff.rendered.test.tsx`
- `lib/ticketListReturn.ts`
- `lib/ticketListReturn.test.ts`
- `shared/ticketVisuals.ts`
- `i18n/locales/en.ts`
- `i18n/locales/es.ts`

Documentation: `docs/navigation/N4-implementation-report.md` (this report).

Generated logs and disposable-fixture helpers remain ignored under `generated-artifacts/`; no generated build outputs or credentials are included in tracked changes.
