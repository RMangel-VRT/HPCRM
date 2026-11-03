---
name: Route import approval boundaries
description: Why route placement approval excludes evolving contractual coverage and preserves other planner history.
---

Approval of recurring route placement must not depend on a fixed covered/uncovered
contract split. Contract signatures and renewals continue during review; fill must
resolve the latest governing coverage rather than snapshot it onto a route stop.

**Why:** The owner explicitly made the coverage split informational, while stop
count and duplicate decisions are approval gates. Commercial changes do not mean
the reviewed crew/day placement was changed.

**How to apply:** Keep contractual eligibility out of source-approval hashing.
Selected planner/property/crew eligibility changes still require renewed review.
Explicit selection authorizes one template only, not deactivation or alteration
of other historical templates; preserve the existing marker-driven cutover.

Source approval alone does not authorize an import outcome changed by new live
route placements.

**Why:** Route inventory can change through the ordinary API while planner source
and its approval hash remain unchanged. A newly added selected-property mowing
stop would otherwise turn an approved placement into a duplicate decision and
reduce the imported stop count.

**How to apply:** Independently fail closed on selected-property route collisions
at cutover under the scheduling gate. Do not expand a source-only fingerprint
with operational inventory or live contractual coverage to solve this boundary.
