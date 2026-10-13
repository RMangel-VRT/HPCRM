---
name: Validation durability
description: Preserve long-running verification evidence across workspace restarts
---

Save long-running validation output in an ignored project directory, not only `/tmp`.

**Why:** A workspace restart can terminate validation processes and erase their temporary logs even though source files and completed database changes persist. Unfinished checks are not passing evidence.

**How to apply:** Keep generated verification outputs excluded from Git and deployment. If a restart interrupts a check, rerun only the unfinished or unconfirmed checks after restoring the relevant workflows; retain already confirmed results.
