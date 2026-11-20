---
name: Estimate rate reset boundaries
description: Keep price refresh separate from replacing the catalog item.
---

A same-item **Reset to catalog price** action updates the rate and its pricing
provenance only. It must not replace the customer's description, alter
plant-table inclusion or labels, refresh the cost snapshot, or switch items.

**Why:** The button promises a rate change. Reusing a full item replacement
could silently discard saved customer-facing work. An old toast could also
target a line whose catalog identity another edit has since changed.

**How to apply:** Keep the rate-only guard in both the authoritative write
and optimistic projection. Verify a reset after editing an excluded plant's
description, as well as a stale reset after changing the underlying item.
