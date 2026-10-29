---
name: Scheduling polish specification correction
description: Resolving the contradictory five-crew lane-height example in the supplied polish attachment
---

The user explicitly chose “keep the formula, correct the test” when the polish attachment claimed five crews in a 900px pane should hit the upper cap. Do not change the sizing rule to satisfy that old example.

**Why:** The attachment's example contradicts its own available-height formula. Header, all row gaps and bottom padding must be subtracted before dividing; the result for that pane is below the upper cap.

**How to apply:** When revisiting sizing or updating regression cases from the attachment, preserve available-pane sizing and use a sufficiently taller pane to exercise the upper cap. Distinguish actual pane dimensions from viewport dimensions.
