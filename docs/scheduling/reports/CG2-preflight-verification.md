# CG2 pre-flight verification

Date: 2026-11-10.

**Historical result: BLOCKED at initial pre-flight.** Subsequently resolved by
integrating CG1 and obtaining explicit owner authorization to proceed from the
reviewed requirements. See `CG2-verification.md` for the completed implementation
and final evidence; this file preserves the original stop/report history.

## Subsequent prerequisite update

After the owner confirmed GitHub contained the merge, a new fetch obtained the
CG1 implementation. It has now been merged into this task's checkout. The
status-log conflict was resolved by preserving both handoffs, and CG1's ledger
state was updated to `merged` to match the actual integration.

The CG1 migration `0074_campaign_service_timing.sql`, both schema updates,
catalog metadata and `campaignServices()`, registered service-program routes,
Service timing page and `docs/slices/campaigns/reports/CG1-verification.md`
are now available. The earlier missing-code findings below are historical,
not current failures.

The remaining source-revision gate is unchanged: neither the CG rules nor CG2
specification was revised by the CG1 merge. CG1's producer handoff explicitly
limits its source waiver to CG1 and requires a revised count/status/gap contract
for CG2. Implementation has not begun under an assumed waiver.

## Governing sources

Read the current repository versions of `docs/slices/README.md`,
`docs/slices/campaigns/00-RULES-CG.md`,
`docs/slices/campaigns/STATUS.md`,
`docs/slices/campaigns/CG2-demand-engine-and-generate.md`,
`docs/scheduling/Master-schedule-design.md`, and the slice-pack workflow memory.
The existing `docs/slices/campaigns/CG1-audit.md` explicitly says CG1 was
audited, not implemented. No task label was treated as proof of a merge.

The assignment requires the replacement CG1 implementation (task #912) to
have merged, with verification available. This checkout cannot establish that
prerequisite: the ledger and actual source both show the required handoff
is absent. A subsequent project status update also reports task #912 as
`IN_PROGRESS`, blocked by `WAITING_FOR_INPUT`, so it has not satisfied the
required merged prerequisite.

## Every CG2 pre-flight check

| Required prerequisite | Result | Repository evidence |
| --- | --- | --- |
| Ledger records CG1 merged and names its migration | FAIL | CG1 is `not started`; no CG1 implementation/migration handoff is recorded. |
| `service_programs` and Zod validation in both schema copies | FAIL | Neither `lib/db/src/schema/schema.ts` nor `artifacts/highplains-crm/src/shared/schema.ts` defines the table or service-program validation. |
| `campaignServices()` and scheduling metadata on catalog entries | FAIL | Neither server nor CRM `src/shared/contractCatalog.ts` contains `campaignServices` or `scheduling`. |
| Campaign generation identity and visit link columns | FAIL | Both campaign table definitions lack `source`, `service_key`, `round_month`, `round_seq`; both visit table definitions lack `campaign_item_id`. Checklist tables' existing same-named columns do not satisfy the visit prerequisite. |
| `GET /api/service-programs` and Settings → Service timing | FAIL | No `service-programs` or `Service timing` matches in API/CRM TypeScript sources. |
| No existing `campaignDemand`, `reconcileCampaigns`, `campaign_generation_years` | PASS (source only) | No matches in API/CRM TypeScript sources or migration SQL. No database-state assertion is made. |

Checks used repository text searches across API/CRM sources, schema copies,
migration SQL and scheduling reports, followed by table-specific inspection
of both schema files. No implementation verification report for CG1 was found;
the only CG1-named documents are its specification and audit.

## Reviewed revision gate

The current rules and CG2 specification are not the reviewed revision required
by this assignment:

- `up_for_renewal` eligibility and priority are absent. The current CG2 text
  only includes `signed`, `active`, `renewed`, and `sent`.
- Explicit quantity zero meaning nothing owed is not specified.
- `invalid_count` and `duplicate_lines` gaps are absent; the demand gap union
  only includes `no_count`, `no_timing`, and `count_mismatch`.
- All-zero months **are** treated as unstated by the existing “any value > 0”
  branch. This requirement is already reflected, but does not resolve the
  other mismatches.

No attachment was substituted for the repository pack and no user-controlled
specification was edited.

## Disposition and exact integration handoff

- Stopped before demand, reconciliation, migration, API or UI implementation.
- New migrations, tables, columns, exported functions and endpoints: **none**.
- Updated only the status log and this verification report.
- No database connections/queries, data writes, Generate runs, backfills,
  migration execution, publication, workflow changes or browser tests.
- Fixture, database, authorization, idempotency and browser verification were
  not run: their implementation prerequisites failed. This report is not a
  passing CG2 implementation handoff and does not authorize CG3.

## Required next action

The owner must supply the reviewed repository pack and merge the replacement
CG1 implementation with its actual verification and exact ledger handoff.
Refresh this task's checkout to include those changes, then rerun the complete
CG2 pre-flight before starting implementation. Do not repair CG1 within CG2.
