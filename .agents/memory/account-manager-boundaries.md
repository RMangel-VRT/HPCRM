---
name: Account manager boundaries
description: Approved mailbox notification exception and account-manager rollout boundaries.
---

Mailbox sync failure notices retain owner-first delivery; if there is no owner email, select one active same-company admin or account manager, not a broadcast.

**Why:** The owner-first single-recipient implementation did not fit the original notify-all versus fallback-owner rules. The user explicitly approved preserving one fallback.

**How to apply:** Include account managers in fallback eligibility while retaining the existing number of recipients. Do not apply this exception to ticket-status fallback admin selection.
