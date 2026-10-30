---
name: Estimate lifecycle decisions
description: Confirmed state-machine interpretation and separation from ticket and Contract Center workflows.
---

Declined estimates support revision, alongside sent and accepted sources.
Creating a revision never supersedes its source; sending supersedes only sent
siblings, and acceptance alone replaces an accepted version. An accepted
historical version remains the contract while a change-order draft is current.

**Why:** The supplied lifecycle brief contradicted itself: its transition table
excluded declined revisions, but its declined UI explicitly offered Revise.
The user confirmed the UI interpretation and the source-preserving rule.
Estimates remain project opportunities, not Contract Center contracts.

**How to apply:** Preserve these semantics in downstream ticket integration and
document generation. Do not infer that the newest version replaced an accepted
agreement merely because it exists or was sent.
