# Contract Center create, payments and renewal verification

Verified in development on October 13, 2026. This slice consumes the merged
Contract Center API and board/detail editors. It does not switch customer pages
away from legacy contracts, freeze legacy writes, generate documents, or publish.

## Implemented

- Admin/office-only static New contract route, board action and customer prefill.
- Six-step wizard, Colorado date defaults, contact/address snapshots, reusable
  scope/rate editors, applicable active card snapshots, overrides and custom rates.
- Company/user-scoped session draft persistence and server revalidation of selected
  customers. Parent and foreign-company customers are not selectable.
- Integer-cent yearly payment patterns with calendar-indexed amounts, cycle order,
  final-payment reconciliation, named lines, editable months and mismatch warnings.
- Shared payment editor in current-term Billing; older terms remain read-only.
- Snow-only time-and-materials note; flat Snow line derives the flat yearly price.
- Flat-rate Billing saves require a positive line named Snow. Removing, renaming
  or zeroing it cannot save an empty schedule while retaining a flat snow price.
- Create-once submission with optional Their form upload afterward; upload failure
  recovery survives reload without posting a second agreement.
- Server-authoritative renewal previews with 300 ms debounce, stale-response
  protection, both rounding options, commit lock, board refresh and new-term hash.

## Acceptance scenarios

An opt-in real-development-database test passed all four scenarios using a disposable
company and user, removed in `finally`, without migrations or existing-company writes:

1. **Pavilion Villas:** Grounds MSI $11,750 plus Fertilization $2,400 over March–September:
   $14,150 yearly, $587.50 Grounds in November–February, $1,175 otherwise,
   Fertilization $342.86 March–August and $342.84 September. Edited $610 mowing rate
   persists. A two-year schedule expands to two years but keeps the $14,150 annual price.
2. **Snow-only T&M:** no payment schedule or annual fixed price; snow card rates remain.
3. **Both flat snow:** $11,750 Grounds plus $5,000 Snow totals $16,750. Replacing the
   Snow schedule with $6,000 and updating its flat price results in $17,750 annually.
4. **3% renewal:** both rounding previews succeed; dollar preview/commit agree at
   $14,575, retained overrides are identified, new dates start October 1, 2027,
   source term remains unchanged, board data has the new renewal draft, and a
   duplicate renewal returns 409 without adding another term.

The signed-in browser pass confirmed office/field access, new versus old routing,
parent/foreign prefill exclusion, contacts/address, scope/rate editing, exact
payment examples, reload persistence, and zero agreement writes before Create.
It stopped at an omitted edited rate in the review summary. That defect was fixed
and verified with rendered and unit regression tests; the browser was not rerun.
Creation, Billing replacement, snow scenarios and renewal persistence were then
checked through the real-development API test and focused rendered/unit tests.
Real private object-storage uploading was not exercised; upload recovery is tested
with the upload helper mocked. Follow-up browser/storage regression suggestions
are separate from this implementation.

## Checks

| Check | Result |
| --- | --- |
| `pnpm --filter @workspace/highplains-crm run test:contract-center` | 11 files, 80 tests pass |
| Focused API Contract Center route/service/board tests | 4 files, 104 tests pass |
| `CC_CREATE_VERIFY=yes pnpm --filter @workspace/api-server exec vitest run src/lib/contractCenterCreateRenewDevelopment.test.ts` | Pass; all four acceptance scenarios and cleanup |
| Full CRM Vitest suite | 162 pass, 8 fail; same baseline failures |
| `pnpm --filter @workspace/api-server test` | 1050 pass, 7 fail, 2 skip; same baseline failures |
| Canonical `pnpm run typecheck` | Existing failure; zero added errors compared with pre-change baseline |
| CRM standalone typecheck | Existing failure; zero added errors after normalizing shifted line numbers |
| `pnpm --filter @workspace/scripts run check-schema-drift` | Pass; no drift |
| `git diff --check` | Pass |

Baseline CRM failures: two `CrewAssignmentBoard.test.ts` reducer cases, five
`useTabParam.test.ts` cases (`window` unavailable in the node environment), and
one `rateCardUtils.test.ts` count expectation (23 versus the existing 42 defaults).
Baseline API failures: six `mailboxAccounts.oauthReconnect.test.ts` cases and one
`plantEnrichment.test.ts` partial-run case. Existing canonical/CRM typecheck errors
were not repaired as unrelated cleanup.

**Migrations:** none. **Schema drift:** none. **Implementation drift:** none;
browser verification coverage is explicitly limited above.
Command logs are retained under ignored `generated-artifacts/cc2-3/`.

## Changed files

Under `artifacts/highplains-crm/`:

- `package.json` — focused Contract Center test command includes the new coverage.
- `src/App.tsx` — static New contract route.
- `src/pages/ContractCenterPage.tsx` — New and shared Renew actions.
- `src/pages/ContractPage.tsx` — current-term payment editing and renewal navigation.
- `src/pages/NewContractPage.tsx` — six-step create and upload recovery.
- `src/components/contracts/PaymentEditor.tsx`
- `src/components/contracts/paymentPresets.ts`
- `src/components/contracts/paymentDraft.ts`
- `src/components/contracts/newContractDraft.ts`
- `src/components/contracts/RenewDialog.tsx`
- `src/components/contracts/renewPreview.ts`
- `src/components/contracts/paymentPresets.test.ts`
- `src/components/contracts/contractCreate.test.ts`
- `src/components/contracts/PaymentEditor.rendered.test.tsx`
- `src/components/contracts/RenewDialog.rendered.test.tsx`
- `src/pages/NewContractPage.rendered.test.tsx`
- `src/pages/ContractBilling.rendered.test.tsx` — removal/rename blocked in both
  Save payments and Done for Snow-only/Both flat terms; positive amount and
  valid Snow edit/derived price checks.
- `src/lib/contractAccess.test.tsx`

Other files:

- `artifacts/api-server/src/lib/contractCenterCreateRenewDevelopment.test.ts` —
  opt-in fixture-only real database/API acceptance checks.
- `.agents/memory/contract-center-phase-boundaries.md` — durable distinction between
  twelve-payment flooring and selected-month rounding.
- This verification report.
