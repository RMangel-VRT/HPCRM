# M2 — Branded chemical notices

Both chemical notices use the shared outgoing email layout. The campaign's
selected notification template (or company default) still supplies product
metadata, and non-empty visit-specific values take precedence. SendGrid,
recipient selection, and notification workflow transitions are unchanged.
Legacy wording columns remain in the table, but are no longer read by the
chemical notice renderer. New templates, including seeds, leave them blank.
Product-label links continue to use the existing signed storage URLs.

## Completion photos

An emailed `/email-img/` link grants anyone who has it access to the specific
JPEG or PNG that was shared. The link is signed for one company, completion
record, and storage generation. It cannot be used to list or read other files.
Only persisted campaign-item or ticket completion photos in their own
namespaces are eligible; draft previews use short-lived storage URLs instead.

Forwarding the email forwards access to its embedded photos. Signing out does
not revoke that access. Mail clients and proxies can cache accepted images for
up to a year. Deleting the original or rotating the signing secret can prevent
future origin reads, but neither can remove a cached or downloaded copy.
Keep the signing secret stable between releases; development links and keys
aren't interchangeable with production links and keys. No deployment is
performed by the M2 task.

## Development delivery evidence

SendGrid accepted one upcoming notice and one completion notice, both using a
synthetic property and the sole approved test inbox. No customer was contacted.
Direct requests to the API returned both sample JPEGs without a session, with
the prescribed immutable cache header. The public development route was not
reachable during the test, and neither the test mailbox nor an iPhone was
available to confirm rendering in Gmail web or the Gmail iPhone app.
