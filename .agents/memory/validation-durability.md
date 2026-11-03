---
name: Validation durability
description: Preserve long-running verification evidence across workspace restarts
---

Save long-running validation output in an ignored project directory, not only `/tmp`.

Database scheduler tests must restrict sweeps to their own synthetic companies,
even when remote requests are mocked.

**Why:** Concurrent suites share the development database. A global sweep can
consume another suite's mocked responses, hold its advisory locks, time out and
make unrelated overlap assertions fail.

**How to apply:** Give real-database scheduler tests an explicit fixture-company
allowlist; production/default sweeps must retain their intended full-company scan.

**Why:** A workspace restart can terminate validation processes and erase their temporary logs even though source files and completed database changes persist. Unfinished checks are not passing evidence.

**How to apply:** Keep generated verification outputs excluded from Git and deployment. If a restart interrupts a check, rerun only the unfinished or unconfirmed checks after restoring the relevant workflows; retain already confirmed results.

Do not combine both full application suites and both leaf typechecks at once when comparing failure baselines in this workspace.

**Why:** Aggregate CPU contention produced many additional unrelated test timeouts and missing-element failures even though focused tests passed. Running the complete suites sequentially with two workers, after typechecks finished, restored baseline-equivalent failures without changing assertions or timeouts.

**How to apply:** Parallelize inexpensive independent work, but limit aggregate concurrency for full-suite baseline attribution. Retain the contended outputs and compare individual failures before calling them product regressions; do not increase test timeouts or suppress tests to hide the result.

Place extracted baseline source trees outside the workspace, or remove them immediately after comparing checks.

**Why:** The schema-drift safety check scans the workspace for extra Drizzle configs even inside ignored generated-output directories. A disposable baseline copy can therefore block validation despite having no schema drift.

**How to apply:** Keep comparison logs in the ignored output directory, but do not leave cloned source/config trees there when running drift checks or completing work.

Finish a baseline check before editing any source it can read, even when the check runs in the background.

**Why:** Library emission and leaf checks read at different times; editing during an asynchronous baseline can produce a hybrid of old and new diagnostics rather than a true pre-change result.

**How to apply:** Parallelize baseline checks only with reads. If edits overlap a baseline, discard it and reconstruct the baseline from a pristine source archive with isolated workspace-library links.

Do not restart the API while database integration suites have active disposable companies.

**Why:** Startup scheduling backfills inspect every company, including intentionally incomplete test workflow fixtures. Restarting during those fixtures can fail bootstrap with a misleading missing-successor error even though the application builds correctly.

**How to apply:** Restart before fixture-based suites begin or after they finish cleaning up; do not alter unrelated workflow data or weaken scheduling checks to make a verification server start.

Remote mocks are process-local; shared-database fixtures are not.

**Why:** A separately running development API can discover synthetic connected
companies even while its test suite mocks all external requests. Test
serialization does not isolate those background jobs.

**How to apply:** Account for cross-process background workers when choosing
fixture isolation, rather than assuming test-local mocks protect the shared
database from other processes.

Historical source archives that borrow installed node_modules also need explicit aliases to their own workspace-library sources.

**Why:** Workspace package symlinks can resolve to the live checkout's generated contracts, making historical routes fail on response fields that did not exist at that revision. A pristine source archive alone is not an isolated historical check.

**How to apply:** Resolve workspace libraries (especially runtime API validators and schema exports) to the archived revision before treating a historical result as provenance evidence. Label incomplete comparisons as invalid, not regressions.
