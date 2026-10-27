# Display-type filters and API/CRM regression audit

Verified October 27, 2026, in development. **Not globally green:** the final suites retain precisely the documented P3-3 **7 API / 8 CRM** failing tests. No production write or publishing was performed.

## Revisions, environment and evidence

- Pre-edit full-suite revision: `678512b0f21922538018d72f0b7a1ace4a297553`.
- Final implementation tested: `f0ede83bbaf0b90044d149452f7e90f2a65edbe7`. Only this report, its summarizer and compact JSON evidence were added afterward; application, libraries and test sources remain identical to that revision.
- Historical P3-3 release revision: `a77f0607` (`docs/p3-3-release-report.md`). Its **final** baseline is 7 API / 8 CRM, not the earlier 8-API run containing a transient reorder timeout.
- Node `v24.22.1`, pnpm `10.26.1`, Vitest `4.1.5`, Linux, `TZ=UTC`. CRM uses its existing `vitest.config.ts` (node default, individual rendered tests select jsdom); API uses its existing default Vitest discovery.
- Existing development PostgreSQL was available; integration tests create and remove disposable records. Existing opt-in destructive/development suites retain their original environment guards. No guard, assertion or suite was skipped/excluded to obtain these results.
- Complete text and JSON reporter output: ignored `generated-artifacts/display-filter-audit/`. Compact, committed machine-readable evidence: [`display-type-filter-audit.json`](display-type-filter-audit.json). It lists every initial/final failed test, load errors, counts, historical comparison results and skipped-file counts.
- Before and final full runs completed, not just started. Both API and CRM commands exit **1**, as expected with the remaining baseline failures.
- The pre-edit checkout was clean. No concurrent revision was applied to the audited checkout between its baseline and implementation. Final checks confirm no application/library/test diff from the tested implementation; unrelated task notifications are not evidence that those changes exist in this checkout.

## Complete-suite results

Counts of **tests** and **files** are deliberately separate. Module-load errors prevent collection and are not additional failed test assertions.

| Run | Passed tests | Failed tests | Skipped tests | Passed files | Failed files | Skipped files | Total files |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fresh pre-edit API | 1,637 | 18 | 69 | 79 | 8 | 10 | 97 |
| Final API | **1,740** | **7** | **69** | **85** | **2** | **10** | **97** |
| Fresh pre-edit CRM | 651 | 8 | 0 | 57 | 3 | 0 | 60 |
| Final CRM | **660** | **8** | **0** | **58** | **3** | **0** | **61** |

The initial API run also had **three module-load failures** (included in its eight failing files). Restoring collection recovered 91 previously uncollected tests, including one stale assertion subsequently fixed. One new API boundary assertion was added. Eleven initially failing API assertions were repaired. CRM gained nine interaction tests.

Final failure delta against P3-3: **API 0 (7 − 7); CRM 0 (8 − 8)**. Every final failed test matches the historical baseline by file **and full test name**, not just total. No newly failing test or unresolved attribution remains in the final runs.

## Every remaining API failure

All are **P3-3 baseline**, reproduced in a pristine P3-3 source archive with its own workspace schema and generated runtime validators. The tests and relevant plant implementation are unchanged since that release (`baseline-failure-source-diff.txt` is empty).

### `artifacts/api-server/src/routes/mailboxAccounts.oauthReconnect.test.ts`

These six cases all fail during dependency initialization, before their OAuth assertions. The broad `drizzle-orm` mock reaches the real workspace schema/index initialization; Drizzle attempts `JSON.parse(undefined)`, producing `SyntaxError: "undefined" is not valid JSON`. This is not evidence that six actual OAuth operations regressed.

1. `OAuth callback reconnect — syncErrorCount reset > resets syncErrorCount to 0 on a successful reconnect from an errored state`
2. `OAuth callback reconnect — syncErrorCount reset > includes syncErrorCount: 0 as an explicit key — not absent — so the DB actually resets it`
3. `OAuth callback reconnect — syncErrorCount reset > does NOT trigger the update at all when the OAuth code exchange fails`
4. `OAuth callback — shared mailbox rejects email mismatch > returns 400 with Email Mismatch page when shared mailbox email differs from connected Google account`
5. `OAuth callback — personal mailbox auto-correct > auto-corrects emailAddress when personal mailbox owner signs in with a different (unclaimed) Gmail`
6. `OAuth callback — personal mailbox auto-correct > rejects when the corrected email is already claimed by another mailbox in the company`

### `artifacts/api-server/src/lib/plantEnrichment.test.ts`

7. `enrichPlants — partial failure > marks the sync run as 'partial' in the DB`
   - Failure: expected `partial`, received `undefined` at the assertion inspecting the final mocked update chain.
   - The neighboring return-value and continue-after-error cases pass. This audit establishes identical historical failure, not that real persistence is correct; changing plant behavior or repairing this baseline mock is outside the display-filter slice.

## Every remaining CRM failure

All are **P3-3 baseline**. The pristine historical focused run reproduces the exact eight names and reasons (12 pass / 8 fail, three files). The corresponding tests and implementations have zero source diff from P3-3.

### `artifacts/highplains-crm/src/hooks/useTabParam.test.ts`

All five fail with `ReferenceError: document is not defined` when Testing Library mounts under the file's node environment:

1. `useTabParam > returns the default tab when no tab param exists in the URL`
2. `useTabParam > reads the active tab from the URL search string`
3. `useTabParam > preserves all non-tab query params when switching tabs`
4. `useTabParam > only updates the tab key and leaves every other param untouched`
5. `useTabParam > adds the tab param without disturbing existing params when no tab was present`

### `artifacts/highplains-crm/src/components/CrewAssignmentBoard.test.ts`

6. `CrewAssignmentBoard.selectReducer > shift click in a different column does not range-extend; falls back to add`
   - Expected selected IDs `["b", "y"]`, actual `["y"]`.
7. `CrewAssignmentBoard.selectReducer > prune removes ids no longer present and clears lastClicked if it was pruned`
   - Expected `lastClicked` null; actual `{ id: "b", col: "u" }`.

These record an existing assertion/behavior disagreement; this slice does not choose new crew-selection semantics.

### `artifacts/highplains-crm/src/components/contracts/rateCardUtils.test.ts`

8. `rateCardUtils > groups and counts missing`
   - Expected missing default count 23; actual 42. Existing catalog/count expectation mismatch; unchanged by this slice.

## Every new initial API failure and introducing change

All entries below are **new relative to P3-3 and fixed**. These were already present in the clean pre-edit checkout, not introduced by the display filters. Evidence is the clean full-suite JSON/log, the named introducing commit's diff, and the successful final full-suite assertions. No operational implementation was changed to make these tests pass.

### Nine visit assertions: missing extracted-handler dependency

File: `artifacts/api-server/src/routes/visits.integration.test.ts`, describe `real PostgreSQL visits API and ticket workflow`.

Each initially returned HTTP 500 instead of 200. The server log identifies **`ReferenceError: applyTicketStatus is not defined`** inside the test's `new Function` extraction of the real PATCH handler:

1. `copies service snapshots through all producers, fills nulls only and filters open summaries`
2. `ordinary ticket edits with open visits save without submitting scheduling mirrors`
3. `ticket crew/date creates, single visit moves, and multi-visit ambiguity changes nothing`
4. `planned visit is removed for incomplete pair {"crewId":null}`
5. `planned visit is removed for incomplete pair {"dueDate":null}`
6. `planned visit is removed for incomplete pair {"crewId":null,"dueDate":null}`
7. `single in-progress visit can move to a complete new crew/date pair through ticket PATCH`
8. `explicit status/current/null intent, follow-up and unrelated edits remain compatible`
9. `deadline-only and To-Do behave as before; ticket PATCH permissions are not broadened`

**Introducing change:** `bb69679e`, “Link RFP bids to contract seasons with transactional lifecycle sync and bilingual CRM flows,” replaced direct ticket writes with `applyTicketStatus` in `routes.ts`, without passing that function into this older extracted-handler harness. The pristine P3-3 visit file passes with historical validators.

**Fix:** import and inject the **real** `applyTicketStatus`. No stubbed success, changed role decision, altered payload, relaxed status assertion or production change. The final integration run exercises the actual shared function and transaction.

### One My Tickets collection assertion: incomplete harness

- File: `artifacts/api-server/src/routes/crewSupervisorDetails.test.ts`
- Test: `actual web details handler crew-supervisor access > scopes both directions of summaries on actual collection route /api/tickets/my`
- Initial result: HTTP 500, not 200. The extracted My Tickets handler now reads `storage.getTicketTypes` and calls `excludeBidsFromPersonalTickets`; neither dependency existed in this harness.
- **Introducing change:** `4fbafcc7`, “Separate Bids from Estimates across board APIs, shared rendering, navigation and dashboard summaries,” added both dependencies in `routes.ts`.
- **Fix:** supply the real scope helper and the missing catalog mock. Ownership-scoped summary assertions remain intact. An additional test proves that Project display metadata does not grant a different owner access, and that successful details still return raw `estimate_request` / raw type ID.

### One obsolete navigation assertion

- File: `artifacts/api-server/src/shared/taskWebClient.test.ts`
- Test: `office ticket-creation entry points > opens the creation route and batch-creation container to office, not field roles`
- Initial result: source assertion expected the old AO-only `/dashboard/tickets` sidebar item.
- **Introducing change:** `2c212495`, “Apply shared role-aware section rails across work pages and consolidate Tickets and Maps navigation,” replaced that item with the shared My Tickets landing and role-specific rail views.
- **Fix:** assert the current My Tickets sidebar landing and shared `mine` visibility, **plus** the AO-only All Tickets rail view. The existing AO-only creation route and selection/batch-delete safeguards remain asserted. This updates the superseded navigation structure without broadening permissions.

### Three load failures, plus one initially hidden assertion

Files:

- `artifacts/api-server/src/routes/contractCenter.test.ts`
- `artifacts/api-server/src/routes/contractCenterCopy.test.ts`
- `artifacts/api-server/src/routes/contractCenterCopyStatus.test.ts`

All initially fail **before test collection**: `No "pool" export is defined on the "../db" mock`, at `new PgStorage`, reached via `ticketStatusChange.ts`.

**Introducing change:** `bb69679e` introduced the import chain `contractCenter → contractCenterLifecycle → rfpContracts → ticketStatusChange → storage`. These existing rate-card/copy tests mock their database and never require the unrelated lifecycle storage singleton.

**Fix:** isolate the unrelated `storage` singleton in these three DB-mocked route tests. Their real route, copy logic, DB transaction mocks and all original safety assertions continue running. The historical P3-3 versions of all three files pass.

Once collection was restored, one additional stale assertion became visible:

- File: `artifacts/api-server/src/routes/contractCenterCopy.test.ts`
- Test: `legacy copy endpoint safety > executes a Both plan with every source link, landscape-only billing and earliest document metadata (mock DB only)`
- Result before its fix: expected `agreement.line === "both"`, actual undefined.
- **Introducing change:** `ba8faaf7`, “Implement seasonal contract-changing renewals with exact pricing, multi-year lifecycle and import-safe derived membership,” deliberately strips the legacy grouping line from the standing agreement in `contractCenterCopyExecution.ts`. The line belongs to the season.
- **Fix:** assert the agreement has **no** line and the season has `line: "both"`, retaining annual price, billing type, source-link and earliest-document assertions. This corrects ownership expectations rather than removing coverage.

## Display filtering and rendered interaction evidence

Final focused CRM run: **74 passed, 0 failed, 0 skipped; four passed files**:

| File | Passed tests |
| --- | ---: |
| `src/pages/DisplayTypeFilters.rendered.test.tsx` | 8 |
| `src/pages/SchedulingPage.rendered.test.tsx` | 33 |
| `src/pages/BillingHandoff.rendered.test.tsx` | 13 |
| `src/components/TicketDisplayIdentity.rendered.test.tsx` | 20 |

- The new Tickets and My Tickets tests click the **actual pill controls**. Project includes genuine Projects and all five projected status keys; Estimate includes only preapproval/unknown/missing-status estimates. Renamed seeded types work by key; custom and unkeyed rows called “Project,” and unkeyed rows called “Estimate Request,” remain separately selectable. Status labels deliberately say “Scheduled” even for unknown/missing keys, proving labels cannot invent approval.
- Multi-select, toggle-to-empty reset and combined search/type changes assert actual ticket inclusion/exclusion. Tickets' independent Show billing items control is enabled when testing all five approved statuses; this does not change the existing billing visibility rule.
- Both actual By Type boards retain approved estimates in their raw Estimate column, even when the Project pill selects them. Card workflow bubbles remain sourced from estimate statuses, never genuine Project/custom status rows.
- The Scheduling test changes the **actual native selector**, combines service/search/type filters, resets them and switches both Needs scheduling and Slipped. Options are deduplicated across both populations, using the same display metadata as cards. Custom keyed and unkeyed “Project” options remain distinct from seeded `project`.
- Scheduling keeps the original queue objects and sends exactly the raw ticket ID for POST and existing visit ID for slipped PATCH. The test checks payload inclusion/exclusion and raw records, not only colors or badge text.
- Queue contracts expose type key/name, not catalog type ID. Unkeyed options therefore use their available raw names in a namespaced value; no editable name is treated as a seeded key. Multiple unkeyed rows with the *same* raw name cannot be distinguished by the existing contract. No new fields or generated contract changes were introduced.
- Existing light/dark identity, assignment, workflow, role, lineage, server display parity, queue scope and visit integration cases remain in the full suites.

Only the three requested filters gained display semantics. The copied raw ID in `resolveDisplayTicketType` is never used as the projected filter identity. No board regrouping, workflow/permission change, raw-ID/key rewrite, scheduling mutation change, mobile change, schema, migration or generated API edit occurred.

## Reproducible commands

Run from the repository root, with the existing development test environment. Do not point integration tests at production.

```sh
mkdir -p generated-artifacts/display-filter-audit
git rev-parse HEAD
node --version
pnpm --version

# Before editing, use before-api/before-crm filenames; final commands:
TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  --reporter=default --reporter=json \
  --outputFile=../../generated-artifacts/display-filter-audit/final-api.json \
  > generated-artifacts/display-filter-audit/final-api.log 2>&1

TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run \
  --config vitest.config.ts --reporter=default --reporter=json \
  --outputFile=../../generated-artifacts/display-filter-audit/final-crm.json \
  > generated-artifacts/display-filter-audit/final-crm.log 2>&1

TZ=UTC pnpm --filter @workspace/highplains-crm exec vitest run \
  --config vitest.config.ts \
  src/pages/DisplayTypeFilters.rendered.test.tsx \
  src/pages/SchedulingPage.rendered.test.tsx \
  src/pages/BillingHandoff.rendered.test.tsx \
  src/components/TicketDisplayIdentity.rendered.test.tsx \
  --reporter=default --reporter=json \
  --outputFile=../../generated-artifacts/display-filter-audit/focused-final-crm.json \
  > generated-artifacts/display-filter-audit/focused-final-crm.log 2>&1

# Build the compact inventory after all seven input JSON reports exist.
node scripts/src/summarize-test-audit.mjs \
  generated-artifacts/display-filter-audit docs/display-type-filter-audit.json

# Direct introducing-change evidence:
git show bb69679e -- artifacts/api-server/src/routes/routes.ts \
  artifacts/api-server/src/routes/contractCenterLifecycle.ts \
  artifacts/api-server/src/lib/rfpContracts.ts
git show 4fbafcc7 -- artifacts/api-server/src/routes/routes.ts
git show 2c212495 -- artifacts/highplains-crm/src/components/nav/navConfig.ts
git show ba8faaf7 -- artifacts/api-server/src/lib/contractCenterCopyExecution.ts
git diff --check
```

Historical focused comparison used `git archive a77f0607` extracted **outside** the workspace at `/tmp/display-filter-p3-3`, with dependency directories symlinked to the same installed versions. For API, this configuration is essential:

```js
export default {
  root: "/tmp/display-filter-p3-3/artifacts/api-server",
  resolve: { alias: {
    "@workspace/db": "/tmp/display-filter-p3-3/lib/db/src/index.ts",
    "@workspace/api-zod": "/tmp/display-filter-p3-3/lib/api-zod/src/index.ts",
  } },
  test: { environment: "node" },
};
```

Save that configuration as `generated-artifacts/display-filter-audit/historical-api.config.mjs`, then:

```sh
TZ=UTC pnpm --filter @workspace/api-server exec vitest run \
  --config ../../generated-artifacts/display-filter-audit/historical-api.config.mjs \
  src/routes/mailboxAccounts.oauthReconnect.test.ts src/lib/plantEnrichment.test.ts \
  src/routes/visits.integration.test.ts src/shared/taskWebClient.test.ts \
  src/routes/contractCenter.test.ts src/routes/contractCenterCopy.test.ts \
  src/routes/contractCenterCopyStatus.test.ts \
  --reporter=default --reporter=json \
  --outputFile="$PWD/generated-artifacts/display-filter-audit/p3-3-corrected-api.json"

# From the historical CRM directory, using its own config:
TZ=UTC ./node_modules/.bin/vitest run --config vitest.config.ts \
  src/hooks/useTabParam.test.ts src/components/CrewAssignmentBoard.test.ts \
  src/components/contracts/rateCardUtils.test.ts \
  --reporter=default --reporter=json \
  --outputFile=/home/runner/workspace/generated-artifacts/display-filter-audit/p3-3-focused-crm.json
```

The corrected historical API run is **222 pass / 7 fail / 0 skip**, seven files (five passed, two failed). Historical CRM is **12 pass / 8 fail / 0 skip**, three failed files. These are focused provenance checks, **not fresh historical full-suite counts**; the historical full-suite baseline is the P3-3 release report.

## Environment limits, warnings and flakes

- An initial historical API attempt omitted the workspace-library aliases. It produced 15 failures because historical visit output was validated by the live checkout's newer display contracts. That comparison is **invalid and discarded as regression evidence**, retained as `p3-3-focused-api.*`; the corrected run above supersedes it. It is not a current app regression.
- The earlier P3-3 transient 5-second reorder timeout was not observed in either fresh complete suite, the corrected historical comparison or the final integration run. It is not counted as an eighth baseline failure.
- The 69 API skips are existing guards in ten Contract Center/RFP development suites (`CC_DEV_VERIFY`, `CC_CREATE_VERIFY`, `CC_FREEZE_VERIFY`, `CONTRACT_AUDIT_DB_TEST`, `CONTRACT_RENEWAL_DB_TEST`, `RFP_CONTRACT_DB_TEST`). Per-file counts are in the JSON inventory. None were added here.
- Existing PostgreSQL SSL-mode and PostCSS `from` advisories remain. They did not fail the display tests.
- CRM preview restarted successfully. The initial unsigned screenshot showed a working sign-in page but API 502s because the API workflow was stopped; starting its existing managed workflow restored the API (`GET /api/auth/me` returns expected unsigned 401). No signed-in browser acceptance or real-account fixture implementation is claimed. Rendered tests verify the changed authenticated controls.
- No full typecheck, production verification or new claim about the pre-existing typecheck backlog is made. This report audits the requested full **test** suites and the display/raw regression boundary.
