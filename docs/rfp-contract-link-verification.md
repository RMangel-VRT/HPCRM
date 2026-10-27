# RFP contract lifecycle link — development verification

Verified October 27, 2026. No production publication, imports, historical linking, or production writes were performed.

## Delivered behavior

- The only persisted relationship is nullable `agreement_terms.bid_ticket_id`, indexed and referencing `tickets(id) ON DELETE SET NULL`. Both schema representations and explicit client insert validation retain it. There is no ticket-side relationship list, new ticket-link type, uniqueness restriction, or automatic contract creation. Renewal creation does not copy the link.
- Eligible, nonfinal RFPs can create multiple ordinary draft seasons for their customer, its parent, or its direct children. Creation revalidates the scoped ticket, seeded type/status identities and customer boundary inside the transaction. Creation records attributable contract history.
- Ticket Overview retains its existing two-column layout and legacy content. The new RFP-only reference/action panel reads **exact linked seasons**, including old seasons, through the existing company-scoped `GET /api/contract-center/contracts?bidTicketId=...` endpoint. Ordinary contract-list serialization is unchanged.
- Shared ticket-status persistence handles history, scheduling metadata, final completion and due-notification dismissal. PATCH retains its existing permissions, validation, step-back cleanup, visit/scheduling behavior, billing behavior and type-specific effects. The helper preserves the ambient PATCH transaction rather than installing the routing database proxy as its own connection.
- Contract status changes recompute the aggregate transactionally. Signed takes precedence and records Awarded then Contract Executed separately, **only before Awarded**. Otherwise Sent advances an earlier RFP to Proposal Submitted. All lost/cancelled, with at least one lost, closes a nonfinal RFP. Final and at/past-Contract-Executed tickets are untouched. Locks follow the existing company gate → ticket → agreement order to prevent sibling stale aggregates.
- Bid draft/sent Lost eligibility is part of the ordinary Contract Center lifecycle, alongside renewal eligibility. Direct unsent bid Lost and Decision Lost use the same operation; there is no propagation-only validation bypass. Decision Lost leaves signed seasons untouched. Ordinary nonrenewal drafts still reject Lost.
- Bids alone requests bulk contract enrichment: one additional SQL query for each populated load, regardless of card count. Linked rows use Contract Center display-status and annual-price semantics, with T&M only for snow-only T&M seasons. Card actions are separate links, not nested ticket links. Estimates serialization, board stage definitions, navigation and dashboard counts are unchanged.

## Actual prefill mapping

The flow reuses the existing ticket-details loader, not a second RFP detail API.

| Source | New Contract destination |
|---|---|
| Ticket customer | Editable customer selection; available customer name, property-management identity/name and address initialize their ordinary fields |
| Stable `service_request_type` field | `Maintenance only` → Landscape; `Snow Removal Only` → Snow; `Maintenance & Snow Removal` → Both |
| `Custom`, absent or unrecognized service | Ordinary line default; no invented classification |
| Valid stable `desired_start_date` | Start date |
| Missing/invalid desired start | Normal `defaultDates(line)` start |
| No matching seeded contract-end or term-length field exists | Normal `defaultDates(line)` end |
| `proposal_due_date` | **Never** used as a contract end date |
| Chosen line | Shared `initialScope(line)` defaults |
| Ticket number/title | `Bid for RFP <number>: <title>` notes |

The bilingual explanatory banner identifies the RFP. Draft keys include company, user and RFP identity without changing ordinary draft keys. Restored edited drafts are not re-prefilled. Successful completion returns to the RFP; the ordinary optional document-upload recovery remains intact.

In the disposable signed-in journey, the RFP's Both service and desired start **2027-01-01** prefilled correctly; the normal end was **2027-10-31**. A Landscape payment line of **$12,000/year** retained twelve $1,000 payments. The linked Draft appeared after creation, Sent updated the RFP and Bids card, and Signed produced separate Awarded and Contract Executed history rows and removed the RFP from open Bids stages. Signed-in screenshots were captured by the browser check. Its empty fixture rate card correctly remained empty.

## Verification results and baseline

- **350 API tests passed**, across eight targeted files, including **23 disposable-database integration tests**. Coverage includes strict creation eligibility, final/custom-final statuses, parent/direct-branch boundaries, foreign-company isolation, multiple contracts, direct draft Lost allowed/accepted, ordinary draft rejection, renewal noninheritance, exact linked-season selection, `ON DELETE SET NULL`, signed precedence, before-Awarded restriction, mixed and concurrent sibling losses, single history transitions, Decision Lost signed preservation, transaction rollback, ambient PATCH transactions, completion/dismissal behavior and manual-transition guards.
- **61 frontend tests passed**, across five files: ordinary creation, RFP field mapping, real-date/default handling, company/user/RFP draft isolation, restored edits and payload/return navigation, bilingual banners/panels/cards, exact linked rows, price/T&M labels and narrow board-create eligibility.
- Live development API verification additionally exercised the **actual ticket PATCH and Decision field routes**, not only the extracted functions: unsigned manual Awarded returned the exact 409 message; ordinary title PATCH succeeded in its ambient transaction; unsent bid Lost was offered and accepted; Decision Lost changed linked draft and sent contracts to Lost; ordinary draft Lost remained rejected.
- Library declaration/typecheck build passed. Existing package-wide diagnostics remain outside this slice. Comparing HEAD and working-tree TypeScript diagnostics by file/code/message, ignoring shifted line numbers, showed **API 736 → 732**, **CRM 221 → 221**, with **zero added diagnostics**. No unrelated baseline cleanup was made.
- Required-extension check passed (`pg_trgm` present). Development migration applied successfully and schema-drift check reported in sync.
- API and CRM workflows were restarted after the code batch and served successfully. Public screenshot showed the intact login page. The browser journey had only the expected initial unauthenticated 401; no signed-in console errors.
- Disposable fixture companies/users and their fixture credential file were removed after verification.

Checks:

```sh
RFP_CONTRACT_DB_TEST=1 pnpm --filter @workspace/api-server exec vitest run \
  src/lib/rfpContracts.integration.test.ts src/lib/rfpContracts.test.ts \
  src/routes/taskBilling.test.ts src/routes/contractCenterLifecycle.test.ts \
  src/lib/contractCenterService.test.ts src/routes/ticketPatchRfbInvoice.test.ts \
  src/routes/estimatesBoard.test.ts src/shared/contractCenterSchema.test.ts

pnpm --filter @workspace/highplains-crm exec vitest run \
  src/pages/NewContractPage.rendered.test.tsx src/pages/BidsBoardPage.rendered.test.tsx \
  src/components/contracts/contractCreate.test.ts src/components/contracts/rfpContractDraft.test.ts \
  src/components/contracts/RfpContracts.rendered.test.tsx

pnpm run typecheck:libs
pnpm --filter @workspace/scripts exec tsx src/compare-rfp-typecheck-baseline.ts
pnpm --filter @workspace/scripts run check-required-extensions
pnpm --filter @workspace/scripts run check-schema-drift
```

Ignored local evidence: `generated-artifacts/tests-api-final.log`, `tests-web-final.log`, `rfp-live-api.log`, `typecheck-comparison.json`, and normalized diagnostic baseline files.

## Migration and expected Publish schema diff

**0052** was the next unused migration number; the existing `0051_one_crew_owner.sql` and all historical duplicate prefixes were left unchanged.

The entire schema delta introduced by this work is:

```sql
ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS bid_ticket_id varchar
  REFERENCES tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agreement_terms_bid_ticket_idx ON agreement_terms (bid_ticket_id);
```

This means one nullable column, its foreign-key constraint, and one nonunique index—no other tables, columns, enum changes, extensions or data backfills. This is the **expected diff attributable to this task**, not a claim that the live Publish UI was opened. Read-only production metadata inspection was unavailable because this fork lacked authenticated production-database access; an actual production-vs-development Publish preview could not be independently captured. Nothing was published.

## Changed files

Schema/migration:
- `.migration-backup/migrations/0052_term_bid_ticket.sql`
- `lib/db/src/schema/schema.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`

API implementation:
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`
- `artifacts/api-server/src/lib/contractCenterService.ts`
- `artifacts/api-server/src/lib/contractCenterStatusChange.ts`
- `artifacts/api-server/src/lib/rfpContracts.ts`
- `artifacts/api-server/src/lib/ticketStatusChange.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/bidsBoard.ts`
- `artifacts/api-server/src/routes/estimatesBoard.ts` — optional shared-loader hook only; Estimates does not opt in

API tests/development fixtures:
- `artifacts/api-server/src/lib/contractCenterService.test.ts`
- `artifacts/api-server/src/lib/rfpContracts.test.ts`
- `artifacts/api-server/src/lib/rfpContracts.integration.test.ts`
- `artifacts/api-server/src/lib/rfpContractFixture.ts`
- `artifacts/api-server/src/lib/rfpContractBrowserFixture.ts`
- `artifacts/api-server/src/routes/contractCenterLifecycle.test.ts`
- `artifacts/api-server/src/routes/taskBilling.test.ts`
- `artifacts/api-server/src/routes/estimatesBoard.test.ts`
- `artifacts/api-server/src/shared/contractCenterSchema.test.ts`

CRM implementation/translations:
- `artifacts/highplains-crm/src/components/contracts/RfpContracts.tsx`
- `artifacts/highplains-crm/src/components/contracts/newContractDraft.ts`
- `artifacts/highplains-crm/src/components/contracts/ContractBadges.tsx`
- `artifacts/highplains-crm/src/components/contracts/contractTypes.ts`
- `artifacts/highplains-crm/src/components/OpportunityBoard.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/ContractPage.tsx`
- `artifacts/highplains-crm/src/i18n/locales/en.ts`
- `artifacts/highplains-crm/src/i18n/locales/es.ts`

CRM tests:
- `artifacts/highplains-crm/src/components/contracts/RfpContracts.rendered.test.tsx`
- `artifacts/highplains-crm/src/components/contracts/rfpContractDraft.test.ts`
- `artifacts/highplains-crm/src/pages/NewContractPage.rendered.test.tsx`
- `artifacts/highplains-crm/src/pages/BidsBoardPage.rendered.test.tsx`

Validation/context:
- `scripts/src/compare-rfp-typecheck-baseline.ts`
- `.agents/memory/estimate-rfp-boundaries.md`
- `docs/rfp-contract-link-verification.md`
