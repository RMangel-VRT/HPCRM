---
name: Estimate unit compatibility boundaries
description: Canonical estimate units must not rewrite frozen commercial facts or contract units.
---

Estimate unit compatibility is presentation-only for every non-draft version.
New reference snapshots and revised draft copies normalize mapped aliases, but
reject unmapped units rather than guessing or perpetuating them. An unmapped
frozen source can therefore block revision; its source remains unchanged.

**Why:** The approved unit-consolidation brief simultaneously freezes historical
commercial facts and requires canonical-only new application writes. Unknown
units such as pallet have no authorized replacement.

**How to apply:** Preserve original unknown strings in displays, CSV exports and
inventory reports. Do not add an irrigation editor, change contract/term-rate
units, or tighten transitional database checks without separate authorization.

Boot relabeling must couple draft eligibility to the version lock in the line
write statement, not rely on an earlier lock sweep.

**Why:** Drafts can be created during catalog processing on another instance;
an earlier sweep misses them, allowing a concurrent send to freeze before the
line relabel commits.

**How to apply:** Update only identities returned by the locking draft query,
recheck status after lock waits, and retain both send-wins and relabel-wins
real-transaction regressions.
