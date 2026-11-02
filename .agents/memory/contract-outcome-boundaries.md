---
name: Contract non-renewal boundaries
description: Business intent behind seasonal non-renewal and the limited customer-inactivation job exception.
---

Non-renewal records a decision about future business, not cancellation of the season still being delivered. It belongs to the final renewal-source season, independently of the season displayed as current and the multi-year set's lifecycle owner.

**Why:** The owner explicitly rejected both marking worked seasons lost and creating placeholder seasons solely to record a renewal outcome.

**How to apply:** Preserve worked-season scope, billing, operating status and independent editability. Keep decision targeting separate from display navigation.

Customer inactivation after a marked season ends is a narrow, explicitly authorized exception to the older prohibition on Contract Center background jobs. Active/Lost display and renewal eligibility remain read-time projections. A season includes its entire Colorado end date; processing begins the following day. Undo never automatically reactivates a customer.

**Why:** The owner requested automatic inactivation only when no other business remains open, with an explicit opt-out, and required already-inactive customers to remain inactive after undo.

**How to apply:** Do not generalize this exception into operating-status sweeps. Eligibility must include other agreement lines and both future/in-effect signed business and draft/sent business.

Inactivation must serialize with creation of new business as well as updates to existing seasons.

**Why:** Locking only the currently visible seasons cannot prevent a concurrent new agreement or season from invalidating the “no other open business” decision. The conservative shared company gate intentionally protects absent rows too.

**How to apply:** Retain the coordinated writer/sweep lock protocol unless replacing it with an equally phantom-safe protocol; preserve RFP-before-agreement locking.
