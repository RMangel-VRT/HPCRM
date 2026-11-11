---
name: Round access projections
description: Team-derived access must remain scoped on calendar and aggregate reads, not only detail pages.
---

Crew-derived access to generated rounds is start-gated and team-scoped on every
read surface, including calendar bars, chemical dates, counts and queues.
Explicit campaign assignment remains the intentional broader pre-start exception.
Do not infer company-wide access merely from a manager role when that role's
round access was introduced through crew linkage.

**Why:** Irrigation-manager linkage accidentally exposed other teams first in
detail reads and then in a separate calendar projection. Scoping only the
visible crew-list endpoint did not protect the same facts elsewhere.

**How to apply:** When introducing a projection or role, test a two-team user
against every new read surface, including unstarted and explicitly assigned
rounds. Compute projected counts only from the authorized item set.
