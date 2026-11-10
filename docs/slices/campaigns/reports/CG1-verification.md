# CG1 verification and CG2 producer handoff

Date: 2026-11-10. Scope: CG1 only; development implementation, not publication.

## Source and pre-flight

Read repository rules, status, CG1 and its audit, ownership map and master schedule design. The original revision gate failed because the repository CG1 still contained the older contract (24-entry prose and incomplete safety boundaries). Work stopped and the owner then explicitly authorized proceeding from the task at hand. No attached specification was substituted, and no owner-controlled slice file was changed. This authorization is a deviation, not a claim that repository Revision 2 exists.

The remaining pre-flight passed:

- No CG slice was merged in the ledger; no equivalent implementation was present.
- Latest historical migration was `0073_customer_documents.sql`; `0074` was free.
- Development SELECTs found no `service_programs`, `campaigns.source`, or `visits.campaign_item_id`.
- `coverageResolver` exists; Routes accepts exactly mowing, pet_station, winter_visits, irrigation_inspection.
- Production **SELECT only** returned zero `source_type = 'campaign_item'` visits before development migration. No production credentials or customer identities were copied into this report.
- Development SELECT found zero campaign-item/campaign company mismatches before adding composite foreign keys.

## Verification

- Strict dev migration command: `pnpm --filter @workspace/scripts run migrate` applied `0074_campaign_service_timing.sql` without baseline mode.
- `check-schema-drift` and `check-required-extensions` passed.
- OpenAPI visit response was updated and `pnpm --filter @workspace/api-spec run codegen` passed, including composite library typecheck.
- Targeted tests:
  - `src/shared/contractCatalog.test.ts`: 25-entry classification, exact campaign/Routes sets, SQL key parity, byte-identical copies and existing catalog behavior.
  - `src/services/servicePrograms.test.ts`: shared program validation and raw usage buckets, no count inference or duplicate summation.
  - `src/routes/servicePrograms.integration.test.ts`: 10 real-PostgreSQL/API tests, including five eligible statuses and end-date inclusivity, auth/company isolation, eight concurrent standard switches, clear-with-retention, used-row deletion conflict, malformed SQL arrays, generated shape/membership/delete guards, projection identity, bidirectional visit link, same-company FK, done uniqueness, generic visit write rejection and linked-history deletion protection.
  - Existing `src/routes/visits.integration.test.ts`: 68 tests passed after supplying the existing `accessRole` in its stale auth fixture and updating its source-identity write expectation to the new explicit rejection.
  - Existing `src/lib/visitSync.test.ts`: 21 tests passed.
  - `src/pages/ServiceTiming.rendered.test.tsx` and `src/components/nav/settingsNav.test.ts`: 15 passed, covering shared standard editor, validation, save body/header, refetch retention, conflict messages, clearing, office read-only, retry, company reset, and retaining the saved standard while a replacement count is only an unsaved choice.
- API and web workflows restarted successfully; `/api/healthz` and Vite's transformed Service timing module returned 200. Startup also logs unrelated pre-existing QuickBooks token failures from old development fixtures; CG1 does not use that integration.
- API leaf typecheck is **not green**: the repository already has hundreds of errors. An in-memory HEAD-source comparison (no source stashing) found API 695 errors before and after, CRM 210 before and after. Two existing storage `billingStatus` errors print a different expanded object-property count after additive schema changes; their cause is unchanged. No new CG1-file errors remain. This is not a claim that the full workspace typecheck passed.
- Real browser: admin saved chemical ×3 (Mar/Jun/Sep), reloaded, selected/saved a standard, switched it to ×2, reloaded, cleared the standard while retaining timing, and deleted the unused non-standard row through confirmation. One twelve-month editor appeared per count. Invalid totals/monthly values disabled Save.
- Unsaved navigation showed the discard/stay dialog and retained the draft when staying. Switching the fixture session to company B and reloading showed no company-A saved rows or drafts; its GET carried the B `X-Company-Id`. Returning to A restored only A's persisted timing. The delayed-write race was not independently simulated in the browser; component and API tests cover scope binding.
- Office browser: the Scheduling rail destination was visible, values were readable, all count/month/standard controls were disabled, and Save/Delete/Add/Clear actions were absent. Direct office PUT returned 403; GET returned 200 and preserved the saved row.
- The initial 768px browser check found viewport-breakpoint columns compressed by the two sidebars. Fixed the grid to `repeat(auto-fit,minmax(2.75rem,1fr))` and made the Add count footer wrap. A targeted screenshot-only recheck of this failure passed at 768×900 with both sidebar columns reserved: every month input measured **52px**, labels did not overlap, the footer wrapped, and document width equaled viewport width (768px). No end-to-end journey was repeated.
- Disposable browser users and both fixture companies (including their saved test programs) were removed after verification. The migration rerun test passed after explicitly aligning the visit FK constraint name with Drizzle. No real-company program defaults were seeded.

## Resolved audit decisions

The exact API fields and exports are inventoried in `../STATUS.md`.

- Program standards are company fallback defaults, not property scope. Both validation callers use one driver-free pure factory with their byte-identical catalog, never two hand-maintained validators.
- Usage is raw eligible seasons, not governing monthly demand. It deliberately does not alter `coverageResolver` defaults or Routes' status eligibility.
- Usage bucket priority is duplicate, invalid count/spread, explicit zero, unstated count, valid stated count. An all-zero valid twelve-month spread is absent. A positive spread inconsistent with a stated count is invalid. Stated months allow nonnegative integers without the program's monthly-four cap; CG2 must not replace a valid stated spread with defaults.
- Rows can be deleted only when non-standard and no eligible valid-count season uses their count. Clearing a standard retains its timing row. A missing-count season with stated months still needs a standard count or a count gap; its stated-month total is never used to infer a count.
- Generated shape PATCH rejects any supplied locked field, including unchanged resubmission and snake-case aliases, before the legacy allow-list discards it. Generated campaign DELETE and season reassignment are blocked. Manual editable fields are unchanged.
- Generated items must leave `servicePlanCategory` NULL and resolve identity from the campaign. Public item routes cannot set the compatibility field on generated items. No historical manual values are changed.
- Campaign visit link is bidirectional; a non-campaign source cannot carry an item ID, and a campaign-item source requires one. Composite FKs enforce company agreement from visit to item to campaign. At most one done visit per item; a cancelled plus done visit is legal.
- Generic visit routes reject engine identity and editing/deleting/reordering campaign visits. Campaign, item and customer deletions with linked visits offer a clear conflict/archive-or-deactivate path instead of clearing the link or deleting history.
- The ownership map now records the newer chemical target/backup-date exception. The old master-design statements about pre-dating campaigns and importing the retired planner are historical, not implementation instructions.

## Exact CG2 handoff — do not implement CG2 here

1. **Repository source gate:** CG2's repository file is still old. The owner must replace it with the revised count/status/gap requirements before the successor begins; CG1's one-task waiver does not silently revise CG2. Confirm this branch is actually merged; an audit or task label alone is not predecessor evidence.
2. Import catalog metadata and `campaignServices()` from the API catalog. Import `CAMPAIGN_TERM_STATUSES`, `serviceProgramSchema`, and usage DTO contracts from `lib/db/src/serviceProgramContracts.ts`. `summarizeServiceUsage` is a statistics helper, **not** a demand or coverage resolver.
3. Read `servicePrograms` by company. Exact `(serviceKey, rounds)` timing and an optional standard on that **same row** are the only company defaults. NULL quantity uses the standard count only. Zero means zero; invalid/duplicate lines are gaps, never repaired. Do not infer a count from month totals, use `defaultQuantity/defaultMonthSpread`, legacy plans/presets, or revive an older applicable program.
4. Stated count and valid stated month spread win. A missing count with stated months still requires a standard count; validate resolved count versus spread instead of silently redistributing it. NULL/all-zero months need exact-count timing. Preserve the difference between default-count and default-timing usage.
5. Extend the existing `coverageResolver` with campaign-specific status/month options while preserving default Routes behavior. Respect own-before-parent coverage, service exclusions, company boundaries, and property-only items. No parent/branch multiplication of raw season statistics.
6. Engine-only campaign writer: use an explicit internal DB transaction, not public manual CRUD or `InsertCampaign` (which deliberately omits engine identity). Acquire `pg_advisory_xact_lock(hashtextextended('campaign-gen:<companyId>',0))` per CG rules. Insert `source='contract'`, exact catalog `serviceKey`, first-day `roundMonth`, positive `roundSeq`, matching category/subtype. Chemical => chemical/NULL; irrigation_open => irrigation/spring_turn_on; irrigation_winterization => irrigation/winterization; other campaign services => general/NULL.
7. Unique generated-round identity is `(company_id,service_key,round_month,round_seq)` where source=contract. Populate item company consistently; leave `service_plan_category` NULL. Generated membership cannot use public add/remove or campaign DELETE; these return 409. Preserve completed/skipped items, chemical progress, tickets and visits during any future engine reconciliation.
8. No CG1 visit producer exists. CG4 records done visits through its own producer on completion, setting `sourceType='campaign_item'` and `campaignItemId` together. Keep company/item/campaign agreement and linked history; use existing scheduling gate/lock order if composing with ticket work. Do not pre-date round work or duplicate chemical promised dates.
9. Item reads: nested customer history exposes `campaign.serviceKey`; flat projections expose `campaignServiceKey` plus source/month/sequence. All campaign reads expose new identity by full-row selection. Existing duplicated customer routes were not reorganized.
10. Do not treat this handoff as permission for production generation, seed programs, backfills, publishing, crew lists, Scheduling-board changes, or customer owed/done UI.
