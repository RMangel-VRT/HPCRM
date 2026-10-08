---
name: Ticket consolidation scope
description: User's boundaries and delivery order for the invoice-link and Billing view work.
---

Invoice tickets must remain tickets, preserving existing auto-created, standalone, batch, project and snow invoicing. The goal is for a job to read as one stream and for the billing manager to see each charge once.

**Why:** The user specified consolidation of the presentation, not replacement of the invoicing model.

**How to apply:** Follow the uploaded Ticket Consolidation rules and C1/C2 sheets. Merge C1 (invoice-link display and read-only cap audit) before starting C2 (Billing view, uncapped pending-invoice query, and the narrow multi-invoice parent-close fix). Make no schema changes or migrations. Preserve Phase 2 scheduling behavior. Leave hiding linked Invoice cards for C3, only after the billing manager has used C2. Do not change QuickBooks, the Dashboard queue, or add Billing batch actions.
