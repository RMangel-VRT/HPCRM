---
name: Proposal and estimate boundaries
description: Commercial ownership and irreversible-send policy for linked proposals.
---

Proposal finalization is an explicit estimate send event, not a second commercial document lifecycle. Sending commits independently before PDF/storage; a failed PDF never authorizes undoing the send. Ticket advancement remains separate and recoverable.

**Why:** The user chose finalization to mean the estimate has been sent and locked, even when the subsequent document work fails. Combining those operations in a compensating transaction would erase that commercial audit event.

**How to apply:** Keep estimate versions as the sole commercial owner, use the shared renderer with an explicit selected version, and preserve previous finalized PDFs. Draft proposals follow the current estimate; historical finalized proposals do not regenerate when the estimate changes. Do not add proposal-owned acceptance/signatures or pricing.

New proposals start from estimates, never an uploaded QuickBooks estimate PDF.
Scope belongs only to the selected estimate version. Unlinked historical
proposals are view/download/delete-only; do not turn linking into a way to
reactivate their drafts or restore the retired upload path.

**Why:** The user explicitly chose estimate-first creation, one scope owner,
and retention of legacy files/PDFs rather than conversion or cleanup.

**How to apply:** Preserve these boundaries in future entry points, attachments,
renderers and worksheet snapshots. Operational snapshots may copy selected
estimate scope, but must not read a stale proposal-owned narrative for linked
documents or become another editable commercial owner.
