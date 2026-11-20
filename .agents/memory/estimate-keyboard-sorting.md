---
name: Estimate keyboard sorting
description: Keyboard targets and focus on the grouped estimate line editor.
---

Use the logical sequence of estimate rows and empty sections as keyboard drop
targets; let pointer sorting use geometry. Restore focus once the moved row
actually renders in its destination.

**Why:** In Chromium, center-based keyboard collisions with variable-height
section cards missed targets. Cross-section drops remount the focused button,
so focusing it immediately after updating the cache can target the old row.

**How to apply:** Verify with Chromium and the real sensors: arrows, Space
or Enter, one request per drop, and focus on the same line in its destination.
Rendered tests can cover the order data but do not model drag geometry.

The photo gallery has the same keyboard distinction: left/right move one
position in the numbered order, up/down move one visual grid row. The
end-of-page marker can change card height, but must not change arrow targets.
