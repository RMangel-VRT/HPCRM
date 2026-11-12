# EA2 — Estimates Action Center implementation and verification

## Delivered scope

- Replaced only `/dashboard/estimates` with the approved action-list layout,
  retaining the Estimates rail and All estimates selection. There is no stage
  board or view toggle on this page. Shared OpportunityBoard and Bids remain
  unchanged.
- Header, action/urgent/sent-subtotal summary, New Estimate Request link, five
  ordered filter cards, default Urgent, all five counted scopes, search,
  present-assignee/Unassigned filters, urgency/bucket/age sorting, quiet won rows,
  owner links and both empty states are connected to the real board endpoint.
- The client consumes server nextAction. It does not reimplement urgency or
  bucket classification. Recently won covers today and the preceding 29 Colorado
  dates, excludes future acceptance dates, and sorts newest acceptance first.
- Send, accept and decline reuse the existing lifecycle dialogs and current
  `versionId`. Builder and list use `runEstimateLifecycle` for HTTP lifecycle
  writes, shared known-error/price-confirmation handling, advancement, moved and
  lifecycle toasts, advisory activation, and affected cache invalidation.
- The builder retains its existing viewed-version gates, synchronous operation
  lock, newest-response installation and draft-conflict navigation. The list
  captures company/session identity, locks concurrent actions, drops stale
  results, and refuses an open lifecycle dialog if polling replaced that row's
  version/status. It never silently retargets a dialog.
- Build uses the existing ticket/customer/title creation flow, including
  duplicate-estimate recovery. Assign/Reassign use company team members and the
  existing ticket PATCH. PDF preview uses the existing scoped inline blob dialog.
- Legacy estimating rows without a draft retain the server's `finish` bucket
  and use Build estimate (or Assign if unassigned) to recover the missing draft;
  no broken Open draft link or client-side reclassification is introduced.
- Shared follow-up dialog shows customer, number, subtotal, Colorado sent day,
  validity day and previous note. It initializes an empty note and Denver +7
  date, supports +3/+7/+14 date-only picks and a date input, and saves precisely
  the typed note, including empty text, through ticket PATCH.
- Every newly introduced label/reason/detail/tooltip/empty state uses EN/ES
  keys. Stage labels on this localized surface use stable-key translations.
  User-entered customer/title/notes/assignee text remains verbatim.
- Red/amber urgency uses theme tokens; row actions use a fixed-width primary
  column and stay together when rows stack.

## Verification

EA1 gate details and contract decisions are in
`estimates-action-center-ea1.md`.

Passed checks:

```
pnpm --filter @workspace/api-server exec vitest run \
  src/services/estimateNextAction.test.ts src/services/ticketEstimates.test.ts \
  src/routes/estimatesBoard.test.ts src/services/ticketEstimates.integration.test.ts \
  src/services/estimateLifecycle.integration.test.ts src/routes/schedulingStatus.test.ts
# 6 files / 167 tests

pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/EstimatesBoardPage.rendered.test.tsx src/lib/estimateLifecycleActions.test.ts
# 2 files / 35 tests

pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts \
  src/pages/EstimateBuilder.lifecycle.rendered.test.tsx src/lib/advanceLinkedTicket.test.ts
# 2 files / 52 tests

pnpm run typecheck:libs
# passed
git diff --check
# passed
```

The page tests cover scope/count/filter behavior, red defaults, sort order,
creation, assignment/reassignment, waiting menus, scoped inline PDF requests,
send confirmation, accept/decline inputs, stale-version dialogs, stale unmount
results, follow-up saves/refreshed waiting state, accessible icon names, Spanish,
access denial and Bids columns. Shared tests additionally verify each lifecycle
effect, advisory acceptance activation, price conflicts, known errors and
company/view changes. Existing builder lifecycle tests passed after extraction.

### Existing check failures and environment warnings

- `pnpm run typecheck` remains nonzero: 212 CRM diagnostics in unchanged files,
  primarily the frontend Drizzle stub schema and existing proposal screens.
- `pnpm --filter @workspace/api-server run typecheck` remains nonzero: 695
  diagnostics in unchanged code. No diagnostics reference the changed board,
  estimate reads/lifecycle, summaries, next-action function or their tests.
- No diagnostics reference the new action-list files, shared lifecycle helper,
  modified builder or locale additions. Focused lifecycle-helper LSP diagnostics
  were also empty.
- Both managed API and web workflows restarted successfully. Vite served the
  updated app. Existing Browserslist/PostCSS warnings and unrelated QuickBooks
  fixture token-decode warnings were present; no related source was changed.
- The first documented development admin login was rejected. An isolated
  temporary company/account was provisioned for the single focused browser
  check without resetting or changing existing accounts.
- The signed-out screenshot attempt timed out; authenticated browser evidence
  is recorded below instead.

Raw test/typecheck logs are in ignored
`generated-artifacts/estimates-action-center/`.

## Scope boundaries

No schema/migrations/settings, recovery-planner changes, pricing/totals changes,
Bids/RFP changes, Dashboard tile changes, proposal redesign, production writes
or publishing. The new validity constant is the prescribed 30 days. Existing
ticket follow-up comment wording is preserved.

## Authenticated browser evidence

The single focused browser journey passed using an isolated development
company/admin and a synthetic prospect. The first documented-login attempt was
blocked; the same tester resumed after safe fixture provisioning.

- Send through the actual row dialog used `hard_copy`, the EA1 version ID and
  the existing send route. Version became sent, ticket became `proposal_sent`,
  and follow-up became November 19 from the November 12 Colorado day.
- An overdue date was set only on the disposable fixture to exercise Log
  follow-up. The real UI saved the typed note and November 15 (+3 days), and the
  board moved to Waiting.
- Waiting-row menus and the Reassign submenu were visible. The sole
  same-person reassign option was disabled.
- Accept through the actual dialog used Phone and the same version. The ticket
  became `ready_to_schedule`, both follow-up fields became null, and Recently
  won showed the Project row with the Scheduling owner link.
- Independent activation/setup was offered and dismissed with Not now. The
  prospect remained a prospect. No external email or customer activation ran.
- Desktop screenshot `zvxk2c` showed the populated Ready to send row with its
  aligned actions. `4r8y9w` showed the quiet won row. Narrow screenshot `ckwjbu`
  showed wrapped, readable controls and the won row at 390px, with document and
  scroll widths both 390. Narrow action-button grouping was confirmed by the
  row's shared flex action cell and width constraints, not by an active-row
  phone screenshot: the phone screenshot was captured after acceptance.
- No feature-specific browser-console error was observed.

The temporary fixture company/account and its records were removed after
verification. No existing account or business data was changed.
