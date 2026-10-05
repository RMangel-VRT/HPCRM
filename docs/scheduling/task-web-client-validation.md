# Task web client implementation and validation

## Changed files and call sites

All paths below are relative to `artifacts/highplains-crm/src/` unless stated otherwise.

- `shared/schema.ts`: declares the server-equivalent `TicketTypeKey` union, `ticketTypes.typeKey`, and `ticketTypeStatuses.statusKey`. The new generic column expression is explicitly typed because the existing frontend stub returns `any`.
- `shared/ticketVisuals.ts`: Task identity, key-first seeded type finder, server-equivalent unkeyed legacy aliases, existing `--tt-extra` hue, and Task-only workflow projection.
- `shared/workTypeCatalog.ts`: Contract/Billable names and Task type mappings.
- `components/TicketIdentity.tsx`: Task icon and translated billing chip; billing supplied by callers.
- `components/TicketCard.tsx`: supplies billing behavior, replaces the old work-type badge for Tasks, and projects Contract progress without the billing step.
- `components/dashboard/NeedsYouQueue.tsx`: reuses the ticket detail query/cache for billing data omitted from the queue envelope; never guesses billing from status.
- `pages/NewTicket.tsx`: seeded-key type resolution and initializer checks, Task/Other picker, exact English explanatory copy with Spanish translations, Contract/Billable POSTs omit server-owned billing behavior, standalone Invoice uses `admin` and preserves Invoice billing behavior, RFP remains `admin`, creation validation messages.
- `pages/TicketDetail.tsx`: Task icon, Contract `work_completed` → `closed_won` advancement by status key, projected forward/backward workflow and stepper, Task billing control replacing work-type metadata, paired PATCH fields, permission/status/pending locks, readable 422 failures, affected cache invalidation including customer ticket lists. The existing 409 `INVOICE_COMPLETED` branch is unchanged.
- `pages/TicketsList.tsx`: billing data supplied to kanban and local card badge renderers, Contract local-card progress projection, renamed filters.
- `pages/MyTickets.tsx`: billing data supplied to badge renderer and renamed filters.
- `components/TicketListView.tsx`: renamed Contract/Billable filters (shared card handles badge/progress behavior).
- `i18n/locales/en.ts`, `i18n/locales/es.ts`: ticket terminology, picker copy, billing labels/lock helper, four generated-ticket campaign strings.
- `artifacts/api-server/src/shared/taskWebClient.test.ts`: focused client helper tests using the existing Vitest runner; no server implementation change.
- `docs/scheduling/task-web-client-validation.md`: this report.
- `.agents/memory/MEMORY.md`, `.agents/memory/task-billing-terminology.md`: durable rationale for the approved client/server/campaign terminology boundary.

## Deliberate catalog divergence

The client `extra_work.billingLabel` is **Billable**. The server catalog intentionally retains **Extra Billable** for its existing tests. The client mirrors the server's Contract/Billable work-type names and Task mappings, but does not change the server catalog, campaign categories, or campaign generation behavior.

## Focused checks

- `pnpm --filter @workspace/api-server exec vitest run src/shared/taskWebClient.test.ts src/shared/ticketCapabilities.test.ts src/shared/workTypeCatalog.test.ts`: **3 files / 17 tests pass**.
- `pnpm --filter @workspace/api-server exec vitest run src/routes/taskBilling.test.ts src/routes/taskTicketType.test.ts`: **2 files / 40 tests pass**. These existing route-level tests complement, but do not substitute for, real-server browser checks.
- Tests cover authoritative keys, renamed types/statuses, unkeyed aliases, keyed-row preference, preserved Task hue, Contract/Billable workflow projection, structured server messages and the two missing-message fallbacks, unchanged global error precedence, non-interference with 409 errors, and Drizzle-stub passthrough across omit/extend.
- `PORT=23878 BASE_PATH=/ pnpm --filter @workspace/highplains-crm run build`: **passes**; existing large-chunk warning remains. Running the same command without artifact environment variables fails at the existing Vite `PORT`/`BASE_PATH` guard, not application compilation.
- `git diff --check`: **passes**.
- Both managed web/API workflows started successfully. API schema/required-extension checks reported in sync.

## Existing typecheck failures, not regressions

- Root `pnpm run typecheck` was run before and after implementation. Both stop in generated API schemas:
  - `lib/api-zod/src/generated/api.ts`: missing `File`.
  - `lib/api-zod/src/generated/types/mobileUploadTicketPhotoBodyOne.ts`: missing `Blob`.
- CRM `pnpm --filter @workspace/highplains-crm run typecheck` / equivalent `tsc -p tsconfig.json --noEmit --pretty false`: **225 existing diagnostics; no introduced diagnostics**.
- Comparison used isolated CRM copies with unchanged files restored from Git HEAD in the baseline copy, the same config/dependencies, and normalized path/code/message matching ignoring shifted line numbers. No workspace code was reverted.
- Baseline/current per-file diagnostic counts are identical:

| File under CRM `src/` | Both baseline and current |
|---|---:|
| `App.tsx` | 2 |
| `components/customer/communications/UnsortedTab.tsx` | 2 |
| `components/LoadingScreen.tsx` | 1 |
| `components/ScheduleSummary.tsx` | 6 |
| `components/ServiceFulfillmentPanel.tsx` | 1 |
| `components/ServicePlanTemplatesAdmin.tsx` | 3 |
| `components/ui/calendar.tsx` | 3 |
| `pages/communications/InboxTab.tsx` | 1 |
| `pages/CrewWorksheetPrint.tsx` | 2 |
| `pages/CustomerDetail.tsx` | 10 |
| `pages/CustomerRouteMap.tsx` | 1 |
| `pages/ProposalDraft.tsx` | 26 |
| `pages/ProposalVersion.tsx` | 2 |
| `pages/SettingsPage.tsx` | 2 |
| `pages/TicketDetail.tsx` | 5 |
| `pages/VisualScopeEditor.tsx` | 3 |
| `shared/schema.ts` | 155 |

These pre-existing failures were not hidden by weakening compiler settings or broadened into unrelated cleanup.

## Real-server end-to-end checks

The documented login account was absent from the current development database. Validation resumed with a disposable development admin account and a real session login, without modifying an existing user or password.

| Journey | Result |
|---|---|
| Contract creation | Passed; POST omitted `billingBehavior`, server returned `contract` / `no_invoice`. |
| Contract advancement | Passed through New → Ready to Schedule → In Progress → Work Completed → Done; the final move went directly to `closed_won` in one click. |
| Billable creation | Passed; POST omitted `billingBehavior`, server returned `extra_work` / `invoice_required`. |
| Pre-billing switch | Both directions returned 200 with the correct paired fields; API/accessibility state and subsequent page state confirmed the updated value. |
| Billable progression | Ready for Billing retained; linked Pending Invoice created. |
| Single label | Ticket-list cards showed one Billable/Contract chip each; Task detail showed the billing control instead of old work-type metadata. |
| Billing locks | Controls disabled at Ready for Billing and Done with lock helper. |
| Real 422 guards | `CONTRACT_CANNOT_BILL` and `BILLING_LOCKED` observed from actual server requests; rejected requests left stored fields/status unchanged. Readable-message/fallback parsing separately covered by focused tests. |
| To-Do | `admin` / `internal`; retained To-Do and internal/not-invoiced behavior. |
| Shop To-Do | `shop_todo` / `internal`; retained To-Do, Open status, no required customer/equipment. |
| Standalone Invoice | `admin` / `invoice_required`; retained Invoice, Pending Invoice status, and Maintenance category. |
| RFP | Retained RFP Request, internal billing, Request Received status, and Maintenance-only service request selection. |
| Permissions | Office role received actual 403 for creation. Billing-control permission gating inspected against the existing `canEdit` rule. |
| Renames | Test-only type/status rename succeeded and was restored; stable-key behavior retained. |
| 409 invoice conflicts | Existing handler and route behavior inspected, not triggered with an additional Estimate Request/Project fixture. |

Reviewed browser screenshots:

- `rzzmsz`: Contract/Billable cards and their distinct workflow paths.
- `uin24b`: Billable Ready for Billing lock and linked Pending Invoice.
- `ejg5vf`: Contract Done and billing lock.
- `iq02ld`, `c55qg1`: To-Do and Shop To-Do.
- `7p1ol7`, `sw64tb`: standalone Invoice and RFP.

Cleanup audit confirmed removal of all seven test-created tickets (including the generated Invoice), four fixture-created ticket types and their statuses/fields, two fixture-created customers, temporary user/membership, and private credential file. The original development company remained. No pre-existing users, types, or customers were removed.

An existing invalid nested-button warning appeared in the ticket-list selection control; the list rendered and the changed chips/cards were usable. One immediate toggle screenshot lagged briefly, but server/accessibility state and later page state agreed. No additional whole-journey browser pass was run.

## Scoped residual-reference audit

Command:

```sh
rg -n 'extra_billable|Extra Billable|Trabajo Extra Facturable' artifacts/highplains-crm/src --glob '*.{ts,tsx}'
```

All 14 remaining hits are intentional:

- `shared/ticketVisuals.ts`: **one** server-equivalent unkeyed `"Extra Billable"` legacy type-name alias; a non-null old key is not treated as Task.
- `shared/schema.ts`: **three** campaign-category/schema/comment references, unchanged.
- `i18n/locales/en.ts`: **one** preserved `campaigns.categoryExtraBillable` label. Spanish preserves the corresponding `"Extra Facturable"` category label.
- `pages/CampaignDetail.tsx`: **two** campaign-category references, unchanged.
- `pages/CampaignsList.tsx`: **six** category values/behavior/labels, unchanged.
- `pages/CampaignItemDetail.tsx`: **one** campaign-category comparison, unchanged.

The four campaign keys `billingConfirmAllDesc`, `billingGenerateRowConfirm`, `billingTicketCreatedBanner`, and `billingGenerateInline` say **Billable Task(s)** / **Tarea(s) Facturable(s)** because they describe tickets, not categories.

No mobile, server schema/migration/billing implementation, campaign generation, `QuickAddToDo`, or `BatchTicketDialog` changes were made.