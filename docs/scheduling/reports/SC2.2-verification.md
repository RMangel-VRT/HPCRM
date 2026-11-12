# SC2.2 — Standard landscape package verification

Date: 2026-11-12. Scope: existing High Plains CRM and API Server only.

## Decision, predecessor checks and safety

Read the attached owner brief, `replit.md`, ownership map, SC2/SC2.1 reports and
integrated engine/reconciliation/editor handoffs before changing allocation.
This report supersedes their **silent-service skip** and **blocking legacy-only
chemical** expectations, not their timing, identity, protection or Routes rules.
The named Standard Scope Mockup was not found in the available source/assets;
the explicit brief and existing editor conventions governed the implementation.
No canvas shapes were created or modified.

No schema declaration, SQL migration, stored-month cleanup, legacy split,
production query/calendar load/Generate, production data correction, publication,
commercial acceptance, invoice creation or native-mobile UI change occurred.
No shared `contractCoverage.ts`, Routes engine or Routes scheduler code changed.

## Delivered behavior

- Package membership comes from this company's checked standard calendar entries,
  except `packageDefault:false` native areas/backflow in byte-identical catalogs.
  Landscape/both eligible agreements are still mandatory; company, immediate-parent,
  current firm/sent priority, own exclusions and deadline boundaries are retained.
- Silent package scope means included/blank/`count:standard`. Explicit false/zero,
  count-first-N, invalid/duplicate, no-calendar/no-standard and needs-rounds remain
  distinct. Checklist quantities do not multiply annual obligations. Stored months
  are ignored and preserved. Chemical-only scope is informational while explicit
  fertilization/broadleaf exceptions govern those services independently.
- A campaign-only resolver considers the latest eligible prior landscape/both season
  **only without current eligible deadline coverage**. It carries its term/scope
  through end + twelve calendar months inclusive, unless non-renewing; it never
  bypasses that refusal for an older season or parent. Leap dates clamp correctly.
  Lost/cancelled seasons are ineligible; non-renewal leaves original-season work owed.
- One demand projection feeds generation, membership refresh, round contract state
  and Customer Services. Renewal changes term provenance, not entry/year identity,
  existing campaign-item identity, notes, target dates or protected work.
- Eligible nonmembers receive one reason: `excluded_by_contract`,
  `count_covers_fewer`, `not_in_package`, `not_renewing`,
  `renewal_beyond_12_months`. Absent native/backflow lines are not enumerated.
  Invalid/duplicate/needs-rounds remain gaps, not exclusions. Omission-only preview
  rounds are visible but never create presentation-only empty campaigns.
- Generate and actual round views use collapsed omission lists and renewal chips,
  including waiting-signature members. Services enumerates silent services and
  carried-forward deadline years using server demand, not browser entitlement rules.
  Explicit selected-season reports remain bounded; route/history/item promises retain
  their owners. Office-only actual-round omission lists preserve field-role access.
- All landscape editor entry points use company-scoped calendars with explicit
  loading/error/retry/empty states. Route mowing/winter-visits/irrigation-inspection
  and snow defaults are unchanged. Standard counts use checked calendar entries, not
  catalog quantities. Implicit defaults write nothing until Save; Save materializes
  defaults and absent-line exclusions. Difference notes are prompted, not required.
  Older saved drafts with pre-calendar scope require explicit review or a new HOA
  preset; entered scope is not discarded and obsolete hard-coded defaults cannot
  silently advance through submission.
- Each line saves `details.billing`, `details.billingPrice`, `priceCents` and notes
  while preserving unrelated details. A single full dollar amount parses to integer
  cents; free-text edits clear numeric cents. Existing server schemas accept these
  fields; billing remains display/save only with no pricing/invoicing automation.
- Shared contracts, OpenAPI schemas, regenerated validators/clients and both locales
  carry the same reasons and renewal metadata, including actual round response
  validation rather than relying on unknown-field passthrough.

## Rollback-only 2027 comparisons

Before changing allocation, ran:

```sh
pnpm --filter @workspace/api-server exec tsx src/lib/sc22DevelopmentPreview.ts "$PWD/generated-artifacts/SC2.2-before.json"
```

Result: `[]`. This fork had **no existing company Service calendar population**.
That is an empty baseline, not evidence that live customers have no obligations.
The manual helper refuses production and requires a workspace ignored output path.

For meaningful paired evidence, the SC2.2 API integration test captures the
integrated predecessor demand source from `git show HEAD:.../campaignDemand.ts`,
bundles that pure source into ignored output, and substitutes it **only inside the
test** for a baseline rollback preview. Capture is explicitly opt-in with
`SC22_CAPTURE_BASELINE=1`, checks the predecessor hash, and refuses misleading
recapture after HEAD changes; ordinary regression tests do not require Git.
It then restores SC2.2 and previews the same
calendar, eight properties and seasons, in the same outer transaction. No app
source is replaced. Predecessor source SHA-256:
`fe58e37c590791022743d65a2b35b222fbe1cda31e72b2d823df7f29d4d17777`.

Fixture: **Silent**, **Excluded** (cleanups false), **Two cleanups** (count 2),
**Not renewing**, **Too old**, **Native one** (explicit native count 1),
**Chemical only**, **Invalid** (cleanups 25).
Seasons are sent October 2026–September 2027 except the deliberately older season.
All 19 nonrecurring entries are listed, including zeros. Counts are owed members,
not devices or trips inferred from counts. `Excluded`, `Not renewing`, `Too old`
and `Two cleanups` below are fixture property names.

| 2027 round | SC2.1 | SC2.2 | Not on this round |
|---|---:|---:|---|
| Spring clean-up | 1 | 6 | Excluded — excluded_by_contract |
| Fall leaf clean-up 1 | 0 | 4 | Excluded — excluded_by_contract; Not renewing — not_renewing; Too old — renewal_beyond_12_months |
| Fall leaf clean-up 2 | 0 | 3 | Same three; Two cleanups — count_covers_fewer |
| Spring aeration | 0 | 8 | None |
| Spring shrub trim | 0 | 8 | None |
| Fall shrub trim | 0 | 6 | Not renewing — not_renewing; Too old — renewal_beyond_12_months |
| Tree trim | 0 | 6 | Same two |
| Ornamental grass cutback | 0 | 8 | None |
| Pre-emergent / spring fertilizer | 0 | 8 | None |
| Summer fertilizer | 0 | 8 | None |
| Fall fertilizer | 0 | 8 | None |
| Broadleaf 1 | 0 | 8 | None |
| Broadleaf 2 | 0 | 8 | None |
| Broadleaf 3 | 0 | 8 | None |
| Spring start-up | 0 | 8 | None |
| Winterization and blowout | 0 | 6 | Not renewing — not_renewing; Too old — renewal_beyond_12_months |
| Spring full native mow | 1 | 1 | None; no unlisted properties enumerated |
| Fall full native mow | 0 | 0 | Native one — count_covers_fewer; omission-only preview, no empty campaign |
| Backflow testing | 0 | 0 | No listed backflow candidates |
| **Total** | **2** | **112** | |

Excluded explanations include the season label. Non-renewal explanations include
the recorded `nonRenewalOn` date. `Invalid` remains a `bad_count` gap on cleanups
and is deliberately absent from those omission lists. Legacy chemical review is
informational. `not_in_package` is covered separately using nonstandard entries;
the starting package fixture has no ordinary-service nonpackage candidate.

Artifacts are ignored under `generated-artifacts/`: `SC2.2-before.json`,
`SC2.2-after.json`, `SC2.2-fixture-comparison.json` (full before/after projections,
all round counts and structured nonmembers), `SC2.2-fixture-preview.json`.
Raw files are local development evidence, not production/customer audit data.
The API test's outer sentinel rollback also undoes its actual reconciliation,
renewal, protected-item and real HTTP billing-save exercises.

## Commands and results

All Vitest commands use `--maxWorkers=1 --no-file-parallelism`.

1. `pnpm --filter @workspace/api-spec run codegen && pnpm run typecheck:libs`
   — passed; refreshed shared declarations and generated clients/validators.
2. `pnpm --filter @workspace/api-server exec vitest run src/lib/campaignDemand.sc22.test.ts --maxWorkers=1 --no-file-parallelism`
   — **21 passed**, including imported predecessor checks. Proves silent/false/zero/
   count-2, native blank/absent, chemical-only vs split exclusions, parent/company
   boundaries, checklist/duplicates/invalid, October–September continuation,
   exact twelve-month/leap boundary, non-renewal, competing terms and renewal arrival.
   Final company-calendar isolation/nonpackage rerun: `SC2.2-company-boundary.log`,
   21 passed. The additional gap test's missing year arguments and `reason` vs `kind`
   assertion typos were corrected; these did not require application changes.
3. `pnpm --filter @workspace/api-server exec vitest run src/routes/campaignStandardPackage.integration.test.ts src/routes/campaignGeneration.integration.test.ts src/lib/customerServiceFulfillment.test.ts src/lib/contractChangingRenewal.test.ts --maxWorkers=1 --no-file-parallelism`
   — **71 passed / 4 files** (`SC2.2-integration-final.log`). Includes paired real
   rollback previews, sent/current/carried service parity, generated response
   validation, omission-only no-campaign behavior, item identity/protection,
   real round reads and real PUT scope validation/save/reload of billing fields.
4. `pnpm --filter @workspace/highplains-crm exec vitest run src/components/contracts/ScopeEditor.sc22.test.tsx src/components/campaigns/RoundNonmembers.test.tsx src/pages/NewContractPage.rendered.test.tsx src/pages/ContractScope.rendered.test.tsx src/pages/CampaignGenerate.rendered.test.tsx src/components/campaigns/GeneratedRoundView.test.tsx src/components/customer/pages/ServicesPage.cp2.test.tsx src/components/contracts/RenewDialog.rendered.test.tsx --maxWorkers=1 --no-file-parallelism`
   — **79 passed / 8 files** (`SC2.2-rendered-final.log`). Covers both round lists/
   chips, Services parity, new/existing/preset/renewal editors, company switching,
   loading/failure/retry/empty, no pre-save writes, absent exclusion persistence,
   blank/count behavior, billing details and English/Spanish presentation.
5. `pnpm --filter @workspace/highplains-crm exec vitest run src/components/contracts/ScopeEditor.split.test.tsx src/components/contracts/contractSave.test.ts src/components/contracts/contractCreate.test.ts src/lib/contractCustomerServices.test.ts src/hooks/useContractCustomerServices.test.tsx src/lib/roundLists.test.ts src/pages/CampaignDetail.rendered.test.tsx src/components/CampaignContractNotice.test.tsx --maxWorkers=1 --no-file-parallelism`
   — **60 passed / 8 files** (`SC2.2-crm-regressions.log`).
6. `ROUTES_DB_TESTS=1 pnpm --filter @workspace/api-server exec vitest run src/lib/routesR3.integration.test.ts src/lib/campaignDemand.test.ts src/lib/campaignDemand.sc22.test.ts src/lib/campaignMembership.integration.test.ts src/lib/campaignRoundLists.integration.test.ts src/lib/campaignMembership.test.ts src/lib/routeEngine.test.ts src/lib/routeScheduler.test.ts src/routes/customerServices.test.ts src/lib/customerServiceFulfillmentLoader.test.ts src/services/serviceCalendar.test.ts --maxWorkers=1 --no-file-parallelism`
   — Initial **173 passed, 2 failed / 11 files** (`SC2.2-regressions.log`).
   One new isolation assertion ran while its implementation edit was in progress;
   frozen-source rerun passed all 20 demand checks. The other was a disposable-company
   teardown deadlock, not an application assertion; unchanged membership suite rerun
   passed **17/17** (`SC2.2-membership-rerun.log`). Routes/shared-coverage/retained-work/
   calendar/loader checks passed. An earlier CG4 disposable cleanup deadlock likewise
   passed in this final regression run; no application locks or protections weakened.
   Exact rerun: `pnpm --filter @workspace/api-server exec vitest run src/lib/campaignMembership.integration.test.ts --maxWorkers=1 --no-file-parallelism`.
7. `pnpm --filter @workspace/scripts exec tsx src/compare-rfp-typecheck-baseline.ts`
   — **zero added diagnostics**: API 695 baseline/current, CRM 212 baseline/current.
   `pnpm run typecheck:libs` passes. `pnpm run typecheck` still exits 2 on existing
   leaf errors; this is not a clean root typecheck claim. Exact output:
   `SC2.2-typecheck-final.log`, `SC2.2-root-typecheck.log`.
8. `cmp artifacts/api-server/src/shared/contractCatalog.ts artifacts/highplains-crm/src/shared/contractCatalog.ts`
   and `git diff --check` — passed. Managed API/CRM restart succeeded; development
   `/api/healthz` and the transformed `ScopeEditor.tsx` module returned HTTP 200.
   Startup still reports unrelated fake QuickBooks credential errors from old
   development fixtures and existing Browserslist/PostCSS warnings; these were
   not repaired or mistaken for SC2.2 failures.
9. `pnpm --filter @workspace/highplains-crm exec vitest run src/pages/NewContractPage.rendered.test.tsx src/components/contracts/newContractDraft.test.ts src/components/contracts/contractCreate.test.ts --maxWorkers=1 --no-file-parallelism`
   — **34 passed / 2 matching files**, including the older saved-draft review guard
   (`SC2.2-draft-policy.log`; the newContractDraft selector matched no separate file).
10. Final capture command:
    `SC22_CAPTURE_BASELINE=1 pnpm --filter @workspace/api-server exec vitest run src/routes/campaignStandardPackage.integration.test.ts --maxWorkers=1 --no-file-parallelism`.
    — **1 passed / 1 file** (`SC2.2-paired-final.log`); hash-guarded capture again
    recorded 19 entries and 2 → 112 owed memberships on the same rollback fixture.
11. Final native-count presentation check:
    `pnpm --filter @workspace/highplains-crm exec vitest run src/components/contracts/ScopeEditor.sc22.test.tsx --maxWorkers=1 --no-file-parallelism`.
    — **5 passed / 1 file** (`SC2.2-native-count.log`).
    Explicit native/checklist counts use the same difference/optional-notes
    presentation as other calendar-timed counts, without granting implicit membership.

Initial expectation failures were resolved by making predecessor fixtures isolate
their explicitly tested service/season; package-wide behavior is covered by the
new full-calendar suite. Assertions about counts, duplicate guards, original-season
history, Routes and protected work were not removed.

## Browser evidence and remaining limits

One development-only browser pass used an isolated lowercase-email admin, company,
property, sent October–September season with no stored scope, and a disposable
company starting calendar. Signed in through the actual local login, opened the
exact season deep link, and verified silent Standard defaults with native/backflow
off. Toggled cleanups off, chose **Billed when done**, entered **155.25** and
**Browser exception**, explicitly saved, reloaded and reopened the editor.
UI and a read-only DB check agreed: `included:false`, `billing:billed_when_done`,
`billingPrice:"155.25"`, `priceCents:15525`, notes preserved; the other eight package
rows were included with null counts and included billing. Screenshot **ojzdkg**
shows the editable scope; persistence was then checked after reload.

The browser used **2027 preview only**, never Refresh/Generate. Fall cleanups
showed **Excluded by contract · 2026–2027 Landscape**; fall shrub trim showed
**Renewal not entered** alongside **Waiting on signature**. Screenshot **9bpta4**
shows both explanations. Read-only counts after preview: **0 campaigns, 0 items,
0 generation-year opt-ins** for this company. The account was logged out (401
afterward) and exact browser company/account/membership/property/agreement/term/
scope/calendar fixture counts were all confirmed zero after cleanup. Screenshots
are attached in the task conversation; no credentials were retained.

Failed regression teardown companies were removed by exact logged fixture IDs
under the existing visit-then-campaign company locks, not by prefix-wide deletion.
The temporary cleanup script was removed. This restored the original empty
development calendar population; final command:

```sh
pnpm --filter @workspace/api-server exec tsx src/lib/sc22DevelopmentPreview.ts "$PWD/generated-artifacts/SC2.2-after.json"
```

Result: `[]`, matching the before population. The paired eight-property preview
above supplies the meaningful round-by-round comparison without making changes
to real companies. Final public preview screenshot showed the healthy sign-in
page; protected scope/Generate evidence came from the signed-in browser pass.

No production runtime or customer correctness is inferred from disposable fixtures.
Large-company performance and a separately authorized real-company rollout audit
remain outside this task, as do SC3/billing automation and new calendar editing.

## Completion-review compatibility correction

The first completion review found a separate estimate-unit compatibility defect
in the combined project changes: canonical estimate units rejected the existing
standard labor-card label **per hour**. The review specifically authorized its
known conversion at the snapshot boundary, without rewriting contract rates or
guessing unknown units.

`estimateSnapshots.ts` now converts that known labor-rate label to **HR** only when
creating an estimate snapshot. Global canonical-unit validation, rate-card units,
contract rates and unknown-unit rejection are unchanged. A new real API regression
seeds the standard card inside a rollback transaction, sets the company price on
its standard general-labor key, inserts a two-hour estimate line, and verifies
201/HR/7500 cents/15000 extended cents while the card still says **per hour**.
Changing the disposable source to an unknown label still returns
422 `INVALID_CATALOG_UNIT` and inserts no additional line. The fixture is rolled
back and its company is confirmed absent.

Two predecessor unit/route-test fixtures used lowercase `ea` as a valid new input;
they now use canonical **EA** so their original math/auth/conflict/safe-error
assertions reach the intended boundaries under the already-merged unit contract.
No unit-validation assertion or production protection was relaxed.

```sh
pnpm --filter @workspace/api-server exec vitest run src/services/estimateLaborSnapshot.integration.test.ts src/lib/estimateUnits.test.ts src/services/estimateRates.test.ts src/services/estimateMath.test.ts src/routes/estimates.test.ts --maxWorkers=1 --no-file-parallelism
```

Final result: **150 passed / 5 files** (`SC2.2-review-fix.log`). The API workflow was
rebuilt/restarted after this correction. This narrow review-requested compatibility
fix is the only addition to the landscape-package scope; it adds no schema change,
rate rewrite, billing automation or production operation.
