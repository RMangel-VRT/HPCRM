---
name: Crew table rollout
description: Standing vs planner/campaign identities and preserving manual link choices
---

Standing crews are the canonical crew list, but planner crews and campaign teams remain separate and keep their current behavior. Nullable links connect them; planner schedule blocks must continue targeting planner crews.

**Why:** The user specified an additive Phase 3 rollout, not a crew-table merger or a transfer of planner scheduling data.

**How to apply:** Later visits and Scheduling work should use standing crew identity without repointing existing planner foreign keys. Production inventory/dry runs are read-only, and unmatched crews are assigned by hand.

Automatic linking must not restore a link explicitly cleared by an administrator.

**Why:** A blank link can mean either "not yet matched" or an intentional "None"; repeated name/leader matching cannot distinguish those meanings without persistent initialization state.

**How to apply:** Keep one-time automatic matching separate from later manual choices. Every explicit manual link choice, including null, must survive API restarts.
