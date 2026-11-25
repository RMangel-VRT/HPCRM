---
name: Estimate discount boundaries
description: Agreed ordering, rounding, gross-vs-net meaning and frozen-total fallback for estimate labor/total discounts.
---
- Labor discount applies first (labor lines only), then the total discount on the remainder. Half-up rounding; each discount caps at its base.
- Subtotal stays **gross** everywhere (lists, category summaries, section figures, action-list "ready" check). The discounted figure is a separate total; customer-facing totals use it.
- Non-draft versions read frozen total, else frozen gross subtotal (versions frozen before discounts existed). Never recalculate frozen money.
- Discount rows appear only when the amount is > 0, so undiscounted documents stay byte-identical to their earlier output.
- Net allocation to QuickBooks categories is a preview/handoff only; no posting or fake negative lines.

**Why:** The task brief required gross groupings to keep their old meaning and old documents to stay unchanged; QuickBooks mapping was deferred to the Invoice Center.
**How to apply:** Any new total display or invoice feeder should consume the discounted total and frozen fallback, not re-derive from gross subtotal.
