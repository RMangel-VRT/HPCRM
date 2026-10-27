---
name: Scheduling drag scrolling
description: Preserve continuous pane-owned edge scrolling, not hovered-element ancestor scrolling.
---

Scheduling drag scrolling must continue while the pointer is held stationary near a pane edge, even when the hovered crew/day changes underneath it. Only the queue and board may scroll; desktop main/body must never become drag scroll targets.

**Why:** A real-browser check found that the drag library's ancestor-based auto-scroll stopped during a valid highlighted bottom-edge hover, despite remaining scrollable content. Its acceleration also does not cap speed if the pointer is allowed beyond a container edge. Merely configuring a threshold and an ancestor allowlist did not provide reliable bounded scrolling.

**How to apply:** Retain a pane-owned continuous pointer-driven scroll path during future scheduling drag refactors. Do not enable a competing ancestor-based loop. Verify stationary-edge hovering, leaving a pane, both scroll limits, cancellation, and unchanged board geometry—not only drags with repeated pointer movement.
