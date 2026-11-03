---
name: Proposal and estimate boundaries
description: Commercial ownership and irreversible-send policy for linked proposals.
---

Proposal finalization is an explicit estimate send event, not a second commercial document lifecycle. Sending commits independently before PDF/storage; a failed PDF never authorizes undoing the send. Ticket advancement remains separate and recoverable.

**Why:** The user chose finalization to mean the estimate has been sent and locked, even when the subsequent document work fails. Combining those operations in a compensating transaction would erase that commercial audit event.

**How to apply:** Keep estimate versions as the sole commercial owner, use the shared renderer with an explicit selected version, and preserve previous finalized PDFs. Draft proposals follow the current estimate; historical finalized proposals do not regenerate when the estimate changes. Do not add proposal-owned acceptance/signatures or pricing.
