---
name: Crew table rollout
description: Standing crew identity and preserving campaign link choices
---

Standing crews are canonical. Campaign membership is a distinct fact, linked to standing identity.

**Why:** Campaign teams are not a second standing crew list.

**How to apply:** Preserve campaign membership and nullable links independently of standing identity.

Automatic linking must not restore an explicit None selection after startup.

**Why:** A blank link may be an intentional choice, not an invitation to match again.

**How to apply:** Keep one-time automatic matching separate from subsequent manual choices; preserve the initialization marker.
