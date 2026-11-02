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
