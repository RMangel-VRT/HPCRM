5 planner crews and 2 active campaign teams would stay unlinked.

# P3-1 production preflight and release evidence

## Read-only production inventory

Collected through authorized read-only production queries on 2026-10-12. Only names, active flags and schedule-block counts were selected; no customer data, contact details or credentials. The production company inventory contains one company. The production schema does not yet have the new crew-link columns. Existing links therefore show `—`; the dry run does not depend on unpublished columns. No production writes or publication were performed.

### High Plains Property Maintenance

Standing crews: **none** (therefore no supervisor/active rows).

| Planner crew | Active | Linked standing crew | Schedule blocks |
|---|---|---|---:|
| JOJO | true | — | 9 |
| Luciano Crew | true | — | 80 |
| Manuel Crew | true | — | 52 |
| Rolando | true | — | 22 |
| Sergio Crew | true | — | 61 |

Teams on active campaigns:

| Team | Campaign | Leader | Linked standing crew |
|---|---|---|---|
| Hugo | Branch Cleanup - May Snow 2026 | Hugo | — |
| Luciano | Branch Cleanup - May Snow 2026 | Luciano | — |

## Production dry-run proposal — no writes

For this company, there are zero active standing crews. Each of the five planner crews has zero trimmed, case-insensitive name matches; each of the two active campaign teams has zero leader-to-supervisor matches. No target can be claimed and no color/hours can be copied. The exact linker rules consequently propose **zero planner links and zero campaign links**; **five planners and two active campaign teams remain unlinked**. There are no ambiguous matches.

After publishing, create the standing crews with the correct supervisors in Settings → Crews, then set the planner and campaign links manually. Do not create standing crews or choose supervisors automatically from this inventory. This is manual setup because production currently has no standing rows; it is not a reason to broaden the automatic match rules.

**Publish gate:** review this inventory/dry-run with Randy before publishing P3-1. This task does not publish or start visits or the Scheduling page.

## Implemented slice and actual call sites

- Migrations **0044_crew_links.sql** and **0045_crew_link_initialization.sql** are additive and guarded. Existing **0043_contract_center_tables.sql** was not overwritten or renumbered. The second migration adds one nullable company initialization timestamp to preserve manual choices across API restarts; it does not add tables or alter relationships. All three crew tables remain; `schedule_blocks.crew_id` still references `maintenance_crews`.
- Nullable standing color/hours/order and nullable planner/team standing links are synchronized in the database and hand-maintained client schemas. Planner ownership is enforced by the partial unique index. Both links use `ON DELETE SET NULL`.
- `registerRoutes` calls the guarded DML-only linker after the existing scheduling/status fix-ups. No startup DDL and no dependency on the unwired startup migrations runner were introduced. **Automatic matching is one-time per company**, using a server-managed nullable initialization timestamp mirrored in both schemas. The marker and links commit in the same company-locked transaction. Successful explicit manual choices (including None) or standing-crew deletion also record initialization, so even choices made before the first matching run cannot be undone on restart. Existing initialized companies are read-only on subsequent runs. Matches are company-isolated, ambiguous/unmatched rows stay null, and reruns preserve existing links. Planner color/hours copy only into null standing values. Per-company logging uses the specification's exact summary format.
- Standing crew routes live in **crewsAndMobile.ts**: existing GET/POST/PATCH/DELETE retain their permissions. GET returns bulk-loaded planner metadata and active-campaign team counts. New **GET /api/crews/board** returns ordered active crews, supervisor names and palette/8-hour fallbacks for admin, office and field_manager; ordinary field users are denied. New **POST /api/crews/order** saves a full company-scoped order atomically.
- Planner **POST/PATCH /api/maintenance-crews** and campaign **POST /api/campaigns/:id/crews**, **PATCH /api/campaigns/:id/crews/:crewId** are in the main **routes.ts**, not a campaign-team routes file. Planner PATCH whitelists mutable schema fields and ignores company/id/timestamps/unknown fields. Campaign create/update persist the optional standing selection. PATCH uses `pickProvided`, so defaults do not overwrite omitted fields.
- All new link mutations and the linker take a company-scoped transaction lock. Cross-company selections return 400, competing planner ownership returns 409, explicit null clears a link, and transaction rollback prevents partial edits/creates. Deleting a standing crew clears the new links while retaining planner crews and their schedule blocks.
- **Settings → Crews / CrewsAdmin.tsx** adds swatches, hours/day, planner metadata, color/hours/planner form fields, None selection, persisted Up/Down and the exact actionable active-unlinked warning. Its action opens the first unmatched planner's linking workflow, preferring a matching unlinked standing crew rather than choosing an unrelated crew.
- The signed-in check found an existing malformed `ANY` array expression in the supervisor-picker read. It was replaced with the equivalent company-scoped `inArray` predicate without changing eligible roles or permissions, and a real-database regression test covers the picker.
- **WeeklySchedulerPage.tsx** shows the link read-only in both existing planner crew editors. There is no second planner linking editor. **ExtraBillableCampaignView.tsx / CrewDialog** is the actual campaign team form; it offers Standing crew/None and initializes edits from the team's current auto-linked value. **CampaignDetail.tsx** remains its unchanged caller.
- No visits, visit API, Scheduling board UI, Needs scheduling producer, phone-app changes, role-promotion changes, ticket seeding changes, campaign billing changes or schedule-block transfers were included.

## Verified results — separate from existing failures

| Check | Baseline | P3-1 result |
|---|---|---|
| API Vitest suite | 845 passed, 7 failed / 852 tests; 48 passed, 2 failed files | 875 passed, **same 7 failed** / 882 tests; 51 passed, 2 failed files |
| CRM Vitest suite | 60 passed, 7 failed / 67 tests; 12 passed, 2 failed files | 68 passed, **same 7 failed** / 75 tests; 13 passed, 2 failed files |
| API typecheck diagnostics | 739 | **734**, zero new diagnostics |
| CRM typecheck diagnostics | 225 | **224**, zero new diagnostics |
| Database declaration build | — | Pass |
| Development schema drift | — | Pass: schema in sync |
| Migration rerun | — | Pass: 0 applied, 53 already up-to-date after both additive migrations |
| API date/mobile/photo regressions, UTC | — | 54 passed / 3 files |
| API date/mobile/photo regressions, America/Denver | — | 54 passed / 3 files |
| CRM scheduling date regressions, UTC | — | 9 passed / 2 files |
| CRM scheduling date regressions, America/Denver | — | 9 passed / 2 files |

**All 30 new API tests and 8 new CRM tests pass.** Coverage includes unique/ambiguous/inactive/company-isolated matching, guarded schema absence (including the initialization column), existing-link preservation, idempotency, null-only copying, create/replace/clear, cross-company 400, ownership 409, concurrent rollback, unknown/immutable PATCH protection, nullable campaign POST/PATCH, read metadata, active-campaign counts, board permissions/order/fallbacks, atomic row order, SET NULL deletion with a real planner schedule block retained, eligible supervisors, exact warning counts, rendered controls and client form payload preservation. Regression tests auto-link both a planner and campaign team, clear them via their real APIs, rerun startup matching twice, and confirm that both remain null and the initialization timestamp remains unchanged. Another case verifies manual None before the first automatic run.

The API integration suite uses isolated disposable companies in the development database and cleans them up. It mounts the actual main-module planner/campaign handlers without running unrelated bootstrap fix-ups. No test touches production.

**Existing failures, not P3-1 regressions:**

- API: six `mailboxAccounts.oauthReconnect.test.ts` failures and one `plantEnrichment.test.ts` partial-failure test.
- CRM: two `useRowSelection.test.ts` failures and five `useTabParam.test.ts` failures.
- Global typechecks still exit nonzero because of existing diagnostics; they are not reported as clean passes. An unchanged-source snapshot produced the historical 739 API / 225 CRM baseline. Diagnostics were compared by file, error code and source-mapped line after edits: none are new. Four existing API return-path diagnostics and the stub's existing partial-index diagnostic no longer occur.
- The first heavily contended API run also had seven timeout failures, for 14 failures in total. The unchanged-source controlled rerun with a 20-second test timeout established the actual seven functional baseline failures, matching the attachment. The final run has those same seven, with no new failures.
- A workspace restart interrupted one final verification run. Those unfinished outputs were discarded, the services restored, and final checks repeated with logs saved under ignored `generated-artifacts/p3-1-validation/`. The development preview returns HTTP 200; anonymous board reads return 401. API/CRM services build and start cleanly with the guarded linker.
- The completion schema check found the archived baseline source's extra Drizzle config, not database column/index drift. That generated config was removed; only the canonical active config remains, and both required-extension and schema-drift checks pass. Completion review also identified the clear-then-restart issue; the additive initialization marker and the regression cases above resolve it.

### Signed-in interface evidence

The signed-in pass confirmed the exact warning count of two active unlinked planners (excluding an inactive planner) and that clicking it opens New crew with the first unmatched planner selected. Color, six hours/day and crew name were entered in the form. The initial navigation attempt was blocked by the workspace restart/HTTP 502 before any records were created.

The resumed pass found the supervisor-picker SQL error described above, preventing submission. That error is fixed; a real-database request to the actual endpoint now returns 200 with the active field_manager supervisor, and all 18 API integration cases pass. The UI fields, warning and payload preservation have eight passing Vitest checks; persistence/clearing/order on the real mutation handlers are covered by the database-backed tests. The complete create/reload/campaign browser journey was **not** completed and is **not** claimed as passing. No second end-to-end pass was started after this confident query fix. The tester logged out and removed its isolated company/users/planners/campaign, verifying no test fixtures remained.

## Changed files

- `.migration-backup/migrations/0044_crew_links.sql`
- `.migration-backup/migrations/0045_crew_link_initialization.sql`
- `lib/db/src/schema/schema.ts`
- `artifacts/highplains-crm/src/shared/schema.ts`
- `artifacts/highplains-crm/src/shared/drizzle-stub.ts`
- `artifacts/api-server/src/lib/crewMatching.ts`
- `artifacts/api-server/src/lib/crewLinks.ts`
- `artifacts/api-server/src/lib/linkCrews.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/storage.ts`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/api-server/src/lib/crewMatching.test.ts`
- `artifacts/api-server/src/lib/linkCrews.guard.test.ts`
- `artifacts/api-server/src/routes/crewLinks.integration.test.ts`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.links.test.tsx`
- `.gitignore` / `.replitignore` exclude generated validation outputs.
- `docs/p3-1-release-report.md` and the project memory note record release evidence and the enduring crew-table rollout boundary.

## P3-1 publish-readiness result

Schema/API/unit/regression checks meet the **no-new-failures/no-new-diagnostics** requirement; unrelated baseline failures remain clearly identified. Production inventory and the exact-rule dry-run are complete and read-only. Review this names-only proposal before publishing. Production linking has not been executed and the app has not been published by this task. Do not begin P3-2/P3-3 until this slice has merged and its publish gate has cleared.
