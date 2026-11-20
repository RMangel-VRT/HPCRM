# M3 — Branded service emails and Compose

## Changed files

| Area | Files and behavior |
| --- | --- |
| Work-completed email | `outgoingEmail/workCompletedEmail.ts`, `outgoingEmail/layout.ts`, `routes.ts`, `emailService.ts`: branded summary, scoped completion photos, recommendations, and follow-up. No structured crew or staff names are passed to the builder. Existing recipient, permission, rule, SendGrid, and `email_logs` behavior remains in place. |
| Company Documents | `outgoingEmail/serviceEmails.ts`, `companyDocumentEmail.ts`, `companyDocuments.ts`, `companyDocumentContracts.ts`, `EmailDocumentsDialog.tsx`: optional note and read-only preview; the sent text and HTML are saved on the communication. |
| Compose and customer sends | `composeEmail.ts` (service and routes), `customerCommunicationCreate.ts`, `gmailSender.ts`, `routes.ts`, `ComposeDrawer.tsx`, `BrandedEmailPreview.tsx`, `AllCommunicationsTab.tsx`, `LogCommunicationForm.tsx`: shared delivery path, company and mailbox checks, send reservation, branded preview, plain-text Gmail replies, and log-only handling for disconnected and sync-disabled mailboxes. |
| Templates and automation | `communicationTemplateCleanup.ts`, `communicationTemplates.ts`, `communicationPermissions.ts`, `automationService.ts`, `routes.ts`: guarded, repeatable data-only cleanup, one permission-checked template API, and a disabled, hidden Proposal Follow-Up rule. |
| Contracts and translations | `openapi.yaml`, generated API client and types, `en.ts`, `es.ts`: new endpoints, payload contracts, and English/Spanish UI strings. |

## Verification

- 88 focused API tests (including the shared layout tests after integrating
  main's internal email changes) and 29 rendered CRM tests passed. Coverage includes
  exact preview/send bodies, two attachments, escaping, reply headers,
  simultaneous and repeated draft send attempts, cross-company requests,
  missing and hidden mailboxes, customer log-only behavior, recorded Gmail failures, the template
  endpoints, and a second pass of the startup cleanup that writes nothing.
- API code generation and the bundled server build passed. The bundle
  contains the shared Compose sender and no relative Gmail sender import.
- Using the same refreshed shared declarations, API typecheck diagnostics
  went from **677 to 675** and CRM diagnostics remained **186**. Both leaf
  typechecks still report existing errors.
- SendGrid accepted one work-completed email for the designated test inbox
  using a synthetic ticket and PNG. The development photo URL served the
  same image without a session. The disabled rule produced no delivery.
- Live Gmail delivery of Company Documents, new Compose, and the reply was
  not possible: development had no connected Gmail mailbox. Gmail web and
  iPhone mailbox screenshots were not available. No customers were contacted.
