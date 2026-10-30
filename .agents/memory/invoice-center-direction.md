---
name: Invoice Center integration direction
description: Uploaded draft, locked business decisions, superseded invoice plans, and open review items.
---

Read `attached_assets/Pasted--Invoice-Center-Integration-Design-Spec-Status-Draft-fo_1793374046412.txt` before planning Invoice Center work. It is explicitly a draft for review, with identified locked decisions, not authorization to build or publish. It supersedes the earlier invoice-center brief and estimate-builder invoice trigger/push and Phase 5 slice list. Code baselines, migration numbers, and claims about existing features must be checked against current code.

**Why:** The user supplied a consolidated integration design rather than an implementation request.

**How to apply:** Preserve its review status; use freshly scoped slices only when requested. The referenced approved mockup is not itself included or verified by reading this text.

The draft records CRM ownership of invoice composition and billed amounts; QuickBooks owns tax, payment, AR and deposits, with explicitly managed CRM mirrors. Admin/office review before push. CRM sends its own branded PDF; QuickBooks must never email the customer. Paid state is read from QuickBooks, never manually set.

CRM numbers use maintenance MA and snow SN sequences; IrrigoPro alone owns IR. Mixed maintenance/snow sources split into separate drafts; irrigation within a CRM landscape job stays on MA. Issued corrections retain the number and update the same QuickBooks invoice in place, preserving revision history. Later accepted-estimate change orders offer a supplemental invoice instead of silently revising the original.

**Why:** These are the business decisions explicitly marked locked in the supplied design; avoiding duplicate charges and invoice-number collisions is central.

**How to apply:** Do not build competing numbering, payment ownership or email paths. Frozen accepted-estimate extended amounts must carry through unchanged. Reconcile sync and revision safety against the full draft before implementing.

The initial rollout is feature-flagged and preserves existing Invoice tickets until they drain. Manual use precedes contract billing and per-job feeder switch-over. No destructive schema cleanup is authorized. Statements/PNC master bill, snow-event feeding and webhooks are deferred. PDF/email payments are checks, ACH by arrangement only, with no online-payment link or published ACH details.

**Why:** The design requires a staged migration without disrupting current billing or creating unsupported payment paths.

**How to apply:** Retain existing ownership safety rules and require explicit approval for real pushes, sends or rollout. Open items include QBO category setup, custom-numbering confirmation, sender/reply-to, document business details/terms, and estimate PDF grouping; do not invent their answers.
