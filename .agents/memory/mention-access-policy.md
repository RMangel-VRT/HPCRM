---
name: Mention access policy
description: Mentions are informational and must not grant access to their source tickets.
---

Receiving a mention must never introduce mention-derived ticket authorization. Keep existing client-route and API permissions unchanged. If a recipient cannot open the source ticket, still mark the mention read on click and show a clear inline access note instead of navigating to an error screen.

**Why:** The user explicitly chose unchanged ticket access over mention-only access. The recipient audience is deliberately wider than the audience authorized to open every source ticket.

**How to apply:** Preserve this distinction in new mention surfaces and deep-link work. Handle denial visibly even when reading removes the row from an unread-only list.
