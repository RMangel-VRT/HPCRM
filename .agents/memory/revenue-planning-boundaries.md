---
name: Revenue planning boundaries
description: Approved ownership, counting, and release order for the Revenue rebuild.
---

The November 17 Revenue brief is `attached_assets/RV-00-RULES_1795463146558.md`.
It specifies RV1 through RV7 in strict merge order. This is a planning
surface, not a new contract, invoice, or accounting writer.

**Why:** The old Revenue page read frozen legacy contracts without a
billing year. The rebuild must show effective agreements, actual accrual
income, and clearly separated estimates without double-counting customers
or invoiced work.

**How to apply:** Contract Center owns signed monthly billing, summed by
the agreement's customer without inherited branch copies. QuickBooks
accrual P&L owns earned income and refreshes only on demand, read-only in
QuickBooks. Revenue owns account mappings, plan assumptions, and targets.
Use integer cents and Colorado month boundaries. Show contract fees
separately in detail but include them in billing totals. Accepted project
estimates are pipeline only until Invoice Center has the necessary
estimate-line provenance. Say **target**, never **budget**. Keep the
legacy tables frozen even after the old revenue code is removed.

Renewal markers belong to counted season history, not to the selected
payment rows. A filter or year boundary can hide all payments from the
earlier season without making the later season the first on the agreement.
Where adjacent seasons both bill the same month, keep both commitments;
the single monthly agreement header describes the newer billing season.

Preserve the difference between an unloaded QuickBooks year and a loaded empty
year. A future month in a loaded year is still not earned. The save-plan action
must reject the whole replacement if a rounded amount cannot be stored as a
target; do not clamp a credit to zero.

**Why:** QuickBooks can report negative net income, but target rows were
approved as nonnegative goals. Changing a value to fit would make the saved
targets disagree with the forecast the user chose.

**How to apply:** Revenue views should consume the server's missing-data and
comparison fields, and explain a rejected target save without suggesting that
any month was saved.

The target edit grid zero-fills streams that have no target rows. Use the
income response's nullable stream target to distinguish an absent target from
an explicitly saved zero. Closed months without QuickBooks can still have
signed Contract Center payments; label those figures as partial, not earned.

**Why:** An absent target is not a zero-dollar goal, and a signed payment is
not proof of accrual income. Mixing those cases gives misleading comparisons.
