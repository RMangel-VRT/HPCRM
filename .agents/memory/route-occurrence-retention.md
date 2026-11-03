---
name: Route occurrence retention
description: Why route identities must survive property deletion and disconnected seasonal windows.
---

Historical route occurrence identities must survive property deletion. Retire the
recurring pattern rather than deleting the referenced stop or clearing its
occurrence identity. Only inactive historical patterns may lack a property.

**Why:** Moved, cancelled and completed trips must stay distinguishable from
unfilled occurrences. Losing the stop identity either defeats that protection
or makes physical property deletion incompatible with required route identity.

**How to apply:** Keep normal customer deletion behind the company scheduling
gate before customer row locks. Retain dated history and cancel only future
planned route trips; do not acquire that gate from a row trigger after locking a
customer. SQL/cascade deletion callers must have equivalent retention semantics.

Derived first/last month windows are bounds, not permission to fill every month
between them. Positive scope month spreads remain authoritative for individual
occurrences unless a manual season override is explicitly selected.

**Why:** Winter coverage can have positive January–March and November–December
quantities while having no summer work.

**How to apply:** Check the original occurrence month, never a later moved/slid
date, when deciding whether to generate a contract-driven occurrence.

A weekly/fortnightly stop has at most one generated occurrence per original
Monday-based week, even after its weekday changes. A weekday edit preserves the
fortnightly anchor week and aligns the anchor day to the new weekday.

**Why:** Keeping only exact stop/date uniqueness after a weekday edit can generate
a second trip for a week already on the calendar; leaving a fortnightly anchor
on the old weekday can instead stop generation entirely. Normal pattern edits
must neither rewrite dated trips nor duplicate already-generated weeks.

**How to apply:** Retain original occurrence identities in every status. Fill
uses original weeks for generation protection, not the current moved/slid dates.
Explicit calendar reconciliation moves existing rows without replacing their
identity or treating a rain-day move into another week as a new occurrence.
