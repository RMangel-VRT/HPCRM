# Estimates / Bids split verification — October 27, 2026

## Delivered scope

- Estimates owns only `estimate_request`, with five stages: new, estimating,
  proposal, sent, decision. Its endpoint ignores all `type` query inputs.
- Bids owns only `rfp_request`, with six stages: new, reviewing, walk,
  proposal, submitted, decision. Waiting-for-information joins reviewing;
  awaiting-response joins submitted.
- Both use one bulk loader and one configurable board/card renderer.
- Business navigation, protected routing, and dashboard ordering place Bids
  immediately after Estimates, with matching admin/office visibility.
- Campaigns remains the explicit ninth reserved dashboard cell, without a count
  or action. Role-hidden cells retain their original positions.
- The My Tickets summary exclusion is unchanged. The separate personal-ticket
  API now also excludes RFP identity, so assigned RFPs cannot leak into that
  destination. General ticket viewing and creation are unchanged.
- No schema, lifecycle, ticket identity catalog, Decision Received, conversion,
  contract synchronization, Campaigns activation, or mobile redesign changes.

## Fresh typecheck baseline and comparison

The root `pnpm run typecheck` was captured **before implementation**, not inferred
from the older ground-rules counts. It exited 2, first reporting 221 CRM
diagnostics. The recursive command stops on the first failed package; its
interleaved output is not a complete inventory of all package failures.

The same root command was rerun after implementation and still exits 2, with
pre-existing API failures. This is **not** a clean typecheck pass.

To make a reliable no-new-diagnostics comparison despite the recursive early exit,
TypeScript was additionally run against both leaf-package configurations with:

1. The original tracked source supplied to the compiler from Git, and new source
   files excluded, to reconstruct the baseline package diagnostics.
2. The current source, using the same absolute configuration paths and options.

Comparison keys are file, diagnostic code, and offending source line. Absolute
line numbers can move after imports are added; TypeScript's printed structural
type-property ordering can also change without changing the underlying error.
Full messages and source locations are retained in the JSON evidence.

| Package | Original source | Final source | New diagnostics |
| --- | ---: | ---: | ---: |
| API Server | 735 | 735 | 0 |
| CRM | 221 | 221 | 0 |

Evidence is in the ignored `generated-artifacts/bids-split/` directory:
`typecheck-before.log`, `typecheck-before.exit`, `typecheck-after.log`,
`typecheck-after.exit`, `typecheck-comparison.json`, and per-package
`*-before-diagnostics.json` / `*-after-diagnostics.json`.
The comparison procedure is retained there as `compare-typechecks.mjs`.

## Automated checks

### API

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/routes/estimatesBoard.test.ts \
  src/routes/dashboardSections.test.ts \
  src/routes/dashboardSections.integration.test.ts \
  src/lib/personalTicketScope.test.ts
```

**104 passed.** Covers exact stage tables and every mapped status; renamed stable
identities; tenant/type/status SQL restrictions; null relationships; empty
companies; deterministic sorting; latest current-status history and re-entry;
Colorado midnight/DST behavior; board/summary population parity; personal RFP
exclusion; authentication, role, active-company, and loader-error handling;
scalar, repeated, empty, invalid, and nested legacy `type` query inputs.

Both boards return all 1 and 1,001 populated tickets using **six queries** in each
case, below the seven-query bound. Splitting removes one metadata lookup; no
redundant seventh query was added.

The later integration/personal-scope-only rerun passed all 8 tests after adding
real-database personal-list assertions. Logs: `api-targeted-tests.log` and
`api-scope-final-tests.log`.

### Client

```sh
pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/EstimatesBoardPage.rendered.test.tsx \
  src/pages/BidsBoardPage.rendered.test.tsx \
  src/pages/HardscapeCatalog.rendered.test.tsx \
  src/components/nav/navConfig.test.ts \
  src/components/dashboard/SectionRouter.rendered.test.tsx
```

**98 passed** in the initial coherent run. After adding the dedicated Bids active
navigation case, the navigation suite independently passed **53 tests**. Other
client source/tests were unchanged after their passing run.

Covers independent API URLs and terminology, five/six stages, English/Spanish,
card links and stale-age warnings, loading/empty/error/retry recovery, legacy
filter removal, catalog rail destinations, role matrix, dashboard counts,
fixed ordering, hidden slots, and the ninth reserved Campaigns slot.
Logs: `client-tests.log`, `nav-final-tests.log`.

### Broader-suite limitation

An initial invocation through the package's `test` script passed arguments after
`--`; Vitest consequently ran the broader API suite instead of only the intended
files. It reported **14 failures across 5 unrelated suites**, with 1,594 passing
and 46 skipped tests. The failures were in contract-copy, contract-schema,
mailbox OAuth reconnect, task web-client source assertions, and plant-enrichment
tests. They were not changed or treated as passing by this slice. The focused
commands above use `exec vitest run` to select the intended files explicitly.
The broader output is preserved in `api-tests.log`.

## Manual development-data comparison

The documented demo account was absent in this task fork. Verification used a
disposable lowercase-email admin account attached to the existing development
company, without resetting existing credentials or creating business tickets.
Both existing development companies had zero tickets. The populated PostgreSQL
integration fixtures above therefore supply the nonempty isolation/re-entry
coverage that the browser's real-data population could not provide.

| Section | Dashboard total | Board population | Dashboard overdue | Board age >= 7 |
| --- | ---: | ---: | ---: | ---: |
| Estimates | 0 | 0 | 0 | 0 |
| Bids | 0 | 0 | 0 | 0 |

The values were compared from authenticated development responses and visible
dashboard tiles. The legacy RFP-filter URL still returned the five-stage Estimates
response. The ninth Campaigns cell had no count, link, or action. Both board
endpoints returned 401 without a session.

The disposable session, membership, and user were removed; cleanup confirmed no
remaining fixture records and no changes to the company's zero-ticket population.
No production data was read or modified.

## Browser and workflow observations

- Both boards rendered at 1440×900 in English/light and Spanish/dark.
- At 390×844, both rendered in English/light and Spanish/dark; Bids also rendered
  in Spanish/light. The final Bids dark-mode check explicitly confirmed
  `html.dark`, Spanish labels, and all six stages after navigation. Board scrolling stayed internal:
  Estimates 342px client / 1,464px scroll width, Bids 390px / 1,760px.
  Document width remained 390px.
- The final Bids Spanish/dark phone screenshot is partially obscured by the
  existing mobile sidebar dialog. Its drawer could not be dismissed through
  Escape, the toggle, or its hidden close control during that observation.
  The DOM/measurements verified the underlying board state, but that particular
  screenshot is not unobstructed visual proof of the whole board. The earlier
  English/light Bids phone screenshot is unobstructed. No sidebar behavior was
  changed in this slice.
- Navigation keyboard focus displayed a visible two-pixel focus ring. Real data
  had no cards, so browser ticket-link navigation and populated-card focus were
  unavailable; rendered tests cover card hrefs and warning markup.
- One phone Bids request returned a transient 502; the translated error/retry
  state appeared and retry recovered to the six-stage board. Subsequent requests
  returned 200. The running API logs contain no corresponding board loader
  exception. Two console resource 404s had no URL in the browser observations.
  No uncaught JavaScript exception was observed.
- Existing English/light preferences were restored. Browser screenshots were
  captured as task observations; the static screenshot tool separately confirmed
  that signed-out direct Bids navigation renders the sign-in page.
- API and CRM workflows were restarted after their code batches and are serving.
  Existing PostgreSQL SSL-mode and frontend PostCSS warnings were retained, not
  represented as new application exceptions.

## Subsequent scope

The already-planned Estimate-to-Project display and Won—in-flight slices follow
this split and must be reread against estimate-only ownership. Separate contract
lifecycle work remains deferred. No overlapping follow-up tasks were proposed.
