# H2 documentation tree report

## Pre-flight and scope

- Working tree was clean before execution.
- All required files existed. Moved **95 files with `git mv`**, preserving basenames.
- Two newer loose files were classified as customer evidence: `cp5-frontend-verification.md` and `cp5-verification.md`, now under `docs/customers/reports/`.
- No existing slice-pack directory or pack contents were present. Created guidance only, not invented campaigns rules or slices.
- Existing content changed only to fix paths. Asset-library metadata, memory references, an application comment and a source-inventory comment were included.
- No behavior, schema, routes, UI, dependency, production data or publishing changes.
- Evidence scripts were not run against production or used to regenerate historical results. Their repository-root discovery and input/output paths were corrected.

## Final tree (`find docs -maxdepth 2 | sort`)

```text
docs
docs/README.md
docs/contracts
docs/contracts/contract-center-audit-rollout.md
docs/contracts/reports
docs/customers
docs/customers/customer-qbo-sync.md
docs/customers/reports
docs/documents
docs/documents/document-design-system.md
docs/documents/document-kit.md
docs/documents/reports
docs/estimates
docs/estimates/estimate-builder-draft-api.md
docs/estimates/estimate-builder-pdf.md
docs/estimates/estimate-builder-screen.md
docs/estimates/estimate-lifecycle.md
docs/estimates/estimate-plant-exhibits.md
docs/estimates/estimate-setup.md
docs/estimates/estimate-ticket-integration.md
docs/estimates/hardscape-catalog.md
docs/estimates/irrigation-catalog-import.md
docs/estimates/proposal-estimate-integration.md
docs/estimates/proposal-shared-template.md
docs/estimates/reports
docs/invoicing
docs/invoicing/invoice-center-draft-api.md
docs/invoicing/reports
docs/navigation
docs/navigation/Navigation-design.md
docs/navigation/README.md
docs/navigation/reports
docs/ownership
docs/ownership/data-ownership-map.md
docs/ownership/reports
docs/scheduling
docs/scheduling/Design.md
docs/scheduling/Master-schedule-design.md
docs/scheduling/P3-3-scheduling-page.md
docs/scheduling/README.md
docs/scheduling/Rules-P2.md
docs/scheduling/Rules.md
docs/scheduling/mockups
docs/scheduling/reports
docs/slices
docs/slices/H2-docs-tree-report.md
docs/slices/README.md
```

## Every repaired reference

Each file is listed at its final location. In this inventory only, repository-root
documentation targets omit their leading `docs/` in both columns, avoiding dead
historical paths in the report itself. Relative Markdown targets keep their
original `../` prefixes. Repeated occurrences of the same replacement are grouped.

| File | Old → new targets |
| --- | --- |
| `.agents/agent_assets_metadata.toml` | `navigation/N1-implementation-report.md` → `navigation/reports/N1-implementation-report.md`; `navigation/N3-implementation-report.md` → `navigation/reports/N3-implementation-report.md`; `routes-engine-verification.md` → `scheduling/reports/routes-engine-verification.md`; `data-ownership-audit.md` → `ownership/reports/data-ownership-audit.md` |
| `.agents/memory/estimate-pricing-selection.md` | `estimate-builder-screen.md` → `estimates/estimate-builder-screen.md`; `estimate-setup.md` → `estimates/estimate-setup.md` |
| `.agents/memory/estimate-ticket-recovery.md` | `estimate-ticket-integration.md` → `estimates/estimate-ticket-integration.md` |
| `.agents/memory/estimate-totals-conventions.md` | `estimate-builder-draft-api.md` → `estimates/estimate-builder-draft-api.md` |
| `.agents/memory/ownership-map-check.md` | `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `artifacts/highplains-crm/src/components/estimates/EstimateIdentityHeader.tsx` | `estimate-builder-screen.md` → `estimates/estimate-builder-screen.md` (comment only) |
| `docs/invoicing/reports/c2-billing-report.md` | `c2-billing-report.md` → `invoicing/reports/c2-billing-report.md` |
| `docs/contracts/reports/cc2-13-verification.md` | `cc2-13-verification.md` → `contracts/reports/cc2-13-verification.md`; `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `docs/contracts/reports/cc2-14-verification.md` | `cc2-14-verification.md` → `contracts/reports/cc2-14-verification.md` |
| `docs/contracts/reports/contract-center-agreement-cleanup-verification.md` | `contract-center-agreement-cleanup-verification.md` → `contracts/reports/contract-center-agreement-cleanup-verification.md`; `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `docs/contracts/contract-center-audit-rollout.md` | `contract-center-renewal-verification.md` → `reports/contract-center-renewal-verification.md`; `contract-center-parent-verification.md` → `reports/contract-center-parent-verification.md` |
| `docs/contracts/reports/contract-center-audit-verification.md` | `contract-center-audit-rollout.md` → `../contract-center-audit-rollout.md` |
| `docs/contracts/reports/contract-center-cc2-1-verification.md` | `contract-center-cc2-1-verification.md` → `contracts/reports/contract-center-cc2-1-verification.md` |
| `docs/contracts/reports/contract-center-cc2-2-verification.md` | `contract-center-cc2-2-verification.md` → `contracts/reports/contract-center-cc2-2-verification.md` |
| `docs/contracts/reports/contract-center-changing-renewals-verification.md` | `contract-center-changing-renewals-verification.md` → `contracts/reports/contract-center-changing-renewals-verification.md` |
| `docs/contracts/reports/contract-center-parent-verification.md` | `contract-center-parent-verification.md` → `contracts/reports/contract-center-parent-verification.md`; `contract-center-audit-rollout.md` → `contracts/contract-center-audit-rollout.md` |
| `docs/contracts/reports/contract-center-renewal-verification.md` | `contract-center-renewal-verification.md` → `contracts/reports/contract-center-renewal-verification.md`; root `contract-center-audit-rollout.md` → `contracts/contract-center-audit-rollout.md`; relative `contract-center-audit-rollout.md` → `../contract-center-audit-rollout.md` |
| `docs/contracts/reports/contract-center-switch-over-verification.md` | `contract-center-switch-over-verification.md` → `contracts/reports/contract-center-switch-over-verification.md`; `contract-center-audit-rollout.md` → `../contract-center-audit-rollout.md` |
| `docs/contracts/reports/contract-exact-rates-verification.md` | `contract-exact-rates-verification.md` → `contracts/reports/contract-exact-rates-verification.md`; `contract-center-audit-rollout.md` → `contracts/contract-center-audit-rollout.md` |
| `docs/contracts/reports/contract-non-renewal-verification.md` | `contract-non-renewal-verification.md` → `contracts/reports/contract-non-renewal-verification.md` |
| `docs/contracts/reports/contract-payment-schedules-verification.md` | `contract-payment-schedules-verification.md` → `contracts/reports/contract-payment-schedules-verification.md` |
| `docs/customers/reports/cp5-verification.md` | `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `docs/customers/reports/cq2-verification.md` | `data-ownership-map.md` → `ownership/data-ownership-map.md`; `customer-qbo-sync.md` → `customers/customer-qbo-sync.md` |
| `docs/customers/reports/cq3-verification.md` | `data-ownership-map.md` → `ownership/data-ownership-map.md`; `customer-qbo-sync.md` → `customers/customer-qbo-sync.md`; `cq3-verification.md` → `customers/reports/cq3-verification.md` |
| `docs/customers/reports/cq31-customer-sync-resilience.md` | `cq31-customer-sync-resilience.md` → `customers/reports/cq31-customer-sync-resilience.md` |
| `docs/customers/reports/cq32-customer-push-deadlocks.md` | `cq32-customer-push-deadlocks.md` → `customers/reports/cq32-customer-push-deadlocks.md` |
| `docs/customers/reports/cq4-verification.md` | `cq4-verification.md` → `customers/reports/cq4-verification.md` |
| `docs/customers/reports/customer-pages-correctness.md` | `data-ownership-audit.md` → `ownership/reports/data-ownership-audit.md`; `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `docs/customers/reports/customer-qbo-sync-verification.md` | `data-ownership-map.md` → `ownership/data-ownership-map.md`; `customer-qbo-sync.md` → `customers/customer-qbo-sync.md` |
| `docs/customers/customer-qbo-sync.md` | `cq3-verification.md` → `reports/cq3-verification.md` |
| `docs/ownership/reports/data-ownership-audit.md` | `contract-center-switch-over-verification.md` → `contracts/reports/contract-center-switch-over-verification.md`; `cp5-verification.md` → `customers/reports/cp5-verification.md`; `customer-pages-correctness.md` → `../../customers/reports/customer-pages-correctness.md` |
| `docs/ownership/data-ownership-map.md` | `data-ownership-audit.md` → `ownership/reports/data-ownership-audit.md`; `customer-pages-correctness.md` → `../customers/reports/customer-pages-correctness.md`; `irrigation-catalog-import.md` → `../estimates/irrigation-catalog-import.md` |
| `docs/scheduling/reports/display-type-filter-audit.md` | `display-type-filter-audit.json` → `scheduling/reports/display-type-filter-audit.json`; `p3-3-release-report.md` → `scheduling/reports/p3-3-release-report.md` |
| `docs/documents/document-design-system.md` | `estimate-builder-pdf.md` → `estimates/estimate-builder-pdf.md` |
| `docs/documents/reports/document-kit-verification.md` | `invoice-center-draft-api.md` → `invoicing/invoice-center-draft-api.md`; `estimate-builder-pdf.md` → `estimates/estimate-builder-pdf.md`; `data-ownership-map.md` → `ownership/data-ownership-map.md`; root `document-kit.md` → `documents/document-kit.md`; relative `document-kit.md#admin-readiness-contract` → `../document-kit.md#admin-readiness-contract` |
| `docs/documents/document-kit.md` | `document-kit-verification.md` → `documents/reports/document-kit-verification.md`; `proposal-shared-template.md` → `../estimates/proposal-shared-template.md` |
| `docs/estimates/estimate-builder-pdf.md` | `document-kit.md` → `documents/document-kit.md` |
| `docs/estimates/estimate-plant-exhibits.md` | `proposal-estimate-integration.md` → `estimates/proposal-estimate-integration.md`; `document-kit.md` → `documents/document-kit.md`; `plant-palette-retirement.md` → `reports/plant-palette-retirement.md` |
| `docs/scheduling/reports/f1-open-ticket-cap-report.md` | `f1-open-ticket-cap-report.md` → `scheduling/reports/f1-open-ticket-cap-report.md` |
| `docs/invoicing/invoice-center-draft-api.md` | `invoice-center-ic1-verification.md` → `invoicing/reports/invoice-center-ic1-verification.md`; `document-kit.md` → `../documents/document-kit.md` |
| `docs/invoicing/reports/invoice-center-ic1-verification.md` | `invoice-center-ic1-verification.md` → `invoicing/reports/invoice-center-ic1-verification.md`; `invoice-center-draft-api.md` → `invoicing/invoice-center-draft-api.md`; `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `docs/navigation/reports/N3-implementation-report.md` | `navigation/N3-implementation-report.md` → `navigation/reports/N3-implementation-report.md` |
| `docs/navigation/reports/N4-implementation-report.md` | `navigation/N4-implementation-report.md` → `navigation/reports/N4-implementation-report.md` |
| `docs/navigation/README.md` | `../data-ownership-audit.md` → `../ownership/reports/data-ownership-audit.md` |
| `docs/scheduling/reports/one-crew-list-report.md` | `data-ownership-audit.md` → `ownership/reports/data-ownership-audit.md` |
| `docs/scheduling/reports/p3-1-release-report.md` | `p3-1-release-report.md` → `scheduling/reports/p3-1-release-report.md` |
| `docs/estimates/proposal-shared-template.md` | `document-design-system.md` → `documents/document-design-system.md` |
| `docs/contracts/reports/rfp-contract-link-verification.md` | `rfp-contract-link-verification.md` → `contracts/reports/rfp-contract-link-verification.md` |
| `docs/scheduling/reports/routes-engine-verification.md` | `scheduling/routes-named-import-verification.md` → `routes-named-import-verification.md` |
| `docs/scheduling/reports/P2-3-handoff.md` | `scheduling/P2-3-handoff.md` → `scheduling/reports/P2-3-handoff.md` |
| `docs/scheduling/reports/P2-5-handoff.md` | `scheduling/P2-5-handoff.md` → `scheduling/reports/P2-5-handoff.md` |
| `docs/scheduling/reports/P3-5-browser-evidence.json` | `scheduling/check-p3-5-contrast.py` → `scheduling/reports/check-p3-5-contrast.py`; `scheduling/P3-5-contrast.json` → `scheduling/reports/P3-5-contrast.json` (paths inside embedded historical report only) |
| `docs/scheduling/reports/P3-5-verification.md` | `scheduling/check-p3-5-contrast.py` → `scheduling/reports/check-p3-5-contrast.py`; `scheduling/P3-5-contrast.json` → `scheduling/reports/P3-5-contrast.json`; `scheduling/P3-5-evidence.json` → `scheduling/reports/P3-5-evidence.json`; `scheduling/summarize-p3-5.py` → `scheduling/reports/summarize-p3-5.py` |
| `docs/scheduling/reports/R2-evidence.json` | `scheduling/R2-verification.md` → `scheduling/reports/R2-verification.md`; `scheduling/R2-evidence.json` → `scheduling/reports/R2-evidence.json`; `scheduling/summarize-r2.py` → `scheduling/reports/summarize-r2.py`; `data-ownership-map.md` → `ownership/data-ownership-map.md` |
| `docs/scheduling/reports/R2-verification.md` | `routes-engine-verification.md` → `scheduling/reports/routes-engine-verification.md`; `scheduling/summarize-r2.py` → `scheduling/reports/summarize-r2.py` |
| `docs/scheduling/reports/check-p3-5-contrast.py` | `scheduling/P3-5-contrast.json` → `scheduling/reports/P3-5-contrast.json`; `resolve().parents[2]` → `resolve().parents[3]` |
| `docs/scheduling/reports/routes-named-import-verification.md` | `../display-type-filter-audit.md` → `display-type-filter-audit.md`; `../invoice-center-ic1-verification.md` → `../../invoicing/reports/invoice-center-ic1-verification.md`; `../estimate-plant-exhibits.md` → `../../estimates/estimate-plant-exhibits.md` |
| `docs/scheduling/reports/summarize-p3-5.py` | `scheduling/P3-5-browser-evidence.json` → `scheduling/reports/P3-5-browser-evidence.json`; `scheduling/P3-5-browser-repro.js` → `scheduling/reports/P3-5-browser-repro.js`; `display-type-filter-audit.json` → `scheduling/reports/display-type-filter-audit.json`; `scheduling/P3-5-evidence.json` → `scheduling/reports/P3-5-evidence.json`; `resolve().parents[2]` → `resolve().parents[3]` |
| `docs/scheduling/reports/summarize-r2.py` | `scheduling/R2-evidence.json` → `scheduling/reports/R2-evidence.json`; `resolve().parents[2]` → `resolve().parents[3]` |
| `docs/scheduling/reports/task-web-client-validation.md` | `scheduling/task-web-client-validation.md` → `scheduling/reports/task-web-client-validation.md` |
| `replit.md` | `contract-center-audit-rollout.md` → `contracts/contract-center-audit-rollout.md`; `document-kit-verification.md` → `documents/reports/document-kit-verification.md`; `plant-palette-retirement.md` → `estimates/reports/plant-palette-retirement.md`; `data-ownership-map.md` → `ownership/data-ownership-map.md`; `document-kit.md` → `documents/document-kit.md` |
| `scripts/audit/data-ownership-inventory.mjs` | `data-ownership-audit.md` → `ownership/reports/data-ownership-audit.md` (comment only) |

## New guidance and indexes

- `docs/README.md`: area map and placement rules.
- `docs/slices/README.md`: repository-first workflow and user-owned slice sources.
- `replit.md`: near-top Working from slice packs section.
- `.agents/memory/slice-pack-workflow.md` and memory index: durable workflow.
- Scheduling and navigation READMEs: relocated report directories and key reports.

## Dead-link checks

Checked repository documentation file references in maintained tracked text plus
new docs/notes, and every local relative Markdown link inside documentation.
Excluded dependencies, generated output, Git internals, ignored task transcripts
and original uploaded source attachments. No source slice files were edited.

```text
Repository documentation path check: no output (0 missing)
Relative Markdown target check: no output (0 broken)
Old moved-path reference check: no output (0 stale)
Pre-existing missing documentation paths: 0
Pre-existing broken relative documentation links: 0
```

## Validation

Raw command logs are retained under ignored `generated-artifacts/h2/`.

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | Exit 2: 693 API TypeScript diagnostics, matching the recorded CP5 root-typecheck count. The library build completed before the leaf failure. |
| `pnpm --filter @workspace/api-server exec vitest run --maxWorkers=2` | Exit 1: 140 files passed, 23 failed, 14 skipped; 2,718 tests passed, 303 failed, 114 skipped. |
| `pnpm --filter @workspace/highplains-crm exec vitest run --config vitest.config.ts --maxWorkers=2` | Exit 1: 104 files passed, 19 failed; 1,256 tests passed, 172 failed. |

The last implementation's [CP5 report](../customers/reports/cp5-verification.md)
already records 693 API diagnostics, a failing typecheck gate and selected test
failures. This full API run additionally exercises older authorization fixtures,
schema-source comparisons and other stale assertions not covered by that selected
CP5 baseline. A full pre-H2 test baseline was not rerun, so exact all-suite
failure-count equivalence is **not claimed**. No tests or application behavior
were changed or suppressed to obtain a green result; the brief's all-green
typecheck/test condition is not met.

- Python evidence scripts parse, the JavaScript repro passes `node --check`,
  and all documentation JSON parses.
- No application source changed except the two documentation-path comments.
- A comparison to HEAD with comments removed proved both source files otherwise
  identical. All 95 destinations exist with unchanged filenames.
- No pack was manufactured from attachments and no next slice was started.
