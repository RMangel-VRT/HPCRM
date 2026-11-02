---
name: Mention access policy
description: Mentions are informational and must not grant access to their source tickets.
---

Receiving a mention must never introduce mention-derived ticket authorization. Keep existing client-route and API permissions unchanged. If a recipient cannot open the source ticket, still mark the mention read on click and show a clear inline access note instead of navigating to an error screen.

**Why:** The user explicitly chose unchanged ticket access over mention-only access. The recipient audience is deliberately wider than the audience authorized to open every source ticket.

**How to apply:** Preserve this distinction in new mention surfaces and deep-link work. Handle denial visibly even when reading removes the row from an unread-only list.

General notification acknowledgement is not mention acknowledgement. Keep the
legacy unfiltered bulk-read contract for callers that deliberately clear both.

**Why:** The user approved separate acknowledgement boundaries for general
notifications and mentions. They also explicitly corrected the earlier instruction
to preserve cache updates verbatim: preservation must not cause mentions to vanish,
even temporarily, while a refetch is delayed.

**How to apply:** Retain scope isolation, cancellation, and broad reconciliation.
Do not infer a mixed cache's remaining unread count from locally visible rows;
its count may include notifications absent from those rows.
