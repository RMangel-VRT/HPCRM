# CC-ATTN verification

Date: **November 12, 2026**, Colorado calendar day.

## Scope and authoritative inputs

Implemented in the existing CRM and API Server. Read the complete CC-ATTN brief,
the supplied **With CC-ATTN** HTML reference, and the dashboard-renewals and
non-renewal predecessor verification reports. The owner's unsigned precedence
correction is authoritative: pending work covering today outranks `new_draft`;
explicit final-source decisions retain priority. College Hills and pre-service
Aspen fixtures exercise that distinction.

There are **no schema changes, migrations, backfills, production writes,
publication, historical customer corrections, mobile changes, Canvas changes,
SC2.2 changes, document-upload changes, or new background status jobs**.
All mutation verification used disposable development companies.

## Ownership and consumer audit

| Consumer | Result |
| --- | --- |
| Ordinary contracts list | Shared classifier, condition date/reason, representative season, flags, authorized action hints, applicable lines |
| Agreement detail | Same classification and document flag; existing season editability and year-one lifecycle controls retained |
| Bid-linked contract list | Existing `bidTicketId` short circuit and distinct payload retained |
| Display status | Ended `renewed` seasons without a signed successor now display expired; cancelled successors do not suppress expiry |
| Renewal eligibility | Reads the classifier's state, not a second date/eligibility rule |
| Renewal progress | Classifier-owned projection; 90-day source cohort retains resolved signed and non-renewal numerators |
| Dashboard pulse renewals | Shared list projection; no separate eligibility read |
| Dashboard Contracts section | Needs-a-decision states plus renewal-due; same read supplies rows and presentation |
| Customer contract summaries/cards/header | Shared display status, classification and PDF flag; existing commercial/field allowlist retained |
| Active customers | Existing `projectActiveCustomers` responsibility/no-contract computation reused without creating agreements |
| Board/table/detail | Server states, clearable segment filtering, unique pipeline placement, authorized actions, translated reasons and PDF chips |

Display-current, final renewal-source and lifecycle-owner selectors remain
distinct. A separate `stateTerm` summary preserves the representative season
even when it is a middle unsigned year, not current/latest or the year-one owner.
Signing hints resolve proven multi-year sets using the same exact timestamp,
chain and positive history-note evidence as the existing lifecycle operation.
Drafts cannot skip Sent; later years cannot acquire independent status controls.

`RENEWAL_WINDOW_DAYS` has one definition, **90**. The recently-signed filter
independently retains **60 calendar days**.

## Accounting, flags and API boundaries

`GET /api/contract-center/attention` uses the existing admin/office authorization,
active-company guard and private/no-store response. It returns all ten state
counts, total, per-line totals/action counts, grouped action items and separate
flag totals. Both agreements count once on each applicable line.

Ordinary list/attention population uses four company-scoped reads: customers,
agreements, seasons (including set evidence), and document metadata. Referenced
non-renewal actors add one bounded read when needed; opted-in parent billing
adds one bounded read. No per-agreement attention query or second dashboard
eligibility query was introduced. Active-customer counts reuse that population.

The server reconciles against company agreements, logs missing classifications
and supplies an unclassified fallback. Orphaned customers and malformed histories
remain visible with critical reasons rather than disappearing. Unknown line
membership is surfaced on both line views; empty histories are classified by
the specified no-signed/no-pending closed rule.

PDF flags use explicit direct attachments/`coversThroughTermId` coverage, not
inferred renewal-set coverage. List, detail and commercial customer summaries
share the document resolver. A flag never replaces a contract's state.

The actual CRM boundaries are direct `apiRequest`/TanStack Query types and
Express `res.json`, not generated OpenAPI response parsing. These endpoints
have no generated contract to regenerate. Shared wire types are driver-free;
the existing bid response and field-reader projection remain separate.

## Automated verification

Generated logs are retained under ignored `generated-artifacts/cc-attn/`.

| Check | Result |
| --- | --- |
| Focused API final, 10 files | **584 passed**; 3 additional dashboard regressions passed in the subsequent 24-test targeted run |
| Actual database integration, separate disposable company | **3 passed** |
| Focused CRM final, 9 files | **117 passed**; added Lost-filter and real-cache regressions passed in the subsequent 34-test targeted run |
| Final renewal/non-renewal/cache follow-up, 3 files | **20 passed**, including the renewal dialog suite |
| Shared library TypeScript build | Passed |
| API leaf TypeScript check | Existing failure: 695 diagnostics; none in changed API implementation/new test files |
| CRM leaf TypeScript check | Existing failure: 213 diagnostics, same normalized signatures as unchanged source |
| Whitespace check | Passed after removing two locale trailing spaces |

### Commands

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/contractState.test.ts src/lib/contractAccounting.test.ts \
  src/lib/contractCenterService.test.ts src/lib/contractCenterBoard.test.ts \
  src/lib/contractCenterRenewals.test.ts src/lib/customerContractSummary.test.ts \
  src/routes/contractCenterLifecycle.test.ts src/routes/dashboardQueue.test.ts \
  src/routes/dashboardSections.test.ts src/lib/companyDay.test.ts \
  --maxWorkers=1 --no-file-parallelism

CC_ATTN_DB_TEST=1 pnpm --filter @workspace/api-server exec vitest run \
  src/lib/contractAttention.integration.test.ts --maxWorkers=1 --no-file-parallelism

pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/components/contracts/boardLogic.season.test.ts \
  src/pages/ContractCenter.board.test.tsx src/pages/ContractCenter.rendered.test.tsx \
  src/pages/CustomerContracts.rendered.test.tsx src/pages/ActiveCustomers.rendered.test.tsx \
  src/components/customer/header/CustomerHeader.cp3.test.tsx \
  src/components/contracts/NonRenewal.rendered.test.tsx \
  src/components/contracts/AttentionWidgets.cache.test.ts \
  src/components/dashboard/SectionRouter.rendered.test.tsx \
  src/components/customer/dashboard/dashboardModel.test.ts

pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/highplains-crm run typecheck
git diff --check
```

Coverage includes the 350-case status/date/successor/decision matrix; all states;
inclusive end/90-day boundaries; Colorado DST; signed future years; realistic
renewed predecessors; cancelled/lost successors; empty and deliberately
impossible histories; all named brief cases; explicit PDF coverage; middle-year
representatives; retained resolved progress; serialized mixed-company counts;
tenant/role denial; bounded reads; reconciliation recovery; and actual
disposable-company sign/non-renewal mutations.

Rendered coverage includes unique three-column placement, Both membership,
segment totals/dimming/filter clearing, line badges, no-contract tab counts,
recent-signed/Lost/PDF filters, permitted signing with confirmation, state/PDF
detail header, customer chips in English/Spanish and dashboard display.
An attention-request failure shows an explicit retry/error, not a fabricated
accounted-for success from a partial list.

### Baselines and inherited failures

An unchanged-source archive ran the original four focused API suites:
**137 passed, 3 failed**. Two failures omitted the already-existing
`notRenewing: false` progress field; the third mock mutated its own absent
`service_calendar` table on a dry-run read. These focused fixtures were corrected.
Changed 60-day and retired-board expectations were updated to the approved
90-day/state-driven behavior, not suppressed.

The original detail-header rendering harness failed 10 tests because its
query-key mock no longer matched the identity-scoped detail request. Its test
harness now matches the existing identity prefix, and the new header regression
passes.

The wider contract-center script still has **12 inherited panel-save failures**
in `ContractBilling.rendered.test.tsx` and `ContractWidgets.rendered.test.tsx`.
A separate unchanged-source run of those exact two files reproduced **12 failed,
27 passed**. They concern extra detail GETs/mock call counts, not state
classification; this task did not broaden into panel-save test cleanup.

The archived API type check reported 711 diagnostics, including 16 archive-only
root-directory diagnostics. After path normalization, the current 695 file/code
signatures introduce none beyond that baseline. This is **not a clean full
typecheck**. CRM has 213 diagnostics before and after, including existing
ScopeEditor test props and the unsupported SeasonDocuments button variant.

## Development data and reconciliation

The pre-fixture development read covered **257 existing companies**. All
company totals reconciled. Combined agreements: **1**.

| State | Existing development agreements |
| --- | ---: |
| new_draft | 0 |
| closed | 0 |
| closed_recently | 0 |
| serving_not_renewing | 0 |
| working_unsigned | 0 |
| renewal_due | 0 |
| renewal_in_progress | 0 |
| good | 1 |
| ended_no_decision | 0 |
| unclassified | 0 |
| **Total / accounted for** | **1 / 1** |

Separate flags: missing document **1**; active customers without a contract
**119**. Most existing development companies are empty/pre-existing test
populations; these numbers are not representative production evidence.
The ignored `development-counts.json` records anonymized per-company counts,
not customer names.

A new disposable fixture contained **9 agreements**, one in each supported
state other than unclassified, plus **1 active customer without a contract**.
Landscape reconciled **9/9**; Snow reconciled **8/8** because the due agreement
was Landscape-only. Before mutations, dashboard action count was **3**:
ended-no-decision + working-unsigned + renewal-due. Drafted/new work was not
added to that dashboard count. Every fixture list/detail/customer projection
agreed with the shared state. Signing and non-renewal changed the resulting
states without changing lifecycle permissions.

Impossible/orphaned conditions were tested explicitly at the pure/HTTP
boundaries, rather than corrupting real customer histories.

## Production evidence

Read-only production counts were attempted through the authorized production
database interface. Access was refused with **“Production database access
requires an authenticated user.”** Consequently **production counts and
production reconciliation are unavailable**, not passing evidence. No alternate
credential, production write, direct connection workaround or publishing was
attempted.

## Browser and workflow evidence

Both managed workflows rebuilt/restarted and served successfully. Existing
synthetic QuickBooks-token decode warnings and frontend Browserslist/PostCSS
warnings are unrelated to this change; they are not reported as clean logs.

The single authenticated disposable-company journey verified:

- Landscape 9/9, Snow 8/8, action badges 5/4; exactly three columns and no duplicate cards.
- Keyboard Enter on the legend, nonmatching-column dimming, two decision rows,
  clearable Showing chip, all nine rows restored on clear.
- Independent/OR recent-signed, Lost and PDF chips; View all lost selected Closed
  and cleared the chips, retaining two Lost rows.
- Active customers' existing one-customer no-contract view.
- Renewal dialog opened/cancelled without draft creation; non-renewal dialog
  opened/cancelled without recording a decision. Its controls were still loading
  when cancelled, so completed browser non-renewal submission is **not** claimed.
  Actual non-renewal writes were verified in the disposable database integration
  and existing rendered non-renewal suite.
- Mark signed confirmation and authorized write; list/attention moved unsigned
  work to renewal-due, with the new missing-PDF flag.
- Populated light/dark themes, expanded/collapsed sidebar, and responsive layout.

The initial browser pass **caught two real issues**, not counted as passes:
inactive pre-sign detail could render stale state on SPA return, and the third
column clipped at 900px. Inactive detail caches are now evicted before active
reader invalidation; the same helper is used by signing, renewal and non-renewal.
A real QueryClient regression verifies inactive-detail eviction and active-detail
refetch. The pipeline uses an available-width auto-fit grid with zero minimum
column overflow.

A targeted continuation with the **same tester**, only over those fixes, passed:
warm College Hills detail, return, sign once, and immediately revisit without
reload showed Renewal due / Active / Ends in 30 days / No contract PDF. At
900×720, all three columns and all five cards stayed within the viewport;
Drafted / sent wrapped below and was reachable by scrolling.

Evidence screenshot identifiers:

| Evidence | Screenshot |
| --- | --- |
| Initial populated Landscape / Snow | `wm0ahc`, `572vhz` |
| Keyboard-selected decision segment | `hhxrn3` |
| OR chips / Closed handoff / no-contract customer | `xkbzl5`, `6olguu`, `4zj74n` |
| Light expanded / collapsed | `0h81nc`, `dklm1b` |
| Dark expanded / collapsed | `0cldom`, `hj86xp` |
| Correct immediate post-sign detail, no reload | `xj2hei` |
| Responsive first columns / wrapped third column | `xb7jc0`, `ys36da` |

The unauthenticated screenshot helper timed out; the authenticated browser
screenshots above supply the actual changed-screen evidence. Direct checks of
API health and the Vite-transformed Contract Center module returned **200**;
signed-out attention correctly returned **401**.

## Cleanup and final checks

The disposable database integration removed its company/user in `finally`.
After the targeted browser continuation, the browser fixture's company, user and
cascaded records were removed using the existing development-only cleanup
helper; the cleanup command passed and its local credential file was deleted.
The only reset was that disposable unsigned season between the original failed
check and the targeted cache regression. No real customer's status was changed.

The temporary unchanged-source archive was removed after baseline comparison;
ignored evidence logs remain. Final leaf type checks retained **695 API / 213
CRM** existing diagnostic signatures, with **no new normalized file/code
signatures**. Final action/cache regressions passed, and `git diff --check` passed.
The report distinguishes those focused passes from the inherited full-check
failures and missing production access; none is hidden as a success.
