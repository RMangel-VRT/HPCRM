# Contract Center API: implementation and verification

## Scope

Server-only payment, read, edit, status, renewal and document slice. No new screens, legacy navigation changes, PDF generation, production copy, production data edits or startup seeding were introduced.

The API slice must merge before the board/detail slice starts; that slice must merge before create/renew screens. The eventual legacy freeze requires confirmation that the old records are fixed.

## Migration

`.migration-backup/migrations/0046_contract_center_payment_lines.sql`

- Adds billing component with the `Contract` default, preserving existing rows.
- Replaces term/month uniqueness with term/component/month uniqueness.
- Adds nullable snow pricing and flat-price columns.
- Applied through the development migration runner: first run applied one migration; second run applied zero.
- The explicit development verification also executed the guarded SQL twice successfully.
- Schema drift and required extensions: passed. Production schema remains Publish-only.

## API notes for the next slices

All lifecycle endpoints are company-scoped and allow admin, office and superadmin. Rate-card writes and legacy copying remain admin/superadmin only.

- Agreement detail is `{ ...agreement, customer, terms }`.
- Each term includes `displayStatus`, `scope`, `rates`, `billingMonths`, `documents`, and `history`.
- List rows include `current`, `renewalDraft`, and `renewalDue`. Pending/lost renewal attempts do not replace their source as the current season. A signed renewal becomes current.
- Replacement PUTs accept either the array itself or `{ scope }`, `{ rates }`, or `{ payments }`.
- PATCH accepts only editable term/contact/snow fields. Status and server-owned fields are ignored; an empty effective PATCH is rejected.
- Committed renewal returns full agreement detail; dry run returns proposed term fields, `payments: [{ component, before, after }]`, `snowFlatPrice: { before, after }`, and `rateChanges`. Rate change `old`/`new` values contain `priceCents` and `priceText`.
- Document metadata must follow an upload URL requested for the same term in the same authenticated session. URLs are normalized using the existing object storage service. Objects receive private company read ACLs; no status/history change occurs.
- All related mutations lock the agreement before changing its terms. This serializes renewals, source status updates and per-kind document version allocation.

## Verification results

- Focused Contract Center Vitest: **192 passed across 7 files**.
- Opt-in real development verification: **1 passed**. Creates and removes a disposable company, user and customer.
  - Pavilion Villas: October 2026–September 2027 grounds pattern plus March–September fertilization; annual **1,415,000 cents**.
  - 3% dollar-rounded renewal: annual **1,457,500 cents**, October 2027–September 2028.
  - Dry run does not change term data.
  - Simultaneous committed renewals against PostgreSQL return one 201 and one 409.
  - Renewal draft → sent → signed produces attributable history on both terms and marks the old term renewed.
  - Active-card overrides survive; sorted scope/billing detail and list selection verified.
  - By-legacy lookup succeeds for a company-owned source.
  - The built running API also passes real session login, legacy contract reads, customer-filtered legacy contract reads, Contract Center detail and an explicit repeat seed.
- Explicit seed preservation tests insert exactly **19 missing defaults** into a 24-row edited card without changing labels/prices/active flags. The disposable development company seeds all 43, then skips all 43 on repeat.
- Full API Vitest: **1,045 passed, 7 failed, 1 intentionally skipped across 59 files**.
  - Pre-existing: six failures in `src/routes/mailboxAccounts.oauthReconnect.test.ts` (`"undefined" is not valid JSON` during Drizzle mock initialization).
  - Pre-existing: one failure in `src/lib/plantEnrichment.test.ts`, partial sync status assertion.
  - Both failing suites reproduce against an extracted unchanged baseline.
  - An earlier full run had one QBO import timeout under parallel load; its 34 tests passed alone and the final full run had no QBO failures.
- Root typecheck: **fails on existing repository errors**. Library declarations refresh successfully. No errors are reported in the new Contract Center files. Baseline comparison reproduces the existing API auth/routes/test errors; existing cross-artifact test imports also violate API `rootDir` and pull in untyped CRM stub errors. No unrelated cleanup was attempted.
- API workflow rebuild/restart: passed. CRM entry screenshot renders the existing sign-in screen.
- Legacy route, Contracts page, customer Contracts tab, contract builder and reports source files are unchanged. Authenticated legacy read endpoints remain functional.

Commands and full logs are retained under ignored `generated-artifacts/cc2-1/`.

```sh
pnpm --filter @workspace/scripts run migrate
pnpm --filter @workspace/scripts run check-required-extensions
pnpm --filter @workspace/scripts run check-schema-drift
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/contractCenterService.test.ts src/routes/contractCenterLifecycle.test.ts \
  src/routes/contractCenter.test.ts src/routes/contractCenterCopy.test.ts \
  src/lib/contractCenterCopy.test.ts src/shared/contractCenterSchema.test.ts \
  src/shared/contractCatalog.test.ts
CC_DEV_VERIFY=yes pnpm --filter @workspace/api-server exec vitest run src/lib/contractCenterDevelopment.test.ts
pnpm --filter @workspace/api-server test
pnpm run typecheck
```

The opt-in development test requires the development API workflow running at the shared proxy. It is skipped during normal API tests and must never be enabled against production.

## Changed files

- `.migration-backup/migrations/0046_contract_center_payment_lines.sql`
- `lib/db/src/schema/schema.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `artifacts/api-server/src/shared/contractCatalog.ts`
- `artifacts/highplains-crm/src/shared/contractCatalog.ts`
- `artifacts/api-server/src/shared/contractCatalog.test.ts`
- `artifacts/api-server/src/shared/contractCenterSchema.test.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.test.ts`
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractCenterService.test.ts`
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterDevelopment.test.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/contractCenter.test.ts`
- `artifacts/api-server/src/routes/contractCenterCopy.test.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`
- `.agents/memory/contract-center-phase-boundaries.md`
- `.agents/memory/validation-durability.md`
- `docs/contract-center-cc2-1-verification.md`
