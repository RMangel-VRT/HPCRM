# E5 — Email estimates from the CRM

## Behavior and ownership

- **Send estimate** opens a bilingual message with connected, visible Gmail
  mailboxes; it defaults to a shared mailbox, then the signed-in user’s own.
  Recipient suggestions use this customer’s contacts, billing addresses, and
  property manager. A sole distinct manager/primary-contact address is prefilled.
  The dialog shows the attachment name, estimated pages and any lines needing
  a price. Without a connected mailbox, it links to settings and disables send.
- `POST /api/estimates/:id/versions/:versionId/send-email` checks the current
  draft, estimate access, mailbox visibility and recipient limits. It reserves
  the version and RFC Message-ID before calling Gmail, which blocks competing
  writes and lets Sent-folder sync deduplicate even before the receipt is recorded.
  The reservation is hidden from communication history. A provider rejection
  removes it and releases the draft without changing the estimate’s lifecycle.
  An interrupted or otherwise unconfirmed delivery retains the reserved RFC ID
  and exact attachment, keeps edits and repeat sends blocked, and directs the
  user to the mailbox’s Sent folder rather than reporting a failed delivery.
- After Gmail accepts, the customer communication is recorded before the
  existing send transition. The communications table has no ticket relation;
  the estimate still advances its linked ticket through the existing client
  routine. If the transition fails, retrying `/send` only marks the already
  delivered version. It does not call Gmail. If the delivery receipt itself
  cannot be saved, the reservation stays locked rather than permitting another
  send; the dialog directs the user to the mailbox’s Sent folder.
- The estimate version holds a private reference to the exact first emailed
  PDF and its filename; the outbound communication owns recipients and provider
  fields. The original is used for preview, download, and **Email it again**
  even if the live work location, catalog display, or version-label rules
  subsequently change. Resend requires explicit `X-Estimate-Resend: 1` intent,
  logs a new communication, and does not rerun the lifecycle or ticket
  advancement. The sender and Company Documents feature were not changed.
- **Mark sent without emailing** supports hard copy, portal and other. Neither
  mark-only sends nor older records get a fabricated original. Their PDFs remain
  regenerated, and **Email it again** is not offered for them.

## Changed files

| Area | Files |
| --- | --- |
| Database and public contract | `0092_estimate_issued_email_pdf.sql`, `lib/db/src/{estimateContracts.ts,schema/estimates.ts,schema/schema.ts}`, `lib/api-spec/openapi.yaml` and generated client/validators |
| Server | `routes/estimates.ts`, `objectStorage.ts`, `services/{estimateEmail,estimateEmailOptions,estimateIssuedPdf,estimateLifecycle,estimatePdf,estimateReads,estimateWorkLocation,estimates}.ts` |
| CRM | `EstimateBuilder.tsx`, `components/estimates/{SendEstimateDialog,EstimateReviewRail,LifecycleDialogs,PdfPreviewDialog}.tsx`, `lib/{estimateBuilder,estimateLifecycleActions}.ts`, and EN/ES translations |
| Verification | `estimateEmail.integration.test.ts`, `EstimateBuilder.lifecycle.rendered.test.tsx` and updated primary-action assertions in the builder suites |

## Verification

- The additive migration was applied to development only. Required extensions and
  schema drift checks passed. The App Storage smoke test wrote a synthetic private
  object, read the same bytes, verified generic-reader denial, and removed it.
- Five CRM suites passed all 176 tests, including localized defaults, no-mailbox
  behavior, price confirmation, recipient history, transition-only recovery,
  explicit resend, mark-only flow and linked-ticket advancement.
- All eight E5 API tests passed using PostgreSQL and Chromium with a fake Gmail
  sender; another 41 existing estimate and Company Documents checks passed. They
  verify the message and PDF, provider failure, confirmed-delivery recovery,
  explicit resend after a location change and revision, company and role scope,
  in-flight concurrency, a connection reset after Gmail acceptance, and
  Sent-folder dedup before and after delivery. An
  initial run used Vitest’s five-second default for the real Chromium/full-route
  test; rerunning with a render-appropriate timeout passed without test failures.
- Shared-library typecheck passed. The API and CRM retained their existing
  694 and 186 TypeScript diagnostics, respectively, with no additions by
  file and diagnostic code.
- The CRM workflow served the changed Vite modules. The development API
  workflow built successfully but did not open its port before the timeout
  while running existing startup backfills. Integration tests use the actual
  estimate routes without going through those unrelated startup jobs.
  No external Gmail message was sent and no production change was made.
