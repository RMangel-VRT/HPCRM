# Estimate discounts: Invoice Center handoff

Status: **documentation only.** Nothing in this note is implemented. No estimate-to-invoice feeder exists yet (`invoice_lines.source_type = 'estimate_line'` is declared but unused), and estimate discounts post nothing to QuickBooks today.

## What estimates now store

Each estimate version owns up to two discounts (migration `0096_estimate_version_discounts.sql`):

| Setting | Columns | Meaning |
| --- | --- | --- |
| Labor discount | `labor_discount_kind`, `labor_discount_value`, `labor_discount_label` | Applies only to lines with `line_type = 'labor'`. |
| Total discount | `total_discount_kind`, `total_discount_value`, `total_discount_label` | Applies to what remains after the labor discount. |

- `kind` is `percent` (value in basis points, 1500 = 15.00%) or `amount` (value in cents). A NULL kind means no discount.
- A NULL label renders as "Labor discount" / "Discount".
- On send, the version also freezes `frozen_labor_discount_cents`, `frozen_total_discount_cents` and `frozen_total_cents`. `frozen_subtotal_cents` stays the **gross** line subtotal.
- Versions sent before discounts existed have NULL frozen discount and total columns. Their total is `frozen_subtotal_cents`.

The math lives in `computeVersionTotals` (`lib/db/src/estimateMath.ts`). It uses integer cents, rounds half up, caps each amount at its base, and applies the labor discount before the total discount. Each discount is spread across lines with a largest-remainder allocation (ties go to sort order, then line id). The results are `byUmbrellaNet` and `bySectionNet`. The gross `byUmbrella` and `bySection` values do not change.

## Proposed QuickBooks mapping (for the Invoice Center to build)

1. **Total discount → QuickBooks `DiscountLineDetail`.** This is QuickBooks' own discount line. It posts to the company's discount account ("Discounts given"). Use the frozen `frozen_total_discount_cents` amount. If the discount is a percent, it may also be sent as `PercentBased` with the basis-point value, but the frozen cents are the commercial fact.
2. **Labor discount → lower labor umbrella items.** Reduce the Landscape Labor and Irrigation Labor items by the labor-discount part of the `byUmbrellaNet` allocation. That way labor income shows what the customer was actually charged. It is not a separate discount line.

Open points for the Invoice Center to decide:
- **Tax:** QuickBooks computes tax, as today. Decide whether a `DiscountLineDetail` applies before or after tax (`ApplyTaxAfterDiscount`). Estimates do not calculate tax.
- **Partial invoicing:** if an estimate is invoiced in parts, decide how each discount is split.
- **Customer-facing label:** decide whether the frozen label is copied into the discount line description.

## Total consumers changed in this slice

These now show the discounted total. For drafts that is the live total. For other versions it is `frozen_total_cents ?? frozen_subtotal_cents`.

- **API reads:** `estimateReads.ts` (detail totals and list `totalCents`), `ticketEstimates.ts` (board summary and ticket panel), `proposalEstimates.ts` (proposal estimate summary).
- **Documents:** `estimatePdf.ts` (model total, subtotal and discount rows). The shared pricing fragment (`documents/estimate.ts`) is used by both the estimate PDF and the proposal PDF. It covers the key-figure box and the acceptance line. `documents/proposal.ts` reprojects the discount rows.
- **Email:** `outgoingEmail/estimateEmail.ts` covers the total chip, the facts total with the subtotal and discount rows, and the revised-version comparison.
- **Revenue pipeline:** `lib/revenueEstimatePipeline.ts` and `services/incomeStreams.ts` now use the sent and accepted frozen totals (legacy fallback: frozen subtotal). No other revenue behavior changed.
- **CRM:** builder header and rail, the version history row, the estimates list (the column is renamed "Total"), the ticket estimate panel, the opportunity board, the Estimates board cards and bucket sums, the action rows and the follow-up dialog.

Summary DTOs keep `subtotalCents` as the gross amount and add `totalCents`.
