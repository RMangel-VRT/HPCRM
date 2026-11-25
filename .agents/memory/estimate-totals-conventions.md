---
name: Estimate totals contract decisions
description: Rationale for stable wire conventions when building downstream estimate UI and lifecycle actions.
---

Keep the draft API's totals conventions stable across the downstream builder
and lifecycle work; see `docs/estimates/estimate-builder-draft-api.md`.

**Why:** The builder brief left zero-denominator margin behavior unspecified.
We chose null because even a known positive cost does not make margin defined
when known-cost revenue is zero. The percentage-point scale and four-decimal
display precision were fixed before a UI existed so later consumers must not
independently choose a different scale or convert undefined margin into zero.

**How to apply:** UI and lifecycle slices should consume the existing totals
contract and represent null as unavailable. If changing the convention, make
it an explicit API contract change, not a local formatting/math workaround.

Discounts are version-owned document pricing: labor-only first, then a total
discount, with editable customer-facing labels. Gross subtotal and category
breakdowns retain their meaning; final totals and net margins reflect discounts.

**Why:** The estimate discount brief explicitly rejects fake/negative lines
and preserves old frozen estimates and undiscounted documents.

**How to apply:** Follow
`attached_assets/Pasted--Replit-Prompt-Estimate-Builder-Labor-Discount-Total-Di_1795627611870.txt`.
Freeze final and discount amounts on send, copy settings on revise, and use
the old frozen subtotal only when the new frozen total is null. QuickBooks
posting is a later Invoice Center responsibility, not part of this brief.
