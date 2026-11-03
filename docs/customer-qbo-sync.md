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

## Staged rollout boundaries

CQ1 adds schema, validation and pure contracts only. **No new QuickBooks calls,
no external writes and no initial sync.** `routes/qbo.ts`, `qboClient.ts` and all
their existing operational call paths are unchanged, including the existing
create endpoint's delivery behavior. The pure `Active` representation is not
authorization to send inactivation; the CRM must never inactivate a QBO customer.

Invoice PDF bill-to still reads the existing QBO cache and falls back to the
property address. Retire that cache reader in **CQ2**, after initial reconciliation
populates CRM billing facts; do not switch it early.

CQ2–CQ5 own initial/scheduled pulls, outbound pushes/review resolution, terms UI,
customer card/links and the wizard. Write-disabled “Waiting to send” behavior,
initial-sync outbound gating and the operational no-email guarantee belong to
those integrations, not CQ1. Later create integration must use the pure create
contract, gate writes with `isQboWriteEnabled()` and initial-sync readiness, use
`qboRequest()`, and never otherwise write `PreferredDeliveryMethod`.
