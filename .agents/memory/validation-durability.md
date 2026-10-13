---
name: Validation durability
description: Preserve long-running verification evidence across workspace restarts
---

Save long-running validation output in an ignored project directory, not only `/tmp`.

**Why:** A workspace restart can terminate validation processes and erase their temporary logs even though source files and completed database changes persist. Unfinished checks are not passing evidence.

**How to apply:** Keep generated verification outputs excluded from Git and deployment. If a restart interrupts a check, rerun only the unfinished or unconfirmed checks after restoring the relevant workflows; retain already confirmed results.

Place extracted baseline source trees outside the workspace, or remove them immediately after comparing checks.

**Why:** The schema-drift safety check scans the workspace for extra Drizzle configs even inside ignored generated-output directories. A disposable baseline copy can therefore block validation despite having no schema drift.

**How to apply:** Keep comparison logs in the ignored output directory, but do not leave cloned source/config trees there when running drift checks or completing work.
