# Task server conversion report

Verified on 2026-10-01. Server-only P1-1 slice; no production writes or publish.

## Outcome

- Stable ticket-type identity is `task`, seeded display name is Task.
- Task requires customer, scheduling, and completion, not invoicing; terminal behavior is close.
- Both contract and extra work map to Task. Catalog names are Contract and Billable; billing labels and behaviors are unchanged.
- Boot order is existing type rename → atomic Extra Billable conversion → capability/status-key backfill.
- The conversion changes the existing type row, not its ID or relationships. It classifies all tickets already on that row as `extra_work` / `invoice_required`, without changing statuses, history, custom fields, or dates.
- Company-row locking serializes competing startup conversions. Once the legacy key/name is replaced, repeat invocation does not revisit that type's tickets.
- Keyed Task or unkeyed exact-name Task conflicts warn and skip. Quick Task is not a conversion candidate or conflict.
- The subsequent Task backfill is key-only: it does not claim or modify a hand-made unkeyed exact-name Task.
- Campaign category `extra_billable` remains unchanged. Generated campaign Tasks retain per-ticket invoice-required billing and linked Invoice creation.
- Task never qualifies for automatic invoicing solely by type, even with a misleading invoicing capability. Current/pending ticket billing behavior remains eligible.
- The existing Ready for Billing normalization block changed only its type-key argument. Its behavior and old diagnostic wording remain deliberately unchanged for the billing-rules slice.
- Removed both unused legacy migrations and their runner entries. The conversion is called directly from route registration, not the uncalled migration runner.

## Read-only preflight

The following query was executed through approved database access against both environments before the first updated development startup:

```sql
SELECT company_id, id, name, type_key
FROM ticket_types
WHERE name ILIKE '%task%';
```

| Environment | Result |
| --- | --- |
| Development | Successful, zero rows; output contained only `company_id,id,name,type_key`. |
| Production | Successful, zero rows; output contained only `company_id,id,name,type_key`. |

No production-access blocker occurred. These are name-discovery results, not authorization to change custom types.

## Development startup evidence

| Startup | Companies examined | Types converted | Tickets classified | Conflicts |
| --- | ---: | ---: | ---: | ---: |
| First updated startup, 22:30:02 | 0 | 0 | 0 | 0 |
| Second startup, 22:30:29 | 0 | 0 | 0 | 0 |

Both emitted:

```text
[convertExtraBillableToTask] companies=0 types=0 tickets=0 conflicts=0
```

Both were followed by successful capability backfill and `Server listening`.
The development database had no ticket-type rows: a subsequent read-only grouping by name/type key returned zero rows. Therefore, there were no actual development Extra Billable tickets to convert. These logs demonstrate the real startup path but **do not claim a nonzero live-data conversion**. Nonempty first-run conversion and zero repeat conversion are verified by real-database tests using rollback-isolated fixtures; no fixtures were persisted to manufacture startup counts.

The proxied `/api/healthz` returned HTTP 200 with `{"status":"ok"}`.
An unchanged CRM preview screenshot was attempted but timed out while capturing; no client page was modified in this slice.

## Changed files and touched call sites

All API paths below are relative to `artifacts/api-server/src/`.

| File | Changes / call sites |
| --- | --- |
| `lib/convertExtraBillableToTask.ts` (new) | Missing-column discovery guard; candidate selection; company lock and re-read; conflict guard; transactional in-place type update and existing-ticket classification; conversion counts/warnings. |
| `lib/convertExtraBillableToTask.test.ts` (new) | Database rollback fixtures for keyed/unkeyed conversion, repeat invocation/new contract Tasks, both conflicts, custom Quick Task/exact Task, relationships and missing columns. |
| `shared/ticketCapabilities.ts` | Capability definition, names-by-key, legacy unkeyed alias, status-key backfill catalog. |
| `shared/ticketCapabilities.test.ts` | New identity/key authority/legacy fallback and capability assertions. |
| `shared/workTypeCatalog.ts` | Contract/Billable display names, both work-type mappings to Task, type union; correct type import from `@workspace/db`. |
| `shared/workTypeCatalog.test.ts` (new) | Mapping, catalog names, and unchanged billing-label/behavior assertions. |
| `routes/routes.ts` | Static conversion import and boot call; renamed/exported `ensureTaskTicketType`; Task seed identity/description/capabilities; status map now keyed by stable keys including field attachment via `work_completed`; `seedAllTicketTypes` call; Task-only capability/key/status backfill guards; RFB normalization type-key argument; campaign billing dependency wiring; deletion of `migrateExtraBillableTicketType` and `fixExtraBillableDoneOrder` plus runner entries. |
| `routes/taskTicketType.test.ts` (new) | New-company Task/status/field seeding and renamed keyed Task/status reuse without duplicates. |
| `routes/ticketCapabilityBackfill.test.ts` | Key-only Task mock handling and regression asserting conflicting exact-name custom Task remains unclaimed/unmodified. |
| `routes/dashboardQueue.ts` | Seeded, pulse, and Ready for Billing type-key sets now use Task. Existing status-key classification is retained. |
| `routes/dashboardQueue.test.ts` | Renamed keyed Task in action queue and pulse billing context. |
| `lib/rfbInvoiceAutoCreate.ts` | Remove type-only Task eligibility, retain ticket billing behavior, switch diagnostic type check to Task. |
| `routes/ticketPatchRfbInvoice.test.ts` | Task type-ineligible assertions, billable forward/step-back invoice creation, no-invoice Task skip, pending billing and stable-key coverage. |
| `routes/extraBillableBilling.ts` | Dependency renamed to `ensureTaskTicketType`; `resolveTicketTypeInfo` uses `ready_for_billing`; summary lookup and generated ticket diagnostics refer to Task. Campaign endpoints/categories remain unchanged. |
| `routes/extraBillableCampaign.generateTickets.test.ts` | Dependency/status-map mocks now use Task and stable status keys; existing generation, photo copy, invoice linking, bulk, and billing-summary tests retained. |
| `lib/db/src/schema/schema.ts` (workspace path) | Replace ticket-type key union and insert-schema enum member with `task`; no DDL or campaign-category changes. |
| This report | Preflight, boot, verification, changed-file and residual-reference audit. |
| `.agents/memory/MEMORY.md`, `.agents/memory/task-name-conflict-policy.md` | Durable rationale for not claiming custom exact-name Task types. |

No frontend, mobile, DDL migration, status-label/order/history migration, or extra-work To-Do migration was made. `pickProvided` was retained.

## Verification

Focused command:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/convertExtraBillableToTask.test.ts \
  src/shared/ticketCapabilities.test.ts \
  src/shared/workTypeCatalog.test.ts \
  src/routes/ticketCapabilityBackfill.test.ts \
  src/routes/taskTicketType.test.ts \
  src/routes/ticketPatchRfbInvoice.test.ts \
  src/routes/dashboardQueue.test.ts \
  src/routes/extraBillableCampaign.generateTickets.test.ts
```

Result: **8 files passed, 74 tests passed**. Conversion tests use PostgreSQL transactions/savepoints and roll back all fixtures. Preservation assertions include statuses, custom type fields, ticket field values, history and dates.

`pnpm --filter @workspace/api-server test`: **27 files passed, 2 failed; 435 tests passed, 7 failed**.
An unchanged HEAD source copy was tested separately: **24 files passed, 2 failed; 420 tests passed, the same 7 failed**.

Baseline failures:

1. `src/lib/plantEnrichment.test.ts`: `enrichPlants — partial failure > marks the sync run as 'partial' in the DB`; expected `partial`, received undefined.
2. Six cases in `src/routes/mailboxAccounts.oauthReconnect.test.ts`: three OAuth reconnect cases, shared-email mismatch, personal-email correction, and already-claimed email rejection. They fail with `SyntaxError: "undefined" is not valid JSON` while mocked Drizzle SQL reaches schema/index initialization.

`pnpm run typecheck`: fails on existing generated API types:

- `lib/api-zod/src/generated/api.ts(683,17)`: cannot find name `File`.
- `lib/api-zod/src/generated/types/mobileUploadTicketPhotoBodyOne.ts(11,9)`: cannot find name `Blob`.

`pnpm --filter @workspace/api-server run typecheck` also fails on existing API-wide diagnostics (routes, storage, authentication, tests, unresolved modules). No diagnostics were reported in the new conversion/seeding files or changed identity, invoice, queue, campaign and backfill test files. The touched catalog's stale `./schema` import was corrected rather than retained. These checks are reported as failed, not skipped or passed.

Build/restart succeeds, health check passes, and diff whitespace check passes.

## Residual Extra Billable reference audit

Audit scope: API server source, excluding generated bundles and installed dependencies. Every retained string occurrence belongs to one of these entries:

| File / locations | Reason retained |
| --- | --- |
| `lib/convertExtraBillableToTask.ts`: legacy candidate query, key/name re-read, documentation and conflict/error diagnostics | Must identify old rows and explain the conversion; the old key is not a new seeded identity. |
| `lib/convertExtraBillableToTask.test.ts`: old-key/name fixtures and conflict/preservation assertions | Required legacy migration regression coverage. |
| `shared/ticketCapabilities.ts`: `task: ["Extra Billable"]` | Deliberate unkeyed legacy-name alias only. A non-null key is authoritative. |
| `shared/ticketCapabilities.test.ts`: old-name fallback and mismatched-key assertions | Prove legacy fallback never overrides another key. |
| `routes/ticketCapabilityBackfill.test.ts`: conflicting legacy fixture | Prove skipped legacy/custom types are not claimed by later Task backfill. |
| `shared/workTypeCatalog.ts` and its test: `billingLabel: "Extra Billable"` | Billing labels explicitly must remain unchanged; catalog name itself is now Billable. |
| `routes/routes.ts`: old RFB normalization comment/log | Only its type-key argument is in scope; replacement of the normalization block belongs to the server billing-rules slice. |
| `routes/routes.ts`: campaign visibility/category whitelist, checklist creation, crew item access, completion checks, campaign billing section heading, photo/note access checks | These are the unchanged `extra_billable` **campaign category**, not a ticket-type key. |
| `routes/extraBillableBilling.ts`: three category guards and bulk/single generation failure diagnostics | Category guards enforce the unchanged campaign category; remaining diagnostics describe the campaign operation. Generated ticket diagnostics now say Task. |
| `routes/extraBillableCampaign.generateTickets.test.ts`: category fixture and rejection test | Campaign-category compatibility/regression coverage. |
| `routes/extraBillablePhotos.ts`: upload/delete category guards; matching `.test.ts` fixture/rejection case | Existing campaign photo permissions/category validation remain unchanged. |
| `lib/extraBillableAccess.ts`: campaign item visibility documentation and two category checks; matching `.test.ts` campaign fixtures/assertions/descriptions | Existing campaign crew-access, filtering, and eligibility policies remain unchanged. |
| `storage.ts`: both campaign-category conditions in extra-billable crew/batch queries | These classify campaigns, not ticket types. |

There are no remaining `ensureExtraBillableTicketType`, `migrateExtraBillableTicketType`, or `fixExtraBillableDoneOrder` call sites. API UI/i18n ticket-type references were not found beyond the deliberately retained billing label; client UI/i18n outside this artifact was not changed.

## Remaining planned work

Server create/update billing rules and replacement of the RFB normalization block, plus client New Task/schema/billing controls, are existing downstream slices. No overlapping follow-up tasks were created.