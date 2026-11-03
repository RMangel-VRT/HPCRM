---
name: Customer creation and QuickBooks sync direction
description: Uploaded CQ slice order, initial-sync safety gate, and cross-product rollout boundaries.
---

Read `attached_assets/Pasted--Customer-creation-QuickBooks-sync-slice-pack-For-Randy_1793727866877.txt` before planning customer creation or QuickBooks customer synchronization. The November 3, 2026 overview specifies a strict chain: CQ1 billing fields/map → CQ2 initial sync and scheduled pull → CQ3 push → CQ4 review queue and links → CQ5 customer wizard. It references `claude/customer-qbo-sync-design.md`, which was not present when this overview was received; detailed slice files were not included in this upload.

**Why:** The user supplied a reference pack overview, not authorization to implement, create tasks, or publish. Each slice depends on its predecessors' merged work.

**How to apply:** Obtain the detailed design and individual slice briefs before implementation. Check current code and free migration numbers rather than trusting the dated baseline or suggested numbers.

After CQ1–CQ2 are published, finish ambiguous customer linking in QuickBooks customer integration settings and manually run initial sync. CQ3–CQ5 may be built before this operational step, but no customer is sent to QuickBooks until initial sync has run; unsent customers remain “Waiting to send.” QuickBooks-side changes become review items; billing edits use sparse updates with SyncToken.

**Why:** Initial linking and sync must precede outbound writes to avoid sending customers before reconciliation.

**How to apply:** Preserve the initial-sync outbound gate independently of build order. Publishing, initial sync, and external writes require explicit authorization. When CQ3 is live, coordinate IrrigoPro's locked-field label change to “Edit in High Plains CRM”; CQ4 supplies the by-QuickBooks-ID CRM link.
