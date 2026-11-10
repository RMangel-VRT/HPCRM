# CQ4 — review queue, customer card and stable QuickBooks links

## Scope and safety

Implemented against merged CQ1, CQ2 and CQ3, plus Randy's November 3 promotion
decision. No schema change, deployment, initial synchronization or live
QuickBooks write was performed. API tests mock `qboRequest`; database tests use
disposable synthetic companies. CRM customer billing fields remain the owner;
QuickBooks cache rows remain sync-service-written mirrors, and review/baseline
payloads remain snapshots.

The existing initial-baseline and write-flag gates, create-only
`PreferredDeliveryMethod: "None"`, and prohibition on QuickBooks inactivation
remain upstream-owned and unchanged.

## Changed files and touched call sites

### API and shared promotion boundary

| File | Changes / call sites |
|---|---|
| `artifacts/api-server/src/services/qboCustomerBinding.ts` | Shared explicit link routine hydrates only empty CRM billing fields, sets the agreed baseline/token/link state, closes matching open new/sub-customer reviews, and records the actor. Missing normalized cache data/token produces an actionable 409 rather than a partially established link. |
| `artifacts/api-server/src/services/qboCustomerComparison.ts` | Clarifies that the existing empty-field hydration helper is also authorized at explicit linking, never ordinary ingestion. No second field-map implementation. |
| `artifacts/api-server/src/services/qboCustomerPromotion.ts` | New transactional implementation for legacy prospect promotion; creates, calls the shared link routine, and returns the linked customer. Missing-address and conflicting-link failures preserve the review; transaction failure rolls creation back. |
| `artifacts/api-server/src/services/qboCustomerReviews.ts` | Review linking calls the shared routine with actor identity; that routine alone closes new/sub-customer link reviews. Review `promote` returns prefill without closing anything. Other resolve semantics remain CQ3-owned. |
| `artifacts/api-server/src/storage.ts` | `bindQboCustomer` forwards actor identity; `promoteQboCustomerToCrm` delegates to the shared transactional promotion service, preserving its response shape. |
| `artifacts/api-server/src/routes/qbo.ts` | Existing bind/promote call sites pass session actor identity. Promotion preserves useful domain errors. Mounts the CQ4 read router. |
| `artifacts/api-server/src/services/qboTerms.ts` | Active-term lookup through `qboRequest`, ten-minute company-specific memory cache, concurrent-request sharing, pagination, response validation and failure isolation. |
| `artifacts/api-server/src/routes/qboCustomerReads.ts` | New terms/picker/card/by-ID read handlers. Every query is company-scoped; new requests reject stale expected-company headers. The card calls CQ1's live bill-to resolver, never cache billing readers. It projects only the assigned term label for customer viewers, not the full terms list. Picker data is allowlisted and does not grant mapping mutations. |
| `artifacts/api-server/src/routes/routes.ts` | Registers the by-ID/card router before the generic customer route. Adds the expected-company header guard before an existing customer PATCH can mutate billing owner facts. |

### CRM surfaces

| File | Changes / call sites |
|---|---|
| `artifacts/highplains-crm/src/lib/qboReview.ts` | CQ4 contracts, company/viewer/role/tag-scoped query keys, expected-company requests, shared count, reviews/options/terms and mutation invalidation. |
| `artifacts/highplains-crm/src/pages/QboCustomerReview.tsx` | New billing-protected queue and seven kind-specific panels; choices, bulk selection, explicit branch confirmation, promotion, rename and exact CQ3 resolution requests. |
| `artifacts/highplains-crm/src/components/qbo/QboCustomerCard.tsx` | Compact live status/financial summary, billing editor and bounded asynchronous-send status polling. |
| `artifacts/highplains-crm/src/components/qbo/QboReviewLink.tsx` | Shared nonzero-count review link. |
| `artifacts/highplains-crm/src/pages/CustomerByQbo.tsx` | Company-scoped resolver, replacement navigation, exact missing-mapping message and review link; authorization and retry states. |
| `artifacts/highplains-crm/src/App.tsx` | Registers resolver before generic customer detail and review queue before Invoicing; retains existing customer/billing access rules. |
| `artifacts/highplains-crm/src/components/nav/navConfig.ts` | Independent secondary badge support; no change to Invoicing eligibility or sidebar sections. |
| `artifacts/highplains-crm/src/components/AppSidebar.tsx` | Independent outlined review badge on Invoicing or billing-tagged My Tickets alternate. The sidebar owns count polling; links reuse its query without adding polling timers. |
| `artifacts/highplains-crm/src/pages/BillingPage.tsx` | Conditional Invoicing header review link. |
| `artifacts/highplains-crm/src/pages/MyTickets.tsx` | Conditional alternate-destination review link above To invoice. |
| `artifacts/highplains-crm/src/pages/CustomerDetail.tsx` | QuickBooks card in the existing Financial area, not a new tab. |
| `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx` | Reuses the card beside existing parent financial summary information. |

### Tests and project notes

- New API tests: `routes/qboCustomerReads.test.ts`,
  `services/qboCustomerPromotion.integration.test.ts`.
- Updated API tests: `routes/qbo.customers.test.ts` (actor forwarding),
  `routes/customerBilling.test.ts` (company-switch guard),
  `services/qboCustomerPush.integration.test.ts` (prefill is not resolution).
- New CRM tests: `pages/QboCustomerReview.rendered.test.tsx`,
  `pages/CustomerByQbo.rendered.test.tsx`,
  `components/qbo/QboCustomerCard.rendered.test.tsx`,
  `components/QboReviewBadge.rendered.test.tsx`.
- Updated navigation tests: `components/nav/navConfig.test.ts`.
- New test-only helper: `artifacts/highplains-crm/src/test/qboFetch.ts`.
- Updated durable notes: `.agents/memory/customer-qbo-sync-direction.md`,
  `.agents/memory/validation-durability.md`.
- This report: `docs/customers/reports/cq4-verification.md`.

All source paths in the test bullets are relative to the corresponding
artifact's `src/` directory unless written in full.

## New API read contracts

| Endpoint | Authorization / result |
|---|---|
| `GET /api/customers/by-qbo/:qboId` | Authenticated existing customer-detail roles; returns `{ id }` or 404 in the active company only. |
| `GET /api/customers/:id/quickbooks-card` | Same customer-detail authorization; returns current CRM customer, effective billing customer/parent, resolved live bill-to, mode/assigned-term labels, identity-only QuickBooks name, write/baseline gates and open customer reviews. Assigned-term lookup failures are explicit without hiding other billing facts. |
| `GET /api/qbo/terms` | Admin, office or billing tag; active `{ id, name }` terms only, cached ten minutes per company. |
| `GET /api/qbo/customer-review-options` | Admin, office or billing tag; minimal CRM identity/parent/link choices and QuickBooks identity/parent/active choices. No mapping write permission is added. |

Existing mutations are reused: reviews resolve; legacy promotion; customer PATCH;
and send-now. Removed/merged actions remain exactly `{ action: "link", qboId }`,
`{ action: "unlink" }`, or `{ action: "dismiss" }`.

## Verification

Evidence logs are retained under ignored `generated-artifacts/cq4/`.

- **Before edits:** canonical `pnpm run typecheck` refreshed shared declarations
  successfully, then failed on existing API diagnostics. It reported 721
  diagnostics before stopping the recursive check. This is not a clean baseline.
- **Before edits:** existing QBO mapping/map tests: **91 passed, 2 files**.
- **Before edits:** existing navigation/billing-access/billing-policy tests:
  **67 passed, 3 files**.
- **API verification:** **224 tests passed across 8 relevant files**,
  including the new lookup/promotion tests and existing CQ1–CQ3 suites.
  Initial combined runs failed during fixture cleanup, not assertions.
  Serial file execution alone did not remove the cleanup deadlock. After stopping
  the separate development API, the affected CQ2 suite passed independently:
  **32 passed**, with successful cleanup. Exact synthetic fixtures from the
  interrupted cleanup were removed; no real customer/company was altered.

- **Final CRM verification:** **232 tests passed, 18 files**, with requests mocked.
  Coverage includes all seven kinds, each resolve/promotion path, both badge
  destinations and simultaneous counts, count scope/gates/timing, customer
  card states/polling/error retention, owner-only billing edits, assigned-term
  projection and resolver history replacement.
- **Final typechecks:** canonical `pnpm run typecheck` refreshed shared
  declarations and remained nonzero on baseline issues. Because recursive
  checking stops at whichever package fails first, both artifacts were also
  checked independently. API: **721 before / 721 after**. CRM: **223 before /
  223 after**. After normalizing source coordinates, neither artifact has a
  new or removed diagnostic. No CQ4 file introduced a typecheck regression.
- **Running application:** rebuilt/restarted the existing API and CRM workflows;
  both serve normally. Schema/extension workflow reports no drift. Existing
  browser-list/PostCSS/SSL warnings remain; no new startup crash.
- **Browser verification:** one focused, mocked-auth/mock-API review journey
  verified keyboard opening, both-changed warning and defaults, required choices,
  exact request payload/company header, actionable 409 retaining the item, retry
  success, zero badge and exact empty state. No network mutation reached the API.
  Initial navigation waiting timed out, but the route mounted and the complete
  interaction passed without a runtime overlay. Browser observations
  `36uo06`, `4v29pi`, `k8hvyl`, and `skx6vp` contain the populated/selected/conflict/
  success screenshots; these are observations, not retained filesystem assets.
  The public login screenshot also loaded; it cannot verify signed-in pages.

### Commands and evidence

```sh
# Before and after; root script refreshes shared library declarations first.
pnpm run typecheck
# Complete artifact diagnostics rather than recursive fail-fast output:
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/highplains-crm run typecheck

pnpm --filter @workspace/api-server exec vitest run --no-file-parallelism \
  src/services/qboCustomerPromotion.integration.test.ts \
  src/services/qboCustomerPush.integration.test.ts \
  src/services/qboCustomerSync.integration.test.ts \
  src/services/qboCustomerMap.test.ts src/services/customerBilling.test.ts \
  src/routes/customerBilling.test.ts src/routes/qbo.customers.test.ts \
  src/routes/qboCustomerReads.test.ts
# Follow-up checks after the relevant final changes:
# qboCustomerSync.integration.test.ts (32 passed, isolated successful cleanup)
# qboCustomerPush.integration.test.ts (45 passed, sole shared link closer)
# qboCustomerReads.test.ts (21 passed, assigned-term projection/errors)

pnpm --filter @workspace/highplains-crm exec vitest run \
  src/components/qbo src/pages/QboCustomerReview.rendered.test.tsx \
  src/pages/CustomerByQbo.rendered.test.tsx \
  src/components/QboReviewBadge.rendered.test.tsx src/components/nav \
  src/components/BillingAccess.regression.test.tsx \
  src/components/BillingView.count.test.tsx src/components/customer \
  src/shared/customerBilling.test.ts src/lib/billing.test.ts
```

Baseline evidence: `typecheck-before.log`, `api-before.log`, `crm-before.log`,
`crm-typecheck-before-normalized.log`. Final evidence: `api-final.log`,
`api-sync-isolated.log`, `api-resolve-final.log`, `api-read-final.log`,
`crm-final.log`, `typecheck-after.log`, `api-typecheck-after.log`,
`crm-typecheck-after.log`. All paths are under `generated-artifacts/cq4/`.
The frontend delegate's earlier filtered summary (223 tests / 17 files) was
superseded by the saved, direct final run above.

## Specification differences and explicit boundaries

1. **Promotion mismatch — resolved under Randy's amendment.** Legacy promotion
   formerly inserted a link without CQ1 billing hydration/baseline/token, while
   review `promote` closed the review before creation. The narrow shared-link
   correction above is intentional CQ3-file scope authorized for CQ4.
2. **Sub-customer creation is deferred explicitly to CQ5.** The interim UI explains
   the boundary and supports linking to an existing matching branch with the
   upstream separate-billing confirmation. It does not invent parent creation.
3. **Send-now remains asynchronous.** A 202 acknowledges waiting, not successful
   remote creation. The card observes status/reviews every five seconds for up
   to sixty seconds and on focus; timeout preserves waiting with Refresh.
4. **Navigation uses the amended gate.** Invoicing eligibility is unchanged.
   Billing-tagged office/field users use the existing My Tickets destination and
   To invoice link; billing and review counts remain separate.
5. **Removed/merged review actions reuse amended CQ3 semantics.** CQ4 does not
   reimplement unlink pause, survivor-link baseline or dismissal behavior.
6. **Login deep-link return remains a confirmed baseline limitation.** Existing
   unauthenticated routing redirects to bare `/login`; successful login navigates
   to `loginLandingPath`, not the requested URL. Neither authentication nor its
   redirect policy was changed. Authenticated by-QBO replacement navigation works
   independently of that limitation.
7. **Terms permissions remain narrow.** Only admin/office/billing viewers may
   enumerate active terms. Other customer viewers receive their assigned label
   through the card projection, not the list or edit access. An inactive/missing
   term or failed lookup shows its ID with an explicit problem rather than
   silently hiding the billing summary.
8. **No CQ5 wizard, live sync, production operation, new sidebar section or
   QuickBooks inactivation was added.** Follow-on wizard and resilience work
   remains separately scoped.
9. **Existing PATCH-role policy is unchanged.** The CQ4 edit dialog is admin/office
   only. The legacy generic customer PATCH handler has a denylist rather than the
   same admin/office allowlist, so some other roles retain their preexisting API
   write eligibility. CQ4 does not broaden it or silently redesign customer
   permissions. A later role-policy decision should align the generic API with
   the intended customer-edit policy.
