# Invoice Center IC1: data foundation and draft API

## Shared draft PDF preview

IC4 adds `GET /api/invoices/:id/pdf` under the existing access-before-flag guard.
The response is inline PDF with no-store/nosniff; `download=1` uses attachment.
Revision filenames are `MA-1001.pdf` / `MA-1001-rev1.pdf`. Foreign invoices
remain 404; non-draft invoices return 409 `INVOICE_NOT_DRAFT` until issued-PDF
storage/regeneration is implemented in the owning lifecycle slice.

The read-only repeatable-read resolver projects captured lines and subtotal,
current company-qualified customer/billing details and document settings.
No source-feeder lookups, issue snapshots, events, QBO values or PDF storage
are written. Tax/final payable totals are not represented as final amounts in
drafts: the PDF says **Subtotal before tax**, shows the QuickBooks tax notice,
uses dashes for unpriced lines and clearly marks DRAFT on every page.
See [the shared document contract](document-kit.md) for rendering, settings,
assets, Chromium setup, future proposal extension constraints and evidence.

## Scope and ownership

IC1 adds invoice document storage and a server-only standalone draft API. No
screens, navigation, translations, mobile changes, QuickBooks calls, source
synchronization, PDFs, mail delivery, payments, monthly creation or revisions.
The attached IC1 brief governs this slice; the broader integration design is
draft context and does not authorize its later slices.

`invoices` and `invoice_number_sequences` own the new document identity, number
and state. `invoice_lines` owns captured billed values; `calculateExtendedCents`
from the existing estimate module is the sole calculated amount writer.
Snapshots are reserved for freezing at issue in IC3. QuickBooks owns tax,
total, balance and payment state; the named `pushInvoice` / `pullPayments`
mirrors are reserved, not populated by IC1. Due date, terms and QBO identity
metadata also remain untouched. Push/send tables are reserved only.

**Existing Invoice tickets and `ticket_links` remain authoritative for existing
billing workflows until IC8.** No legacy readers/writers, pending-invoices,
ticket numbers, auto-creation, Mark invoiced, campaign or snow billing states
are switched or synchronized here.

## Migration and development-only flag

`0060_invoices.sql` creates six guarded, additive tables and indexes. Apply
through `pnpm --filter @workspace/scripts run migrate` in development or the
existing post-merge flow. No historical migration is renamed or modified,
no startup DDL or seeding is introduced, and no production writes or
publication are part of this task.

The flag is company-scoped `settings.feature_flags.invoiceCenter`. Missing rows,
invalid JSON, arrays/null, anything other than the boolean `true`, and read
failures all disable it. No settings UI is added. To enable **only a chosen
development company**, preserve all other flags when manually editing its
existing settings row:

```sql
-- Run only against DEVELOPMENT, binding the intended company ID as $1.
-- Existing feature_flags must be a valid JSON object; inspect/correct it first.
UPDATE settings
SET feature_flags = jsonb_set(feature_flags::jsonb, '{invoiceCenter}', 'true'::jsonb)::text
WHERE company_id = $1;
```

No actual company flag is enabled by installation. Tests use disposable
companies/settings and remove them afterwards.

## Driver-free contracts and JSON

Import constants, helpers, strict request schemas and DTOs through
`@workspace/db/invoice-contracts`. CRM's shared schema re-exports that module
without importing PostgreSQL or relying on the frontend Drizzle stub.
Database table declarations are exported through `@workspace/db`.
JSON DTO timestamps are ISO strings even for direct service callers;
calendar dates remain validated `YYYY-MM-DD` strings.

Create accepts `customerId`, `prefix` (defaults MA), `kind` (required,
`standalone` only), `title`, optional `memo`, `poNumber`, `txnDate`.
PATCH schemas have explicit fields, no defaults, reject empty changes and
unknown fields. State, numbering, source, liveness, snapshots, derived money
and QBO fields cannot be supplied by clients. Null clears optional header
values or line quantity/rate; omission preserves the existing value.

Quantity follows the estimate contract: positive decimal strings or plain
numeric JSON with at most two decimals, no input rounding or exponent strings.
Range is `0.01`–`9999999999.99` (`numeric(12,2)`); reads normalize to two places.
Rates are nonnegative int32 cents. Blank pricing is null, not a silent zero.
Extensions use exact BigInt hundredths and half-up rounding:
`2.5 × 33¢ = 83¢`. Extensions and subtotal must fit `2147483647` cents.
Any overflow rolls back the entire transaction, including line/event changes.

## Authentication and routes

All ten endpoints run `invoiceAccess` before feature-flag evaluation:
authentication, admin/office role, active company, optional `X-Company-Id`
expectation, and `Cache-Control: no-store`. The header never grants access;
it prevents queued requests from crossing an active-company switch.
Flag off returns 404 `{ "error": "INVOICE_CENTER_DISABLED" }`, before parsing
the request. All data reads and writes are company-scoped.

| Method | Path | Input / response |
|---|---|---|
| GET | `/api/invoices` | Strict `status?`, `customerId?`, `prefix?`, `search?`; bare `InvoiceListItemDto[]` |
| POST | `/api/invoices` | Create contract; 201 detail |
| GET | `/api/invoices/:id` | Detail with ordered lines |
| PATCH | `/api/invoices/:id` | `title?`, `memo?`, `poNumber?`, `txnDate?`, `customerId?`; detail |
| POST | `/api/invoices/:id/lines` | `category`, `description`, `unit`, `quantity?`, `rateCents?`; 201 detail |
| PATCH | `/api/invoices/:id/lines/:lineId` | Explicit optional versions of the same five fields; detail |
| DELETE | `/api/invoices/:id/lines/:lineId` | 200 detail |
| POST | `/api/invoices/:id/lines/reorder` | `{lineIds: string[]}`; detail |
| POST | `/api/invoices/:id/cancel` | `{reason}`; detail |
| GET | `/api/invoices/:id/events` | Bare event array, newest creation time first, descending ID tie-break |

Every create/edit/delete/cancel returns the same `InvoiceDetailDto`: invoice
fields, display `number`, current `customerName`, ordered `lines` and informational
`pushReadiness: {ready, problems}`. Problems are `{code:"NO_LINES"}`,
`{code:"UNPRICED_LINE",lineIds}`, `{code:"CUSTOMER_NOT_LINKED"}` and
`{code:"ZERO_TOTAL"}`. IC1 never acts on readiness.

List search is a case-insensitive literal substring of display number/title/
customer name. All statuses are included unless filtered. Lists use one batched
join, ordered updated descending then ID ascending. Lines order by display
order, created time and ID. Detail reads use a repeatable-read snapshot so
concurrent mutations cannot mix header and line versions.

## Transactions, numbers and edits

Creation locks the company-qualified bill-to customer `FOR SHARE`; parent
customers are valid. It atomically allocates the company/prefix counter,
inserts a draft with source summary `Manual` and records `created`.
MA and SN each start at 1001 and grow without padding or truncation.
IrrigoPro's IR prefix is not available in this app.

Despite the specified `next_value` column name, the stored value is the most
recently allocated number: the first INSERT returns 1001, each conflicting
allocation increments and returns once. A failed transaction consumes no
number. Every committed draft keeps its number, including cancelled drafts;
there is no invoice-delete endpoint. Revisions are reserved for later slices.

All existing draft edits acquire the company-qualified invoice `FOR UPDATE`
first, reject non-drafts with 409 `INVOICE_NOT_DRAFT`, and recompute the bounded
subtotal before commit. Customer changes require zero lines; header text edits
do not. Line IDs must belong to that invoice/company. Manual source labels use
the actor's first name (`Added by Casey`). Source-backed lines cannot be edited
through manual CRUD. SN accepts only snow categories; MA accepts all others.
Mismatch is 409 `PREFIX_CATEGORY_MISMATCH`.

Reorders must contain every existing line exactly once. Invalid, duplicated,
missing or foreign IDs fail before ordering writes/events. Cancellation sets
the reason and instant, records its event, and clears every line's liveness
atomically, releasing source claims without deleting invoice numbers.

`setInvoiceStatus(tx, companyId, invoiceId, status)` is the sole internal
existing-row status/liveness writer. It takes the invoice lock, participates
in the caller's transaction, and maintains live lines for draft/issued and
non-live lines for void/cancelled/superseded. IC1 only calls it for cancellation;
there are no other lifecycle endpoints. Later slices must use the same writer
and maintain revision/source constraints in their transactions.

Errors: 400 invalid input, 401/403 auth/role, 404 unavailable records or disabled
flag, 409 company-switch/draft/category/order/customer/source/unique conflicts,
422 amount overflow, generic 500 otherwise. Logging contains only sanitized
codes, never raw errors, bodies or PostgreSQL detail.

## Verification evidence

See `docs/invoice-center-ic1-verification.md` for the migration, focused/full
test counts, recorded baseline failures, typecheck delta, disposable development
fixture numbers and complete changed-file inventory.
