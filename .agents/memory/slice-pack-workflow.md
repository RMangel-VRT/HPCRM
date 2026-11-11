---
name: Task-plan workflow decisions
description: User revocation of repository-only source gates and non-obvious predecessor verification lessons.
---

On 2026-11-11 the user explicitly revoked the repository-only specification
requirement, including the missing-file authorization gates previously treated
as necessary for Campaigns work.

**Why:** The user wants task plans refined through discussion and codebase
investigation to govern implementation, with pasted and attached requirements
accepted through the normal task workflow, not treated as one-task exceptions.

**How to apply:** Use the current workflow in `replit.md` and
`docs/slices/README.md`. Do not revive old source gates from historical reports
or status entries. Missing pack files alone are not a technical preflight failure.

A prerequisite's merged task status does not refresh an already-running successor's
checkout. Fetch the actual GitHub `origin/main` before concluding that the merged
implementation is absent; integrate its handoff without overwriting local work.

**Why:** A successor retained its original audit-only base after its prerequisite
merged, making repeated local pre-flights report obsolete missing-code failures.

**How to apply:** Verify the latest fetched source and handoff separately from the
task status. Preserve technical preflight checks without adding a specification
storage or revision-authorization gate.

The owner deliberately kept the obsolete numbered Campaigns slice documents
removed. Do not restore those old specifications.

**Why:** The checked-in versions predated the reviewed count/status/gap decisions;
restoring them would reintroduce the version ambiguity the owner removed.

**How to apply:** For subsequent Campaigns work, use the approved task plan and
actual predecessor handoff, not obsolete specifications. Approval of a task is
not approval to invent or automatically begin later slices.
