---
name: QuickBooks sync transaction boundary
description: Preserve independently committed OAuth rotation when customer reconciliation rolls back.
---

Keep OAuth refresh-token rotation outside customer mirror/reconciliation
transactions. Explicitly join only the local data writes to that transaction;
remote pull acquisition must not inherit a customer-write transaction.

**Why:** QuickBooks rotates credentials remotely. Rolling back newly stored
credentials after a later pagination/normalization/reconciliation failure can
leave the company holding an invalid old refresh token.

**How to apply:** When adding sync entry points, reuse the customer lock and its
explicit transaction for mirrors/reviews/customer metadata, but do not bind all
ambient database calls (including `qboRequest`'s credential refresh) to it.
