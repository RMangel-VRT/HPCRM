# Customer billing and QuickBooks: CQ1

## Ownership and field map

`customers` owns billing facts. `qbo_customer_cache` is an automatic QuickBooks
mirror maintained only by the sync service (existing pull/create paths today;
CQ2 supplies the new reconciliation service). `customers.qbo_display_name`
remains a mirror, not a billing-name fallback; CQ1 adds no readers of it.
`qbo_baseline` is a deliberate snapshot of the normalized values last agreed by
both systems, not another independently editable owner.

| CRM column / resolved fact | QuickBooks Customer field | Owner / copy semantics |
|---|---|---|
| `billing_name ?? name` | `DisplayName` | Customer owner |
| `billing_company_name` | `CompanyName` | Customer owner |
| `billing_contact_name` | `GivenName`, `FamilyName` | Customer owner; split on last space |
| `billing_emails` | `PrimaryEmailAddr.Address` | Customer owner; comma-joined, 100-character maximum |
| `billing_phone` | `PrimaryPhone.FreeFormNumber` | Customer owner |
| `billing_mobile` | `Mobile.FreeFormNumber` | Customer owner |
| `bill_to_mode` | Selects `BillAddr` source | Customer owner: property / management_company / custom |
| `bill_street`, `bill_street2`, `bill_city`, `bill_state`, `bill_zip` | Whole `BillAddr` | Customer owner, custom mode only |
| `street`, `city`, `state`, `zip` | Whole `ShipAddr`; `BillAddr` in property mode | Customer owner of service location |
| `property_management_company_id` → live directory address | Whole `BillAddr` | Directory owns its address; never copied onto customer |
| `qbo_term_id` | `SalesTermRef.value` | Editable customer billing fact, not protected sync metadata |
| `parent_customer_id`, parent's `branch_billing_mode` | `ParentRef.value`, `Job`, `BillWithParent` | Customer hierarchy owner; separate branches use parent QBO ID and `BillWithParent:false` |
| `status` | `Active` in pure representation | Existing CRM lifecycle unchanged; no operational inactivation added |
| `qbo_customer_id` | `Id` | Server-owned binding |
| `qbo_sync_token` | `SyncToken` | Server-owned last-seen remote concurrency token |
| `qbo_synced_at` / `qbo_pushed_at` | — | Server-owned synchronization instants |
| `qbo_sync_state`, `qbo_last_error` | — | Server-owned workflow metadata |
| `qbo_baseline` | Normalized mapped fields | Server-owned agreed-value snapshot (CQ2 writes) |
| `qbo_display_name` | `DisplayName` | Existing automatic mirror, no new readers |
| — | `MetaData.CreateTime`, `MetaData.LastUpdatedTime` | Parsed remote metadata, not editable CRM billing facts |

## Bill-to contract

`resolveBillTo(customer, ctx)` reads company-scoped customers and directory rows
through supplied storage methods. It checks the company again on returned rows.
Missing or incomplete addresses return `{ problem: "BILL_TO_INCOMPLETE" }`.
A master-billed branch uses its parent's billing name and bill-to; the pure
customer mapper rejects creating a separate remote customer for that branch.
Separate mode leaves the branch's billing facts independent.

Address fields map to QuickBooks `Line1`, `Line2`, `City`,
`CountrySubDivisionCode`, `PostalCode`. For management companies, `Line1`
(`street`) is `c/o {name}`, `Line2` (`street2`) is the live directory street,
followed by city/state/zip. This preserves the care-of line through payload
round trips without storing a copy on the customer.

`normalize` trims/collapses text whitespace, lowercases/deduplicates/sorts
emails, strips phone punctuation, uppercases state and strips ZIP punctuation
(five or nine digits). Empty strings/empty addresses become null. `diffFields`
compares only mapped commercial keys, not parsed metadata.

`toQboPayload` creates a full payload with `PreferredDeliveryMethod:"None"`.
Updates require `Id`, `SyncToken` and explicit `onlyKeys`; they are sparse and
never set delivery method. Compound keys (contact names, parent references)
emit their complete QBO representation. Address changes send a whole object,
including blank optional line 2. Clears use explicit blank scalar/subfield
values, not omission; null addresses clear all mapped address components.

## API and migration

POST and PATCH validate email arrays and enum values. Custom mode requires all
four core address fields. Management-company mode requires an existing,
same-company directory association; address completeness is checked by the
resolver when used, not by copying it. PATCH validates the merged record and
keeps `pickProvided`, preserving omitted fields/defaults and existing concurrency
handling. Both routes reject camelCase and snake_case binding/sync metadata
before Zod stripping, including the existing `qboSyncedAt` mirror timestamp.

Migration `0067_customer_billing_fields.sql` is additive, guarded and re-applicable.
The pack originally proposed 0066, but explicitly allows the next unused number;
0066 already belongs to proposal covers. Existing linked `not_linked` rows become
`in_sync`; other states are preserved. There is no startup DDL.

## CQ1 rollout history

CQ1 adds schema, validation and pure contracts only. **No new QuickBooks calls,
no external writes and no initial sync.** `routes/qbo.ts`, `qboClient.ts` and all
their existing operational call paths are unchanged, including the existing
create endpoint's delivery behavior. The pure `Active` representation is not
authorization to send inactivation; the CRM must never inactivate a QBO customer.

CQ1 deliberately retained the old invoice cache reader. CQ2 now gates that
legacy exception on the company's initial-reconciliation baseline.

CQ2–CQ5 own initial/scheduled pulls, outbound pushes/review resolution, terms UI,
customer card/links and the wizard. Write-disabled “Waiting to send” behavior,
initial-sync outbound gating and the operational no-email guarantee belong to
those integrations, not CQ1. Later create integration must use the pure create
contract, gate writes with `isQboWriteEnabled()` and initial-sync readiness, use
`qboRequest()`, and never otherwise write `PreferredDeliveryMethod`.

## CQ2: initial reconciliation and mirror maintenance

Migration `0068_qbo_customer_sync.sql` is additive and safely re-applicable.
`0066_proposal_cover.sql` and CQ1's `0067_customer_billing_fields.sql` retain their
historical filenames. The migration adds mirror metadata, connection watermarks
and review evidence snapshots with company-scoped open-subject uniqueness.
It contains no startup DDL, customer import, or outbound QuickBooks operation.

`qboCustomerSync.ts` is the sole cache writer, including CSV seed-suggestion
metadata. Full pulls, CDC, live duplicate-check results and existing create
results all use it. A transaction-bound company advisory lock covers remote
retrieval through local commit. Nested sync calls reuse the same transaction.
Customer locks protect reconciliation from concurrent customer edits. OAuth
credential refreshes commit independently; do not put the ambient database
proxy into the reconciliation transaction, or a later rollback can discard a
rotated refresh token. The existing create route explicitly joins only its
local binding operation to the cache transaction.

Before `customer_baseline_at`, ordinary ingestion is **cache-only**: no CRM
fields, customer baselines/tokens, or reviews of any kind. A manual full pull may
refresh the mirror/full-pull timestamp but cannot establish the baseline or CDC
cursor. Incremental work skips unbaselined companies.

The admin initial-sync action is distinct from ingestion. It fills empty billing
slots, detects custom addresses, preserves non-empty conflicts as review
snapshots, and records normalized remote baselines/tokens. Missing remote
service addresses and other genuine unsent differences leave `pending_push`.
Master-billed branches with their own bindings are skipped and returned for
manual attention. Once the company baseline exists, retries use the review-only
full-pull path rather than repeating hydration. They preserve deliberately
cleared CRM values, retain unresolved baselines/tokens and merge current review
evidence. They do not turn old unbound records into new-customer reviews.

After baseline, remote changes only update the mirror and review evidence.
Agreement on a changed field may advance that field's baseline; outstanding
field reviews prevent token advancement. Repeated changes preserve other open
fields while refreshing their current evidence. Inactive/deleted bound records
receive lifecycle reviews without changing CRM status. Unbound sub-customers
and top-level customers receive `sub_customer`/`new_in_qbo` **only** when their
creation time is strictly greater than the original company baseline. Older,
equal-to-baseline, and undated unbound records stay cache-only.

The unreferenced, stoppable scheduler considers connected, baselined companies
every 15 minutes. It rechecks watermarks under the company lock, uses full pulls
when older than 24 elapsed hours, and contains each company's errors. CDC
cursors advance to request start only after successful ingestion. Cursors older
than 29 days and capped CDC responses recover through a full pull. No cache row
is deactivated until the complete paged full response has validated and ingested.
These are elapsed-time intervals, not Colorado calendar-day calculations.

Routes:
- Admin: `POST /api/qbo/customers/initial-sync`.
- Admin/office: `POST /api/qbo/customers/sync-now`,
  `GET /api/qbo/customers/sync-status`, existing `POST /customers/pull`.
- Sync-now requires the initial baseline. Status exposes only timestamps/counts.
- New controls scope browser state/cache by company, user and role, and send
  `X-Company-Id`; mismatches with the authenticated session are rejected.
- The existing create path retains its feature gate and additionally requires
  initial reconciliation. Its payload now explicitly sets delivery to `None`.
  CQ3 outbound synchronization and conflict resolution are not implemented here.

Invoice draft PDFs read the legacy cache address **only before baseline**.
After baseline they use CQ1's live bill-to resolver, billing name, management
directory and master-parent policy. Only `BILL_TO_INCOMPLETE` permits a property
fallback; unrelated errors propagate. Issued-document snapshot rules are unchanged.

### Acceptance discrepancy

The upload's final “every linked customer is in_sync” sentence conflicts with
its detailed non-destructive initial comparison rules. CQ2 follows the detailed
rules: it never erases non-empty billing values or marks genuinely differing
normalized fields `in_sync` to satisfy that sentence.
