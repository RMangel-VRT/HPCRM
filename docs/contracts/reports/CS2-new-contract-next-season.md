# New contracts as the next season

## Implementation

- Verified that the merged split-repair implementation is present. Extracted its
  existing source/pending/overlap/start-date refusals into the driver-free
  `lib/db/src/contractNextSeason.ts`; both repair and creation use those rules.
  Callers still select the source through the existing canonical selector.
- Creation retains authorization, company-header checks, customer/RFP/management
  validation and the RFP → company → agreement lock order. Target seasons are
  reread under lock. Existing-agreement creation inserts a draft season only,
  with its predecessor link; normal signing remains unchanged.
- The existing customer list endpoint supplies lightweight season summaries for
  matching and date eligibility. Matching excludes inherited coverage and
  closed/non-renewing agreements, and uses the latest non-cancelled/non-lost
  season's line rather than the displayed current season.
- The English/Spanish creation panel shows all matches, disabled reasons,
  line changes, annual price and new-tab detail links. It defaults only when
  exactly one agreement is eligible. Separate creation requires a trimmed reason
  of at most 200 characters, independently enforced by the server.
- History combines RFP provenance with next-season/separate creation notes.
  Different entered management companies are named in history without changing
  the agreement's management company.
- Both create responses include `createdTermId`. Document requests and the
  persisted recovery marker use that ID, never the last sorted season.
  Ordinary and RFP success navigate to the destination agreement and invalidate
  contract/customer/attention, destination detail, revenue and existing RFP keys.

## Verification

- Real PostgreSQL, disposable development companies only:
  - `CONTRACT_NEXT_SEASON_DB_TEST=1 RFP_CONTRACT_DB_TEST=1 pnpm --filter @workspace/api-server exec vitest run src/lib/contractNextSeason.integration.test.ts src/lib/rfpContracts.integration.test.ts --maxWorkers=1 --no-file-parallelism`
  - **44 passing** checks across creation and existing RFP lifecycle coverage.
    Covered submitted explicit and patterned billing, scope/rates/form,
    exact season identification, signing, RFP linkage, management attribution,
    all refusals, concurrent requests/locked revalidation, separate reasons,
    line matching, permissions and real cross-company fixtures.
  - Merged-repair integration suite: **26 passing** checks after eligibility
    extraction. No changes to repair behavior or consumers.
- Rendered creation and draft-body regression checks:
  - `pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts src/pages/NewContractPage.rendered.test.tsx src/components/contracts/contractCreate.test.ts --maxWorkers=1`
  - **41 passing** checks, including defaults, multiple destinations,
    ineligibility, whitespace reasons, request bodies, no matches, line changes,
    lookup failure, RFP navigation, query invalidation, exact upload destination,
    and persisted retry after a later cancelled season sorts last.
- Shared-library typecheck passed. Artifact typecheck diagnostic locations/codes
  match the pre-change baseline: API **583**, CRM **177**, with **zero added or
  removed diagnostic locations**. Existing inferred-type text differed only in
  unrelated property/union ordering. Existing errors were not changed here.
- API and CRM managed workflows restarted successfully; API production bundle
  built and the preview services started without a new runtime error.
- A single signed-in browser journey passed on a disposable company: panel and
  default, whitespace-reason gating, actual next-season creation, exact upload
  target, failed-upload recovery after reload without a duplicate create, retry
  targeting the same term, and navigation to the existing agreement. Upload-URL
  requests were deliberately aborted; no storage objects or real documents were
  uploaded. The later cancelled season remained unchanged. Browser screenshots
  were inspected. One automation click timed out before dispatching a request;
  repeating it succeeded with the expected target.
- All disposable database fixtures, including the signed-in browser company and
  user, were removed after verification.
- `git diff --check` passed.

## Scope

No schema declarations, migrations, import/Copy behavior, Renew/status-menu
behavior, board/revenue/inactivation consumers or production data changed.
Existing RFP test payloads now state why their deliberately separate fixture
contracts are separate; their provenance assertions include that audit note.
Generated verification logs and disposable browser setup stay in the ignored
`generated-artifacts/cs2/` directory.
