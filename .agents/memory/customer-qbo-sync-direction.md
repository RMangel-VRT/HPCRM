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

An intentional removed-customer unlink pauses all automatic sending until a new
activation or explicit Send to QuickBooks now. Parent-first creation and branch
mode changes are not permission to recreate an intentionally unlinked customer.

**Why:** Randy's November 3, 2026 amendment makes unlink an explicit operational
pause, not merely an empty binding eligible for automatic recovery.

**How to apply:** Keep stale queued work, scheduler retries, billing edits and
recursive parent synchronization behind this boundary. Dismiss only closes review
evidence; linking a survivor establishes that survivor's agreed baseline.

The current outbound retry quota is deliberately process-local, not a durable
cross-instance guarantee.

**Why:** The push scope explicitly directed documenting retry durability gaps
rather than inventing an unapproved attempt-ledger schema.

**How to apply:** Do not claim restart-safe or distributed three-per-hour limits
without separately approving durable attempt metadata and its ownership.

Explicit customer linking is authorized to hydrate empty CRM billing facts from
the QuickBooks mirror, preserve nonempty CRM facts, establish the agreed
baseline/token, and close matching new/sub-customer reviews atomically.
Requesting a promotion prefill is not a completed resolution.

**Why:** Randy's November 3, 2026 decision requires all explicit linking and
promotion paths to share one bookkeeping routine. A failed or abandoned customer
creation must not remove the review.

**How to apply:** CQ5's wizard must finish through that shared link boundary.
Sub-customer creation/parent selection remains the wizard's responsibility;
interim promotion handles top-level prospects only. Send-now remains
asynchronous: acknowledge waiting, then observe status, never infer remote
success from a queued request.

Incoming QuickBooks postal text is not subject to the CRM's US-only ZIP policy.
Historical and international QuickBooks addresses must remain ingestible even
when they cannot be sent back as newly edited CRM addresses.

**Why:** Randy explicitly separated tolerant incoming normalization from
CRM/outbound validation on November 3, 2026; rejecting one customer's postal data
must not stop a company-wide mirror batch.

**How to apply:** Future customer-entry flows, including the new-customer wizard,
must reuse the shared CRM input contract rather than making incoming QuickBooks
normalization strict. Preserve unrelated edits to unchanged legacy ZIP values.

Signing a prospect's contract or accepting its estimate offers explicit activation; neither win automatically activates it. Activation prerequisites remain the existing completeness contract, not a new requirement for an AP contact name.

**Why:** The follow-up brief explicitly separates recording a win from consenting to activation and outbound synchronization. Existing active customers may remain incomplete without being barred from unrelated setup edits.

**How to apply:** Keep the committed win independent of its optional activation advisory, preserve activation validation for active creation and non-active-to-active setup transitions, and describe missing facts on already-active edits as advisory.
