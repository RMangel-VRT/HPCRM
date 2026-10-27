---
name: Section action-list direction
description: User-supplied product rules for distributing action lists across sections.
---

Read `attached_assets/Pasted--Section-Action-Lists-Ground-Rules-Paste-this-once-at-t_1793134932506.txt` before planning or implementing section action-list slices. This supersedes the earlier ground-rules uploads.

The dashboard directs users to the section where work happens. Ownership follows status: each lifecycle ticket action list belongs to the section that can act on it; Tickets is the whole-population viewing surface, not an action list. My Tickets remains a personal assignment view.

Each section must use its own meaningful overdue clock, not a universal schedule-by ordering. In particular, invoicing must not use stale scheduling dates, and intermediate estimates may have no schedule-by date. Follow the uploaded clock table and Colorado calendar-day rules.

These three slices permit no schema changes; stop and ask if a column appears necessary. Reuse the established ticket visual system: matching type hue only on the left rail and type badge, universal status colors, token-based row styling rather than bordered cards.

**Why:** These are the user's supplied product and scope rules for the next action-list work, including an explicit correction to the earlier universal schedule-by design.

**How to apply:** Treat this upload as shared requirements alongside each forthcoming slice specification. The upload references a separate design document; locate and read it before relying on its contents. Its diagnostic counts are a dated baseline, not proof of current results.

The October 27 dashboard direction is eight live section tiles, with Bids immediately after Estimates, plus a visibly held ninth Campaigns cell. Campaigns waits until Phase 5's move to visits and a deliberate action-ownership decision; flow waits for its own index migration. Both spaces remain reserved so enabling them later does not reorder or resize tiles. Tile order/geometry never change with urgency; only intensity changes.

**Why:** The user explicitly chose to retain Campaigns while splitting Bids, superseding the October 26 plan to give the reserved cell to RFP Center.

**How to apply:** Use the clarification alongside `attached_assets/Pasted--Slice-01-Dissolve-the-queue-make-the-dashboard-a-route_1793055434946.txt`. Do not implement Campaigns counts or flow now. Completed, not-yet-invoiced campaign work potentially belonging to Invoicing is a future design consideration, not a settled ownership rule.

See [Estimate and RFP boundaries](estimate-rfp-boundaries.md) for the opportunity split and the remaining separate contract lifecycle direction.

Before extending a response, inspect its output-validation boundary. When a generated contract validates it, change the source API specification and regenerate rather than editing generated files. Test that the new field survives actual response serialization.

**Why:** The updated ground rules explicitly warn that unknown response fields can be stripped silently, making a computed field disappear without an error.

**How to apply:** Include contract propagation and serialized-response assertions in any affected slice; computation-only assertions are insufficient.

On a localized surface, every state of a label must use translation keys. Do not fall back to the English identity vocabulary for projected states. Surfaces displaying raw stored names should remain internally consistent instead of translating only some states.

**Why:** The updated rules explicitly prohibit mixed translated labels and hard-coded English identities within one UI element.

**How to apply:** Add missing translation keys for label variants and verify English and Spanish states. Keep this scoped separately from the broader pre-existing database-name localization gap.

Removing the dashboard pulse rail is approved even when its statistics have no destination yet. Do not add Revenue or Reports displays as part of rail removal, and never describe intentionally unplaced figures as relocated.

**Why:** The user explicitly amended the original “nothing is lost” specification after the consumer audit was corrected. Missing monthly/YTD summaries, active-customer/contract statistics, and top-customer rendering belong to later section-owned work.

**How to apply:** Keep the pulse payload and the stats, top-customers, and monthly-revenue endpoints intact. Preserve existing Revenue charts. Do not restore close-to-invoice latency or wire/delete the orphan customer-growth chart under this dashboard scope.
