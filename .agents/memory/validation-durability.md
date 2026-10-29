---
name: Validation durability
description: Preserve long-running verification evidence across workspace restarts
---

Save long-running validation output in an ignored project directory, not only `/tmp`.

**Why:** A workspace restart can terminate validation processes and erase their temporary logs even though source files and completed database changes persist. Unfinished checks are not passing evidence.

**How to apply:** Keep generated verification outputs excluded from Git and deployment. If a restart interrupts a check, rerun only the unfinished or unconfirmed checks after restoring the relevant workflows; retain already confirmed results.

Do not combine both full application suites and both leaf typechecks at once when comparing failure baselines in this workspace.

**Why:** Aggregate CPU contention produced many additional unrelated test timeouts and missing-element failures even though focused tests passed. Running the complete suites sequentially with two workers, after typechecks finished, restored baseline-equivalent failures without changing assertions or timeouts.

**How to apply:** Parallelize inexpensive independent work, but limit aggregate concurrency for full-suite baseline attribution. Retain the contended outputs and compare individual failures before calling them product regressions; do not increase test timeouts or suppress tests to hide the result.

Place extracted baseline source trees outside the workspace, or remove them immediately after comparing checks.

**Why:** The schema-drift safety check scans the workspace for extra Drizzle configs even inside ignored generated-output directories. A disposable baseline copy can therefore block validation despite having no schema drift.

**How to apply:** Keep comparison logs in the ignored output directory, but do not leave cloned source/config trees there when running drift checks or completing work.

Historical source archives that borrow installed node_modules also need explicit aliases to their own workspace-library sources.

**Why:** Workspace package symlinks can resolve to the live checkout's generated contracts, making historical routes fail on response fields that did not exist at that revision. A pristine source archive alone is not an isolated historical check.

**How to apply:** Resolve workspace libraries (especially runtime API validators and schema exports) to the archived revision before treating a historical result as provenance evidence. Label incomplete comparisons as invalid, not regressions.
