# Customer QuickBooks sync verification

## Scope and prompt discrepancies

- Implemented initial reconciliation, centralized mirror ingestion, review-only
  remote reconciliation, CDC/full scheduling, sync controls and gated invoice
  bill-to resolution. CQ3 pushes/resolution, CQ4 queue/navigation and CQ5 wizard
  remain out of scope.
- Followed the detailed preservation/comparison rules instead of the upload's
  contradictory final requirement that all linked customers become `in_sync`.
  Non-empty conflicts are preserved and genuine differences remain `pending_push`.
- Used the next free migration number, `0068`. `0066` is proposal covers;
  CQ1 uses `0067`. No historical migration filename changed.
- Applied the November 3 overrides: before baseline, ingestion raises **no**
  review kinds and changes **no** CRM metadata; unbound sub-customers require a
  creation timestamp strictly after the original baseline, just like new
  top-level records.
- The existing customer-create endpoint did not yet have an operational
  initial-baseline gate or delivery suppression. Added the minimum gate and
  `PreferredDeliveryMethod: "None"` required by this slice's ground rules,
  without implementing outbound synchronization or changing its mapping UI.
- CSV seed evidence also writes the cache. Its metadata writer now belongs to
  the centralized service rather than leaving an exception in storage.

No publishing, production migration execution, live initial reconciliation,
external customer writes or live QuickBooks validation was performed.

## Changed files and call sites

| File | Change / touched call sites |
|---|---|
| `.migration-backup/migrations/0068_qbo_customer_sync.sql` | Guarded additive mirror/connection fields, review snapshots, nullable customer FK with SET NULL, two partial open-review indexes |
| `lib/db/src/schema/schema.ts` | Cache mirror metadata and connection watermarks |
| `lib/db/src/schema/qboCustomerSync.ts` | Review schema, kinds/statuses, evidence types and indexes |
| `lib/db/src/schema/index.ts` | Exports review schema |
| `artifacts/highplains-crm/src/shared/schema.ts` | Matching driver-free cache/review schema, connection and UI result/status contracts |
| `artifacts/api-server/src/services/qboCustomerSync.ts` | All cache writes; full/initial/CDC entry points, review merge, company lock, status, seed metadata and scheduler |
| `artifacts/api-server/src/services/qboCustomerComparison.ts` | Normalized comparison table and empty-only initial billing patch; uses CQ1's map, not a replacement |
| `artifacts/api-server/src/routes/qbo.ts` | Existing pull delegates to service; live duplicate query and existing create-result ingestion use service; create is company-serialized/baseline-gated and suppresses QBO delivery; its binding joins the mirror transaction; CSV import calls central seed writer; adds initial/sync-now/status routes and expected-company guards |
| `artifacts/api-server/src/storage.ts` | Removed both stale-cache deactivators, old cache upsert and seed writer; existing mapping/binding/duplicate readers retained |
| `artifacts/api-server/src/index.ts` | Starts customer scheduler and stops it on server close |
| `artifacts/api-server/src/services/invoiceBillTo.ts` | Explicit pre-baseline mirror exception; live CQ1 resolver/name/master-parent policy after baseline; only incomplete resolution permits property fallback |
| `artifacts/api-server/src/services/invoicePdf.ts` | Draft model calls gated bill-to reader instead of unconditional cache join; issued snapshots unchanged |
| `artifacts/highplains-crm/src/components/qbo/CustomerSyncControls.tsx` | Scoped status query, initial confirmation, result/branch summary, office/admin sync-now, loading/error feedback and invalidations |
| `artifacts/highplains-crm/src/pages/QboCustomerMapping.tsx` | Mounts small sync strip in existing settings page; existing mapping tabs retained |
| `artifacts/api-server/src/services/qboCustomerSync.integration.test.ts` | Mocked QBO + real PostgreSQL coverage described below |
| `artifacts/api-server/src/routes/qbo.customers.test.ts` | Existing route regression coverage adapted to service delegation; new auth/role/company/baseline-gate cases |
| `artifacts/api-server/src/routes/qbo.test.ts` | Original OAuth suite isolates the newly imported customer sync service |
| `artifacts/highplains-crm/src/components/qbo/CustomerSyncControls.test.tsx` | Rendered interaction tests for confirmation, requests, errors/loading, counts, permissions, invalidation and company-switch reset |
| `docs/customers/customer-qbo-sync.md`, `docs/ownership/data-ownership-map.md` | Sync contract, transaction boundary and explicit pre-baseline invoice exception |
| `.agents/memory/MEMORY.md`, `customer-qbo-sync-direction.md`, `qbo-sync-transaction-boundary.md` | Durable clarification and OAuth-rotation transaction decision |

### Cache read/write audit

Repository search across `artifacts`, `lib` and `scripts`, excluding tests/build
output, found cache INSERT/UPDATE operations only in `qboCustomerSync.ts`.
Remaining storage reads support mapping, binding/promote, seed matching and
duplicate checks, not post-baseline invoice billing. `invoiceBillTo.ts` is the
only billing read exception and returns from the legacy branch only when the
company baseline is absent. No post-baseline PDF billing lookup uses the cache.

## Verification results

### Before edits

- Canonical `pnpm run typecheck`: failed with **721 existing API-reported
  diagnostics** after refreshing shared-library declarations.
- Relevant original Vitest suites: **5 files / 150 tests passed**:
  `qbo.customers`, `qbo`, `qboClient`, `qboCustomerMap`, `customerBilling`.

### After implementation

- Canonical `pnpm run typecheck`: still **721 diagnostics**, with **zero added
  or removed file/error-code categories** after ignoring shifted line numbers.
  Shared-library declaration build succeeds. Existing failures include route
  return-path errors, legacy Zod `.errors` accesses, schema-stub typing and
  cross-artifact root-directory imports. No new sync, comparison, invoice reader,
  route or controls diagnostic.
- Standalone CRM `typecheck`: **223 diagnostics** in the existing application
  baseline; no diagnostics in the new sync controls or mapping page. A separate
  standalone frontend before-check was not captured; the canonical before/after
  comparison above is the baseline delta evidence.
- API final Vitest: **9 files / 199 tests passed**. Includes the original five
  suites plus `customerBilling.migration.test.ts`,
  `qboCustomerSync.integration.test.ts`,
  `documents/invoiceModel.test.ts`, and
  `documentSettings.integration.test.ts` (including real PDF rendering).
- UI Vitest: **1 file / 4 tests passed**.
- Development SQL migration: applied `0068` successfully with the documented
  migration runner. Independent migration test applies the same SQL twice in a
  private schema inside a rolled-back transaction, checks both partial indexes
  and verifies customer deletion preserves review evidence with a null FK.
- Real PostgreSQL tests prove cross-connection advisory-lock exclusion,
  nested-call reuse, overlapping manual pulls, converging QBO/customer review
  subjects and a uniqueness race against an independent producer.
- Mocked-QBO tests cover all four comparison cases, own-write echo, merged
  snapshots, strict creation-time gates (old/equal/new), no auto-import,
  pre-baseline cache-only behavior for active/inactive/deleted/unbound records,
  initial hydration/conflicts/idempotence/pending state, live management-company
  preservation, master-parent exceptions, success-only CDC cursor advancement,
  failed ingestion, 29-day recovery, complete active/inactive pagination,
  failed-pagination rollback, scheduler error containment and company isolation.
  An additional PostgreSQL regression verifies that jsonb address-key ordering
  cannot turn a CRM-only edit into a spurious QuickBooks review.
  Initial-sync retries after an established baseline use ordinary review-only
  reconciliation. Regression tests cover intentional CRM clears and changed
  remote values with an existing open conflict, preserving baseline/token
  evidence rather than repeating one-time hydration.
- Invoice tests exercise legacy cache billing before baseline, live CRM after,
  master-parent names/addresses, incomplete-address fallback, immutable issued
  snapshot behavior and the existing PDF rendering pipeline.
- Both managed API/web workflows restarted successfully. API build/boot succeeded
  with no new startup failure. Existing PostgreSQL SSL-mode, Browserslist and
  PostCSS warnings remain.
- HTTP: unauthenticated sync-status returns **401**. Vite transforms the new
  controls module successfully (**200**), covering the dev JSX instrumentation.
- Preview screenshot loads the existing sign-in page normally. **The signed-in
  settings page was not verified in a browser**; its changed controls were
  verified through rendered interaction tests instead. No browser action
  triggered real sync or external writes.
- `git diff --check`: passed.

Raw verification output is retained under ignored `generated-artifacts/cq2/`.
There are planned downstream slices, so no overlapping follow-up work was proposed.
