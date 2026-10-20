---
name: Navigation direction
description: Reference for the approved navigation scope and the separation of web navigation from native-app expansion.
---

Read `docs/navigation/Navigation-design.md` before planning or implementing navigation changes.

**Why:** The October 20, 2026 design establishes that every role should have desktop sidebar access and native-app access, but explicitly separates the web navigation rollout from the later mobile project.

**How to apply:** Follow the role matrix, redirect and translation requirements, and proposed slice boundaries. Web navigation work must not widen mobile login or crew-supervisor eligibility. Preserve unresolved choices as questions rather than treating the model or proposed slice order as approval to implement them.

The latest supplied October 20 design resolves Flags as a separate sidebar item, Inbox as email-only, and the display label change to “Ready to invoice” without changing the status key.

**Why:** These replace options that were still open in the earlier navigation sheet.

**How to apply:** Do not re-open those decisions by default. Only service-month ownership and retiring the old Contracts route remain open; both are non-blocking in the revised design.

The user supplied a local clickable model for the upcoming navigation slices: `attached_assets/High_Plains_Navigation_Model_–_Proposed_navigation_(clickable_1792516149954.html`.

**Why:** The user explicitly designated this upload as the reference to use for those slices, alongside the approved written navigation design.

**How to apply:** Inspect the model for layout, role switching, secondary rails and menu interactions when scoping each slice. Use the revised written design for implementation constraints and settled decisions; the model's short URLs are illustrative and do not replace required `/dashboard/` routes.

The subsequently supplied implementation rules are in `attached_assets/00-RULES-N_1792516880939.md`; read the applicable uploaded navigation slice as well. Their explicit scope exceptions override broader earlier design wording.

**Why:** The detailed invoicing slice deliberately leaves the customer's Financial › Billing label unchanged because it opens contracts, although the earlier navigation narrative proposed renaming it.

**How to apply:** Follow the supplied slice boundaries rather than expanding a task to match every illustrative model feature. Keep the customer Financial label and revenue billing-frequency wording unchanged unless separately approved.

Settings rail visibility is intentionally narrower than standalone route authorization: office sees only Property managers, but retains existing direct access to shared-mailbox oversight and QBO customer mapping.

**Why:** The supplied Settings slice explicitly restricts visible links while also prohibiting route-permission changes. Hiding a Settings link is not authorization to revoke its route.

**How to apply:** Preserve the separate visibility and access policies in future navigation work. Service months and season records must also remain separate stores until the user explicitly resolves their ownership question.
