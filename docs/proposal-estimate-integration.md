# Proposals using CRM estimates

## Ownership and compatibility

`proposals.estimate_id` is a live relationship. Draft details use the estimate's
current version and authoritative subtotal. `proposal_versions.estimate_version_id`
identifies the exact version passed to `renderEstimatePdf` for that stored PDF.
The compatibility estimate number is mirrored on linking and ticket auto-linking;
prices and totals are never copied into proposal fields.

Migration `0064_proposal_estimates.sql` is additive and guarded. Both foreign keys
use `ON DELETE SET NULL`; the company/estimate index is additive. Existing
migration filenames were retained, including the two existing 0063 files. No
historical proposal is linked or regenerated. The migration was applied only to
the development database, and its rerun/deletion behavior is regression-tested.

Unlinked proposals retain the uploaded QuickBooks PDF workflow. Linked proposals
keep uploaded files available for viewing/deletion, but those files do not
participate in validation or rendering. Generated pages occupy the existing
estimate merge slot, after Visual Scope and before plants/palette/photos.
Blank-page filtering applies only to uploaded PDFs. Other drawing code is
unchanged; legacy raster fingerprints remain unchanged.

## Finalization and failure ordering

1. Authorize the role and active company; load the company-scoped proposal.
2. Select the linked current estimate version once. Reject void or ineligible
   states. An optional `expectedEstimateVersionId` prevents a stale editor or
   zero-price confirmation from silently selecting a replacement version.
3. A draft requires a valid send method. The lifecycle service validates
   zero-priced lines and commits its own transaction, freezing totals.
4. Render that **explicit version ID**, not a new read of the current pointer.
5. Save PDF/exhibit bytes to an attempt-unique private path, then create the
   immutable proposal-version record with that same estimate version ID.
6. Return existing version fields plus `estimateTransition`. Ticket advancement
   happens afterward on the client and cannot roll back proposal finalization.

A PDF, exhibit, storage or proposal-record failure after step 3 **never undoes
the send**. The linked failure response has `error: "PROPOSAL_FINALIZE_FAILED"`
and transition metadata; the editor explains that the estimate remains locked.
Retry uses a sent/accepted current version without another send. A concurrent
revision is not substituted midway through an attempt. A version-number conflict
retries record creation with a new unique object path: it cannot overwrite bytes
already associated with an earlier successful request.

`estimateTransition` is null for unlinked proposals; otherwise it contains
`sent`, `estimateId`, `versionId`, `method`, and `sentOn` (the committed send instant
as ISO text). `sent` means this request performed the send, not merely that the
version has previously been sent.

The Estimate section reads full lifecycle history and mounts the existing
state-derived ticket recovery notice. Recovery survives reload, a failed PDF,
and a failed ticket field update, without a persisted failure flag. It remains
forward-only. Client keys/transient editor state include company, user and role;
estimate requests carry the initiating company expectation and stale create
responses cannot link or navigate in a new scope.

## Verification

Logs are retained under ignored `generated-artifacts/estimate-proposals/`.
No production writes or publication were performed.

- Fresh declaration baseline: `pnpm exec tsc --build --force` passed before
  implementation; a final forced declaration build also passed.
- Root `pnpm run typecheck`: baseline **733** existing diagnostics; final **730**.
  Comparison after removing shifted line numbers has **no increased
  file/error-code counts**. Pre-existing API/frontend schema-stub/type errors
  still prevent a globally green root check. No new service/component/contract
  type errors remain.
- Missing installed renderer dependencies were present in the committed
  lockfile. `pnpm install --frozen-lockfile` restored them without changing
  package manifests or lockfile.
- Focused API regression run: **65 passed** across proposal integration,
  proposal PDF/raster decorations, estimate model, lifecycle, and estimate PDF
  tests. Includes guarded migration/FK deletion, tenant/customer/ticket/void
  linking, number mirror/auto-link, authoritative reads, method/zero-price
  handling, accepted/declined/void states, partial failures/retry, stale version
  rejection, concurrent sends/finalization and unchanged legacy finalization.
- Focused rendered-client/ticket routine run: **28 passed**. Covers linked and
  ticket-suggestion states, customer picker/create/link/open/unlink, current
  version preview/frozen total, upload collapse, required method, zero-price
  confirmed retry, committed-send failure copy, ticket advancement, and dropping
  late creates after unmount.
- Full API suite: baseline **18 failed files / 18 failed tests**, including
  12 renderer-import failures from the missing installed package. Final full
  run: **7 failed files / 18 failed tests**, **2406 passed**, **115 skipped**.
  The final full run included a new PDF-test caption-case assertion and a
  pre-existing concurrent-numbering timeout. The caption assertion was corrected
  to match the unchanged uppercase document caption; both checks then passed in
  the focused 65-test run. Remaining failures are in existing contract board/
  schema/copy, plant enrichment and mailbox reconnect tests.
- Full client suite: baseline **6 failed files / 12 failed tests**, **912 passed**.
  Parallel final run: **9 failed files / 19 failed tests**, **918 passed**.
  Additional failures were timing-sensitive existing rendered tests. Rechecking
  DisplayTypeFilters, EstimateBuilder, EstimateBuilder slice35 and ContractWidgets
  with one worker and a 30-second timeout gave **95 passed**. Existing unrelated
  crew reducer, conversation empty-state, tab environment, and rate-card
  assertions remain outside this slice.
- Required extension and schema-drift checks passed after the development
  migration. API/CRM workflows rebuilt and started; the proxied Vite proposal
  module returned HTTP 200.

The one signed-in browser pass was blocked: the documented development account
returned 401. No authentication/account changes were made. Rendered component
checks and HTTP/real-DB tests passed, but this is **not** a claim that the signed-in
browser journey was verified. The existing queued development-login restoration
work covers that environment problem.

## Boundaries and deviations

The document-design-system paths named in the original brief were unavailable;
the supplied document rules and the merged shared-renderer contract governed the
integration. No estimate drawing replacement, document restyle, proposal
signature/acceptance block, plant/palette integration, QuickBooks writes, emailing,
mobile changes or historical regeneration were added.

Safety additions beyond the minimal request are an optional stale-version
expectation and attempt-unique object keys. The response remains additive.
Plant schedule/palette integration and palette-tool retirement remain the already
planned downstream slices; no duplicate follow-up tasks were proposed.
