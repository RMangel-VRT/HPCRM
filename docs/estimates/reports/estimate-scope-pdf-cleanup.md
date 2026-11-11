# Estimate Builder Slice 4.5 — scope and PDF cleanup

## Integration and boundaries

Implemented against the existing merged builder/lifecycle/shared document kit.
The brief's abbreviated `services/`, `routes/` and `pages/` references live under
the API Server and High Plains CRM artifact `src/` roots. Earlier estimate,
proposal linking and exhibit behavior was reused, not rebuilt. No slice pack,
rules or STATUS file was invented; this task used the authorized task plan.
Services catalog (4.6) and add-line/custom-line changes (4.7) remain separate.

The four reference images (`eb45-builder.png` and three target PDF PNGs) were not
supplied. Written-spec implementation and new rendered evidence are available;
**screenshot parity is unverified**.

## Data and endpoint contract

- Rechecked migration allocation: 0076 already belonged to campaign crew lists;
  0077 was unused. Added `0077_estimate_scope_of_work.sql`: guarded
  `ALTER TABLE estimate_versions ADD COLUMN IF NOT EXISTS scope_of_work text`,
  inside BEGIN/COMMIT. Nullable, no default, no backfill or startup DDL.
- Applied through the normal development migration runner: one new migration
  applied. The runner also reported a pre-existing changed checksum for 0074;
  it did not reapply or modify that migration.
- Matching Drizzle field and required nullable detail DTO field
  `version.scopeOfWork`; full version reads already spread version columns.
  Revision explicitly copies the source version's scope.
- `PATCH /api/estimates/:id/versions/:versionId` accepts only
  `{scopeOfWork: string | null}`, with a 10,000-character string limit.
  Whitespace-only strings become null; nonblank text is preserved verbatim.
  Empty object is checked before required-field parsing: 400 `EMPTY_PATCH`.
  Missing/unknown fields or invalid values return 400 `INVALID_REQUEST`.
- Uses `estimateAccess`, session-based company ownership, optional initiating
  `X-Company-Id` expectation, and existing `mutateEstimate`: company-qualified
  container lock first, void guard, owned version/draft guard, update timestamps,
  normal detail envelope read inside the transaction. Locked versions retain
  409 `VERSION_LOCKED`; voided containers retain 409 `ESTIMATE_VOIDED`.

## Builder and safe document model

The new focused `ScopeOfWorkCard` is above the first section even with zero
sections. It reuses the section shell/header treatment and FileText icon, hint,
seven-row vertically resizable textarea, localized read-only/empty states and
EN/ES save/retry status. Changed blur saves are serialized and deduplicated.
The existing mutation path captures the company header, drops obsolete
identity/company/version results and installs newest authoritative detail.
The card consumes that installed value, preserves newer typing during saves,
queues a newer blur and retains failed text for retry.

`EstimateDocumentModel` allowlists nullable scope and derived `hasPlants`.
The latter uses **captured** line `umbrellaKey === "plants"`, including custom
Plants lines. Raw umbrellas and internal fields still do not escape the model.
Proposal's nested allowlist copies the two fields, but the proposal narrative
continues to use proposal-owned scope, not estimate scope.

**Category decision:** retained `categorySummary`. Explicit model tests and the
proposal-model copy still consume it. Only the printed By category box was
removed. The two-column summary retains an empty left column, right-aligned
Estimate total, `data-totals` and the unchanged last-three-row orphan algorithm.

## PDF changes and preservation

- Escaped multiline estimate scope appears after project title/optional ticket
  and before pricing; absent scope creates no block. 10.5pt, 1.45 line height,
  14px bottom gap.
- Warranty requires captured plants; configured terms print independently.
  Legal fragment text uses 8.5pt, 1.45, #5c665f; headings use 10pt and 14px/5px
  margins. CSS is scoped to shared **legal** boilerplate rather than all
  `.boilerplate`, preserving proposal narrative and invoice typography.
  Computed WCAG contrast on white is **5.96446:1**, exceeding 4.5:1.
- Terms still start a new page but flow naturally. Only Acceptance/signatures
  and the outside mountain reserve are indivisible. Browser final-block
  measurement selects `.acceptance-group` and invoice `.final.keep`;
  invoice totals preflight remains active and can reject first.
- Proposal cover/scope/attachment fingerprints remain unchanged. Only shared
  pricing and legal page fingerprints, plus intentional standalone HTML hashes,
  were updated. Invoice rendering, footer/mountains, legacy exhibit decorations,
  paragraph escaping and orphan handling were not redesigned.
- Nothing was published; no production schema/data was edited and no historical
  PDF was regenerated.

## Changed files

- `.migration-backup/migrations/0077_estimate_scope_of_work.sql`
- `lib/db/src/schema/estimates.ts`, `lib/db/src/estimateContracts.ts`
- API `src/routes/estimates.ts` and its test
- API `src/services/estimates.ts`, `estimateLifecycle.ts`, `estimatePdf.ts`,
  `estimatePdf.test.ts`, `estimates.integration.test.ts`,
  `proposalEstimates.integration.test.ts` (test-harness dependency repair only)
- API `src/services/documents/{estimate,layout,browser,proposal,fixtures}.ts`
- Document tests `{scopeCleanup,estimateEngine,pagination,proposal,render}.test.ts`
- API `scripts/estimate-scope-evidence.mjs`
- CRM `src/components/estimates/ScopeOfWorkCard.tsx`, `src/pages/EstimateBuilder.tsx`
- CRM rendered tests `EstimateBuilder.rendered.test.tsx` and
  `EstimateBuilder.slice35.rendered.test.tsx`
- CRM `src/i18n/locales/{en,es}.ts`
- Documents, builder-screen, builder-PDF and ownership documentation; existing
  artifact-test-runner memory note records the container worker-budget limitation.

## Verification and evidence

Evidence is synthetic, contains no customer data, and lives under ignored
`generated-artifacts/eb45/`. No generated PDF/PNG or archive is committed.
Tests create PDFs, every-page PNGs, extracted text, bounding boxes and check JSON.
Reproduce with:

```sh
pnpm --filter @workspace/api-server exec vitest run --maxWorkers=1 --no-file-parallelism src/services/documents/scopeCleanup.test.ts
node artifacts/api-server/scripts/estimate-scope-evidence.mjs
```

| Fixture | Pages | Last body bottom | Mountain top |
|---|---:|---:|---:|
| Twelve lines, plants and scope | 3 | 316.30pt | 693.75pt |
| Services only, no scope/warranty | 3 | 275.05pt | 693.75pt |
| 2,500-character terms + 2,500-character warranty | 4 | 219.55pt | 693.75pt |

Reviewed every page in `plants-scope-review.png`, `services-only-review.png` and
`long-legal-review.png`: scope placement, no category box, warranty gating,
three-row pricing tail, flowing legal area, unsplit acceptance, no final-page
text in the mountain reserve, repeating footers and short continuation headers.
The long legal fixture places terms/warranty on page 3 and keeps Acceptance
whole on page 4. A separate longer-terms regression exercises multi-page flow.

### Baselines and final checks

| Targeted checks | Unchanged-source baseline | Final result |
|---|---|---|
| Server, 15 files | 209 tests: 197 passed, 12 failed in an outdated proposal route harness | **221 passed**, 12 added |
| Builder, 3 rendered suites | 99 tests: 34 passed, 65 failed in outdated auth mocks | **112 passed**, 13 added |
| API direct typecheck | 695 existing primary diagnostics | 695, zero added/removed by file + code |
| CRM direct typecheck | 212 existing primary diagnostics | 212, zero added/removed by file + code |

Shared declarations were force-refreshed before the baseline and final leaf
checks. `pnpm exec tsc --build --force` succeeds. Canonical root
`pnpm run typecheck` remains **not clean** because of existing artifact errors;
its fail-fast output is not treated as a clean check. The normalized direct
diagnostic comparisons show no task-attributable additions.

The final server result combines `server-verified.log` with the 48 passing
targeted checks in `server-recheck.log` after the final fixture updates.
The final builder result combines `client-final.log` with the 44 passing builder
checks in `client-verified.log` after adding the voided-container assertion.
No unresolved test failure remains in these targeted checks.

The first unconstrained parallel run exhausted the container's thread/process
budget (`EAGAIN`), so repeatable server checks use
`--maxWorkers=1 --no-file-parallelism`, with a 20-second general test budget
(real-render tests retain their explicit 30/60-second budgets).
Baselines were rerun from unchanged tracked source in an ignored archive using
the artifact-local launchers. Two archive-only missing-migration-file failures
were corrected by supplying the original SQL directory; both migration checks
then passed. These were not product failures.

Two builder auth mocks lacked the current `accessRole` projection, causing
65 original checks to stop at access denial. The proposal integration harness
extracted actual route code without injecting its current `accessRole`
dependency, causing 12 original checks to return 500. Fixed only those test
fixtures/dependencies; production auth and proposal routing were not changed.

Coverage includes strict PATCH fields/length/empty body, null and whitespace
normalization, all locked statuses, void precedence, access and company
isolation, migration reruns, source-scope revision copy, save-once/unchanged blur,
authoritative returned text, queued newer typing, retained-text retry, no-section
drafts, locked/voided display, Spanish, late company/user/version responses,
scope placement/absence/escaping, catalog/custom captured Plants detection,
independent terms and warranty, legal typography/contrast, flowing long text,
oversized acceptance/invoice protection, orphan boundaries, footer/mountains,
proposal allowlists and prior exhibit/lifecycle integration.

Twelve available invoice PNGs were compared to the unchanged-source baseline:
**all twelve are byte-identical**. Proposal cover, narrative scope and attachment
fingerprints pass unchanged; only authorized pricing/legal fingerprints changed.
Both managed workflows restarted successfully. API health and development
schema checks succeeded. Existing unrelated background QuickBooks fixture-token
warnings remain; no estimate startup failure was observed.

### Signed-in browser evidence

A single real-browser journey passed with disposable isolated
company/admin/customer/estimate records:

- Changed multiline scope blur produced exactly one version PATCH with the
  initiating company header, returned 200 and showed Saved.
- Reload preserved the saved scope; unchanged blur sent no request.
- With the first response deliberately held, newer typing remained visible.
  Its blur queued rather than racing; releasing the first response triggered
  the second save, and reload retained the newer text.
- Sent/locked Spanish view showed translated title/hint/lock notice, plain
  read-only scope and no scope textarea.

All disposable fixtures were removed and verified absent. No existing password
or business record was changed, no proposal/estimate was delivered to anyone,
and no third-party send endpoint was used. The tester set sent metadata only
on its disposable development version to exercise the locked view.

Four browser PNG screenshots (saved draft, reloaded draft, pending-save typing,
Spanish locked scope) are attached to the task conversation and were inspected.
The browser evidence interface exposes attachments rather than image bytes, so
it could not export a local `builder.png`; the three PDF scenario PNG sets and
review sheets are saved locally as documented above.

No follow-up scope was added: the already-planned 4.6 and 4.7 work remains
separate. No publication, production edits or historical regeneration occurred.
