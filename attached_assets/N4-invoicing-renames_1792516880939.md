# N4: Billing → Invoicing, and "Ready for Billing" → "Ready to invoice"

> Assumes `00-RULES-N.md` and N1–N3. **Line numbers are from GitHub `a77f060`**; find code by its content.
>
> **One data update (DML only).** No column changes, and every **key** stays: `ready_for_billing`, the `billing` sidebar key, the `billing` Settings tab, `/api/pending-invoices`, `BILLING_LANDING`, and the test IDs such as `text-billing-title`.
>
> What bites hardest here: status **names** are data. Each company has its own `ticket_type_statuses` rows. Any code that still compares the display name breaks the moment the name changes, so §2c has to land in the same slice as the data update.

## 1. Billing → Invoicing (labels and the page route)

- **Sidebar** (`navConfig.ts`): the `billing` item's label becomes **Invoicing / Facturación**, and its href becomes `/dashboard/invoicing`. The key, the `showBillingSidebar` rule and the badge are unchanged.
- **Route:** add `/dashboard/invoicing` → `BillingPage`, with the same `access={canViewBilling}`. `/dashboard/billing` → `<Redirect>` to `/dashboard/invoicing`, keeping the query string.
- **Update the internal links:**
  - `NeedsYouQueue.tsx` ~L605, the non-billing-person link.
  - `TicketsList.tsx` ~L98, the `?view=billing` redirect target.
  - `lib/ticketListReturn.ts` ~L36: accept both `/dashboard/billing` and `/dashboard/invoicing`.
  - Grep for any other `"/dashboard/billing"`.
- **Page title:** `BillingPage.tsx` ~L11 uses `nav.billing`. Add `nav.invoicing` ("Invoicing" / "Facturación") and use it there and in the sidebar. Keep `nav.billing` only where a string still means billing.
- **`NeedsYouQueue.tsx` ~L96:** the `billing` section label becomes "Invoicing". The key stays.
- **`BillingView.tsx` ~L300–301 copy:** "Same list as the Invoicing page, filtered to you, plus any job stuck at Ready to invoice." and "Every charge in the company, plus any job stuck at Ready to invoice with no invoice." Add both to i18n with Spanish.
- **Settings rail** (`settingsNav.ts`): "QuickBooks billing" becomes **QuickBooks invoicing / Facturación de QuickBooks**. The tab key `billing` stays.
- **Leave these alone:**
  - The customer page's Financial › "Billing" item. It opens the customer's **contracts** tab (`tabValue: "contracts"`), so renaming it is a separate decision for Randy.
  - RevenueOverview's "Billing" column, which is billing frequency.

## 2. "Ready for Billing" → "Ready to invoice"

### 2a. The data update

Write a new function, `renameReadyForBillingStatusLabel()`, in `routes.ts` next to the other boot steps. Call it in `registerRoutes()` **after** `migrateTicketTypeRename()` (~L2607). It is **not** registered in `runStartupMigrations()`.

```sql
UPDATE ticket_type_statuses
   SET name = 'Ready to invoice'
 WHERE status_key = 'ready_for_billing'
   AND name = 'Ready for Billing';
```

- **Guard:** skip cleanly if the `status_key` column doesn't exist (`information_schema.columns`).
- **Idempotent.** A second run changes 0 rows.
- **Only the exact old seeded name changes.** A company that renamed the status itself keeps its own name.
- Log the number of rows changed.

### 2b. Seeds and the name→key maps

- **`shared/ticketCapabilities.ts` `STATUS_KEY_BACKFILL`** (~L146, ~L157, ~L166, in Estimate Request, Task and Project): add `"Ready to invoice": "ready_for_billing"` next to the existing `"Ready for Billing"` entry. **Keep the old entry.** The legacy-name fallback list is built from this map, so both names keep resolving.
- **The seed definitions in `routes.ts`:**
  - the `name: "Ready for Billing"` status rows at ~L621 (Estimate Request), ~L834 (Task) and ~L924 (Project) become `"Ready to invoice"`;
  - the `statusName: "Ready for Billing"` field definitions at ~L690 and ~L966 become `"Ready to invoice"`.
  - **Check how `fieldDefinitions` resolve `statusName`.** They read the `statusMap` built from the definition names. If anything there looks the status up by its stored name, change it to look up by key.
  - New companies get the new name. Existing companies get it from §2a.
  - Each `ensure*TicketType` finds statuses by **key** (`findSeededStatus(existingStatuses, statusKey)`), so the rename doesn't create a duplicate. Confirm this for each of the three types.
- **`fixProjectDisplayOrders`** (~L1200, `expectedOrders` keyed by name): it's in the unwired runner, so it's dead code. Add the new name next to the old one anyway, so it stays correct if anyone wires it up.

### 2c. The code that still compares the name (must change in this slice)

| Where | Today | Change to |
|---|---|---|
| `pages/TicketDetail.tsx` ~L846 | non-Task types check `currentStatus?.name === "Ready for Billing"` | `currentStatus?.statusKey === "ready_for_billing"` for every type. Unkeyed custom statuses fall back to either name. This is the "pending invoice blocks advancing" rule for Estimate Request and Project; without the fix it silently stops working. |
| `lib/rfbInvoiceAutoCreate.ts` ~L127 | unkeyed fallback `newStatusName === "Ready for Billing"` | accept either name |

Then grep `artifacts/` and `lib/` for any remaining `"Ready for Billing"` comparison (`===`, `.name ==`, `includes(`). Only log messages and comments may keep the old wording.

### 2d. Copy

- `TicketDetail.tsx` ~L3209: "Stepping back past Ready to invoice will permanently delete this invoice ticket and all its data."
- `BillingView.tsx` ~L194: "Ready to invoice, no invoice yet".
- `en.ts` ~L2061 `billingConfirmAllDesc`: "…Billable Tasks at status 'Ready to invoice'…". Make the matching change in `es.ts`.
- **Server messages:**
  - `extraBillableBilling.ts` ~L304 and ~L363
  - `routes.ts` ~L6882 and ~L7306
  - Use "Ready to invoice" wording.
- **Spanish status name:** statuses are stored in English and shown as stored, so this slice doesn't translate them. If the client already maps status names to Spanish anywhere, add "Ready to invoice" → "Listo para facturar".

## 3. Tests

- **Data update:**
  - against the test DB, a `ready_for_billing` status named "Ready for Billing" becomes "Ready to invoice";
  - one named "Bill it" is untouched;
  - a second run changes 0 rows.
- **Seeding a new company** creates "Ready to invoice", and re-running `ensure*` creates no duplicate.
- **TicketDetail:** an Estimate Request at the renamed status with an open linked invoice still can't advance. (This test fails before the §2c change.)
- **Auto-create:** a Task landing on the renamed status (keyed) still auto-creates its invoice.
- **Redirect:** `/dashboard/billing?x=1` goes to `/dashboard/invoicing?x=1`.
- **Update the fixtures that assert the seed name:**
  - `billing.test.ts`
  - `ticketPatchRfbInvoice.test.ts`
  - `dashboardQueue.test.ts`
  - `extraBillableCampaign.generateTickets.test.ts`
  - `BillingHandoff.rendered.test.tsx`
  - Change only name assertions, not behavior.

## Report

- The number of rows the data update changed in dev, and the statuses per company before and after (read-only query).
- Screenshots of a ticket at Ready to invoice, the Invoicing page, and the sidebar.
