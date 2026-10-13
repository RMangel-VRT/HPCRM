# Contract Center screens — verification and handoff

## Scope and readiness

CC2-1 was present in the starting branch before implementation. The existing High Plains CRM now has the role-gated Contract Center board/list at `/dashboard/contracts` and agreement detail at `/dashboard/contracts/:id`. The unchanged legacy `ContractsOverview` remains at `/dashboard/contracts/old`, registered before the dynamic route.

Admin and office roles can use the new screens; other roles do not see the sidebar item and direct navigation is denied. Creation, renewal and payment editing remain deferred to CC2-3. Customer contract reads/writes, legacy contract behavior, generation, mobile consumers and Canvas have not been switched over.

Read-only API response additions expose current/draft IDs, editable flags, allowed moves, signed dates, flat-snow prices, managing agents, latest terms, renewal progress and actor names. The existing current-term selection is preserved. The existing term PATCH accepts `needsReview` without clearing `reviewNote`.

## Migration and drift

- **Migrations: none.** No schema, DDL, migration runner or background job changes.
- `pnpm --filter @workspace/scripts run check-required-extensions`: **pass**, `pg_trgm` present.
- `pnpm --filter @workspace/scripts run check-schema-drift`: **pass**, schema in sync.
- `git diff --check`: **pass**.

## Focused tests

| Command | Result |
| --- | --- |
| `pnpm --filter @workspace/highplains-crm run test:contract-center` | **27 passed, 5 files** |
| `pnpm --filter @workspace/api-server exec vitest run src/lib/contractCenterBoard.test.ts src/lib/contractCenterService.test.ts src/routes/contractCenterLifecycle.test.ts` | **52 passed, 3 files** |

Coverage includes Both board placement, expired/no-renewal placement, draft renewal placement and term links, signed progress, lookback boundaries excluding future dates, Snow price sorting, legacy redirects versus actual errors, past-term absence of Edit, money display, real role-guard rendering, upload request compatibility, unsaved link/store guards, changed-field validation, explicit zero month-spread validation, and partial-save coordination.

Render tests use the repository's existing Vitest + `renderToStaticMarkup` harness, not a new DOM testing-library dependency. Whole-dollar integer-cent values render without `.00`, following the explicit display rule rather than the conflicting money-test example.

## Full tests

| Command | Result |
| --- | --- |
| `pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts` | **98 passed, 8 failed; 18 passed files, 3 failed files** |
| `pnpm --filter @workspace/api-server test` | **1,050 passed, 7 failed, 1 skipped; 57 passed files, 2 failed files, 1 skipped file** |

Unrelated existing failures were not repaired in this slice:

- Client `useTabParam.test.ts`: five failures because the Node harness has no DOM.
- Client `CrewAssignmentBoard.test.ts`: two existing shift/prune expectations.
- Client `rateCardUtils.test.ts`: stale defaults-count expectation, expected 23 versus actual 42.
- API `plantEnrichment.test.ts`: one partial-sync-status assertion.
- API `mailboxAccounts.oauthReconnect.test.ts`: six mock/import failures involving undefined JSON in the mocked database schema.

The same eight client failures were recorded before the new client screens were added. The API failures concern unchanged plant/mailbox code, not Contract Center.

## Canonical typecheck

`pnpm run typecheck` was run with its initial `pnpm run typecheck:libs` / `tsc --build`, refreshing shared declarations.

- **Shared declaration build passes.**
- **Canonical root typecheck remains failing** on the repository's existing API/CRM errors: shared-schema untyped generics, implicit types, API-to-CRM imports outside the API root, missing/stale symbols, many existing return-path errors, and existing VisualScopeEditor ref types.
- No remaining diagnostics in the new Contract Center pages, editors, formatting/saving/upload/guard modules or the changed Contract Center service/persistence.
- Baseline and final output are retained separately in ignored `generated-artifacts/contract-center/`.

No repository-wide baseline repairs were made.

## Development verification

One signed-in browser pass used disposable admin, office and field accounts in a separate development company. The previously documented test account was rejected; no real user's credentials were changed.

Verified with real sessions:

- Admin Landscape/Snow toggle and customer search; Both agreement visible on both boards and in the table.
- Office board/detail access and entry into Edit; Cancel preserves the server data.
- Field sidebar has no Contracts item, direct route denies access, authenticated detail API returns 403.
- Signed-term scope, monthly spread, Snow triggers and custom rate edits persist after reload.
- An intentionally failed scope PUT during Done preserves the unsaved scope draft and shows the server error, while successful field/rate sections persist. Retrying Save scope succeeds.
- History contains attributable “Edited after signing” entries for fields, rates and scope.
- Sidebar navigation and browser Back both show inline discard choices. Keep editing retains changes; Discard navigates without saving.
- `/dashboard/contracts/old` loads the original overview. The isolated company initially has no legacy contracts.
- Status changes have explicit inline confirmation.

Browser screenshots were examined for the board, partial-save error and status confirmation. No uncaught JavaScript exception was observed. Recurring unrelated dashboard-resource 404s and a development Fast Refresh invalidation appeared; hydration and the changed journeys continued.

Past-season UI and legacy redirect are verified by the required render tests; the isolated browser company did not contain past/legacy season fixtures. Price-ordering behavior is covered by a multi-row test; the browser initially had one matching row.

A separate direct development integration check performed two **real** signed-document uploads through the term-owned upload URLs:

- storage PUT and metadata registration succeed;
- versions allocate 1 and 2;
- authenticated `/objects/...` downloads return the uploaded bytes;
- uploads leave the sent term **sent**;
- explicit status action then marks it signed.

The browser did not exercise file selection or the post-upload Yes/No prompt. The UI handler and prompt are wired to explicit signing only, and helper tests verify the upload request contract. No automatic signing is performed.

Disposable companies, users, customers, agreements and uploaded objects were removed after verification. Generated login details were removed and were never committed. Both workflows were restarted and served successfully.

## Changed files

### API

- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractCenterBoard.test.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`

### CRM registration and legacy-compatible extraction

- `artifacts/highplains-crm/package.json`
- `artifacts/highplains-crm/src/App.tsx`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`

### CRM screens, shared editors and display

- `artifacts/highplains-crm/src/pages/ContractCenterPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractPage.tsx`
- `artifacts/highplains-crm/src/components/contracts/ContractBadges.tsx`
- `artifacts/highplains-crm/src/components/contracts/ContractUploadButton.tsx`
- `artifacts/highplains-crm/src/components/contracts/ScopeEditor.tsx`
- `artifacts/highplains-crm/src/components/contracts/RatesEditor.tsx`
- `artifacts/highplains-crm/src/components/contracts/boardLogic.ts`
- `artifacts/highplains-crm/src/components/contracts/contractFormat.ts`
- `artifacts/highplains-crm/src/components/contracts/contractSave.ts`
- `artifacts/highplains-crm/src/components/contracts/contractTypes.ts`
- `artifacts/highplains-crm/src/lib/contractUpload.ts`
- `artifacts/highplains-crm/src/lib/unsavedGuard.ts`

### CRM regressions

- `artifacts/highplains-crm/src/pages/ContractCenter.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/contractSave.test.ts`
- `artifacts/highplains-crm/src/lib/contractAccess.test.tsx`
- `artifacts/highplains-crm/src/lib/contractUpload.test.ts`
- `artifacts/highplains-crm/src/lib/unsavedGuard.test.ts`

### Handoff context

- `docs/contract-center-cc2-2-verification.md`
- `.agents/memory/contract-center-phase-boundaries.md` — durable guidance to isolate signed-contract verification, not an implementation log.
