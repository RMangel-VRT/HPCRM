# Contract non-renewal verification

## Scope and schema

Implemented the attached non-renewal specification in the existing CRM and API.
No publishing, production schema/data operation, named-customer backfill,
legacy-contract reader repointing, crew/mobile change, or dependency cleanup was
performed.

Migration: `.migration-backup/migrations/0063_term_non_renewal.sql`.
The number was unused when selected; no existing migration was renamed.
The migration adds **only six columns** on `agreement_terms`, and the nullable
`non_renewal_by` user foreign key with `ON DELETE SET NULL`. Reasons are text,
not a database enum. Development catalog inspection confirms the six types,
nullability, false boolean default and FK action. Both term declarations and
frontend insert-schema extensions agree. This is the intended publish schema
change; production/Publish was deliberately not accessed.

The migration was applied to development only: one applied, 72 already current.
No DDL was added to startup. Existing startup code and unrelated migrations
were not changed.

## Behavior and regression coverage

- Record/undo endpoints require admin or office and company-scoped access.
  Calendar dates, future decisions, seven reasons and text limits are validated.
  Final-source selection is distinct from displayed current season and
  year-one lifecycle ownership.
- Recording preserves the source's operating status, money, scope and
  editability. Pending renewal sets close through the existing lifecycle/RFP
  function in the same transaction. Outcome history is attributable and
  idempotent, without duplicate generic edit entries.
- Undo clears all six facts, does not restore lost pending renewals, refuses
  after a signed successor, and reports an already-inactive customer without
  reactivation.
- Interactive renewal and import planning/execution reject marked sources,
  including under-lock import revalidation.
- Inclusive Colorado end dates retain in-effect behavior. Ended marked sources
  project Lost, leave renewal/action lists, and appear in the board's existing
  90-day Lost window. A lost pending renewal cannot mask or prematurely place
  the source. Progress keeps non-renewals in the denominator separately from
  signed renewals.
- Startup/hourly processing reuses manual customer storage behavior and
  atomically commits customer status, history and flag consumption. The shared
  company gate coordinates agreement creation, seasonal writes, copy/import,
  undo and the sweep. Tests include overlapping sweeps, concurrent new
  draft/signed business, concurrent undo, transaction failure/retry, other
  open lines, inactive customers, unticked flags and inclusive end dates.
- Bilingual dialog, role-gated header/board actions, source-aware strip/chips,
  customer Contracts tab, Cancelled-only active/signed menus, cache refresh and
  already-inactive undo feedback are implemented. Checkbox defaults count
  other open agreement lines, not years in the same agreement. Contract queries
  have finite staleness and refresh on focus rather than remaining infinitely
  fresh across sessions.

## Checks and prior failures

Logs are retained in ignored `generated-artifacts/non-renewal/`.

| Check | Result |
| --- | --- |
| Baseline selected API suites | 153 passed, 10 database-gated tests skipped |
| Final service, lifecycle API, non-renewal DB, renewal unit/import DB, RFP DB suites | 207 passed in six files |
| Final board/rendered widgets/customer/Renew/dialog client suites | 88 passed in seven files, then 17 customer-tab tests passed including the additional chip regression: 89 distinct client tests |
| Supplemental current/ended dashboard exclusion and actual dashboard route suite | 24 passed in two files; includes the non-renewal DB suite again |
| Development schema drift | Pass: declarations and database agree |
| Required extensions | Pass: `pg_trgm` present |
| Development schema catalog audit | Pass: six columns and nullable user FK with SET NULL |
| API and CRM workflows | Restarted; API build/listen and Vite ready; no new startup error |
| `git diff --check` | Pass |
| Workspace `pnpm run typecheck` | Existing failure: 730 API diagnostics before and after; zero new file/error-code signatures |
| Standalone CRM typecheck | Existing failure: 221 diagnostics before and after |
| Locale registration follow-up | Six non-renewal rendered tests passed after registering both localized reason catalogs |

Workspace typecheck refreshes emitted library declarations before checking leaf
packages. The baseline includes pre-existing auth/seed/object-storage/test
diagnostics and frontend Drizzle-stub/root-directory diagnostics imported by the
API. Unrelated repair was deliberately not attempted. One displayed Zod
diagnostic changes only object-property ordering between runs; its file, code
and meaning are unchanged.

The initial drift check overlapped the first schema declaration edit and
therefore reported the six not-yet-migrated columns. It did **not** identify
unrelated pre-existing drift. The post-migration check is clean.

Initial feature verification exposed and corrected:

1. A synthetic multi-year fixture copied a PostgreSQL timestamp through
   JavaScript millisecond precision, losing the exact same-transaction
   timestamp needed for set membership. The fixture now supplies one exact
   timestamp for both members; production grouping rules were not weakened.
2. An RFP assertion used the wrong history field (`newStatusId` instead of
   `toStatusId`).
3. An existing board test's full Query mock needed the newly imported dialog
   mocked, just as it already mocked Renew.
4. The typed legacy Copy plan needed explicit empty non-renewal values for the
   expanded term type; this was fixed without adding legacy-table facts.
5. The added customer-tab assertion initially expected the wrong mocked
   translation key; it now asserts the actual shared chip key.

The transactional-failure test intentionally emits a logged error and proves
rollback followed by successful retry. PostgreSQL SSL-compatibility and
concurrent-query deprecation warnings are pre-existing/toolchain warnings, not
failed assertions. The dashboard suite is actually under `src/routes/`, not
the originally listed `src/lib/` path.

## Browser verification

One authenticated development-only pass used a disposable company, canonical
temporary user, customer and agreement. The generated credentials are kept only
in ignored temporary verification output, never in this report.

The browser pass succeeded on: board action; required dialog fields; Colorado
decision date; competitor Surfaces; only-open-line checkbox; immediate board
exclusion and separate progress count; worked-season Active status; red chip,
actor/date/reason strip and Undo; editable details; Cancel contract with no Lost;
exactly one attributable history outcome and no generic edit; undo restoring
renewal eligibility; opening/canceling the real renewal preview without creating
a draft. Screenshots were inspected for the dialog, recorded detail, status
menu, undo and renewal preview.

A subsequent scoped development read confirmed exactly one non-renewal outcome,
the source still stored as `signed`, and undo-cleared fields with no placeholder
season. The disposable customer's detail API returned HTTP 200. The temporary
company, user and dependent fixture data were deleted, and the ignored
credential file was removed.

**Verification limitation:** the linked customer detail page remained loading
in the browser, so its Contracts tab was not visually verified in that pass.
The actual CustomerContracts component is covered by an explicit rendered
regression asserting that the non-renewal chip replaces the renewal chip.
No second broad browser pass was run. Existing full-typecheck failures remain
the validation blocker listed above; there is no new diagnostic signature.

## Changed files

- `.agents/memory/MEMORY.md`
- `.agents/memory/contract-outcome-boundaries.md`
- `.migration-backup/migrations/0063_term_non_renewal.sql`
- `docs/contracts/reports/contract-non-renewal-verification.md`
- `lib/db/package.json`
- `lib/db/src/contractNonRenewal.ts`
- `lib/db/src/schema/schema.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/storage.ts`
- `artifacts/api-server/src/shared/contractCatalog.ts`
- `artifacts/api-server/src/lib/contractCenterCopy.ts`
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractCenterService.test.ts`
- `artifacts/api-server/src/lib/contractNonRenewal.ts`
- `artifacts/api-server/src/lib/contractNonRenewalFixture.ts`
- `artifacts/api-server/src/lib/contractNonRenewalSweep.ts`
- `artifacts/api-server/src/lib/contractNonRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/contractRenewalPlan.ts`
- `artifacts/api-server/src/lib/contractRenewal.test.ts`
- `artifacts/api-server/src/lib/contractRenewal.integration.test.ts`
- `artifacts/api-server/src/lib/rfpContracts.integration.test.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`
- `artifacts/highplains-crm/src/shared/contractCatalog.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `artifacts/highplains-crm/src/components/contracts/contractTypes.ts`
- `artifacts/highplains-crm/src/components/contracts/boardLogic.ts`
- `artifacts/highplains-crm/src/components/contracts/boardLogic.season.test.ts`
- `artifacts/highplains-crm/src/components/contracts/CustomerContracts.tsx`
- `artifacts/highplains-crm/src/components/contracts/NonRenewalChip.tsx`
- `artifacts/highplains-crm/src/components/contracts/NotRenewingDialog.tsx`
- `artifacts/highplains-crm/src/components/contracts/NonRenewal.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/ContractPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractCenterPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractCenter.board.test.tsx`
- `artifacts/highplains-crm/src/pages/CustomerContracts.rendered.test.tsx`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`
- `artifacts/highplains-crm/src/i18n/locales/es.ts`
