# CP6 — Contract-owned customer Services

2026-11-11. Client-only integration of the merged CG5 consumer contract.

## Authority and safety

Implemented the assigned CP6 plan and supplied CP6 brief against
[CG5's actual integration contract](CG5-services-integration.md). Confirmed
`registerCustomerServices`, the DTOs and generated `useGetCustomerServices`
already exist. The generated helper is used as explicitly requested, without
running API generation or changing the broader frontend convention.

No schema, migrations, API/server calculation, authorization, role policy,
fulfillment backfill, reconciliation, Generate, mobile or commercial-total
changes. No production writes or publication.

## Exact client integration

- `src/hooks/useContractCustomerServices.ts` wraps the existing generated
  `useGetCustomerServices` from `@workspace/api-client-react`.
- Query key: `["/api/customers", customerId, "services", companyId, viewerId,
  activeRole, accessRole, termId ?? "default"]`.
- Initiating `X-Company-Id` is captured in each request; cookies use
  `credentials: "include"` and the generated helper propagates cancellation.
  Missing customer, company or viewer disables the reader. No previous-query
  placeholder is retained. Errors do not expose an old successful payload.
- Default requests omit query parameters. Explicit selection sends only
  `termId`; `useServiceSeason` tags local selection by property/company/viewer/
  active-role/access-role, resetting before another scope can issue a request.
  CustomerDetail also keys the Services component by its scope and property.
- Every default consumer shares the default query independently of the page's
  explicit selection. Polling is every 60 seconds, with stale-on-mount/focus
  refresh; 4xx errors do not retry. An explicit-season 404 resets selection once;
  a default 404 remains an error. A 403 shows the not-available treatment.
- `src/lib/contractCustomerServices.ts` is presentation only: labels/display
  tones, calendar-safe localized next wording, sums of supplied done/owed for
  **known owed rows only**, metadata-based setup classification and selection
  of the earliest supplied next event. It does not calculate demand, outcomes,
  remaining, deadlines, governing terms or primary-status precedence.
- Setup metadata includes `no_count`, `no_timing`, `invalid_count`,
  `duplicate_lines`, `no_route`, `missing_item`, whether primary or secondary.
  `count_mismatch` is informational. Signature waits alone are not setup.
  Unknown-owed annotations are counted separately from setup metadata.
- Services rows retain endpoint order and all secondary issues. Unknown owed/
  remaining display as an em dash. Tiles omit unknown progress bars and omit
  skipped counts. Other/retained work never enters totals.
- Item drawers read the existing customer campaign-item history and use the
  existing `ChecklistItemDetailPanel`. Route drawers keep Open Routes.
  Campaign links require a returned campaign ID; item controls require an item
  ID. Gap links match existing App route-role gates and exact agreement/season
  hashes. Inherited labels use the customer's existing parent name.
- Dashboard KPI/card/attention, next-service summary and Services tab badge read
  default demand. Overdue counts use **primary** `status === "overdue"`.
  Recent activity continues to use real item/route-visit completion history.
  Parent customers retain disabled per-property service readers.

## Changed application and regression files

Paths below are relative to `artifacts/highplains-crm/`:

- `src/hooks/useContractCustomerServices.ts` (new scoped adapter/season state).
- `src/lib/contractCustomerServices.ts` (new presentation helpers).
- `src/components/customer/pages/ServicesPage.tsx`.
- `src/components/customer/pages/services/ServiceParts.tsx` (new focused parts).
- `src/components/customer/dashboard/CustomerDashboard.tsx`.
- `src/components/customer/dashboard/dashboardModel.ts`.
- `src/components/customer/CustomerNextService.tsx`.
- `src/pages/CustomerDetail.tsx`.
- `src/hooks/useCustomerServices.ts`.
- `src/i18n/locales/en.ts`, `src/i18n/locales/es.ts`.
- `src/components/customer/pages/ServicesPage.cp2.test.tsx` (updated, not discarded).
- `src/pages/CustomerDetail.cp3.rendered.test.tsx`.
- `src/components/customer/page/__tests__/cp4.acceptance.rendered.test.tsx`.
- `src/components/customer/dashboard/dashboardModel.test.ts`.
- `src/lib/customerServices.test.ts`.
- New regressions: `src/hooks/useContractCustomerServices.test.tsx`,
  `src/lib/contractCustomerServices.test.ts`,
  `src/components/customer/CustomerNextService.cp6.test.tsx`.
- New synthetic test builders: `src/lib/contractCustomerServices.fixtures.ts`.
  These are not application fallbacks or persisted business records.

Documentation: this report and `docs/slices/campaigns/STATUS.md`.

## Remaining legacy-hook consumers

`useCustomerServices` remains only for activity/history:

1. `CustomerDetail.tsx` passes observed item/route completion history to the
   dashboard's recent-activity feed. It is disabled until a non-parent customer
   is loaded.
2. `ServiceParts.tsx` loads real item data when an item drawer is opened.
3. `ServicesPage.tsx` uses it in retained-round title lookup, only when returned
   retained work exists. CG5 deliberately supplies retained IDs/service/status,
   not campaign titles; title lookup does not alter demand.

Its unused `next`, `overdueCount`, `inContract` field and category-as-contract
classifier were removed after checking callers. `services`, `items`, observed
state and actual completion timestamps remain for history. `displayStatus.ts`
still imports its `ServiceState` **type** for historical service display.
Tests still mock history where appropriate.

## Automated verification

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/highplains-crm run typecheck
cd artifacts/highplains-crm
./node_modules/.bin/vitest run --config vitest.config.ts \
  src/components/customer src/hooks/useContractCustomerServices.test.tsx \
  src/lib/customerServices.test.ts src/lib/contractCustomerServices.test.ts \
  src/pages/CustomerDetail.cp1.rendered.test.tsx \
  src/pages/CustomerDetail.cp2.rendered.test.tsx \
  src/pages/CustomerDetail.cp3.rendered.test.tsx \
  src/pages/CustomerDetail.cq7.rendered.test.tsx \
  src/pages/CustomersList.cp4.rendered.test.tsx \
  src/components/CustomerLocationEditor.cp2.test.tsx
```

Library declarations passed. CRM leaf typecheck retains its existing baseline:
212 baseline / 212 current diagnostics, no added/removed file/error-code counts
in a compiler-host comparison substituting HEAD source into the same refreshed
program. This is **not** a green broad CRM typecheck claim.
Ignored evidence: `generated-artifacts/cp6-typecheck.log`,
`cp6-typecheck-comparison.json`, `cp6-typecheck-compare.cjs`.

Customer regression suite: **229 tests in 22 files passed**, including the final
primary-status matrix. Coverage includes generated-helper URL/header/
scope isolation, absent-property guard, 403, actual explicit-404 recovery with
default-query independence, null/setup aggregation, all next kinds, existing
drawer identity, round states/provenance/window+promise, gap permissions/season
hashes, manual exclusion, retained visibility, no-season history, localized dates/
keyboard behavior, cross-surface demand and retained actual activity.
Command output: `generated-artifacts/cp6-customer-suite.log`.

Managed CRM/API services restarted and served requests. API `/api/healthz` and
changed ServicesPage/ServiceParts Vite transforms returned 200. Existing
Browserslist/PostCSS notices and unrelated QuickBooks fixture-token warnings
remain; they are not new feature failures. Schema/required-extension workflow
reported in-sync/present. No backend implementation changed.

## Browser evidence and limitations

The first signed-in attempt was blocked: the documented development admin
credentials returned 401. No existing user's credentials were changed.
The same tester continued with an isolated disposable development account.
No existing account was reset. The documented account was absent in the task
fork's development database. The same tester provisioned only a disposable
company, lowercase admin/membership and non-parent property, then removed them
and their session after the run.

**Real authenticated integration:** `GET /api/customers` returned 200 JSON and
found the fixture property. Its unmocked `GET /api/customers/:id/services`
returned 200 with the actual nine DTO keys, null selection and empty terms/rows.
This verifies the signed-in generated-reader boundary, not populated real-world
fulfillment data.

**Synthetic read-only visual cases:** after the real reads, browser-only GET
interception supplied clearly labeled synthetic season/round/item data. The
property name and campaign titles in the screenshots say “Synthetic.” These
responses were never saved as contractual or campaign business records and are
not production evidence. They covered:

- Generated irrigation row, owed 2/done 1, primary overdue and informational
  mismatch; expanded pending round with program timing/standard count.
- Route row owed 1/done 0, primary on-track with a secondary overdue issue.
- Null-owed no-timing gap, with a setup label/no tile bar.
- Manual Other work and retained generated work, excluded from all totals.
- Dashboard known-only **1 / 3**, one unknown/setup row and **one**, not two,
  primary-overdue rows; Services rail badge agreed.
- Alternate `termId=term-cp6-alt`, then Dashboard's independent default query.
- Explicit `termId=term-cp6-gone` returned synthetic 404, followed by a request
  without `termId` and recovery to the default view.
- Existing item panel opened from a returned item ID; route drawer retained
  Open Routes. Destination links were inspected, not followed, so campaign/
  contract/Settings destination behavior was not re-tested in this pass.
- Desktop 1280×900 and narrow 390×844. Document/body widths equaled 390px with
  no document overflow; the pre-existing customer chip navigation scrolls
  horizontally. Lower sections require vertical scrolling.

Attached browser observation references (actual captured screenshots):

| Observation | Evidence |
| --- | --- |
| `l971vj` | Expanded generated round, null gap, retained work; Other work starts below viewport |
| `rmymyv` | Recovered default season, gap/retained/manual sections |
| `wyv054` | Dashboard known-only totals, setup/overdue counts and Services badge |
| `7oq1qq` | Narrow Services layout |
| `7pbk9n` | Existing item detail panel |
| `57l19o` | Route drawer and Open Routes |
| `1d7vx3` | Authenticated real disposable-property list before interception |

The detailed run record, exact synthetic DTO/item fixtures and observed requests
are in `generated-artifacts/cp6/browser/findings.md`. The tester's browser tool
could not export screenshot binaries to that directory; the screenshots remain
attached observations by the IDs above. A separate signed-out preview screenshot
attempt timed out before producing a file; it is not claimed as evidence.
No production screenshot or production fulfillment audit is claimed.

Logout returned 200, subsequent `/api/auth/me` returned 401, and cleanup checks
reported zero remaining disposable company/user/membership/property rows.
The browser context and temporary credential file were removed. No Generate,
real business-data mutation, messaging action or publication occurred.

After inspecting the captured layouts, a small follow-up keeps tile ratios on
one line and closes any old item drawer when switching seasons. Focused rendered
checks passed **29 tests in three files** (`cp6-final-focused.log`); no second
browser pass was started. The final CRM restart served successfully with only
the existing Browserslist/PostCSS notices.
