---
name: Shared mailbox cleanup
description: November 21 decisions on shared Gmail, Spark, and administration of historic CRM copies.
---
The CRM only connects, syncs, and sends through shared company mailboxes. Spark remains the team's everyday inbox; staff can CC or forward to the shared address when personal correspondence belongs in the CRM. The shared-only rule applies across companies, not just to today's High Plains address.

**Why:** The team chose to keep personal mail out of customer history without replacing Spark. Removing personal mailboxes is not permission to delete actual Gmail messages or to remove CRM-authored records.

**How to apply:** Leave inactive and personal data for a real admin's scoped, reviewed CRM-only cleanup. Keep CRM-authored messages and their audit or document links. Keep live test messages on authorized development mailboxes and approved recipients; never use a personal mailbox or a customer's address as a substitute.

The product labels are **Threads** in English and **Conversaciones** in Spanish. Put the CRM sidebar item in Customers, immediately after Maps; keep the existing bookmarks and access rules.

**Why:** The final November 21 brief changed both the label and position, superseding the earlier Conversations-in-the-top-group plan.

**How to apply:** Use Threads on the English page, breadcrumb, customer section and dialog. Keep Spark as the team's everyday inbox.

Gmail thread IDs alone are not proof of a safe merge or reply. A parent must belong to the same customer and shared mailbox; a revised estimate must also have a confirmed earlier CRM issuance of that estimate. A syntactically valid local Message-ID reservation is not itself proof.

**Why:** Imported IDs can collide between mailboxes, a thread can straddle customer assignments, and Gmail may return a different Message-ID from the local reservation.

**How to apply:** Fail closed on cross-customer or detached parents. Fall back to a new email for an estimate with no eligible predecessor rather than borrowing a Gmail thread.

Gmail can return the exact RFC Message-ID the CRM reserved. Store that explicit verification with the original estimate issuance; an equal ID without verification still cannot serve as a threading parent for a revised estimate.

**Why:** Merely seeing the local reservation in storage cannot distinguish Gmail retaining it from the post-send metadata lookup failing.

**How to apply:** Preserve the first issuance's verification through resends and keep older unverified reservations ineligible.
