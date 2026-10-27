# Contract Center dashboard renewals verification

Verification date: **2026-10-27** (Colorado calendar day).

## Scope and source

Read the complete CC2-11 attachment and updated Section Action Lists Ground Rules.
The referenced `claude/section-action-lists-design.md` was unavailable and was not
used or reconstructed. CC2-11 §3 supersedes the retired queue instructions.
No queue, schema, migration, production write, publication, historical-record edit,
role change, navigation change, or board redesign was part of this work.

The regular contracts-list route and dashboard renewal loaders share
`loadContractList` in Contract Center persistence. It performs three company-scoped
reads, plus one billing read only for opted-in parent coverage; query count does not
grow with agreement count. Search, current/pending season-line filters, customer
filtering, direct-parent coverage, location counts, recovered payments and regular
list response fields are preserved. The bid-linked route retains its existing
`loadLinkedContracts` short circuit and distinct response shape.

`loadRenewalsDue` uses the shared summaries and current-season display selection.
It retains draft/sent rows and signed calendar-day differences, while
`contractsSection` excludes pending renewals from unstarted action counts.
The section's internal `rows` field supplies preview line information from the
same read; `mostOverdue` itself has only the four specified fields.

Pulse sends the shared rows directly through `res.json`, without an outgoing
generated-Zod parse. Neither dashboard endpoint is declared in the existing
OpenAPI spec; there was no generated schema to update or regenerate.
Serialized-response tests exercise agreement IDs, line, calendar end date,
daysLeft, term ID, season label and sent-renewal status at the HTTP boundary.

The rail keeps its three-row limit, urgency classes, layout and test-ID prefixes.
Links now target agreement detail. Season-date formatting cannot project midnight
UTC into the previous browser-local day. Returning to Dashboard refetches pulse
instead of retaining the global infinite-stale cache; section summaries already
refetch on mount and poll.

## Caller inventory and deletions

The fresh audit found exactly these old renewal consumers/surfaces:

| Surface | Outcome |
| --- | --- |
| Contracts section summary | Migrated to `contractsSection` |
| `/api/dashboard/pulse` handler | Migrated to `loadRenewalsDue` |
| `/api/dashboard/upcoming-renewals` | Deleted; no client calls it |
| Storage interface and implementation | Deleted |
| Exported legacy renewal type | Deleted; no remaining references |
| Dashboard section/pulse test mocks | Replaced with shared-loader fixtures |

Dashboard consumes pulse through `PulseRail`'s updated client type.
`rg getUpcomingRenewals artifacts/` returns **no matches**.
Revenue, reporting, active-contract statistics, snowBook, scheduling, mobile and
other unrelated legacy consumers deliberately remain unchanged.

## Automated checks

- Baseline focused API suites: **118 tests passed** across 5 files.
- Final focused API suites: **163 tests passed** across 7 files:
  dashboard sections/pulse, Contract Center lifecycle, renewal loader/summary,
  board summary, renewal import/export and Colorado calendar-day checks.
- Focused CRM suites: **35 tests passed** across 4 files:
  pulse rail, dashboard section router, Contract Center rendering and board logic.
- Fixtures cover 45/30/20/0/-10 days, pending draft/sent renewals, signed/active/
  renewed replacements, realistic multi-year predecessors, mixed most-overdue
  ordering, empty data, tenant isolation, bounded reads, direct parents/payments,
  bid short-circuit compatibility, Colorado midnight and both DST boundaries.
- Rail rendering tests confirm agreement destinations, all three line labels,
  dates, negative/30-day urgency, three-row limit, empty state and keyboard focus.
- Root `pnpm run typecheck`: **fails on inherited API diagnostics**.
  Baseline: **732**; final: **731**. Normalizing only line/column positions
  yields **zero new diagnostics**; deleting the obsolete endpoint removes one
  existing TS7030 diagnostic.
- Separate CRM typecheck: **220 diagnostics**, identical count to an in-memory
  baseline using the pre-change rail source and excluding the newly added rail
  test. No diagnostics point to changed CRM files or the new test.
- `git diff --check`: passed.
- Existing optional RFP database suite was inspected but not enabled; its
  23 tests are skipped by default. This is not claimed as a passing DB suite.

## Development database evidence

Existing data was read in a **repeatable-read, read-only database transaction**.
Actual client `placements` and `boardColumns` were compared against actionable
renewal rows, section counts and overdue counts, including Landscape/Snow coverage.

| Development company | Agreements | Raw renewals | Board up for renewal | Dashboard action count |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0 | 0 | 0 | 0 |
| 2 | 0 | 0 | 0 | 0 |

Both pass, but this is **empty-company parity only**. The historical October 26
example of 18 populated renewals is not available in this development database
and was not hardcoded or claimed as current evidence.

A separate disposable-company transaction verified the real persistence path:

1. Signed fixture season ending in 20 days: dashboard count **1**, renewal card **1**.
2. Insert a draft successor: dashboard count **0**, raw renewal rows **1** with
   draft status, renewal column **0**, drafted column **1**.
3. Roll back the entire transaction, including company, customer and all terms.

No real signed/historical record was changed. The verification harness and logs
are retained under ignored `generated-artifacts/` and excluded from deployment.

## Preview and limitations

Both relevant workflows rebuilt/restarted successfully. Rendered tests have no
new console errors. Keyboard focus uses the rail's existing visible focus ring.
The unauthenticated preview renders sign-in; its auth request returns the expected
401 and the existing password-autocomplete notice remains. It cannot verify the
changed signed-in dashboard visually. No populated signed-in browser run or
production-data check is claimed.
