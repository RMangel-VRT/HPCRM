# Task server billing: implementation and verification

## Prerequisite and scope

The merged checkout already contains Task conversion, the Task seeding helper,
stable-key status maps, and corrected startup backfill ordering. No conversion,
DDL, retroactive repair, campaign-category, CRM, or mobile implementation was changed.

## Files and call sites changed

- `artifacts/api-server/src/routes/routes.ts`
  - `POST /api/tickets`: contract/extra-work requests resolve the seeded Task
    type and its keyed `new` status, overriding submitted type, status, and billing.
    Existing permissions, assignment validation, and other work types remain intact.
  - `POST /api/tickets/batch`: the same resolution applies, including when no
    client type was submitted. Duplicate checks use the resolved Task type.
    Task inputs are validated with the insert schema before ticket creation.
    Non-Task batch behavior is preserved. The batch insert explicitly supplies
    the existing database default `mobileStatus: "not_started"` to satisfy its
    required insert type; this does not alter mobile behavior.
  - `PATCH /api/tickets/:id`: Task identity is resolved after access and
    parent-customer guards. Billing/work-type validation, pairing, and current
    status locks precede status cleanup and history writes. Unsupported Task
    work types return `TASK_WORK_TYPE`; invalid billing values or conflicting
    pairs return `BILLING_MISMATCH`. Effective billing changes at
    `ready_for_billing` or `closed_won` return `BILLING_LOCKED`.
  - Status transitions reject contract Tasks entering billing and billable Tasks
    closing without an outgoing `invoice_for` link, before any transition side
    effects. Billing-change comments are written only after a successful update.
    Unrelated PATCHes still use `pickProvided`, preserving both billing fields.
  - Removed Task's type-based Ready-for-billing normalization. The existing
    direction-independent `maybeAutoCreateInvoiceOnRfb` invocation is unchanged.
- `artifacts/api-server/src/routes/taskBilling.test.ts`
  - 38 route-level tests mount the actual production mutation-handler source on
    Express with mocked storage and the real insert schema, Task seeding helper,
    and invoice helper. Only the registration block is compiled for this harness,
    avoiding unrelated startup DML. No handler logic is duplicated in the tests.
  - Coverage includes single/batch server resolution, reordered/renamed statuses,
    duplicate handling, input validation, permission and parent guards, both
    directions of billing changes, invalid/null/conflicting inputs, current-status
    locks, no-op changes, failed updates, reassignment preservation, contract
    rejection on forward and backward billing transitions, invoice link direction,
    invoice creation/idempotency, combined billing/status changes, closing paths,
    and step-back-then-switch behavior.

## Billing inference audit

All server occurrences of `invoice_required` were inspected.

| Site | Behavior and disposition |
| --- | --- |
| Task Ready-for-billing normalization in ticket PATCH | Removed. Task type alone no longer changes a ticket's billing. |
| Single and batch ticket creation | New pairing is derived from submitted `workType`, not ticket type: `contract`/`no_invoice`, `extra_work`/`invoice_required`. |
| Task billing PATCH | Explicit changes to either field derive and persist the valid pair. No default billing assignment on unrelated updates. |
| `fixEstimateRequestBillingBehavior()` in `routes.ts` | Untouched startup repair, limited to Estimate Request type plus `estimate_request` work type and existing `internal` billing. |
| Estimate Request approved-path PATCH in `routes.ts` | Untouched: Estimate Request type plus work type and approved status set `invoice_required`. |
| Direct Project approved-path PATCH in `routes.ts` | Untouched remaining type-based normalization: Project at an approved status becomes `invoice_required`. |
| `lib/convertExtraBillableToTask.ts` | Untouched prerequisite one-time classification of converted legacy Extra Billable tickets into `extra_work`/`invoice_required`. Not a runtime Task invoicing inference. |
| `routes/extraBillableBilling.ts` | Untouched campaign generation explicitly supplies both `extra_work` and `invoice_required`; campaign category stays `extra_billable`. |
| `shared/workTypeCatalog.ts` | Untouched catalog entries for extra-work and invoice work types. These are work-type configuration, not type-based Task assignment. |
| `lib/rfbInvoiceAutoCreate.ts` | Unchanged: Task is excluded from type-only eligibility; per-ticket or pending billing controls its eligibility. Other types retain existing capability/Estimate Request/Project fallbacks and outgoing-link idempotency. No `invoice_required` assignment here. |
| Legacy invoice migration scan in `routes.ts` | Unchanged read of already invoice-required tickets; does not assign billing. |
| Insert schema | Enum validation/default `no_invoice`, not type inference. |

Manual invoice creation remains limited to Estimate Request/Project. Their
Invoicing fallback and invoice auto-creation behavior are untouched.

## Verification results

- Focused command:
  `pnpm --filter @workspace/api-server exec vitest run src/routes/taskBilling.test.ts src/routes/ticketPatchRfbInvoice.test.ts`
  — **67 passed**, including 38 new route tests and 29 existing invoice tests.
- Full API command: `pnpm --filter @workspace/api-server test`
  — **473 passed, 7 failed** across 30 files. The failures also reproduce against
  an isolated copy of the merged prerequisite:
  - `src/lib/plantEnrichment.test.ts`: partial-failure test expects final
    `status: "partial"` but gets no final status.
  - `src/routes/mailboxAccounts.oauthReconnect.test.ts`: all six cases fail
    during database-schema initialization with
    `SyntaxError: "undefined" is not valid JSON`, originating from the mocked
    SQL expression used in the customer trigram index.
- Server command: `pnpm --filter @workspace/api-server run typecheck`
  — **blocked by pre-existing errors**. The prerequisite has 582 diagnostics;
  this change has 581. Comparing diagnostic file/line/code identities with
  unchanged lines mapped back to the prerequisite finds **no new diagnostics**.
  The touched batch insert's missing-mobile-default diagnostic was eliminated.
- Root command: `pnpm run typecheck`
  — **blocked on both checkouts** by missing global `File` in
  `lib/api-zod/src/generated/api.ts` and `Blob` in
  `lib/api-zod/src/generated/types/mobileUploadTicketPhotoBodyOne.ts`.
  Generated/shared typing repairs are outside this server slice.
- `git diff --check` passes.
- API managed workflow rebuilt and restarted successfully. Startup conversion
  and capability backfills were no-ops; the server is listening.
- Proxied `GET /api/healthz` returns **200**, `{"status":"ok"}`.
- CRM sign-in preview still renders. No browser end-to-end run was necessary:
  server routes and all requested billing paths are exercised by HTTP route tests.

The implementation is complete, but the requested globally clean typecheck and
fully passing API suite cannot be claimed while these confirmed baseline failures
remain. No validation command was skipped, and no failure was hidden or bypassed.