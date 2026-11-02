---
name: Master scheduling direction
description: Pointer to the user's agreed scheduling architecture and build order.
---

Read `docs/scheduling/Master-schedule-design.md` before planning or implementing scheduling work. The October 30, 2026 design received November 2 adds Routes decisions and supersedes earlier uploads. Source: `attached_assets/Pasted--High-Plains-CRM-Master-schedule-design-Status-Oct-30-2_1793651942607.txt`.

**Why:** The user supplied this master design for ongoing scheduling-system reference; it defines product intent, not merely the current implementation.

**How to apply:** Use it with the existing scheduling rules and slice specifications. All scheduling tools converge on visits, Contract Center scope is the intended demand source, and work follows the documented build order. Recheck dated implementation and production observations rather than assuming they remain current.

The remaining order is Routes, Campaigns onto visits, coordinated crew-app migration to visits, then fulfillment reporting. Incomplete contract scope does not block Routes: prefill where scope exists and allow manual setup elsewhere. Retiring legacy planner holders must still follow the separate ownership freeze/drop rules; this design is not approval to drop tables.

**Why:** The latest user-supplied master design changes the earlier ordering that put crew-app work ahead of Routes and explicitly resolves scope completeness as non-blocking for Routes.

**How to apply:** Use the new ordering when scoping future work, coordinate the mobile boundary, and do not begin implementation merely because the updated reference was uploaded.

Route season comes from the covering contract term's scope month spread, with an allowed manual override. A stop with no covering contract generates no visits. Manual route setup does not remove this coverage gate. Weekly and fortnightly cadence and both rain-day modes are required: push the remaining week one day, or move only the selected day to the next working day. Existing planner placements seed 2027 once, after a production dry run. Route visits do not create/change tickets or appear in the ticket-based mobile Today before Phase 4.

**Why:** The newly supplied Routes decisions make contract coverage a generation prerequisite and distinguish pattern setup from permission to generate work.

**How to apply:** Read the Routes pack rules at `attached_assets/Pasted--Routes-pack-rules-paste-once-at-session-start-Goal-Ran_1793378476039.txt` with applicable scheduling and ownership rules. Preserve crew and contract fact ownership, do not duplicate their names/quantities into patterns, and do not expand this pack into mobile implementation or table drops.

The uploaded local Routes mockup is `attached_assets/R-mockup-routes_1793654654730.html`, titled "High Plains Routes". Use it as the visual/interaction reference alongside the Routes pack and master design; sample customers, dates, crews and simulated actions are not production facts or backend requirements.

**Why:** The user supplied the standalone HTML while Routes UI implementation was underway, making the visual reference available locally rather than only through the external artifact link.

**How to apply:** Inspect its weekly-pattern/Needs a route layout, stop drawer, calendar route blocks, and Rain day dialog when working on Routes UI. This reference upload alone does not authorize changes to an active task or application code.

For scheduled-capable workflows, open visits own scheduling edits: an ordinary ticket edit must not resubmit crew, due date, or legacy route order. Closed/cancelled history alone does not transfer that ownership. Unknown history is not confirmed empty history.

**Why:** The user requires open trips to be edited in Visits, while preserving the zero-open legacy editing path. Sending legacy route order alone can still reject an unrelated title save even if crew/date were correctly omitted.

**How to apply:** Base the guard on complete ticket history and stable scheduled-status capability, not the visible board week/filter or current ticket status. Keep the read-only hint usable and refresh the guard after visit mutations.
