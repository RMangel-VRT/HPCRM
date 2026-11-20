---
name: Compose delivery claims
description: Legacy pending delivery status does not by itself mean a send was attempted.
---

Treat an outbound draft as reserved for Gmail only when it is pending **and**
already holds its reserved provider Message-ID. Write the provider ID before
calling Gmail so a concurrent send cannot pass the claim and Gmail sync can
deduplicate the Sent copy.

**Why:** The deployed database lineage can have a non-null `pending` default
on delivery status even though the Drizzle schema permits null. Ordinary
drafts may therefore start pending without any attempt.

**How to apply:** Preserve the ordinary draft state with no provider ID. Do
not require clearing delivery status to null, or count every pending draft as
in flight.

Logging a customer communication is not a request to send it. A selected
mailbox can identify where an email was handled even if that mailbox is
disconnected or sync-disabled. Honor explicit log-only intent, and check the
current server-side mailbox capability before creating a delivery draft.
