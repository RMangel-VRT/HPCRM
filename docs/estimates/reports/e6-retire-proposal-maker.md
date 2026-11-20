# E6 — Retire Proposal Maker, keep old proposals

## Replacement and compatibility

E4 and E5 were merged before retirement: the estimate version owns its plant
table and photos, generates a crew worksheet, and can be emailed from a connected
mailbox. **Mark sent without emailing** remains available. No estimate or invoice
workflow was changed here. RFP workflows are separate and were not retired.

The protected `/dashboard/tools/proposals` route is now **Old proposals**. The
customer Proposals tab, ticket history and all existing proposal and version URLs
still work. The viewer shows a localized retirement notice, metadata, original
attachments, draft previews, and saved PDF versions. The former Finalize action
could leave the parent row in `draft`; saved versions are therefore shown
independently of row status. Finalized/published rows show their stored PDF.
Drafts with no surviving preview source can still show a stored version if they
have one. A download never writes a new file or version.

Former proposal write endpoints (including both crew worksheet generation URLs)
return `409 PROPOSALS_RETIRED` and `estimateBuilderPath` once the normal
role/company checks pass. Whole-proposal Delete still uses the existing
authorization, confirmation and server behavior. Proposal history and existing
worksheet snapshots were not migrated. The old proposal-number startup job
and proposal-to-estimate scope carry no longer run. There are no new database
migrations, schema changes, or storage cleanup.

## Changed areas

| Area | Files |
|---|---|
| API | `routes/routes.ts`, `routes/retiredProposalWrites.ts`, `routes/proposalPdfReads.ts` |
| Archive | `pages/{ProposalMaker,ProposalDraft,ProposalVersion,ToolsPage}.tsx`, `components/proposals/ProposalHistory.tsx` |
| Former entry points | `pages/{EstimateBuilder,TicketDetail,CustomerDetail}.tsx`, `TopbarMenus.tsx`, `CommandBand.tsx`, `CustomerHeader.tsx`, `ProposalsPage.tsx`; removed obsolete proposal-editor components and tests |
| Copy and guidance | EN/ES locales, document design guide, estimate builder and historical proposal docs |
| Checks | `proposalEstimates.integration.test.ts`, `pdfBrand.test.ts`, `ProposalDraft.rendered.test.tsx`, customer-header fixtures/tests |

The mobile app and reports had no proposal-authoring links to remove.

## Production inventory and schema

Read-only aggregate queries counted **114 proposals**, including **112 unlinked**
and **2 linked drafts**; **168 version rows**, **326 file rows**, and **1 crew
worksheet with a proposal snapshot**. All 114 proposal container rows are marked
draft; 99 have at least one stored PDF version reference. These are counts, not
proof that every storage object can be opened. No production record or storage
object was written or removed.

The branch changes no schema or migrations. A read-only catalog comparison
matched all **110** column, index, constraint, and sequence entries for the
proposal tables in development and production. It also found no production-only
public tables or columns anywhere in the schema. The actual SQL preview from
Publish was not accessible in this task; these checks establish that E6
introduces no proposal drops, not that an unrelated future Publish diff is safe.

## Automated verification and baseline

- A fresh administrator login in development found no proposal creation
  controls in the Estimate Builder, ticket or Tools menu. The archive,
  Customer Proposals tab and linked ticket all opened their historical
  viewers. A linked draft returned a preview PDF, and a finalized unlinked
  proposal's original stored download matched its seeded checksum. Cancel
  left the fixture intact; confirmed Delete removed it and its saved version
  without changing the earlier worksheet snapshot. The disposable fixtures
  and synthetic PDF were cleaned up. No production records were exercised.
- API: **597 passed / 600** after rerunning the branding suite with its updated
  no-PDF expectation (8/8 passed). The other three failures reproduced on
  unchanged E5: two categorized-service fixtures and a ticket acceptance
  assertion that matches the current date in an unrelated `createdAt` field.
  The retirement integration tests cover both worksheet aliases, all
  retired writes, customer/ticket/company scope, linked and legacy preview
  paths, byte-identical stored downloads, authorized whole-proposal Delete,
  and worksheet snapshot retention.
- CRM: **364 passed / 382**. All 18 failures reproduced by test name on
  unchanged E5 (estimate settings, board, ticket estimate panel, rail and
  customer service fixtures). The archive list and detail tests verify the
  original URLs, English and Spanish copy, linked/stored views, and cancel
  versus confirmed deletion.
- Shared library typecheck passed. API diagnostics fell from **694 to 678**;
  CRM remained **186 to 186**. Comparing diagnostic messages and file paths
  found no new errors. The existing package typechecks are still not green.
- Required PostgreSQL extensions and development Drizzle schema checks passed.
