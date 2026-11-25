# Merge separate renewal agreements — verification

## Scope

Implemented CS1 from the two supplied CS attachments. Existing renewal and
non-renewal behavior, classification, board columns, revenue calculations,
legacy URL handling, schema declarations and migration history are unchanged.
No publishing, production write, real-customer repair or CS2 implementation
was performed.

## API and preservation

- Admin/office-only candidates and merge endpoints live under
  `/api/contract-center/contracts/:agreementId/merge-candidates` and `/merge`.
  The merge requires the initiating `X-Company-Id`, accepts only
  `sourceAgreementId`, and returns the kept agreement's full detail.
- Candidate qualification and locked write refusals share one pure helper.
  Candidates include every season's dates, status, line and annual price,
  first qualifying season/start, blocked reason and management-company names
  for the confirmation. Qualification ignores cancelled/lost seasons, uses
  the existing renewal-source selector and sorts by first qualifying start.
- The company gate precedes agreement locks in ascending ID order. Seasons
  are reread after locking, and cross-company/customer access returns the
  existing 404 sentence. Same agreement, imported source, non-renewal,
  draft/sent successor, inclusive overlap, missing source, invalid ordering
  and an already-linked first qualifying source season are refused.
- Every source season moves through `writeTerm` in outcome-history mode.
  No scope, rate, billing, document, legacy-source or historical row is
  recreated or deleted. Only the first qualifying moved season gets the new
  predecessor pointer; other pointers are retained.
- Signed/active/renewed successors mark the predecessor renewed. Draft/sent
  successors preserve its status and become the pending renewal. Specified
  move/link/outcome notes are attributable to the current user.
- A differing non-null source management company replaces the target's,
  with both names in history. Source notes are appended under
  `From merged contract:`; the target import reference is untouched.
  An unfiltered remaining-season assertion precedes deleting the source.
  Any failure rolls the entire operation back.
- Detail GET supplies role-aware `canMergeSeparate` using agreements and
  terms already loaded by `fullDetail`; it adds no second population query.

## Screen

The header action is independent of `allowedActions` and disabled with
unsaved edits. The existing dialog pattern supplies native disabled radio
rows, all season facts, before/after season strips, line/management changes,
the removal warning, loading/error/empty states, and inline server sentences.
English and Spanish copy are supplied.

The operation stays bound to the company that opened the dialog. Success
refreshes contract/list/attention-related queries, both agreement details,
revenue and the bids board, closes the dialog, keeps the target URL and shows
the specified toast. Existing deleted-URL handling is deliberately unchanged.

## Automated checks

Commands and outputs are retained under ignored `generated-artifacts/cs1/`.

| Check | Result |
| --- | --- |
| `CONTRACT_MERGE_DB_TEST=1 pnpm --filter @workspace/api-server exec vitest run src/lib/contractMerge.integration.test.ts` | 26 passed against real development PostgreSQL, only UUID-owned disposable companies |
| Revenue, income forecast and contract classification regression suites | 377 passed; combined earlier run with the original 22 merge cases: 399 passed |
| `MergeSeparateDialog.rendered.test.tsx` | 6 passed |
| `ContractCenter.rendered.test.tsx` | 17 passed, including header independence from projection actions |
| `RenewDialog.rendered.test.tsx` | 13 passed |
| Root `pnpm run typecheck` before/after | Both exit 2; exactly the same 585 API diagnostic messages, no additions or removals |
| Explicit CRM typecheck against unchanged HEAD archive and final tree | Both exit 2; same 183 diagnostic locations/codes, no additions or removals |
| `git diff --check` | Passed |
| Managed API/web restart | Both started successfully; API build and document-runtime verification passed |

The root recursive typecheck stops when the API fails; therefore the client
also received its own unchanged-source comparison. Its archive reused
unchanged shared libraries and the artifact-local dependencies, and was
removed after comparison. The remaining baseline failures are not claimed
as fixed or passing.

Database cases cover the Vista West three-season shape, cancelled/lost
tolerance, all moved status outcomes, full old child/history preservation,
management/notes/import behavior, pending-renewal classification, every
specified refusal, access/company guards, reverse concurrent merges,
deterministic locks and fresh under-lock eligibility, injected write failure
and a failed empty-source assertion. Regression assertions prove identical
2027 signed payment totals, no old pending renewal and no renewal-fill
estimate in months covered by the moved season. Consumers were not changed.

## Signed-in verification and cleanup

One browser pass signed in with a generated disposable fixture account,
selected the separate signed renewal, checked the preview and warning,
merged once, observed the exact success toast, reloaded the kept agreement,
and opened the removed source URL. The final agreement had the renewed 2026
season, untouched cancelled draft and moved signed 2026–27 season.

The source URL returned 404 and retained the existing uncopied/not-found
screen. No new redirect or wording was added to that existing screen.

The browser worker's optional database probe used incorrect table names;
the main agent independently verified the actual PostgreSQL rows afterward:
three seasons, zero source agreements, correct predecessor status and
renewal pointer, unchanged cancelled season, three scope rows, three rate
rows, 36 billing rows, three document rows and three legacy-source rows.
The disposable company/user were then deleted with an identity guard, and
the local generated credentials file was removed. Integration test fixtures
also clean up their companies/users.

Only expected signed-out 401/deleted-ID 404 responses and existing tooling
warnings appeared. The preview login screen and authenticated merge-preview,
final-detail and deleted-URL screens were captured. No additional browser
pass was needed.

## Handoff

CS2 is already queued as the next slice and was not duplicated with a new
follow-up suggestion. The owner performs any real agreement repair from the
released screen. No automatic repair or migration is included.
