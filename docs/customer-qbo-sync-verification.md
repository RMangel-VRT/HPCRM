# CQ1 verification

## Delivered files and touched call sites

- `.migration-backup/migrations/0067_customer_billing_fields.sql`: guarded additive columns, enum checks, linked-customer state backfill.
- `lib/db/src/schema/schema.ts`: customer owner columns, protected server metadata, insert validation and ownership comments.
- `artifacts/highplains-crm/src/shared/schema.ts`: synchronized column definitions, explicit owner-field validation and protected metadata guards. Billing insert defaults are intentionally applied by API/DB, not the legacy edit-form resolver, so an omitted field stays omitted.
- `artifacts/api-server/src/services/customerBilling.ts`: new live resolver and parent-billing predicate.
- `artifacts/api-server/src/services/customerBillingInput.ts`: new raw protected-key check and merged-record bill-to validation.
- `artifacts/api-server/src/services/qboCustomerMap.ts`: new pure parsers, canonicalization, diffs, payload builder and display-name validation.
- `artifacts/api-server/src/routes/routes.ts`: the **only existing HTTP call sites changed** are `POST /api/customers` and `PATCH /api/customers/:id`, plus their local scoped-storage context adapter.
- Four new API test files: `services/customerBilling.test.ts`, `services/customerBilling.migration.test.ts`, `services/qboCustomerMap.test.ts`, `routes/customerBilling.test.ts`.
- `artifacts/highplains-crm/src/shared/customerBilling.test.ts`: existing add/edit resolver compatibility smoke tests.
- `docs/customer-qbo-sync.md`, `docs/data-ownership-map.md`: contracts and staged ownership.
- Agent memory notes: clarify slice authorization boundaries and trustworthy asynchronous validation baselines.

`storage.ts`, `routes/qbo.ts`, `services/qboClient.ts`, `services/invoicePdf.ts`
and the frontend form components are **unchanged**. Existing internal insert
callers can continue relying on database defaults. No mapper is connected to a
remote request. No new `qboDisplayName` reader was added.

## Tests

- Pre-change QuickBooks baseline: **5 files / 156 tests passed**.
- Final API run: **9 files / 189 tests passed**, including those same 156 existing
  tests and 33 new acceptance tests.
- Frontend resolver smoke tests: **1 file / 2 tests passed**.
- Coverage includes normalized round trips, raw metadata, email/contact rules,
  create-only delivery suppression, sparse changed-only updates and explicit
  clearing, whole addresses, parent billing modes, live directory changes,
  incomplete addresses, same-company isolation, protected camel/snake metadata
  writes, API enum/email checks, effective PATCH transitions, omitted-default
  preservation, permissions and conflict responses.
- Migration test executes actual SQL **twice** on a connection-local temporary
  `customers` table inside a rolled-back transaction. It checks defaults,
  constraints and preservation of `pending_push`, `error`, `via_parent` and
  unlinked states. It never updates application customer rows.
- `pnpm --filter @workspace/scripts run migrate`: **passed in development**,
  1 migration applied, 0 baselined, 78 already up to date.
- Required-extension and schema-drift checks both **passed**. API and CRM
  workflows restarted successfully; proxied `/api/healthz` returned **200**.
  The public sign-in screen renders correctly. This screenshot does not claim
  to verify authenticated forms; those were checked with resolver/HTTP tests.
- Existing form behavior is verified at the actual client resolver and actual
  HTTP handlers. No new billing UI is introduced, and no browser mutation of
  real customer records was needed.

## Typecheck comparison

The initial background baseline overlapped editing and was discarded. A pristine
pre-change Git archive outside the workspace was then checked using the same
installed dependency versions, with its own relative workspace-library links.

Both baseline and result use `pnpm run typecheck`, which refreshes shared library
declarations before leaf checks. Library compilation succeeds. The full command
fails on existing API diagnostics: **721 before / 721 after**. Every
`(relative file, TypeScript error code)` diagnostic count is identical.
Messages can reorder inferred type properties or contain different archive
paths; those are not new diagnostics.

Because the canonical recursive command stops on the API failure, the CRM was
also checked independently on both trees: **223 before / 223 after**, again
identical per-file/error-code counts. **New-error delta: zero.**

Existing failures include missing returns, legacy Zod `.errors` use, untyped
frontend stub generic calls, and cross-artifact imports outside the API root.
They were not suppressed or fixed as unrelated CQ1 work.

## Prompt/code differences and boundaries

- The brief's suggested `0066` is occupied by proposal cover work. The overview
  explicitly authorizes the next unused number, so this slice uses `0067`
  without renaming history. Later slices must allocate their own free numbers.
- The overview references a design document not supplied in this checkout; the
  complete CQ1 upload supplies the acceptance contract.
- The existing frontend Drizzle stub's `omit` is a no-op. Its passthrough
  behavior is preserved; protected customer metadata is explicitly forbidden
  with optional `never` fields in the client customer insert schema.
- Existing `qboSyncedAt` is protected alongside the brief's listed binding/sync
  fields, because it is also server-owned synchronization metadata.
- No production migration, publishing, initial sync, scheduling job or external
  QuickBooks write was performed. CQ2–CQ5 remain outside this implementation.

Detailed command output is retained locally under ignored
`generated-artifacts/cq1/`, not committed or deployed.
