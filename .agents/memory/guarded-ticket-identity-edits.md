---
name: Guarded ticket identity edits
description: The November 19 boundaries for changing an existing ticket's customer or workflow.
---

A customer edit never moves or removes the work-location pin or reparents
linked work. Open and completed visits block customer edits. The workflow
change rule is stricter: **any** visit history blocks conversion, and
conversion starts at the target's first workflow status. Invoice and shop
equipment workflows retain their own paths.

**Why:** A property correction must not silently change physical location or
historical work. A workflow conversion changes the meaning of that work, even
if the previous visit was cancelled.

**How to apply:** Recheck relationships inside the existing company-first
transaction. Do not combine the two policies into one permission just because
the fields share a dialog. Keep conversion separate from ordinary PATCH; if
conversion commits and PATCH fails, preserve the unsaved edits and say which
part succeeded.
