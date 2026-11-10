Removing 16 files and 230 code sites; production planner rows to be dropped: schedule_blocks 224, weekly_schedule_templates 7, maintenance_visit_configs 45, maintenance_crews 5, route_import_decisions 0 (281 total); imported route stops: 0.
- drop 5 tables: `route_import_decisions`, `schedule_blocks`, `maintenance_visit_configs`, `weekly_schedule_templates`, `maintenance_crews`;
- drop 2 columns: `route_stops.imported_from_block_id`, `companies.routes_imported_at`.

**Randy: if Publish proposes any other table or column drop, stop and do not publish. Randy, not this task, checks and publishes. Nothing was published and no production schema or data writes were performed.**

# R3 retirement evidence — November 5, 2026

## Production evidence and changed safety instructions

The production inventory above is **Randy-run, Nov 5, 2026, production Database pane, read-only**, supplied in the resume instruction. Randy also verified:

- `route_stops`: 20 total; imported provenance: **0**.
- Foreign keys from outside the five-table retirement set into that set: **0**.
- CSV backups **explicitly waived by Randy**. Backup paths/counts: **not applicable; no CSVs were exported, and no exporter or invocation was added**.

No production access was attempted after that instruction. Complete live dev/production table equality was **not independently checked**: Randy instructed that the post-migration dev list be supplied for his Publish comparison instead. The complete list is below. This is a user-directed execution change, not a claim that the production lists were compared by the agent.

## Inventory and counting convention

Inventory used current tracked source, not old release reports: CRM, API, mobile, canonical and client schemas, libraries, scripts/reset utilities, OpenAPI/generated clients, current guidance and memory. The initial retirement-pattern inventory is `generated-artifacts/r3/inventory.txt`.

- **16 files** means tracked files deleted in this change, including obsolete tests and one obsolete memory note.
- **230 code sites** means distinct original source/test `file:line` sites matching the retirement identifier set that were removed from **surviving** files under `artifacts/`, `lib/`, or `scripts/`. Lines in deleted files are not counted twice. Multiple identifiers on one original line count once. Other edited lines are not claimed as additional sites.
- The identifier set is the exact residual-search pattern below plus removed provenance, import-marker, crew-projection/linking and helper identifiers. The enumerated original sites are supplied in the downloadable evidence appendix (`removed-code-sites.txt`); use `git diff --unified=0` against the pre-R3 source to reproduce them.

### Deleted files

```text
.agents/memory/route-import-approval-boundaries.md
artifacts/api-server/src/lib/importPlannerRoutes.ts
artifacts/api-server/src/lib/plannerFreeze.ts
artifacts/api-server/src/lib/plannerRouteSelection.test.ts
artifacts/api-server/src/lib/plannerSourceFingerprint.ts
artifacts/api-server/src/lib/routeEngine.integration.test.ts
artifacts/api-server/src/lib/routeImportApproval.ts
artifacts/api-server/src/lib/routeProductionAudit.ts
artifacts/api-server/src/lib/routesR2.integration.test.ts
artifacts/highplains-crm/src/components/PlannerCrewPicker.tsx
artifacts/highplains-crm/src/components/routes/PlannerReplacedBanner.tsx
artifacts/highplains-crm/src/pages/PlannerFreeze.rendered.test.tsx
artifacts/highplains-crm/src/pages/SchedulePage.tsx
artifacts/highplains-crm/src/pages/ScheduleViewer.tsx
artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx
scripts/src/routes-production-audit.sql
```

### Removed or switched code sites

- `routes/routes.ts`: all old crew/template/config/block endpoints, import/readiness bootstrap, freeze middleware/error handling. Reset/delete SQL and storage interface/implementations were removed from `storage.ts`.
- `routes/routeStops.ts`: decisions/readiness routes, provenance and import-status projections, marker-dependent access. Routes authorization is now distinct from visit-board authorization; irrigation managers get the former only. Existing create/move/reorder/fill/slide algorithms were not redesigned.
- `routeSchema.ts`: surviving route/visit readiness checks no longer require the retired columns. `routeReporting.ts`: retired banner constant removed.
- `crewsAndMobile.ts`, `crewProjection.ts`, `crewLinks.ts`, `crewMatching.ts`, `linkCrews.ts`: only the obsolete crew projection/linking side was removed. Campaign links, company scoping, initialization marker, explicit None persistence, unique team-per-campaign behavior, and active-team deletion blockers remain. `/api/routes/crews` has Routes roles and a company-change guard; `/api/crews/board` keeps its prior roles.
- Both schema copies: all five tables, their insert schemas/types, the two columns and unused weekday type removed. Route inputs are strict: undeclared fields are rejected on create/PATCH and provenance is not returned.
- `App.tsx`, navigation/sidebar and command band: no legacy entry; both saved URLs redirect to Routes, preserving query strings. Irrigation gets Routes, not Scheduling.
- `SchedulePreview.tsx`: **the original wrapper contained both legacy and route-backed branches. R3 retains only the already-existing `RouteSchedulePreview` component**, now reading `/api/routes/preview`, with the same non-import stop fields and broad authenticated company-scoped read access. It is not a replacement preview invented in R3.
- `CustomerSchedulingSection.tsx`: `/api/customers/:id/route-summary` only, service/crew/weekday/cadence/minutes, exact empty state “Not on a route yet,” management link only for Routes managers. No fallback editor.
- `CrewsAdmin.tsx`, `CrewSetupCard.tsx`: no obsolete column, field, payload or setup rows. Campaign-only setup remains.
- `use-routes.ts`, `lib/routes.ts`, `RoutesPage.tsx`: no import decisions, readiness/marker requests or banner; retained route queries and mutation invalidation.
- English/Spanish: exclusively used keys deleted. `schedule.templateName` and `schedule.searchProperties` intentionally remain: current Settings and Snow screens still use them.
- OpenAPI and generated clients had **no legacy planner contracts in current source at baseline**. Verified absent before/after; existing codegen ran successfully and generated no tracked diff. No hand-edited generated client changes.
- Current ownership map and guidance updated; obsolete memory removed/replaced; the three specified reports have the exact cancellation banner. Historical migration filenames and contents were not changed. The ownership audit is explicitly marked historical.

### Mobile and service-month inventory

No direct retired endpoint/table/provenance consumers were found in the mobile product. Its auth/Today/properties/crew consumers still use the mobile API and standing crews; shared generated crew consumers were checked. No mobile code was changed.

Settings mowing/cleanup service months remain where they were. Future ownership question only: should those company defaults remain Settings-owned once all recurring demand comes from Contract Center? R3 does not move or reinterpret them.

## Development database proof

Only `0069_retire_maintenance_planner.sql` was pending before execution; the existing migration runner reported **1 applied, 0 baselined, 80 already up-to-date**. All older filenames were retained.

The new migration has exactly the seven authorized guarded statements, in the specified dependency order, with **no CASCADE** and no route-stop data write.

Before writing it, the dev foreign-key catalog contained only these internal references into the retirement set:

```text
maintenance_visit_configs.preferred_crew_id -> maintenance_crews
schedule_blocks.crew_id -> maintenance_crews
schedule_blocks.template_id -> weekly_schedule_templates
schedule_blocks.visit_config_id -> maintenance_visit_configs
```

The independent production external-FK result is Randy's zero count above.

Full dev table and column catalogs were captured before/after. Results:

- Tables: **139 before, 134 after**, including the system metadata table.
- Removed tables: exactly the five authorized names; added tables: **0**.
- Removed columns on surviving tables: exactly the two authorized columns.
- Added columns: **0**; changed definitions of surviving columns: **0**.
- Existing dev stops: **7 before and 7 after**.
- Content hash (ordered JSON, excluding only the intentionally removed provenance column before migration): **`19e53f5ca678bb39a0bcb500d3346ede` before and after**. No existing stop was imported, recreated, renumbered or rewritten.
- Disposable test/browser data was created only in separate companies and cleaned up.
- `check-required-extensions`: passed (`pg_trgm` present).
- `check-schema-drift`: passed before retirement and after migration/final schema build.

Metadata evidence, with no customer row exports: `dev-tables-before.json`, `dev-safety-before.json`, `dev-safety-after.json`, `migration.log`, `extensions.log`, `drift.log` under the ignored `generated-artifacts/r3/` directory.

### Complete post-migration dev table list for Randy

There are 134 tables: 133 `public`, one `_system`. Do not confuse system/migration metadata with newly proposed application schema drops.

```text
_system.replit_database_migrations_v1
public._applied_sql_migrations
public._chem_notif_legacy_cleanup
public._migration_audit_log
public.agreement_terms
public.agreements
public.campaign_checklist_audit_log
public.campaign_checklist_tasks
public.campaign_crew_members
public.campaign_crews
public.campaign_item_task_completions
public.campaign_items
public.campaigns
public.chemical_notification_templates
public.chemical_products
public.communication_audit_log
public.communication_automation_rules
public.communication_links
public.communication_templates
public.communication_threads
public.communications
public.companies
public.company_document_settings
public.company_users
public.contacts
public.contract_builder_documents
public.contract_builder_sections
public.contract_builder_variables
public.contract_documents
public.contract_masters
public.contract_monthly_amounts
public.contract_services
public.contract_status_history
public.contract_templates
public.contracts
public.crew_worksheet_number_counters
public.crew_worksheet_photos
public.crew_worksheet_versions
public.crew_worksheets
public.crews
public.customer_map_documents
public.customer_map_layers
public.customer_rate_sheets
public.customer_service_plans
public.customers
public.email_logs
public.email_rules
public.email_templates
public.equipment
public.equipment_files
public.equipment_ticket_status_history
public.equipment_tickets
public.estimate_lines
public.estimate_number_counters
public.estimate_quick_items
public.estimate_sections
public.estimate_versions
public.estimates
public.flag_photos
public.flags
public.hardscape_catalog_items
public.invoice_events
public.invoice_lines
public.invoice_number_sequences
public.invoice_qbo_pushes
public.invoice_sends
public.invoices
public.irrigation_catalog_items
public.irrigation_sync_runs
public.mailbox_accounts
public.mailbox_backfill_runs
public.mailbox_sync_runs
public.mobile_auth_tokens
public.notes
public.plant_catalog_items
public.plant_enrichment
public.plant_palette_items
public.plant_palettes
public.plant_sync_runs
public.property_management_companies
public.property_manager_emails
public.property_manager_phones
public.property_managers
public.property_site_notes
public.proposal_files
public.proposal_plant_items
public.proposal_versions
public.proposals
public.qbo_connections
public.qbo_customer_cache
public.qbo_customer_reviews
public.qbo_item_cache
public.qbo_umbrella_items
public.rate_card_items
public.recent_property_views
public.route_stops
public.scope_preset_lines
public.scope_presets
public.seasons
public.service_plan_template_items
public.service_plan_templates
public.service_type_template_items
public.service_type_templates
public.session
public.settings
public.sheet_templates
public.snow_event_attachments
public.snow_event_property_impacts
public.snow_events
public.style_presets
public.term_billing_months
public.term_documents
public.term_legacy_sources
public.term_rates
public.term_scope_lines
public.term_status_history
public.ticket_comment_mentions
public.ticket_comments
public.ticket_field_values
public.ticket_links
public.ticket_notes
public.ticket_notifications
public.ticket_photos
public.ticket_sources
public.ticket_status_history
public.ticket_type_fields
public.ticket_type_statuses
public.ticket_types
public.ticket_work_items
public.tickets
public.unsorted_emails
public.users
public.visits
public.visual_scope_sheets
```

## Verification and baseline deltas

Logs are under `generated-artifacts/r3/`. Existing artifact-local Vitest launchers were used, not a different root runner.

### Baseline

- `pnpm run typecheck:libs`: passed.
- `pnpm --filter @workspace/api-server run typecheck`: **716 diagnostics**.
- `pnpm --filter @workspace/highplains-crm run typecheck`: **223 diagnostics**.
- UTC API broad selection `vitest run route crew visit scheduling backfill`: **53 files passed, 2 failed, 2 skipped; 1471 tests passed, 12 failed, 45 skipped**. Unrelated pre-existing failures: six Contract Center copy tests (mock transaction missing `execute`) and six mailbox OAuth reconnect tests (invalid JSON fixture).
- UTC CRM broad selection `vitest run --config vitest.config.ts routes Routes Crew crew Scheduling scheduling PlannerFreeze navConfig`: **14 files passed, 1 failed; 212 tests passed, 2 failed**. Both failures were in unchanged `CrewAssignmentBoard.test.ts`: cross-column shift selection and pruning `lastClicked`.

### Changed and retained functionality

- API Routes/P3/crew selection: 15 suites, **214 tests covered with passing results in both UTC and America/Denver**, combining the primary 213-test run with focused corrections and the additional strict-input test. Primary runs had one campaign harness failure; the missing standing-crew import/dependency was restored and all four campaign integration tests passed in both zones. The strict-input suite then passed all 24 tests in each zone. No failing changed test is hidden by an aggregate exit status.
- CRM Routes/Scheduling/navigation/CrewsAdmin/summary/preview: **15 suites, 226 tests pass**. Denver passed as a complete run. UTC initially had a missing jsdom directive in the new 13-test read-surface suite; after fixing the harness, all 13 passed. The other 213 tests had already passed. No changed test remains failing.
- The unchanged generic Crew selection suite was also run explicitly under **both** zones: **2 failures and 15 passes** in the combined crew selection, exactly the two baseline failures above. Therefore the entire repository is **not** claimed all-green. Those unrelated reducer expectations were not changed merely to satisfy R3.
- New manual-stop fixtures exercise all ten roles, auth/company boundaries, readiness without retired markers, preview/summary shapes, create/move/reorder, invalid and duplicate requests, contract bounds/month holes, fill idempotency and concurrency, occurrence/history retention, both rain-slide modes, and rollback. Retained P3 visit and crew suites cover Scheduling route blocks/visit behavior.
- Campaign tests cover projected standing identity, POST/PATCH ownership and uniqueness, frozen identity fields, changing/clearing links, startup matching and repeated startup preserving None, and active-campaign crew deletion blockers. Matching and schema-readiness guard tests no longer require retired fixtures.
- New summary/preview rendered tests cover all ten roles, summary-only requests, no input controls, exact empty state, error display and existing preview endpoint/fields.
- Both saved URL declarations/query-preserving redirects and role permission boundaries pass rendered/source regression tests.

### Types, generated contracts and runtime

- Final API typecheck: **697 diagnostics, down 19**. CRM: **220, down 3**.
- Diagnostics were compared by original source site and TS code using unchanged-line mapping, not raw moved line numbers or nondeterministic printed union order: **0 new diagnostic source sites** in either artifact. See `typecheck-delta.txt`. Existing diagnostics are not claimed fixed.
- `pnpm --filter @workspace/api-spec run codegen`: passed; libraries built; no legacy generated contracts and no generated tracked changes.
- API production build and CRM dev server start successfully. An initial API restart overlapped P3's intentionally incomplete disposable workflow fixtures and hit the existing boot safety guard; it restarted successfully after fixture cleanup. No guard was disabled. Existing unrelated synthetic QBO test-token warnings were observed; no production troubleshooting was attempted.
- Vite-transformed `App`, sidebar, customer summary, CrewsAdmin, RoutesPage and route preview modules all returned **200**, avoiding reliance on TypeScript alone.
- Actual running dev HTTP requests returned **404** for old maintenance crew/config, schedule template/block, readiness/preview and decisions endpoints. No handlers remain. See `removed-endpoints.log`.
- Signed-in browser: saved bookmark to Routes, route minutes saved/reloaded, customer route-only summary, and Crews column removal verified. Irrigation Routes editing and `/api/routes/crews` 200 verified; `/api/visits` and `/api/crews/board` remained 403, Scheduling navigation and calendar link absent.
- Browser report's second “legacy” failure actually tested `/dashboard/scheduling`, which is the **retained protected visit board**, not the retired `/dashboard/schedule`. Its denial is expected. Both actual retired URL declarations passed regression tests; no permission was broadened to make that mistaken check pass.
- A final unauthenticated `/login` screenshot request timed out while taking the image. Signed-in browser screenshots of the saved weekly stop, summary, crew settings and irrigation drawer were returned successfully by the journey above; the screenshot timeout is not represented as a passing capture.

## Residual search and historical exceptions

Exact requested command:

```sh
git grep -i -E "maintenance_crews|maintenanceCrews|schedule_blocks|scheduleBlocks|weekly_schedule|maintenance_visit_config|maintenance-config|schedule-templates|route_import|PLANNER_REPLACED|importPlannerRoutes|/api/planner|WeeklyScheduler|ScheduleViewer|SchedulePage"
```

The verbatim output is pasted into the downloadable complete report's **Exact residual output** appendix; its original capture is `generated-artifacts/r3/residual-exact.txt`. It contained **98 historical/removal-documentation lines** before adding this report. This new report necessarily adds its own inventory/removal evidence matches. The new migration was untracked when `git grep` ran; it was additionally checked directly and contains the required seven authorized removals.

The strict expectation of an empty whole-repository search except old docs/new migration is **not literally met** because preserving historical migrations is also required. Existing migration matches are in `0000_needy_ben_grimm.sql`, `0044_crew_links.sql`, `0063_route_import_decisions.sql`; expanded provenance search also finds `0045_crew_link_initialization.sql` and `0061_route_stops.sql`. They were **not** deleted or renamed to conceal matches.

Historical document matches are the ownership audit, dated crew/P3 reports, Scheduling design and master-design snapshots, `R2-evidence.json`, and the three preserved Routes/R2/named-import reports. The current ownership map includes named Removed entries as requested. These are not live contracts or instructions to run an import. Uploaded historical specifications were retained.

The same retired-identifier search across live `artifacts/`, `lib/`, `scripts/` source produced **no matches**, including generated contracts. The expanded output is pasted in the complete report too. Its surviving live crew initialization marker/index matches are **intentional campaign behavior**, not missed retirement dependencies. Current memory/guidance retains only the permanent no-reintroduction rule, not import instructions.

## Remaining exceptions and handoff

No production backup or independent live production comparison is claimed: Randy waived the former and took responsibility for the latter. No production mutation or publication occurred.

The unrelated baseline typecheck/test failures above remain. The changed R3 tests pass; the report does not claim a clean whole-repository test/typecheck run.

Randy must compare the complete dev list above with production and the exact seven Publish removals at the top. **If any other table or column drop appears, stop and do not publish.**
