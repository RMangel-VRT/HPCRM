# Categorized Estimate Services Catalog — integration report

## Scope and predecessor

Implemented Estimate Builder Slice 4.6 in the existing CRM/API artifacts.
Slice 4.5 was verified on the updated main history (`4b7167d0`, version-owned
scope and PDF cleanup), after fast-forwarding this task's stale checkout to
`fbefddb6`. The task plan and complete attachment are the acceptance contract;
no repository slice pack was invented or required.

The attachment's abbreviated server/client paths resolve under
`artifacts/api-server/src` and `artifacts/highplains-crm/src`. No named
`eb46-services-catalog.png`, `eb46-add-category.png`, or `eb45-builder.png` was
supplied. Verification is against the written specification and existing catalog
patterns, not screenshot parity.

No production database writes, publication, new artifact, new dependencies,
QuickBooks item creation, or contract/campaign catalog changes were performed.
Slice 4.5 scope/PDF behavior and Slice 4.7 search/custom-save work remain separate.

## Storage and migration handoff

Apply the normal strict migration command:

```sh
pnpm --filter @workspace/scripts run migrate
```

- `0077_estimate_scope_of_work.sql` already belongs to the integrated predecessor.
- `0078_estimate_services.sql`: guarded category table/index, existing-company
  seeds, quick-item category FK and kind/category invariant, expanded item kind
  and unit checks, and service line-type check.
- `0079_estimate_service_legacy_unit_check.sql`: removes the older automatically
  named `estimate_quick_items_default_unit_check`. SQL migration 0053 originally
  created an inline check with this name. It coexisted with 0078's correctly
  expanded canonical check, so initial new-unit inserts still failed. A separate
  compatibility migration fixes that without editing an applied migration.
- Both new migrations applied in development; 0078 was rerun twice in integration
  coverage without duplicate seeds or resetting edited defaults/active state.
- The migration runner also reported a **pre-existing checksum difference** in
  `0074_campaign_service_timing.sql`. It was not changed or reapplied here.

`estimate_service_categories` owns company/name, default umbrella/unit,
sortOrder, isActive and timestamps. Names are trimmed, 1–100 characters, unique
case-insensitively within the company; units/umbrellas have DB checks.
`estimate_quick_items` remains the **only** item store; service requires a
category and equipment/fee cannot have one. The category FK uses DELETE RESTRICT.
There is no hard-delete endpoint.

General Landscape and Chemical Treatments seed at sort orders 0/1 with
Landscape Labor and `1,000 sq ft`. Existing rows are not reset. **Company setup
difference:** umbrella rows were seeded by migration and lazily provisioned by
existing umbrella operations, not by company creation. The company creation
method now creates both categories in the same transaction as the company;
the umbrella lifecycle remains unchanged.

## API contracts

All routes use `estimateAccess`: admin/office authorization, session company,
expected `X-Company-Id` rejection, and `Cache-Control: no-store`.

| Route | Contract |
| --- | --- |
| GET `/api/estimates/service-categories` | Array, active and inactive, sortOrder/name ordering, `itemCount` over all members including inactive items |
| POST same path | name, defaultUmbrellaKey, defaultUnit, optional sortOrder/isActive; defaults landscape_labor / 1,000 sq ft / 0 / true |
| PATCH `.../:id` | Only supplied category fields; no PATCH defaults; empty body invalid; foreign ID 404 |
| GET `/api/quick-items?kind=service` | Existing array envelope plus serviceCategoryId/name/isActive projection (`serviceCategoryIsActive`) |
| POST `/api/quick-items` | Active same-company category required for service; omitted unit/umbrella resolved server-side; explicit overrides retained |
| PATCH `/api/quick-items/:id` | Merge existing row before checking kind/category; changed associations require active same-company category; unrelated edits preserve inactive association |
| DELETE `/api/quick-items/:id` | Existing soft deactivation, unchanged |

Duplicate category response is 409
`{"message":"A category with this name already exists"}`.
Item label uniqueness remains company-wide across **all three kinds**, with 409
`{"message":"An item with this name already exists"}`.

Management retains active and inactive categories and their members. Deactivating
a category does not deactivate its items or change their defaults/snapshots.
The picker requires both item and category active. Catalog mutations invalidate
the service picker cache; new references independently recheck category availability
on the server. Changing defaults affects only later creates.

## CRM and builder integration

- `/dashboard/estimates/catalogs/services`, rail key `services`, directly above
  Equipment & Fees. Header, optional rates, table, scoped loading/error/retry,
  category chips/counts/filter, Show inactive, service add/edit/deactivate/reactivate,
  and category add/edit/active management use existing catalog conventions.
- Unit and umbrella prefill independently until touched. Untouched service-create
  values are omitted for server resolution; editing an existing item preserves
  its captured defaults and sends only changed fields. Inactive current categories
  remain selectable on unrelated edits.
- Scope-keyed page remounts isolate user/company/role form state and query data.
  Every request carries its initiating company. Delayed saves cannot close a new
  company's dialog or show an old-company success toast.
- Equipment & Fees deliberately retains a two-kind list and excludes service rows.
- Builder adds Service between Labor and Equipment, Sprout, EN/ES labels,
  active-category filter chips and Free-type. Existing click-to-select,
  quantity, explicit Add/Enter and double-click behavior is preserved.
- Service tint is `hsl(78 55% 28%)`, distinct from all seven existing entries;
  the luminance regression test verifies at least 4.5:1 against white.
- Referenced line request: `{lineType:"service",sectionId,quantity,quickItemId}`.
  Initial detail is null and source `quick_list`; values are captured once.
  Free entries use complete manual fields and `manual` provenance, no category.
- Draft name/detail/unit/umbrella remain editable like equipment/fee. Locked and
  void versions remain protected. Category/item edits do not refresh existing lines.

### Literal-list inventory

| File | Lists/guards changed |
| --- | --- |
| `lib/db/src/schema/estimateSetup.ts` | QUICK_ITEM_KINDS; QUICK_ITEM_UNITS; kind union/check; unit check; category invariant; category unit/umbrella validators |
| `lib/db/src/estimateContracts.ts` | ESTIMATE_LINE_TYPES; quickBranch type union; discriminated service reference/free branch |
| `lib/db/src/schema/estimates.ts` | estimate_lines_type_check |
| new SQL migrations | SQL kind/unit/line-type checks; existing-company category seed values |
| `api-server/src/routes/estimateSetup.ts` | kind query now derives from QUICK_ITEM_KINDS, rather than another two-kind literal |
| `api-server/src/services/estimateSnapshots.ts` | service alongside equipment/fee snapshot branches; active category guard |
| `api-server/src/services/estimates.ts` | display-field-edit allowlist adds service |
| `highplains-crm/src/shared/estimateSetup.ts` | mirrored kinds/units/creation validation; category and joined item response types |
| `highplains-crm/src/lib/estimateSettings.ts` | explicitly two-kind EQUIPMENT_FEE_KINDS to preserve existing page; category API/types |
| `highplains-crm/src/lib/estimateBuilder.ts` | LINE_TYPES, FREE_UNITS, FREE_UNIT_TYPES, DEFAULT_UMBRELLA, LINE_TINT; line type derived from shared DTO |
| `highplains-crm/src/components/estimates/AddLineButtons.tsx` | icon map adds Sprout |
| `highplains-crm/src/components/estimates/AddLineDialog.tsx` | service picker branch; manual-service unit/default umbrella |
| `highplains-crm/src/components/nav/estimatesRail.tsx` | EstimatesRailKey and catalog destination |
| `highplains-crm/src/i18n/locales/{en,es}.ts` | service type/picker title; new unit labels; catalog/category/rail strings |
| tests | estimateMath exclusive-union parameterization; slice35 button-order expectation; service-specific fixtures and contract/list parity |

Old seven-type fixtures that intentionally exercise only original line kinds were
not expanded gratuitously; new service-specific tests and browser checks exercise
the additional type.

### Invoice compatibility

Audited `lib/db/src/invoiceContracts.ts`, `services/invoices.ts`,
`services/invoiceReads.ts` and estimate-line consumers. No separate estimate
line-type allowlist requires an update. This checkout's invoice service implements
manual invoice mutations; no new estimate feeder was invented. Existing estimate
aggregation uses captured `umbrellaKey`, not line type (`estimateMath.ts`).
Tests verify a service contributes to the existing six umbrella totals, including
after an allowed manual umbrella edit. No new invoice category or QBO summary item.

## Verification

Raw logs, unchanged-source baseline archive, browser evidence and typecheck
comparison live under ignored `/generated-artifacts/services-catalog/` (excluded
from Git and publication). The baseline archive deliberately excludes Drizzle
configuration so schema discovery still has one active configuration.

### Automated tests

| Check | Baseline | Final |
| --- | --- | --- |
| API setup route + setup persistence + estimates persistence | 59/59 | 59/59 preserved |
| API estimateMath existing tests | 31/31 | 32/32, service exclusive-union case added |
| New service API/DB integration suite | — | 6/6 |
| CRM EstimateSettings + estimatesRail + builder + slice35 | 122 passed / 6 failed (128 total) | Same six failures; original tests preserved, one intentional button-order expectation updated |
| New ServicesCatalog rendered tests | — | 14/14 |
| New shared-contract/list parity and tint tests | — | 3/3 |

Existing CRM failures are unchanged: QuickBooks Setup's `link-qbo-settings`,
Labor & Rates' `link-rate-card`, and four plant-page estimatesRail navigation
assertions. They are not hidden or described as passing. Two intentional
expectation changes are the Service button position and the unknown-cost hint
now including services in its EN/ES type list. The combined post-change
run before the two additional race/prefill tests reported 134 passed / 6 failed
of 140; the latest focused service run passes 17/17. Thus the verified total
across these CRM suites is 139 passed / 6 existing failures of 145.

Coverage includes idempotent seed and preserved edits, actual company creation,
DB invariant/unit/FK checks, role/company/no-store guards, category duplicates/
ordering/deactivation, cross-kind item name conflicts, same-company active
associations on create/reassignment, unrelated inactive-member edits, server
defaults/explicit overrides/joins/counts, referenced/free snapshots, draft display
edits, locked/void gates, independent prefill-until-touched, stale-company saves,
service exclusion from Equipment & Fees, picker request bodies and Spanish copy.

### Typecheck

Composite library declarations were refreshed before baseline checks and after
schema changes. Both library builds passed. Full root typecheck remains red on
pre-existing diagnostics, so leaf checks were also run independently to avoid
pnpm stopping early and hiding one artifact's output.

Unchanged-source baseline: API **695** diagnostics; CRM **212** diagnostics.
Final leaf counts: API **695**, CRM **212**, a **zero-diagnostic delta**.
Normalized file/error-code multisets have no additions or removals; compare
`typecheck-delta.json`. The library build passed. The root check still fails on
the same existing diagnostics; no validation was bypassed.

### Browser evidence and final handoff

The documented demo account was absent from the fork's development database
(confirmed with a read-only lookup). No real user's password or permissions were
changed. A disposable company/admin/customer fixture was created with the
development-only `lib/estimateServicesBrowserFixture.ts`, with temporary login
values confined to an ignored file. Browser verification resumes using that
isolated company. Cleanup subsequently removed the entire disposable company,
its estimate/category/service/customer records, the disposable user and the
temporary credential file. No verification records remain.

The signed-in journey succeeded: created category/service, confirmed independent
prefills, optional rate, persistent rename, chip count/filter, inactive category
with still-active member, reactivation and duplicate inline error. Explicit
selection plus Add created exactly one draft service line; authenticated reads
confirmed quantity `1.00`, captured price `1850`, unit `1,000 sq ft`, matching
quickItemId, null detail and `quick_list` source. Nothing was sent or accepted.

At both **1440×1000** and **1041×1000**, document/body widths matched the viewport.
The narrow catalog scrolls its own table, not the whole page; both dialogs fit.
No feature-impacting JavaScript errors were observed. An expected duplicate 409
was shown inline. One navigation load timeout was retried successfully.

The following screenshots were captured, attached in chat, and visually inspected:

| Screen | 1440px screenshot ID | 1041px screenshot ID |
| --- | --- | --- |
| Services Catalog | `80v1ap` | `3d1smt` |
| Add category dialog | `iw4hxw` | `cvrc8v` |
| Builder service picker | `vzl9p4` | `6e25ja` |

Screenshot export limitation: the browser tool supplies attached image IDs, not
a supported local-file export, so no filesystem screenshot paths are claimed.
The tester's “unable” label refers only to that extra local-export request;
the full signed-in journey, six captures and both-width overflow checks succeeded.
The separate signed-out Screenshot capture timed out; it is not used as evidence
for the signed-in screens. The cost-exclusion hint was subsequently updated to
include services and verified with its rendered test; screenshots predate only
that copy adjustment.

Changed production files are enumerated above and in the API/UI sections:
the category service, existing quick-item service/routes, storage company creation,
snapshot/edit services, schemas/contracts, catalog page, app route/rail,
builder helpers/buttons/picker, mirrored DTOs, Equipment & Fees filter and locales.
New tests and the disposable development fixture are identified by their section
names and paths; no generated evidence or credentials are committed.

No additional follow-up suggestions were created because the already-planned
Slice 4.7 covers the downstream catalog search/custom-save work. Nothing was published.
