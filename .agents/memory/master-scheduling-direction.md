---
name: Master scheduling direction
description: Pointer to the user's agreed scheduling architecture and build order.
---

Read `docs/scheduling/Master-schedule-design.md` before planning or implementing scheduling work. It records the user's agreed direction as of October 19, 2026, including the remaining scope-data question.

**Why:** The user supplied this master design for ongoing scheduling-system reference; it defines product intent, not merely the current implementation.

**How to apply:** Use it with the existing scheduling rules and slice specifications. All scheduling tools converge on visits, Contract Center scope is the intended demand source, and work follows the documented build order. Recheck dated implementation and production observations rather than assuming they remain current.

For scheduled-capable workflows, open visits own scheduling edits: an ordinary ticket edit must not resubmit crew, due date, or legacy route order. Closed/cancelled history alone does not transfer that ownership. Unknown history is not confirmed empty history.

**Why:** The user requires open trips to be edited in Visits, while preserving the zero-open legacy editing path. Sending legacy route order alone can still reject an unrelated title save even if crew/date were correctly omitted.

**How to apply:** Base the guard on complete ticket history and stable scheduled-status capability, not the visible board week/filter or current ticket status. Keep the read-only hint usable and refresh the guard after visit mutations.
