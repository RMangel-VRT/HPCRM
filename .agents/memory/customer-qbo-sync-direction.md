---
name: Customer creation and QuickBooks sync direction
description: Uploaded CQ slice order, initial-sync safety gate, and cross-product rollout boundaries.
---

Read `attached_assets/Pasted--Customer-creation-QuickBooks-sync-slice-pack-For-Randy_1793727866877.txt` before planning customer creation or QuickBooks customer synchronization. The November 3, 2026 overview specifies a strict chain: CQ1 billing fields/map → CQ2 initial sync and scheduled pull → CQ3 push → CQ4 review queue and links → CQ5 customer wizard. Use each slice's complete supplied brief as its acceptance contract; the overview's referenced `claude/customer-qbo-sync-design.md` was not supplied.

**Why:** The overview is not blanket authorization to implement later slices or publish. Each assigned slice supplies its own scope and depends on its predecessors' merged work.

**How to apply:** Read the assigned slice brief before implementation. Check current code and free migration numbers rather than trusting the dated baseline or suggested numbers. Billing schema and pure payload contracts do not authorize switching invoice bill-to readers before initial reconciliation or altering existing QBO call paths.

After CQ1–CQ2 are published, finish ambiguous customer linking in QuickBooks customer integration settings and manually run initial sync. CQ3–CQ5 may be built before this operational step, but no customer is sent to QuickBooks until initial sync has run; unsent customers remain “Waiting to send.” QuickBooks-side changes become review items; billing edits use sparse updates with SyncToken.

**Why:** Initial linking and sync must precede outbound writes to avoid sending customers before reconciliation.

**How to apply:** Preserve the initial-sync outbound gate independently of build order. Publishing, initial sync, and external writes require explicit authorization. When CQ3 is live, coordinate IrrigoPro's locked-field label change to “Edit in High Plains CRM”; CQ4 supplies the by-QuickBooks-ID CRM link.

Before the explicit initial reconciliation establishes the company baseline,
ordinary ingestion is cache-only: no CRM reconciliation, customer baseline/token
changes, or review items of any kind. After baseline, unbound sub-customers follow
the same strictly-after-baseline creation-time rule as new top-level customers;
old and equal-to-baseline sub-customers remain cache-only.

**Why:** Randy explicitly clarified these boundaries on November 3, 2026,
overriding the original upload's unconditional sub-customer review rule.

**How to apply:** Keep initial billing hydration separate from ordinary
ingestion. Preserve the original baseline on retries, and once it exists route
retries through review-only reconciliation rather than re-hydrating fields
someone deliberately cleared. Do not apply CQ3 push or
CQ4 review-queue behavior as an implicit extension of CQ2.
