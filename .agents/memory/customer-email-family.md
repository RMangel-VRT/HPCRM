---
name: Customer email family
description: November 20 decisions for branded customer emails and fixed-layout wording.
---

Customer emails speak as High Plains, not an individual staff member. Use one
shared email-safe layout, with company contact facts from Document settings
and the company name from the company. Staff may edit wording and review a
server-rendered preview; the layout is fixed and there is no HTML editor.
Prefer the shared office Gmail mailbox. Bulk chemical mail stays on SendGrid
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

Keep mail-client evidence separate from browser preview evidence. An empty
iframe sandbox gives the preview an opaque origin, and Chromium can block
images from loopback even when the files are served correctly. **Why:** local
image failures do not establish how the public image URLs behave in real mail
clients. **How to apply:** check the PNG responses separately and confirm image
loading in actual mail clients only when the public paths and approved test
mailbox are available.
