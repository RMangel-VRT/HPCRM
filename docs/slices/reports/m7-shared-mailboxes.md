# M7 — Shared mailbox sync and cleanup

## What changed

- The API starts polling after 30 seconds and checks due shared Gmail mailboxes once per minute while it is awake. Each tick waits for the previous one to finish. After sleep, Gmail history supplies changes since the saved cursors. Shutdown stops the poller.
- Compose, Reply, estimate and company-document sends reserve an ID before transport, then read Gmail's stored RFC Message-ID. The receipt and Sent sync coordinate so the CRM-authored row survives a duplicate, along with its attachment and audit references. Polling and backfill use the same Gmail message parser. If Gmail acknowledges the send but the metadata read fails, the receipt keeps the reservation and doesn't retry the send. If Gmail rewrote the ID in that case, a later verified pair can be handled by the reviewed duplicate action.
- All communications omits unrestricted filters; the API still accepts older `type=all` and `direction=all` requests. A management-company-name-only match goes to Unsorted with its candidate. The sample-clear controls and endpoints are removed.
- Personal and inactive accounts are out of normal mailbox selection and visibility. The retired My mailbox link redirects admin and office to Shared mailboxes and other staff to the dashboard. Spark is unchanged.

## Owner steps after review and merge

1. Publish through the normal flow only if the proposed SQL has **no unexpected schema change and no `DROP`**. This slice requires no migration.
2. In **Settings → Shared mailboxes → Legacy mailboxes**, choose the intended legacy mailbox and select **Delete mailbox and its synced mail**. Review the counts and confirm only if they match the intended scope. If they change, review them again. CRM-authored mail is retained with the mailbox reference cleared.
3. Separately select **Remove duplicate sent copies**, review the count of verified pairs and the counts left for review, then confirm if intended. Matching thread, subject and time are not enough: the recipients and message text must also agree. Ambiguous or unmatched rows are left alone.

Neither action deletes mail from Gmail or Spark. No deployment or production cleanup was performed during development.

## Verification boundaries

PostgreSQL checks used a disposable database with synthetic accounts. They covered Gmail history pagination and automatic polling with a simulated provider, reply headers, Sent synchronization, cleanup confirmation and stale review protection, and repeated cleanup. Links from purged imported records cascade; their audit rows remain with the communication reference cleared. Duplicate repair moves links, audit records and local reply references to the retained message.

72 API and 14 rendered CRM tests passed, covering polling followed by backfill, deactivation, and preserving distinct messages in the same thread. The CRM build passed, and the bundled API returned HTTP 200 from `/api/healthz` on the disposable database. The standard development API timed out during its existing visit-service startup backfill; the managed preview could not be verified end to end.

Root `pnpm run typecheck` still exits with code 2: 650 API diagnostics versus 674 before M7 (24 fewer). The remaining errors include existing incomplete route returns and ticket insert types. Running the CRM typecheck separately also reports existing workspace type errors.

No authorized shared Gmail mailbox was connected in development. Live Gmail delivery, automatic appearance of a real reply, and Gmail's actual stored RFC ID were not verified against the provider. Only approved recipients should be used for that check; never customers.
