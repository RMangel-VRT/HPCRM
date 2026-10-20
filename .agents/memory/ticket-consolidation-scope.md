---
name: Ticket consolidation scope
description: User's boundaries and delivery order for the invoice-link and Billing view work.
---

Invoice tickets must remain tickets, preserving existing auto-created, standalone, batch, project and snow invoicing. The goal is for a job to read as one stream and for the billing manager to see each charge once.

**Why:** The user specified consolidation of the presentation, not replacement of the invoicing model.

**How to apply:** Follow the uploaded Ticket Consolidation rules and C1/C2 sheets. Merge C1 (invoice-link display and read-only cap audit) before starting C2 (Billing view, uncapped pending-invoice query, and the narrow multi-invoice parent-close fix). Make no schema changes or migrations. Preserve Phase 2 scheduling behavior. Leave hiding linked Invoice cards for C3, only after the billing manager has used C2. Do not change QuickBooks, the Dashboard queue, or add Billing batch actions.

For the billing handoff, sidebar visibility and billing authorization are intentionally different. Admins see Billing regardless of tags; untagged office users see it; all billing-tagged non-admin users, including office users, do not see the entry or badge but retain authorized direct-URL access and work from To invoice.

**Why:** The user explicitly superseded the sheet's sidebar rule to give billing staff one working location without narrowing their permissions.

**How to apply:** Do not use route/API access as the sidebar visibility predicate. Verify the active membership role from read-only evidence when discussing a named user's visibility; do not assume a role from old documentation.

Keep the Dashboard Billing action-queue count, items and actions independent of the charge list. Only add the navigation link there.

**Why:** The user explicitly clarified that count agreement means equivalent charge populations, not forced equality with an independent action queue.

**How to apply:** Explain legitimate mine/all assignment differences and Dashboard workload differences; never change queue aggregation to make counts match.

Crew-supervisor web ticket access is assigned-only, even with a billing tag. Billing-page authorization does not authorize another owner's ticket details or linked invoice/parent identity.

**Why:** The desktop-shell scope adds access to assigned work, not company-wide operational ticket permissions. Linked titles and IDs are record data too; hiding the full detail endpoint alone is insufficient.

**How to apply:** Check both records' authorization when changing ticket relationships or list summaries. Administrative link creation/deletion and comment deletion remain unavailable to crew supervisors. Preserve other roles' existing billing exceptions.
