---
name: Customer email family
description: November 20 decisions for branded customer emails and fixed-layout wording.
---

Customer emails speak as High Plains, not an individual staff member. Use one
shared email-safe layout, with company contact facts from Document settings
and the company name from the company. Staff may edit wording and review a
server-rendered preview; the layout is fixed and there is no HTML editor.
Use only shared office Gmail mailboxes. Bulk chemical mail stays on SendGrid
until separately approved. English email defaults and bilingual UI are distinct.

**Why:** The user approved one visual and writing system for customer emails,
with review before delivery and a single owner for company contact details.

**How to apply:** Use the approved rules and mockup for wording, block order,
stripe meaning and stable public images. Keep internal mail distinct (staff
names allowed, plain footer). M1 adds only the shared foundation and estimate
variants; the other email families and wording overrides require their own
scoped work. Never send development test mail to a real customer.

M5 invoice and reminder mail waits for Invoice Center. M6 staff email needs
the shared layout, not M5 or the customer wording editor. Do not make private
flag attachments public just to reuse the completion-photo email route.

Treat shared-renderer output as final when using a legacy mail transport.
**Why:** A second template pass can consume literal brace expressions in a
field note even when the note was correctly HTML-escaped.
**How to apply:** Preserve the rendered subject and both MIME bodies unchanged;
keep template substitution for callers that actually supply templates.

Keep mail-client evidence separate from browser preview evidence. An empty
iframe sandbox gives the preview an opaque origin, and Chromium can block
images from loopback even when the files are served correctly. **Why:** local
image failures do not establish how the public image URLs behave in real mail
clients. **How to apply:** check the PNG responses separately and confirm image
loading in actual mail clients only when the public paths and approved test
mailbox are available.

The November 21 mailbox decision supersedes the earlier shared-mailbox
preference: the CRM sends and syncs only shared mailboxes. Personal mail stays
in the everyday mail client and reaches the CRM when staff CC or forward the
shared address. Run due-aware sync while the autoscale app is awake; no cron or
always-on deployment. Imported legacy CRM copies may be removed only through
a separately confirmed admin action; preserve CRM-authored records and never
delete the provider originals.

**Why:** The CRM is the company conversation record, not a personal inbox.

**How to apply:** Enforce shared-only access at sender, connection and sync
boundaries. A management-company-name-only match belongs in Unsorted for
review, not on a customer's record.

The November 21 Conversations decision replaces the October navigation label
“Inbox.” Keep the CRM customer record grouped by Gmail thread, with quotes
folded and staff attribution visible only internally. Replies use a slim
company signature and preview, not a branded banner. Revised estimates stay
in the original eligible CRM email thread. Keep logged notes and calls; retire
the unused scheduling, template and automation UI without dropping its data.

**Why:** Spark remains the everyday inbox; the CRM should make the customer's
conversation easy to follow without exposing the team's internal attribution.

**How to apply:** Scope to company, mailbox and customer before aggregating
visible messages. Reuse the same reply builder for preview and delivery.
Keep Property Detail unchanged in M8 and put sample cleanup behind a reviewed,
explicit admin action, not a boot job.

For chemical notices, leave product-label URLs on their existing signed-link
path. Only actual completion images are eligible for durable email links.
**Why:** recipients may retain or forward notices long after the visit; those
intentionally shared copies remain readable without a session, but this does
not authorize other private attachments.
**How to apply:** verify both the public route and recipient rendering before
claiming client compatibility. SendGrid acceptance and a successful direct
image response are separate pieces of evidence.

M9's dark strip is a new public email asset, not a replacement at the old
URL. **Why:** already-sent HTML still fetches the old strip and must not
change appearance. **How to apply:** preserve both URLs indefinitely, and
when adding new brand images, check the stored Conversations renderer's
exact same-origin image allowlist as well as the public asset response.
