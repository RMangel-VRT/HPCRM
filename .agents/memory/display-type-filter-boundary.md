---
name: Display type filter boundary
description: Approved-estimate display filtering is deliberately narrower than operational ticket identity.
---

Tickets and My Tickets type pills and the Scheduling queue type selector follow display identity: approved estimates appear under Project. Board grouping, workflow choices, authorization and writes retain stored identity.

**Why:** The owner explicitly superseded the earlier raw-filter requirement only for these three controls. Extending that decision to operational consumers would change workflows without approval.

**How to apply:** Do not reuse a projected type's retained raw ID to determine display membership. Keep custom/unkeyed catalog identities distinct from seeded types, even when their editable labels coincide.
