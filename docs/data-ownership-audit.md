7 areas have live duplicates; 3 tables look dead; 5 copied columns have drifted.

# Data ownership audit — read-only

## Scope and observation labels

- **Production**: schema metadata observed 2026-10-19T20:51:37.22478+00:00; all schema-table counts observed **2026-10-19 20:52:08.762084+00** (label **P0**). Detailed production comparisons below have their own exact observation times, through 2026-10-19 21:06:43.202118+00. No development data is substituted for production.
- **Source**: workspace main at `0871a64fe4a64612e2767ffa64575cd3d5d26e5b`. The source helper scanned 417 application source files plus the canonical schema. This is source-tree evidence, not proof that the same revision is currently published.
- The opening duplicate-area count means **independently maintained holders on live code paths**, including structural divergence before data exists, not seven proven corrupt datasets. The areas counted are A, B, C, E, K, N and O. Exact-value drift is reported separately and does not decide whether a per-property alias should be preserved.
- All 113 tables declared in `lib/db/src/schema/schema.ts` exist in production. The full inventory is Appendix A. Four additional infrastructure tables are listed separately; no table was dropped or classified dead merely because it is empty.
- Only SELECTs were run against production. Outputs contain counts, dates, schema/code identifiers and allowed crew/service/category names. No customer names, addresses, contact details, message bodies, raw storage paths or credentials were returned.
- Stored newest-write dates below are **max(greatest(created_at, updated_at))**, using whichever of those columns exist. These are row timestamp proxies, not database audit logs: deletes, some raw updates and tables without those columns cannot be dated by this method. Timestamp-without-time-zone values are preserved as stored; observation timestamps include their UTC offset.
- No repairs, ownership selections, application changes, schema changes, data writes, restarts or publishing were performed. The only audit deliverables are this report and the optional unused source-inspection helper.

## One-screen summary

**All row totals in this table: production, P0 = 2026-10-19 20:52:08.762084+00.** Disagreement details have the exact comparison timestamps in their area sections. Effort is a suggestion, not a scoped implementation task.

| Area | Holders | Production rows @ P0 | Disagree? | Suggested owner | Effort | Risk notes |
|---|---|---|---|---|---|---|
| A — Crews | `crews`, `maintenance_crews`, `campaign_crews`, `campaign_crew_members`, `crew_worksheets` (full list below) | crews: 0; maintenance_crews: 5; campaign_crews: 2; campaign_crew_members: 2; crew_worksheets: 1 | Independent live holders; measured drift/coverage below | crews owns standing crew identity and capacity; campaign membership remains campaign-specific and links to that identity | L | Deleting planner crews cascades schedule blocks; inactive crews can hide placements. Crew snapshots and membership are not interchangeable. |
| B — Property scope and service demand | `contracts`, `contract_services`, `contract_monthly_amounts`, `customer_service_plans`, `service_plan_templates` (full list below) | contracts: 102; contract_services: 1; contract_monthly_amounts: 780; customer_service_plans: 6; service_plan_templates: 0 | Independent live holders; measured drift/coverage below | Contract Center term_scope_lines owns per-property, per-term entitlement, as the master scheduling design requests | L | Current revenue, dashboard, snow, tickets and mobile legacy consumers intentionally remain on frozen legacy data. Parent agreements may cover branch properties; agreement owner is not always the operational property. |
| C — Service vocabulary | `tickets`, `contract_services`, `customer_service_plans`, `service_plan_template_items`, `term_scope_lines` (full list below) | tickets: 538; contract_services: 1; customer_service_plans: 6; service_plan_template_items: 0; term_scope_lines: 721 | Independent live holders; measured drift/coverage below | one versioned service-key registry with explicit domain mapping tables, while retaining separate geometry, contract-line and application-subtype dimensions | M | Client and server schema/catalog copies are manually duplicated in the inspected tree; no automatic catalog-sync command was found. Unknown/custom other:* keys must survive. |
| D — Rates and prices | `customer_rate_sheets`, `rate_card_items`, `term_rates`, `term_scope_lines`, `agreement_terms` (full list below) | customer_rate_sheets: 42; rate_card_items: 43; term_rates: 2463; term_scope_lines: 721; agreement_terms: 69 | No same-fact contradiction established; snapshots/domain separation below | rate_card_items owns current default rates; each term owns its negotiated historical prices and card baseline snapshots; campaign estimates remain estimates | L | Money uses different units/representations across old and new models; compare cents and textual rates deliberately. Legacy rate-sheet writes are frozen. |
| E — Contacts and management companies | `contacts`, `property_managers`, `property_manager_emails`, `property_manager_phones`, `property_management_companies` (full list below) | contacts: 94; property_managers: 21; property_manager_emails: 21; property_manager_phones: 18; property_management_companies: 8 | Independent live holders; measured drift/coverage below | referenced management company and manager identity plus normalized contact channels own current directory facts; customer/property-specific contacts should refer to that owner or explicitly state they are independent contacts | M | contacts.property_manager_id has no declared database FK in the observed schema, so validate relationship ownership before reconciliation. Never expose contact data in this report. |
| F — Customers versus properties | `customers`, `campaign_items`, `property_site_notes`, `customer_map_layers`, `customer_map_documents` (full list below) | customers: 62; campaign_items: 456; property_site_notes: 0; customer_map_layers: 221; customer_map_documents: 0 | No same-fact contradiction established; snapshots/domain separation below | customers owns operational property identity, preserving parent/branch grouping and customer IDs | M | Renaming a customer can leave cached display text stale; parent-level contracts must not collapse branch scheduling identities. |
| G — Message and display templates | `email_templates`, `communication_templates`, `chemical_notification_templates`, `communication_automation_rules`, `style_presets` (full list below) | email_templates: 3; communication_templates: 8; chemical_notification_templates: 9; communication_automation_rules: 5; style_presets: 16 | No same-fact contradiction established; snapshots/domain separation below | each semantic template family has one owner with shared rendering/delivery adapters | M | Boot seeding, automation references and chemical-label attachments are live dependencies. Template names alone cannot prove identical content. |
| H — Sent and received message history | `email_logs`, `communications`, `communication_threads`, `communication_links`, `communication_audit_log` (full list below) | email_logs: 337; communications: 643; communication_threads: 0; communication_links: 0; communication_audit_log: 0 | No same-fact contradiction established; snapshots/domain separation below | communications owns the routed conversation record, mailbox/provider identity owns import deduplication, and staging/delivery/audit tables retain their distinct workflow evidence with explicit links | L | Mailbox OAuth, inbound routing, automations, scheduled delivery and soft-delete behavior make blind consolidation unsafe. No message bodies, email addresses or credentials were selected. |
| I — Work notes and photos | `ticket_comments`, `ticket_comment_mentions`, `ticket_notes`, `ticket_photos`, `tickets` (full list below) | ticket_comments: 87; ticket_comment_mentions: 14; ticket_notes: 0; ticket_photos: 0; tickets: 538 | No same-fact contradiction established; snapshots/domain separation below | retain one source record per authored note or captured photo, expose it through typed work/property streams, and use references or deliberate snapshots when attaching it elsewhere | L | Mobile offline client IDs, upload retries, customer visibility, object ACLs and required-photo checklists must survive. Zero rows does not make a live upload endpoint dead. |
| J — Work orders and execution documents | `tickets`, `ticket_status_history`, `equipment_tickets`, `equipment_ticket_status_history`, `crew_worksheets` (full list below) | tickets: 538; ticket_status_history: 1566; equipment_tickets: 6; equipment_ticket_status_history: 13; crew_worksheets: 1 | No same-fact contradiction established; snapshots/domain separation below | tickets owns the CRM job lifecycle, proposals own the offered/signed quote and worksheets own the dispatched execution snapshot | L | Do not rewrite dispatched or finalized scope when a proposal changes. Equipment statuses and field job statuses are not one interchangeable enum. |
| K — When work happens | `visits`, `tickets`, `schedule_blocks`, `weekly_schedule_templates`, `maintenance_visit_configs` (full list below) | visits: 0; tickets: 538; schedule_blocks: 224; weekly_schedule_templates: 7; maintenance_visit_configs: 45 | Independent live holders; measured drift/coverage below | visits owns a dated crew trip; route and campaign tools generate visits, and ticket crew/date/order remain an automatic visit-derived mirror through syncTicketFromVisits | L | Retiring planner crews can cascade placements; recurrence cannot be copied as if each weekly block were one dated visit. Keep company scheduling gate before ticket locks and preserve Colorado-day semantics. |
| L — Seasons | `seasons`, `agreement_terms`, `weekly_schedule_templates`, `campaigns` | seasons: 1; agreement_terms: 69; weekly_schedule_templates: 7; campaigns: 11 | No same-fact contradiction established; snapshots/domain separation below | use one reusable season identity for operational grouping where appropriate, while each contract term owns its actual signed dates and renewal history | M | Colorado calendar boundaries and terms whose billing pattern spans years require explicit mapping; do not overwrite an old term to represent a renewal. |
| M — Documents and files | `contract_documents`, `term_documents`, `contract_builder_documents`, `contract_builder_sections`, `contract_builder_variables` (full list below) | contract_documents: 121; term_documents: 66; contract_builder_documents: 6; contract_builder_sections: 42; contract_builder_variables: 47 | No same-fact contradiction established; snapshots/domain separation below | document records own their attachment/version metadata and refer to an explicitly managed stored object; copied legacy documents preserve provenance | L | A row cascade and object deletion are different operations. Shared storage references, non-imported renewals and direct attachments must be checked before replacement or removal. |
| N — Unlisted duplicate: campaign display text | `campaign_items`, `customers` | campaign_items: 456; customers: 62 | Independent live holders; measured drift/coverage below | resolve current property name/city from customers for display, or explicitly identify and timestamp a historical campaign snapshot | S | Completion emails and campaign screens currently read cached names; a rename repair must not accidentally alter already-sent message history. |
| O — Unlisted duplicate: company settings identity | `companies`, `settings` | companies: 1; settings: 1 | Independent live holders; measured drift/coverage below | companies owns organization identity; settings should hold configuration/explicit branding overrides rather than a second unlabeled company name | S | PDFs, email templates and worksheets currently use different fallback order, so changing precedence can change customer-facing branding. |
| P — Unlisted shadow field: checklist template JSON | `service_type_templates`, `service_type_template_items` | service_type_templates: 0; service_type_template_items: 0 | No same-fact contradiction established; snapshots/domain separation below | normalized service_type_template_items owns executable checklist entries; remove the shadow JSON only after checking every API/schema consumer and deciding whether it is a compatibility snapshot | S | An empty table with live admin/mobile paths is not dead; generated payload types can still depend on the parent field. |

## Confirmed copied-value differences

These are the five columns with nonzero differences in the measured linked comparisons, not five automatically approved repairs. The same row can be present in multiple comparisons. No identifying row samples are included.

| Copied column | Compared with | Different rows | Environment / observed at |
|---|---|---:|---|
| campaign_items.customer_name | customers.name on same-company customer_id | 7 | production / 2026-10-19 20:56:39.20581+00 |
| customers.management_company | property_management_companies.name on the linked same-company ID, case/trim normalized | 3 | production / 2026-10-19 20:56:48.509114+00 |
| contacts.name | linked same-company property_managers.name | 3 | production / 2026-10-19 21:01:03.402079+00 |
| contacts.emails | sorted lower/trim-normalized linked manager email array | 1 | production / 2026-10-19 21:01:03.402079+00 |
| contacts.phones | sorted digit-normalized linked manager phone array | 1 | production / 2026-10-19 21:03:19.815842+00 |

An intentionally signed/issued snapshot is not included in this drift total. Negotiated term prices differing from defaults are not drift. Compared company settings names, campaign city copies, matched worksheet title/number snapshots, matched proposal plant names and QBO cached display-name mirrors have no measured differences; their comparison counts are below. Unpopulated communication name-copy fields cannot establish mirror health.

## A. Crews

Parallel editable planner and campaign crew identities exist without links to the standing list. This is a structural duplication, not proof that similarly named crews have identical membership. Production names are Hugo Crew, Luciano Crew, Manuel Crew, Rolando and Sergio Crew in the planner, and Hugo and Luciano in campaign crews; no user names or logins were queried. The older design sheet naming JOJO is stale for this observation. The one-time initialization marker is already set, so a restart must not be expected to repopulate missing links or override deliberate None choices.

**Suggested owner (not a decision):** crews owns standing crew identity and capacity; campaign membership remains campaign-specific and links to that identity. Preserve actual crew/lead facts on completed work as snapshots. Map planner and campaign identities explicitly before moving placements; do not delete legacy crews to force linking.

**Retirement risk:** Deleting planner crews cascades schedule blocks; inactive crews can hide placements. Crew snapshots and membership are not interchangeable.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `crews` | `name`, `supervisor_user_id`, `is_active`, `color`, `default_hours_per_day`, `display_order` | 0 | — | [R49/W6](#table-crews) |
| `maintenance_crews` | `name`, `default_hours_per_day`, `is_active`, `crew_id` | 5 | 2026-06-14 19:02:31.660149 | [R14/W13](#table-maintenance-crews) |
| `campaign_crews` | `name`, `leader_user_id`, `crew_id`, `campaign_id` | 2 | 2026-05-26 22:37:09.004327 | [R22/W8](#table-campaign-crews) |
| `campaign_crew_members` | `campaign_crew_id`, `user_id` | 2 | 2026-05-26 22:37:09.004327 | [R14/W8](#table-campaign-crew-members) |
| `crew_worksheets` | `crew_label`, `assigned_crew_lead_id` | 1 | 2026-08-31 11:50:10.601343 | [R19/W8](#table-crew-worksheets) |
| `tickets` | `crew_id`, `crew_member_user_ids`, `lead_tech_user_id` | 538 | 2026-10-19 16:39:07.12 | [R97/W37](#table-tickets) |

### Production check: crew_links

Environment: **production**. Observed at **2026-10-19 20:56:31.472881+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| planner | 5 |
| campaign | 2 |
| standing | 0 |
| planner_names | Hugo Crew, Luciano Crew, Manuel Crew, Rolando, Sergio Crew |
| campaign_names | Hugo, Luciano |
| planner_linked | 0 |
| campaign_linked | 0 |
| standing_active | 0 |
| campaign_members | 2 |
| worksheets_with_lead | 0 |
| tickets_with_crew_members | 0 |
| worksheets_with_crew_label | 0 |

### Production check: crew_initialization

Environment: **production**. Observed at **2026-10-19 21:01:22.998672+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| companies | 1 |
| initialized | 1 |

## B. Property scope and service demand

Frozen legacy contracts and newer Contract Center terms deliberately coexist, but customer service plans and planner visit configurations remain separate live inputs. Coverage differs; the legacy-customer and CC-customer sets are not identical. The one comparable legacy-service/service-plan quantity pair agrees, so do not extrapolate a quantity mismatch to every holder. All campaign property_id and service_plan_category values are null in the observed production rows, so the campaign scope integration is not populated. Quantity/month-spread nulls include services that are legitimately optional or not counted; they are coverage findings, not automatically damaged contracts.

**Suggested owner (not a decision):** Contract Center term_scope_lines owns per-property, per-term entitlement, as the master scheduling design requests. Copy and reconcile legacy/planned entitlement, preserve seasons and inherited parent coverage, repoint fulfillment readers, then freeze redundant planning inputs before eventual retirement. Service checklists are execution instructions, not a second entitlement owner.

**Retirement risk:** Current revenue, dashboard, snow, tickets and mobile legacy consumers intentionally remain on frozen legacy data. Parent agreements may cover branch properties; agreement owner is not always the operational property.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `contracts` | `customer_id`, `service_type`, `start_date`, `end_date`, `status` | 102 | 2026-10-13 22:41:13.166 | [R52/W13](#table-contracts) |
| `contract_services` | `contract_id`, `service_type`, `annual_count`, `monthly_distribution`, `service_parameters` | 1 | 2026-09-01 19:17:26.486937 | [R21/W8](#table-contract-services) |
| `contract_monthly_amounts` | `contract_id`, `month`, `amount` | 780 | 2026-10-13 22:38:29.976335 | [R28/W2](#table-contract-monthly-amounts) |
| `customer_service_plans` | `customer_id`, `year`, `service_category`, `expected_quantity`, `source_contract_ref`, `source_template_id` | 6 | 2026-09-15 20:13:47.036381 | [R12/W13](#table-customer-service-plans) |
| `service_plan_templates` | `name`, `active` | 0 | — | [R6/W6](#table-service-plan-templates) |
| `service_plan_template_items` | `template_id`, `service_category`, `default_annual_quantity` | 0 | — | [R6/W3](#table-service-plan-template-items) |
| `service_type_templates` | `service_type`, `name`, `items` | 0 | — | [R7/W3](#table-service-type-templates) |
| `service_type_template_items` | `template_id`, `label`, `default_instruction`, `photo_required`, `is_required` | 0 | — | [R3/W4](#table-service-type-template-items) |
| `maintenance_visit_configs` | `customer_id`, `estimated_duration_minutes`, `crew_size`, `preferred_day`, `preferred_crew_id` | 45 | 2026-06-14 19:36:54.566806 | [R5/W5](#table-maintenance-visit-configs) |
| `agreements` | `customer_id`, `line` | 45 | 2026-10-19 17:54:41.687287 | [R15/W11](#table-agreements) |
| `agreement_terms` | `agreement_id`, `season_label`, `start_date`, `end_date`, `annual_price_cents` | 69 | 2026-10-19 17:54:41.687287 | [R14/W13](#table-agreement-terms) |
| `term_scope_lines` | `term_id`, `service_key`, `included`, `quantity`, `month_spread`, `price_cents`, `details` | 721 | 2026-10-19 17:54:41.687287 | [R12/W12](#table-term-scope-lines) |
| `scope_presets` | `name`, `line` | 0 | — | [R0/W0](#table-scope-presets) |
| `scope_preset_lines` | `preset_id`, `service_key`, `quantity` | 0 | — | [R0/W0](#table-scope-preset-lines) |
| `campaign_items` | `property_id`, `customer_id`, `service_plan_category` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |

### Production check: contract_scope_coverage

Environment: **production**. Observed at **2026-10-19 20:57:09.967039+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| cc_customers | 39 |
| legacy_customers | 50 |
| scope_missing_months | 391 |
| scope_missing_quantity | 327 |
| cc_customers_without_legacy | 1 |
| legacy_customers_without_cc | 12 |
| active_terms_without_included_scope | 0 |

### Production check: scope_comparable

Environment: **production**. Observed at **2026-10-19 21:01:15.192446+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| joined | 1 |
| quantity_diff | 0 |

### Production check: cc_2027_scope

Environment: **production**. Observed at **2026-10-19 21:01:07.264105+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| terms_2027 | 3 |
| included_lines | 45 |
| quantity_missing | 22 |
| month_spread_missing | 25 |

### Production check: campaign_service_plan_mapping

Environment: **production**. Observed at **2026-10-19 21:01:26.79328+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| ticket_linked | 0 |
| target_and_backup | 140 |
| items_using_service_plan_category | 0 |

## C. Service vocabulary

Service keys are independently declared in schema validation, server and client catalogs, template editors, rollups, map classifications and chemical-notice options. These are not one interchangeable enum: Contract Center adds service concepts; map layers describe geometry; chemical templates describe application subtypes. pet_station versus pet_stations is a spelling variant. irrigation_close and snow_removal have explicit review-required legacy mappings, not safe universal aliases. Production also has ice_melt_buckets, absent from the declared map-layer type. The full source lists, key matrix and stored distributions are in Appendix C. Mobile uses API service strings rather than a separately found complete service-key enum.

**Suggested owner (not a decision):** one versioned service-key registry with explicit domain mapping tables, while retaining separate geometry, contract-line and application-subtype dimensions. Migrate persisted aliases with reviewed mappings; do not silently collapse one-to-many chemical or snow concepts.

**Retirement risk:** Client and server schema/catalog copies are manually duplicated in the inspected tree; no automatic catalog-sync command was found. Unknown/custom other:* keys must survive.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `tickets` | `service_type` | 538 | 2026-10-19 16:39:07.12 | [R97/W37](#table-tickets) |
| `contract_services` | `service_type` | 1 | 2026-09-01 19:17:26.486937 | [R21/W8](#table-contract-services) |
| `customer_service_plans` | `service_category` | 6 | 2026-09-15 20:13:47.036381 | [R12/W13](#table-customer-service-plans) |
| `service_plan_template_items` | `service_category` | 0 | — | [R6/W3](#table-service-plan-template-items) |
| `term_scope_lines` | `service_key` | 721 | 2026-10-19 17:54:41.687287 | [R12/W12](#table-term-scope-lines) |
| `scope_preset_lines` | `service_key` | 0 | — | [R0/W0](#table-scope-preset-lines) |
| `customer_map_layers` | `layer_type`, `category` | 221 | 2026-09-10 20:46:53.583079 | [R4/W8](#table-customer-map-layers) |
| `campaigns` | `category`, `subtype` | 11 | 2026-09-24 02:55:30.432 | [R64/W11](#table-campaigns) |
| `campaign_items` | `service_plan_category` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `service_type_templates` | `service_type` | 0 | — | [R7/W3](#table-service-type-templates) |
| `property_site_notes` | `service_type` | 0 | — | [R5/W3](#table-property-site-notes) |
| `chemical_notification_templates` | `service_type` | 9 | 2026-09-20 23:37:56.4 | [R24/W15](#table-chemical-notification-templates) |

All stored key/count distributions are in Appendix C, observed in production at 2026-10-19T20:59:08.778Z.
## D. Rates and prices

Default card prices, negotiated term prices and historical billing are different facts, not an instruction to keep signed prices synchronized to defaults. The matched term-rate card baselines agree with current catalog prices, while negotiated prices differ on many rows; those differences are intentional snapshots/overrides, not counted among drifted copied columns. contract_services has no standalone price column in the current schema, campaigns has no price column, and proposals has no top-level total/price column; commercial detail may live in proposal/version payloads. The reported area columns retain only fields that actually exist.

**Suggested owner (not a decision):** rate_card_items owns current default rates; each term owns its negotiated historical prices and card baseline snapshots; campaign estimates remain estimates. Repoint legacy rate-sheet consumers only in a separate approved rollout, not by rewriting signed terms.

**Retirement risk:** Money uses different units/representations across old and new models; compare cents and textual rates deliberately. Legacy rate-sheet writes are frozen.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `customer_rate_sheets` | `general_labor`, `operator_labor`, `irrigation_labor`, `emergency_general_labor`, `emergency_irrigation_labor`, `hand_shovel_labor`, `plow_truck`, `atv`, `skid_steer`, `snow_blower`, `ice_melt_material`, `ice_melt_application_labor` | 42 | 2026-04-17 18:28:52.116187 | [R14/W2](#table-customer-rate-sheets) |
| `rate_card_items` | `rate_key`, `price_cents`, `price_text`, `label`, `unit`, `minimum` | 43 | 2026-10-14 15:37:08.149673 | [R17/W6](#table-rate-card-items) |
| `term_rates` | `term_id`, `rate_key`, `price_cents`, `price_text`, `card_price_cents`, `card_price_text`, `label` | 2463 | 2026-10-19 17:54:41.687287 | [R12/W12](#table-term-rates) |
| `term_scope_lines` | `price_cents` | 721 | 2026-10-19 17:54:41.687287 | [R12/W12](#table-term-scope-lines) |
| `agreement_terms` | `annual_price_cents`, `snow_flat_price_cents`, `snow_pricing` | 69 | 2026-10-19 17:54:41.687287 | [R14/W13](#table-agreement-terms) |
| `term_billing_months` | `term_id`, `amount_cents`, `month` | 1422 | 2026-10-19 17:54:41.687287 | [R12/W12](#table-term-billing-months) |
| `campaign_items` | `estimated_amount` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `proposals` | `scope_of_work` | 111 | 2026-10-06 22:29:42.214236 | [R30/W8](#table-proposals) |
| `proposal_versions` |  | 164 | 2026-10-15 17:04:08.246225 | [R8/W2](#table-proposal-versions) |

### Production check: term_rate_snapshots

Environment: **production**. Observed at **2026-10-19 20:57:14.841846+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| joined | 2396 |
| label_diff | 0 |
| price_diff | 478 |
| card_snapshot_diff | 0 |

Generic child replacement is a real writer: `artifacts/api-server/src/lib/contractCenterPersistence.ts:36-39` deletes and reinserts term scope/rates/billing rows; its table-specific caller sites are included in the inventory.
## E. Contacts and management companies

Linked contacts can be edited independently of the property-manager identity and child contact channels. Production has differing linked names, email sets and phone sets; the management-company free text also differs from its referenced company name. Those are literal count-only differences; a person must decide whether any per-property alias is intentional. Manager scalar email/phone values that are populated are represented in their child channel tables. Contract legal/project/contact text is a deliberate contract snapshot and must not be overwritten from current contacts.

**Suggested owner (not a decision):** referenced management company and manager identity plus normalized contact channels own current directory facts; customer/property-specific contacts should refer to that owner or explicitly state they are independent contacts. Preserve contract signer/contact snapshots separately.

**Retirement risk:** contacts.property_manager_id has no declared database FK in the observed schema, so validate relationship ownership before reconciliation. Never expose contact data in this report.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `contacts` | `customer_id`, `property_manager_id`, `name`, `emails`, `phones`, `role`, `is_primary` | 94 | 2026-10-14 16:26:37.287886 | [R62/W9](#table-contacts) |
| `property_managers` | `property_management_company_id`, `name`, `phone`, `email` | 21 | 2026-04-27 18:22:51.416601 | [R7/W8](#table-property-managers) |
| `property_manager_emails` | `property_manager_id`, `email`, `is_primary` | 21 | 2026-04-27 18:22:51.452545 | [R3/W10](#table-property-manager-emails) |
| `property_manager_phones` | `property_manager_id`, `phone`, `is_primary` | 18 | 2026-04-27 18:22:51.48874 | [R3/W10](#table-property-manager-phones) |
| `property_management_companies` | `name`, `phone`, `email`, `street`, `city`, `state`, `zip` | 8 | 2025-12-31 18:26:21.371148 | [R13/W9](#table-property-management-companies) |
| `customers` | `management_company`, `property_management_company_id`, `property_manager_id` | 62 | 2026-10-14 16:28:11.29 | [R242/W33](#table-customers) |
| `agreement_terms` | `legal_name`, `managing_agent_name`, `project_contact`, `contact_phone`, `contact_email`, `project_address` | 69 | 2026-10-19 17:54:41.687287 | [R14/W13](#table-agreement-terms) |

### Production check: contact_drift

Environment: **production**. Observed at **2026-10-19 21:01:03.402079+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| linked_contact_names | 3 |
| contacts_with_manager | 31 |
| linked_contact_email_sets | 1 |
| manager_scalar_email_populated | 4 |
| manager_scalar_phone_populated | 4 |
| manager_scalar_email_not_in_children | 0 |
| manager_scalar_phone_not_in_children | 0 |

### Production check: contact_phone_drift

Environment: **production**. Observed at **2026-10-19 21:03:19.815842+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| linked | 31 |
| phone_set_drift | 1 |

### Production check: management_copy_drift

Environment: **production**. Observed at **2026-10-19 20:56:48.509114+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| both_present | 11 |
| text_fk_name_different | 3 |

## F. Customers versus properties

A property is an operational customers row, not a separate properties master table. Parent/child grouping is in customers; property_* names here represent attached notes or management metadata, not another property owner. The parent flags and actual parent relationships agree in the measured aggregate. The campaign property_id column is a second pointer to customers but is unpopulated in this snapshot; existing items use customer_id.

**Suggested owner (not a decision):** customers owns operational property identity, preserving parent/branch grouping and customer IDs. Distinguish agreement ownership/inherited coverage from the property where crews work; reconcile the duplicate campaign property pointer before selecting a single field.

**Retirement risk:** Renaming a customer can leave cached display text stale; parent-level contracts must not collapse branch scheduling identities.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `customers` | `id`, `parent_customer_id`, `is_parent`, `customer_type`, `street`, `city`, `state`, `zip` | 62 | 2026-10-14 16:28:11.29 | [R242/W33](#table-customers) |
| `campaign_items` | `customer_id`, `property_id` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `property_site_notes` | `customer_id` | 0 | — | [R5/W3](#table-property-site-notes) |
| `customer_map_layers` | `customer_id` | 221 | 2026-09-10 20:46:53.583079 | [R4/W8](#table-customer-map-layers) |
| `customer_map_documents` | `customer_id` | 0 | — | [R3/W6](#table-customer-map-documents) |
| `recent_property_views` | `customer_id` | 0 | — | [R2/W1](#table-recent-property-views) |

### Production check: customer_shape

Environment: **production**. Observed at **2026-10-19 20:56:35.299825+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| child | 11 |
| total | 62 |
| standalone | 50 |
| parent_flag | 1 |
| management_fk_present | 31 |
| parents_with_children | 1 |
| management_text_present | 11 |
| flag_false_with_children | 0 |

### Production check: campaign_copy_drift

Environment: **production**. Observed at **2026-10-19 20:56:39.20581+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| city | 0 |
| name | 7 |
| joined | 456 |
| category_missing | 456 |
| unresolved_property | 456 |
| property_customer_ids_differ | 0 |

## G. Message and display templates

These tables hold different template families rather than demonstrably duplicated rows of the same template. Settings notification-templates is a route to ChemicalNotificationTemplates and the chemical_notification_templates API, not a separate settings JSON template store. Style presets and sheet templates describe rendering/layout, not message bodies. Legacy chemical-email cleanup is a boot writer and must be considered before retiring the old mail-template path. No body values were queried or printed.

**Suggested owner (not a decision):** each semantic template family has one owner with shared rendering/delivery adapters. Preserve chemical pre/post application semantics and style/layout configuration; do not merge unlike template rows merely because they are all called templates.

**Retirement risk:** Boot seeding, automation references and chemical-label attachments are live dependencies. Template names alone cannot prove identical content.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `email_templates` | `name`, `category`, `subject`, `html_body`, `text_body` | 3 | 2026-10-19 20:09:13.654 | [R11/W6](#table-email-templates) |
| `communication_templates` | `name`, `category`, `type`, `subject`, `body`, `is_archived` | 8 | 2026-04-01 19:10:15.563669 | [R33/W12](#table-communication-templates) |
| `chemical_notification_templates` | `name`, `service_type`, `pre_visit_subject`, `pre_visit_html`, `post_visit_subject`, `post_visit_html` | 9 | 2026-09-20 23:37:56.4 | [R24/W15](#table-chemical-notification-templates) |
| `communication_automation_rules` | `name`, `template_id` | 5 | 2026-04-01 19:10:15.891527 | [R9/W13](#table-communication-automation-rules) |
| `style_presets` | `name`, `type`, `category`, `style_config` | 16 | 2026-08-27 22:54:53.359007 | [R3/W8](#table-style-presets) |
| `sheet_templates` | `name`, `layer_visibility`, `legend_config`, `default_preset_ids` | 0 | — | [R2/W6](#table-sheet-templates) |

Navigation evidence: `artifacts/highplains-crm/src/components/AppSidebar.tsx`, `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx` and chemical-notification-template routes in `artifacts/api-server/src/routes/routes.ts`.
## H. Sent and received message history

Delivery logs, routed customer communications, unrouted mailbox staging and audit records represent different lifecycle facts. No cross-store provider-ID overlap was found in the compared pairs; resolved staging links point to existing same-company communications. This does not prove deduplication for every provider or historic missing ID. Communication display-name copy fields were not populated on comparable joined rows, so their drift count is not evidence of an actively maintained mirror.

**Suggested owner (not a decision):** communications owns the routed conversation record, mailbox/provider identity owns import deduplication, and staging/delivery/audit tables retain their distinct workflow evidence with explicit links. Reconcile records by stable provider identity rather than copying bodies between stores.

**Retirement risk:** Mailbox OAuth, inbound routing, automations, scheduled delivery and soft-delete behavior make blind consolidation unsafe. No message bodies, email addresses or credentials were selected.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `email_logs` | `provider_message_id`, `customer_id`, `ticket_id`, `status`, `sent_at` | 337 | 2026-10-06 18:46:18.437751 | [R5/W29](#table-email-logs) |
| `communications` | `provider_message_id`, `mailbox_account_id`, `thread_id`, `parent_communication_id`, `customer_id`, `contact_id`, `direction`, `delivery_status`, `customer_name`, `contact_name`, `sent_by_name` | 643 | 2026-05-13 20:56:20.452911 | [R41/W35](#table-communications) |
| `communication_threads` | `customer_id`, `subject_root` | 0 | — | [R3/W3](#table-communication-threads) |
| `communication_links` | `communication_id` | 0 | — | [R2/W1](#table-communication-links) |
| `communication_audit_log` | `communication_id`, `action_type` | 0 | — | [R2/W12](#table-communication-audit-log) |
| `unsorted_emails` | `provider_message_id`, `resolved_to_communication_id`, `status` | 843 | 2026-05-11 18:56:00.095653 | [R37/W13](#table-unsorted-emails) |
| `mailbox_accounts` |  | 1 | 2026-05-11 18:29:13.107 | [R58/W41](#table-mailbox-accounts) |
| `mailbox_sync_runs` | `mailbox_account_id`, `status` | 0 | — | [R3/W7](#table-mailbox-sync-runs) |
| `mailbox_backfill_runs` | `mailbox_account_id`, `status` | 1 | 2026-05-11 18:56:04.18 | [R12/W9](#table-mailbox-backfill-runs) |

### Production check: message_history_overlap

Environment: **production**. Observed at **2026-10-19 20:56:57.11479+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| unsorted_resolved | 41 |
| resolved_link_missing | 0 |
| unsorted_communications_same_provider_id | 0 |
| email_logs_communications_same_provider_id | 0 |

### Production check: communication_copy_drift

Environment: **production**. Observed at **2026-10-19 20:56:43.292718+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| sender_name | 0 |
| contact_name | 0 |
| customer_name | 0 |
| sender_copies | 0 |
| contact_copies | 0 |
| customer_copies | 0 |

## I. Work notes and photos

CRM conversation comments, mobile crew notes, property reference notes, campaign completion evidence and worksheet snapshots have different scopes/audiences. The newer ticket_notes and ticket_photos stores are empty in production, while older inline ticket/campaign photo holders are used. No same-ticket exact body duplicate was found between mobile notes and comments. A unified work stream can read typed records without asserting they are identical facts. Paths and note contents were never returned.

**Suggested owner (not a decision):** retain one source record per authored note or captured photo, expose it through typed work/property streams, and use references or deliberate snapshots when attaching it elsewhere. Resolve inline arrays versus normalized photo records before adding further capture paths.

**Retirement risk:** Mobile offline client IDs, upload retries, customer visibility, object ACLs and required-photo checklists must survive. Zero rows does not make a live upload endpoint dead.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `ticket_comments` | `ticket_id`, `body`, `parent_comment_id` | 87 | 2026-10-12 23:01:11.781531 | [R8/W13](#table-ticket-comments) |
| `ticket_comment_mentions` | `comment_id` | 14 | 2026-10-08 14:22:43.607823 | [R1/W2](#table-ticket-comment-mentions) |
| `ticket_notes` | `ticket_id`, `body`, `client_id` | 0 | — | [R6/W2](#table-ticket-notes) |
| `ticket_photos` | `ticket_id`, `storage_key`, `client_id` | 0 | — | [R8/W2](#table-ticket-photos) |
| `tickets` | `photos`, `completion_photo_storage_keys`, `completion_notes`, `internal_completion_notes`, `work_summary_for_customer` | 538 | 2026-10-19 16:39:07.12 | [R97/W37](#table-tickets) |
| `notes` | `customer_id`, `body` | 12 | 2026-10-07 17:02:50.414419 | [R3/W8](#table-notes) |
| `property_site_notes` | `customer_id`, `service_type`, `label`, `value` | 0 | — | [R5/W3](#table-property-site-notes) |
| `campaign_items` | `notes`, `photos`, `completion_notes`, `completion_photo_storage_keys` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `crew_worksheet_photos` | `crew_worksheet_id`, `storage_object_path` | 5 | 2026-08-31 11:50:10.601343 | [R9/W11](#table-crew-worksheet-photos) |
| `flags` | `note` | 0 | — | [R6/W2](#table-flags) |
| `flag_photos` | `flag_id`, `storage_key` | 0 | — | [R4/W2](#table-flag-photos) |

### Production check: notes_overlap

Environment: **production**. Observed at **2026-10-19 20:57:23.746352+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| campaigns_with_photos | 24 |
| ticket_notes_also_comments | 0 |
| tickets_with_inline_photos | 65 |
| tickets_with_completion_photos | 0 |
| campaigns_with_completion_photos | 0 |

## J. Work orders and execution documents

Proposals and crew worksheets are linked documents with explicit frozen source snapshots; they are not automatically extra independent job owners. Production proposals are often linked to tickets; the existing worksheet is linked to its source proposal and its checked title/number snapshots agree. Equipment tickets remain a distinct maintenance workflow. Existing campaign items have no ticket_id links in this snapshot, so a campaign-to-job mirror cannot be assumed.

**Suggested owner (not a decision):** tickets owns the CRM job lifecycle, proposals own the offered/signed quote and worksheets own the dispatched execution snapshot. Decide equipment-workflow convergence separately; connect campaign execution to visits/tickets without duplicating billable state.

**Retirement risk:** Do not rewrite dispatched or finalized scope when a proposal changes. Equipment statuses and field job statuses are not one interchangeable enum.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `tickets` | `id`, `ticket_type_id`, `current_status_id`, `equipment_id`, `contract_id` | 538 | 2026-10-19 16:39:07.12 | [R97/W37](#table-tickets) |
| `ticket_status_history` | `ticket_id`, `from_status_id`, `to_status_id` | 1566 | 2026-10-19 16:38:33.264367 | [R5/W17](#table-ticket-status-history) |
| `equipment_tickets` | `equipment_id`, `status`, `title` | 6 | 2026-06-24 17:21:18.494 | [R11/W6](#table-equipment-tickets) |
| `equipment_ticket_status_history` | `from_status`, `to_status` | 13 | 2026-06-24 17:21:18.545261 | [R2/W3](#table-equipment-ticket-status-history) |
| `crew_worksheets` | `ticket_id`, `source_proposal_id`, `source_proposal_number_snapshot`, `source_proposal_title_snapshot`, `scope_of_work`, `status` | 1 | 2026-08-31 11:50:10.601343 | [R19/W8](#table-crew-worksheets) |
| `crew_worksheet_versions` | `crew_worksheet_id` | 0 | — | [R6/W1](#table-crew-worksheet-versions) |
| `campaign_items` | `ticket_id`, `status`, `billing_status` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `proposals` | `ticket_id`, `scope_of_work`, `status` | 111 | 2026-10-06 22:29:42.214236 | [R30/W8](#table-proposals) |
| `proposal_versions` | `proposal_id` | 164 | 2026-10-15 17:04:08.246225 | [R8/W2](#table-proposal-versions) |

### Production check: worksheet_snapshots

Environment: **production**. Observed at **2026-10-19 20:57:18.967546+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| joined | 1 |
| title_snapshot_diff | 0 |
| number_snapshot_diff | 0 |

### Production check: documents

Environment: **production**. Observed at **2026-10-19 20:57:28.235217+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| proposals_with_ticket | 79 |
| legacy_term_same_object | 66 |
| worksheets_with_proposal | 1 |

## K. When work happens

The old planner has weekly blocks and campaigns have target/backup dates, but production has no visits. These remain separate scheduling stores without a general planner/campaign-to-visit producer. Ticket due dates without a visit are not automatically mirror damage: an unscheduled job may legitimately have a due date. No populated visit/ticket pair exists on which to measure mirror disagreement.

**Suggested owner (not a decision):** visits owns a dated crew trip; route and campaign tools generate visits, and ticket crew/date/order remain an automatic visit-derived mirror through syncTicketFromVisits. Preserve job schedule_by as a distinct scheduling deadline and snow as an event domain until its design is approved.

**Retirement risk:** Retiring planner crews can cascade placements; recurrence cannot be copied as if each weekly block were one dated visit. Keep company scheduling gate before ticket locks and preserve Colorado-day semantics.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `visits` | `crew_id`, `visit_date`, `route_order`, `ticket_id`, `source_type`, `customer_id`, `title`, `status` | 0 | — | [R12/W7](#table-visits) |
| `tickets` | `crew_id`, `due_date`, `route_order`, `mobile_status`, `schedule_by` | 538 | 2026-10-19 16:39:07.12 | [R97/W37](#table-tickets) |
| `schedule_blocks` | `template_id`, `visit_config_id`, `crew_id`, `day_of_week`, `sort_order`, `start_time` | 224 | 2026-06-14 19:37:39.274018 | [R2/W9](#table-schedule-blocks) |
| `weekly_schedule_templates` | `season_start_month`, `season_end_month`, `is_active` | 7 | 2026-06-14 19:02:01.664962 | [R6/W8](#table-weekly-schedule-templates) |
| `maintenance_visit_configs` | `preferred_day`, `preferred_crew_id`, `estimated_duration_minutes` | 45 | 2026-06-14 19:36:54.566806 | [R5/W5](#table-maintenance-visit-configs) |
| `campaign_items` | `target_date`, `backup_date`, `time_window_start`, `time_window_end`, `was_bumped_to_backup` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `snow_events` | `event_start_date_time`, `event_end_date_time` | 0 | — | [R14/W8](#table-snow-events) |

### Production check: schedule_mirror

Environment: **production**. Observed at **2026-10-19 20:57:05.971027+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| visits | 0 |
| tickets_due | 218 |
| tickets_crew | 0 |
| ticket_visits | 0 |
| planner_blocks | 224 |
| tickets_route_order | 0 |
| campaign_backup_dates | 140 |
| campaign_target_dates | 140 |

### Production check: campaign_service_plan_mapping

Environment: **production**. Observed at **2026-10-19 21:01:26.79328+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| ticket_linked | 0 |
| target_and_backup | 140 |
| items_using_service_plan_category | 0 |

## L. Seasons

Operational campaign seasons, contract-term dates/labels and recurring planner windows describe related but distinct time dimensions. Numeric term labels do not disagree with the tested start-year rule. A recurring planner month/week interval is not a dated contract season and must not be treated as one. Contract seasons must remain historical, including multi-year/seasonal terms.

**Suggested owner (not a decision):** use one reusable season identity for operational grouping where appropriate, while each contract term owns its actual signed dates and renewal history. Preserve recurring route rules as rules rather than silently turning them into global season dates.

**Retirement risk:** Colorado calendar boundaries and terms whose billing pattern spans years require explicit mapping; do not overwrite an old term to represent a renewal.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `seasons` | `name`, `start_date`, `end_date` | 1 | 2026-03-18 04:36:21.686975 | [R15/W6](#table-seasons) |
| `agreement_terms` | `season_label`, `start_date`, `end_date`, `renewed_from_term_id` | 69 | 2026-10-19 17:54:41.687287 | [R14/W13](#table-agreement-terms) |
| `weekly_schedule_templates` | `season_start_month`, `season_start_week`, `season_end_month`, `season_end_week` | 7 | 2026-06-14 19:02:01.664962 | [R6/W8](#table-weekly-schedule-templates) |
| `campaigns` | `season_id` | 11 | 2026-09-24 02:55:30.432 | [R64/W11](#table-campaigns) |

### Production check: season_alignment

Environment: **production**. Observed at **2026-10-19 21:03:28.522473+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| terms | 69 |
| campaigns_with_season | 5 |
| template_season_windows | 7 |
| labels_disagree_with_dates | 0 |

### Production check: cc_2027_scope

Environment: **production**. Observed at **2026-10-19 21:01:07.264105+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| terms_2027 | 3 |
| included_lines | 45 |
| quantity_missing | 22 |
| month_spread_missing | 25 |

The master-design question about complete 2027 entitlement cannot be answered yes from these rows. The season-label-matched observation includes quantity/month-spread nulls; some are expected for optional services. Review counted service lines, inherited coverage and contract seasons before automatic campaign generation.
## M. Documents and files

Legacy contracts and Contract Center deliberately share stored document object references after migration; the matching-object count is not evidence that the PDF should be duplicated or either reference deleted. Imported provenance links resolve to both a term and a legacy contract in the same company. Builder documents, signed term documents and file attachments have distinct ownership/lifecycle. contract_masters is an empty reserved schema table with no application query paths found.

**Suggested owner (not a decision):** document records own their attachment/version metadata and refer to an explicitly managed stored object; copied legacy documents preserve provenance. Retain every surviving reference before deleting any underlying object, and keep signed files immutable.

**Retirement risk:** A row cascade and object deletion are different operations. Shared storage references, non-imported renewals and direct attachments must be checked before replacement or removal.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `contract_documents` | `contract_id`, `storage_object_path`, `version` | 121 | 2026-10-13 22:42:13.942181 | [R15/W10](#table-contract-documents) |
| `term_documents` | `term_id`, `master_id`, `storage_object_path`, `kind`, `version` | 66 | 2026-10-13 22:37:15.808 | [R12/W9](#table-term-documents) |
| `contract_builder_documents` | `contract_id`, `customer_id`, `pdf_storage_object_path`, `status` | 6 | 2026-06-22 20:50:03.851962 | [R6/W10](#table-contract-builder-documents) |
| `contract_builder_sections` | `document_id` | 42 | 2026-06-22 20:51:05.75009 | [R4/W4](#table-contract-builder-sections) |
| `contract_builder_variables` | `document_id` | 47 | 2026-06-22 20:51:06.75138 | [R4/W4](#table-contract-builder-variables) |
| `contract_templates` | `section_key`, `default_content` | 21 | 2025-11-19 20:18:42.415049 | [R4/W0](#table-contract-templates) |
| `contract_masters` | `version`, `storage_object_path`, `is_current` | 0 | — | [R0/W0](#table-contract-masters) |
| `proposal_files` | `proposal_id`, `storage_object_path` | 308 | 2026-10-15 17:02:24.300375 | [R37/W10](#table-proposal-files) |
| `equipment_files` | `equipment_id` | 0 | — | [R3/W4](#table-equipment-files) |
| `customer_map_documents` | `customer_id` | 0 | — | [R3/W6](#table-customer-map-documents) |

### Production check: documents

Environment: **production**. Observed at **2026-10-19 20:57:28.235217+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| proposals_with_ticket | 79 |
| legacy_term_same_object | 66 |
| worksheets_with_proposal | 1 |

### Production check: legacy_copy_links

Environment: **production**. Observed at **2026-10-19 21:01:19.166937+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| links | 99 |
| missing_term | 0 |
| missing_legacy | 0 |
| companies_mismatch | 0 |

## N. Unlisted duplicate: campaign display text

Campaign customer_name is copied when items are created; current customer edits do not automatically reconcile old campaign items in the inspected write paths. Several name copies disagree while city copies agree. There is no immutable snapshot marker on these display copies, so treat them as unsynchronized cached text pending the owner decision, not as a proven historical record that may be rewritten automatically.

**Suggested owner (not a decision):** resolve current property name/city from customers for display, or explicitly identify and timestamp a historical campaign snapshot. Retire cached columns only after consumers switch.

**Retirement risk:** Completion emails and campaign screens currently read cached names; a rename repair must not accidentally alter already-sent message history.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `campaign_items` | `customer_id`, `customer_name`, `customer_city` | 456 | 2026-10-06 18:46:18.015 | [R59/W27](#table-campaign-items) |
| `customers` | `id`, `name`, `city` | 62 | 2026-10-14 16:28:11.29 | [R242/W33](#table-customers) |

### Production check: campaign_copy_drift

Environment: **production**. Observed at **2026-10-19 20:56:39.20581+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| city | 0 |
| name | 7 |
| joined | 456 |
| category_missing | 456 |
| unresolved_property | 456 |
| property_customer_ids_differ | 0 |

## O. Unlisted duplicate: company settings identity

Company name is editable through company identity and company settings, and report/rendering code chooses between them differently. The measured pair currently agrees; that is not an automatic reconciliation contract. Mowing/cleanup months, rate benchmarks and feature_flags are only found in settings as configuration owners, not duplicated company columns.

**Suggested owner (not a decision):** companies owns organization identity; settings should hold configuration/explicit branding overrides rather than a second unlabeled company name. If branding is intentionally distinct, name it as such and define precedence.

**Retirement risk:** PDFs, email templates and worksheets currently use different fallback order, so changing precedence can change customer-facing branding.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `companies` | `name` | 1 | 2026-05-05 03:29:09.82 | [R41/W27](#table-companies) |
| `settings` | `company_id`, `company_name` | 1 | 2026-05-05 03:29:09.948 | [R19/W9](#table-settings) |

### Production check: company_settings_drift

Environment: **production**. Observed at **2026-10-19 20:56:52.804629+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| pairs | 1 |
| company_name | 0 |

## P. Unlisted shadow field: checklist template JSON

The template parent still has an embedded items JSON column alongside normalized child rows. The inspected mobile/admin checklist routes return normalized children and write those children separately. Both stores are empty in this production snapshot, so no data drift is measurable; this is a shadow-column retirement candidate, not an additional confirmed populated duplicate area.

**Suggested owner (not a decision):** normalized service_type_template_items owns executable checklist entries; remove the shadow JSON only after checking every API/schema consumer and deciding whether it is a compatibility snapshot.

**Retirement risk:** An empty table with live admin/mobile paths is not dead; generated payload types can still depend on the parent field.

### Holders and columns

**Production P0: 2026-10-19 20:52:08.762084+00.** R/W counts are source routines traced by the static helper, not production traffic; their exact query sites, endpoint wrappers, consumers and dormant/frozen qualifications are in Appendix B.

| Holder | Fact columns present in current production schema | Production rows @ P0 | Newest row timestamp @ P0 | Source read/write routines |
|---|---|---:|---|---|
| `service_type_templates` | `items` | 0 | — | [R7/W3](#table-service-type-templates) |
| `service_type_template_items` | `template_id`, `label`, `default_instruction`, `photo_required` | 0 | — | [R3/W4](#table-service-type-template-items) |

## Ownership check on recent work

| Work | Source evidence | Ownership assessment | Production evidence |
|---|---|---|---|
| C3 billing / invoice lists | Invoice-link helpers and pending-invoices/billing completion handlers in `artifacts/api-server/src/routes/routes.ts`; `artifacts/highplains-crm/src/pages/TicketsList.tsx` | Charge identity stays the Invoice ticket; parent chips and Billing are projections of ticket_links, not new charge records. Parent invoice relationships are bulk resolved and company scoped. | 65 invoice_for links; 0 missing/cross-company link endpoints; 0 multi-invoice parents (production / 2026-10-19 20:57:01.730064+00). This validates current counts, not the unexercised concurrent-close edge case. |
| P3-1 crew links | `artifacts/api-server/src/routes/crewsAndMobile.ts`; linkCrewsByName boot call in `artifacts/api-server/src/routes/routes.ts`; crew rollout memory | Standing crew identity is the intended owner; nullable planner/campaign links do not copy capacity or membership. One-time matching must preserve manual None. | Standing 0, planner 5, campaign 2, linked 0/0 (production / 2026-10-19 20:56:31.472881+00); initialization marker 1 (production / 2026-10-19 21:01:22.998672+00). The standing list is empty in the observed data. |
| P3-2 visits and ticket mirror | `artifacts/api-server/src/lib/visitSync.ts:48-106`; `artifacts/api-server/src/routes/visits.ts`; backfill/compatibility paths in `artifacts/api-server/src/routes/routes.ts` | syncTicketFromVisits is the owner of ticket crew/date/order mirrors; winning visit is selected from open visits. No winner clears crew/order but preserves existing due date. POST/PATCH/reorder/removal reconcile within transactions; compatibility paths must go through the same visit model. | 0 visits and 0 assigned ticket crew IDs (production / 2026-10-19 20:57:05.971027+00). Mirror runtime equality is not testable on an empty join. |
| P3-3 service_key | Current canonical schema and production information_schema | Not in the inspected main schema or production columns; no merged implementation was assumed from an in-flight task. The saved P3-3 spec describes a deliberate copy-on-create snapshot that visit PATCH may change, not a continuously mirrored ticket service field. | service_key absent from production visits metadata (production / 2026-10-19T20:51:37.22478+00:00). No service_key values or drift counts are invented. |
| Contract Center legacy-copy and freeze | `artifacts/api-server/src/lib/legacyContractFreeze.ts`; `artifacts/api-server/src/routes/contractCenter.ts`; audit/renewal execution helpers; `docs/contract-center-switch-over-verification.md` | Copied seasons, prices and documents are deliberate term snapshots with provenance. Direct user legacy mutations reject with HTTP 409; downstream legacy readers intentionally remain. A repository method that still contains an insert is not proof the guarded HTTP route can write. | 99 provenance links; 0 missing legacy; 0 missing term; 0 company mismatches (production / 2026-10-19 21:01:19.166937+00). |

## Dead, read-only and frozen tables

**Production row counts: P0 2026-10-19 20:52:08.762084+00.** Dead means no application query path found, not permission to drop. Schemas/types alone are not live readers. Read-only means read paths exist but no live write caller was found. Frozen means a deliberate guard blocks legacy user writes even where old routines remain.

| Table | Production rows @ P0 | Classification | Still read? / qualification |
|---|---:|---|---|
| `contract_masters` | 0 | Dead | No application SQL/read/write call path found; empty reserved schema table. |
| `scope_presets` | 0 | Dead | No application SQL/read/write call path found; empty reserved schema table. |
| `scope_preset_lines` | 0 | Dead | No application SQL/read/write call path found; empty reserved schema table. |
| `contract_templates` | 21 | Read-only | Yes; builder/PDF readers; no current source writer found. |
| `crew_worksheet_versions` | 0 | Read-only | Yes; read endpoints exist. A storage create helper remains but no application caller was found; do not count that definition as a live screen writer. |
| `communication_links` | 0 | Read-only | Yes; read endpoints exist. A storage create helper remains but no application caller was found; do not count that definition as a live screen writer. |
| `contracts` | 102 | Frozen | Yes; revenue/dashboard/audit/legacy consumers remain. Old storage/route write code is retained behind freeze guards. |
| `contract_services` | 1 | Frozen | Yes; revenue/dashboard/audit/legacy consumers remain. Old storage/route write code is retained behind freeze guards. |
| `contract_monthly_amounts` | 780 | Frozen | Yes; revenue/dashboard/audit/legacy consumers remain. Old storage/route write code is retained behind freeze guards. |
| `contract_documents` | 121 | Frozen | Yes; revenue/dashboard/audit/legacy consumers remain. Old storage/route write code is retained behind freeze guards. |
| `contract_status_history` | 103 | Frozen | Yes; revenue/dashboard/audit/legacy consumers remain. Old storage/route write code is retained behind freeze guards. |
| `customer_rate_sheets` | 42 | Frozen | Yes; revenue/dashboard/audit/legacy consumers remain. Old storage/route write code is retained behind freeze guards. |

## What makes retirement hard

1. **Foreign-key cascades.** The full production FK graph is in Appendix D. Deleting a maintenance_crews row can delete schedule_blocks; customer/contract/company deletes cascade across contracts, documents, amounts, rates and job data. A dead-looking parent can have non-dead references. Freeze helpers explicitly guard destructive customer/company/reset paths.
2. **Mobile and offline producers.** `artifacts/highplains-mobile/app/(tabs)/today`, property detail/history, `artifacts/highplains-mobile/lib/upload-queue.ts` and mobile endpoints in `artifacts/api-server/src/routes/crewsAndMobile.ts`, `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts` and `artifacts/api-server/src/routes/flags.ts` still depend on current job/photo/note/work-item shapes. The crew app has not been repointed merely by adding visits.
3. **QuickBooks identity and authentication.** qbo_customer_cache is an external-system cache; customers.qbo_customer_id is the link. qbo_connections stores connection state, not a second CRM customer master. Preserve those links and do not select credentials. The cache display-name equality check is recorded below.
4. **Generated clients and duplicated client schema.** `lib/api-spec/package.json` runs Orval code generation. Both API contracts/generated clients and frontend-compatible schema/catalog copies must change with a future owner switch; removing a DB column while a generated consumer still expects it is not a complete migration.
5. **Publish and phantom drops.** `replit.md` requires one active Drizzle config and forbids obsolete schema/config/package/meta files under migration backup because Publish can discover the wrong baseline and generate destructive drops. The supplied brief mentions a September 2 phantom-drop incident; its dated incident report was not found in current memory/docs, so no additional incident details are asserted. Official documentation lookup did not establish a dependency-safety guarantee for drops: always review the actual publish diff and preserve data until each reader/writer is moved. This audit does not modify a schema file or propose a drop.
6. **Snapshots and shared stored objects.** Signed terms, negotiated prices, issued proposals, dispatched worksheets and sent messages can legitimately differ from today's defaults. Shared legacy/term document paths require reference-aware cleanup; do not delete an object because one row is retired.
7. **Boot fix-ups.** `artifacts/api-server/src/routes/routes.ts` runs ticket rename, Task conversion, capability/status migration, schedule-by backfill, crew linking and visit backfill before route registration. Other seed/legacy-chemical routines also write. Existing boot DDL and raw DML are source evidence only; none was executed by the audit. Count boot functions as writers even without a screen.

### Production check: qbo_display_mirror

Environment: **production**. Observed at **2026-10-19 21:03:23.846847+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| linked | 42 |
| display_name_drift | 0 |

### Production check: plant_snapshots

Environment: **production**. Observed at **2026-10-19 21:01:11.33429+00**. Every number in this block belongs to this observation.

| Measure | Production count |
|---|---:|
| palette_items | 0 |
| proposal_joined | 3 |
| proposal_name_snapshot_difference | 0 |

## Method, limits and reproducibility

- Production counts use actual count(*) rather than PostgreSQL row estimates. All schema tables were counted in one statement at P0, with the creation window measured from that statement's CURRENT_TIMESTAMP minus 90 days. Cross-area comparisons were later SELECT statements, not one transaction spanning the audit; changes between timestamps remain possible.
- The optional helper `scripts/audit/data-ownership-inventory.mjs` only reads source text and uses the existing TypeScript parser; it imports no app module and opens no database connection. Re-run with `node scripts/audit/data-ownership-inventory.mjs`. It scans API, CRM and mobile code, excludes tests/generated output and testHelpers, resolves direct query/join and insert/update/delete sites, raw SQL, static/dynamic import aliases, storage callers and generic replaceRows callers.
- Appendix A distinguishes direct query-expression site counts from propagated enclosing routine/endpoint counts. One routine may issue multiple queries. A propagated reader/writer is not a proven production request; guarded legacy writers, test-only fixture routines and callbacks may remain in the static graph. Read-only and Frozen classifications apply the manually checked reachability/guard qualifications above.
- Appendix B enumerates discovered direct SQL sites, resolved read/write routines, endpoints and statically matched screen/component consumers. Dynamic dispatch and generated-client-only consumers are not guaranteed resolvable by this source graph; no deletion should rely solely on a zero count. Tables classified Dead were additionally searched by both SQL and exported table names.
- Contact comparisons normalize case/trim for emails and digits for phones; array multiplicity is retained. Management-company comparison normalizes case/trim. Campaign names and linked contact names use literal IS DISTINCT FROM; differences may include intentional aliases and require review.
- This is an ownership audit, not a repair proposal. Suggested owners and S/M/L estimates are provisional. No rows were changed and no task was accepted, merged, cancelled or published by this audit.

## Appendix A — all schema-defined tables

**Every database count/date in this appendix is production P0 = 2026-10-19 20:52:08.762084+00. Source site/routine counts refer to the inspected workspace main revision above, not dev or prod traffic.** Null means the qualifying timestamp column is absent or no row exists. “FK out” lists referenced tables; “FK in” lists referencing tables.

| Table | Area | Prod rows @ P0 | Created in 90d @ P0 | Newest row timestamp @ P0 | Read sites / routines (source) | Write sites / routines (source) | Main screens/endpoints | FK out | FK in | Status |
|---|---|---:|---:|---|---|---|---|---|---|---|
| [agreement_terms](#table-agreement-terms) | Contracts/scope/rates | 69 | 69 | 2026-10-19 17:54:41.687287 | 7 / 14 | 3 / 13 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, agreements, companies, contract_masters, users | agreement_terms, term_billing_months, term_documents, term_legacy_sources, term_rates, term_scope_lines, term_status_history | Active |
| [agreements](#table-agreements) | Contracts/scope/rates | 45 | 45 | 2026-10-19 17:54:41.687287 | 6 / 15 | 7 / 11 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, customers, property_management_companies | agreement_terms | Active |
| [campaign_checklist_audit_log](#table-campaign-checklist-audit-log) | Campaigns/chemicals | 0 | — | — | 1 / 2 | 2 / 3 | CampaignItemDetail.tsx; GET /api/campaigns/:id/items/:itemId/checklist/audit | campaign_checklist_tasks, campaign_items, users | — | Active |
| [campaign_checklist_tasks](#table-campaign-checklist-tasks) | Campaigns/chemicals | 0 | — | — | 2 / 6 | 1 / 2 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; GET /api/campaigns/:id; GET /api/campaigns/:id/checklist-tasks | campaigns | campaign_checklist_audit_log, campaign_item_task_completions | Active |
| [campaign_crew_members](#table-campaign-crew-members) | Crews | 2 | 0 | 2026-05-26 22:37:09.004327 | 5 / 14 | 4 / 8 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; GET /api/campaigns; GET /api/me/extra-billable-batches | campaign_crews, users | — | Active |
| [campaign_crews](#table-campaign-crews) | Crews | 2 | 0 | 2026-05-26 22:37:09.004327 | 7 / 22 | 4 / 8 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; GET /api/crews; GET /api/campaigns | campaigns, companies, crews, users | campaign_crew_members, campaign_items | Active |
| [campaign_item_task_completions](#table-campaign-item-task-completions) | Campaigns/chemicals | 0 | — | — | 1 / 3 | 4 / 4 | CampaignDetail.tsx; CampaignItemDetail.tsx; GET /api/campaigns/:id; POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle | campaign_checklist_tasks, campaign_items, users | — | Active |
| [campaign_items](#table-campaign-items) | Campaigns/chemicals | 456 | 84 | 2026-10-06 18:46:18.015 | 14 / 59 | 5 / 27 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; POST /api/campaigns/:campaignId/items/:itemId/photos/drop; DELETE /api/campaigns/:campaignId/items/:itemId/photos/*storageKey | campaign_crews, campaigns, chemical_products, companies, customers, email_logs, tickets, users | campaign_checklist_audit_log, campaign_item_task_completions | Active |
| [campaigns](#table-campaigns) | Campaigns/chemicals | 11 | 2 | 2026-09-24 02:55:30.432 | 14 / 64 | 4 / 11 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; GET /api/crews; POST /api/campaigns/:campaignId/items/:itemId/photos/drop | chemical_notification_templates, companies, seasons, users | campaign_checklist_tasks, campaign_crews, campaign_items | Active |
| [chemical_notification_templates](#table-chemical-notification-templates) | Campaigns/chemicals | 9 | 0 | 2026-09-20 23:37:56.4 | 3 / 24 | 6 / 15 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; POST /api/campaigns; GET /api/campaigns/:id | companies, users | campaigns | Active |
| [chemical_products](#table-chemical-products) | Campaigns/chemicals | 0 | 0 | — | 5 / 9 | 3 / 6 | ChemicalProductsAdmin.tsx; CrewAssignmentBoard.tsx; PropertyCard.tsx; PATCH /api/campaigns/:id/items/:itemId; POST /api/campaigns/:id/items/:itemId/send-pre-comm | companies | campaign_items | Active |
| [communication_audit_log](#table-communication-audit-log) | Messages/templates | 0 | 0 | — | 1 / 2 | 1 / 12 | ComposeDrawer.tsx; DeleteCommunicationButton.tsx; CommunicationsCenter.tsx; GET /api/communications/audit-log | communication_templates, communications, companies, users | — | Active |
| [communication_automation_rules](#table-communication-automation-rules) | Messages/templates | 5 | 0 | 2026-04-01 19:10:15.891527 | 2 / 9 | 4 / 13 | AllCommunicationsTab.tsx; GET /api/automation-rules; POST /api/automation-rules/:id/run | companies, users | — | Active |
| [communication_links](#table-communication-links) | Messages/templates | 0 | 0 | — | 1 / 2 | 1 / 1 | DeleteCommunicationButton.tsx; AllCommunicationsTab.tsx; GET /api/communications/:id | communications, companies | — | Read-only |
| [communication_templates](#table-communication-templates) | Messages/templates | 8 | 0 | 2026-04-01 19:10:15.563669 | 5 / 33 | 2 / 12 | ComposeDrawer.tsx; DeleteCommunicationButton.tsx; LogCommunicationForm.tsx; GET /api/customers/:id/parent-rollup; GET /api/admin/parent-customer-audit | companies, users | communication_audit_log, communications | Active |
| [communication_threads](#table-communication-threads) | Messages/templates | 0 | 0 | — | 2 / 3 | 1 / 3 | ComposeDrawer.tsx; DeleteCommunicationButton.tsx; CommunicationsCenter.tsx; GET /api/communication-threads | companies | communications | Active |
| [communications](#table-communications) | Messages/templates | 643 | 0 | 2026-05-13 20:56:20.452911 | 26 / 41 | 12 / 35 | BillingView.tsx; ComposeDrawer.tsx; DeleteCommunicationButton.tsx; GET /api/dashboard/action-queue; GET /sync-summary | communication_templates, communication_threads, communications, companies, contacts, customers, mailbox_accounts, users | communication_audit_log, communication_links, communications | Active |
| [companies](#table-companies) | Organization/settings | 1 | 0 | 2026-05-05 03:29:09.82 | 8 / 41 | 7 / 27 | AccountSidePanel.tsx; AppSidebar.tsx; CrewAssignmentBoard.tsx; GET /api/auth/me; POST /api/user/switch-company | — | agreement_terms, agreements, campaign_crews, campaign_items, campaigns, chemical_notification_templates, chemical_products, communication_audit_log, communication_automation_rules, communication_links, communication_templates, communication_threads, communications, company_users, contacts, contract_builder_documents, contract_documents, contract_masters, contract_monthly_amounts, contract_services, contracts, crew_worksheet_number_counters, crew_worksheet_photos, crew_worksheet_versions, crew_worksheets, crews, customer_map_documents, customer_map_layers, customer_rate_sheets, customer_service_plans, customers, email_logs, email_rules, email_templates, equipment, equipment_files, equipment_tickets, flag_photos, flags, mailbox_accounts, mailbox_backfill_runs, mailbox_sync_runs, maintenance_crews, maintenance_visit_configs, mobile_auth_tokens, notes, plant_catalog_items, plant_enrichment, plant_palette_items, plant_palettes, plant_sync_runs, property_management_companies, property_manager_emails, property_manager_phones, property_managers, property_site_notes, proposal_files, proposal_plant_items, proposal_versions, proposals, qbo_connections, qbo_customer_cache, rate_card_items, recent_property_views, scope_presets, seasons, service_plan_templates, service_type_templates, settings, sheet_templates, snow_event_attachments, snow_event_property_impacts, snow_events, style_presets, term_billing_months, term_documents, term_legacy_sources, term_rates, term_scope_lines, term_status_history, ticket_notes, ticket_notifications, ticket_photos, ticket_types, tickets, unsorted_emails, users, visits, visual_scope_sheets, weekly_schedule_templates | Active |
| [company_users](#table-company-users) | Auth | 11 | 1 | 2026-09-08 22:25:19.868141 | 14 / 51 | 6 / 14 | AppSidebar.tsx; BatchTicketDialog.tsx; BillingQueueTab.tsx; POST /api/auth/register; POST /api/user/switch-company | companies, users | — | Active |
| [contacts](#table-contacts) | Contacts/directory | 94 | 1 | 2026-10-14 16:26:37.287886 | 10 / 62 | 4 / 9 | ComposeDrawer.tsx; CrewAssignmentBoard.tsx; CustomerLocationEditor.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, customers | communications | Active |
| [contract_builder_documents](#table-contract-builder-documents) | Contracts/scope/rates | 6 | 0 | 2026-06-22 20:50:03.851962 | 2 / 6 | 4 / 10 | ContractBuilderPage.tsx; GET /api/contract-builder/documents; GET /api/contract-builder/documents/:id | companies, contracts, customers, users | contract_builder_sections, contract_builder_variables | Active |
| [contract_builder_sections](#table-contract-builder-sections) | Contracts/scope/rates | 42 | 0 | 2026-06-22 20:51:05.75009 | 1 / 4 | 2 / 4 | ContractBuilderPage.tsx; GET /api/contract-builder/documents/:id/sections; POST /api/contract-builder/documents/:id/export-pdf | contract_builder_documents, contract_templates | — | Active |
| [contract_builder_variables](#table-contract-builder-variables) | Contracts/scope/rates | 47 | 0 | 2026-06-22 20:51:06.75138 | 1 / 4 | 2 / 4 | ContractBuilderPage.tsx; GET /api/contract-builder/documents/:id/variables; POST /api/contract-builder/documents/:id/export-pdf | contract_builder_documents | — | Active |
| [contract_documents](#table-contract-documents) | Contracts/scope/rates | 121 | 30 | 2026-10-13 22:42:13.942181 | 6 / 15 | 4 / 10 | AuditImportCard.tsx; LegacyCopyCard.tsx; ContractBuilderPage.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, contracts, users | — | Frozen |
| [contract_masters](#table-contract-masters) | Contracts/scope/rates | 0 | 0 | — | 0 / 0 | 0 / 0 | See source ledger | companies, users | agreement_terms, term_documents | Dead |
| [contract_monthly_amounts](#table-contract-monthly-amounts) | Contracts/scope/rates | 780 | 84 | 2026-10-13 22:38:29.976335 | 9 / 28 | 1 / 2 | ContractServices.tsx; RevenueChart.tsx; RevenueMatrixPanel.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, contracts | — | Frozen |
| [contract_services](#table-contract-services) | Contracts/scope/rates | 1 | 1 | 2026-09-01 19:17:26.486937 | 3 / 21 | 4 / 8 | ContractServices.tsx; ScheduleSummary.tsx; AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, contracts | — | Frozen |
| [contract_status_history](#table-contract-status-history) | Contracts/scope/rates | 103 | 12 | 2026-10-13 22:37:04.894887 | 2 / 2 | 2 / 7 | ContractServices.tsx; ScheduleSummary.tsx; AuditImportCard.tsx; POST /api/admin/contract-center/copy-legacy | contracts, users | — | Frozen |
| [contract_templates](#table-contract-templates) | Contracts/scope/rates | 21 | 0 | 2025-11-19 20:18:42.415049 | 1 / 4 | 0 / 0 | ContractBuilderPage.tsx; GET /api/contract-templates; POST /api/contract-builder/documents/:id/export-pdf | — | contract_builder_sections | Read-only |
| [contracts](#table-contracts) | Contracts/scope/rates | 102 | 11 | 2026-10-13 22:41:13.166 | 21 / 52 | 6 / 13 | BillingView.tsx; ContractServices.tsx; CustomerLocationEditor.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, customers | contract_builder_documents, contract_documents, contract_monthly_amounts, contract_services, contract_status_history, customer_service_plans, tickets | Frozen |
| [crew_worksheet_number_counters](#table-crew-worksheet-number-counters) | Proposals/worksheets | 1 | — | — | 0 / 0 | 1 / 4 | CrewWorksheetDraft.tsx; CrewWorksheetMaker.tsx; CrewWorksheetPrint.tsx | companies | — | Active |
| [crew_worksheet_photos](#table-crew-worksheet-photos) | Proposals/worksheets | 5 | 5 | 2026-08-31 11:50:10.601343 | 5 / 9 | 5 / 11 | CrewWorksheetDraft.tsx; POST /api/crew-worksheets/:id/photos; PATCH /api/crew-worksheets/:id/photos/:photoId | companies, crew_worksheets | — | Active |
| [crew_worksheet_versions](#table-crew-worksheet-versions) | Proposals/worksheets | 0 | 0 | — | 4 / 6 | 1 / 1 | GET /api/crew-worksheets/:id/versions; GET /api/crew-worksheets/:id/versions/:versionId/download | companies, crew_worksheets, users | — | Read-only |
| [crew_worksheets](#table-crew-worksheets) | Proposals/worksheets | 1 | 1 | 2026-08-31 11:50:10.601343 | 4 / 19 | 4 / 8 | CrewWorksheetDraft.tsx; CrewWorksheetMaker.tsx; CrewWorksheetPrint.tsx; GET /api/crew-worksheets; GET /api/crew-worksheets/:id | companies, customers, proposals, tickets, users, visual_scope_sheets | crew_worksheet_photos, crew_worksheet_versions | Active |
| [crews](#table-crews) | Crews | 0 | 0 | — | 23 / 49 | 5 / 6 | AppSidebar.tsx; CustomerSchedulingSection.tsx; ExtraBillableCampaignView.tsx; POST /api/crews/order; GET /api/crews/board | companies, users | campaign_crews, flags, maintenance_crews, tickets, visits | Active |
| [customer_map_documents](#table-customer-map-documents) | Maps | 0 | 0 | — | 2 / 3 | 3 / 6 | GET /api/customers/:customerId/map-documents | companies, customers | — | Active |
| [customer_map_layers](#table-customer-map-layers) | Maps | 221 | 58 | 2026-09-10 20:46:53.583079 | 2 / 4 | 4 / 8 | CustomerDetail.tsx; PropertyMapsPage.tsx; GET /api/customers/:customerId/map-layers; POST /api/customers/:customerId/map-layers | companies, customers | — | Active |
| [customer_rate_sheets](#table-customer-rate-sheets) | Contracts/scope/rates | 42 | 0 | 2026-04-17 18:28:52.116187 | 5 / 14 | 1 / 2 | CustomerLocationEditor.tsx; CustomerSearchInput.tsx; AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies, customers, users | — | Frozen |
| [customer_service_plans](#table-customer-service-plans) | Services/templates | 6 | 6 | 2026-09-15 20:13:47.036381 | 5 / 12 | 3 / 13 | ContractServices.tsx; ScheduleSummary.tsx; ServiceFulfillmentPanel.tsx; POST /api/admin/contract-center/copy-legacy; GET /api/admin/parent-customer-audit | companies, contracts, customers, service_plan_templates | — | Active |
| [customers](#table-customers) | Customers/properties | 62 | 7 | 2026-10-14 16:28:11.29 | 79 / 242 | 16 / 33 | AnnualServiceRollup.tsx; AppSidebar.tsx; BatchTicketDialog.tsx; POST /api/setup/initialize; GET /api/admin/contract-center/current-export | companies | agreements, campaign_items, communications, contacts, contract_builder_documents, contracts, crew_worksheets, customer_map_documents, customer_map_layers, customer_rate_sheets, customer_service_plans, email_logs, flags, maintenance_visit_configs, notes, plant_palettes, property_site_notes, proposals, qbo_customer_cache, recent_property_views, snow_event_property_impacts, tickets, visits, visual_scope_sheets | Active |
| [email_logs](#table-email-logs) | Messages/templates | 337 | 109 | 2026-10-06 18:46:18.437751 | 2 / 5 | 3 / 29 | CrewAssignmentBoard.tsx; PropertyCard.tsx; CampaignDetail.tsx; GET /api/email-logs; POST /api/email-logs/:id/resend | companies, customers, email_templates, tickets, users | campaign_items | Active |
| [email_rules](#table-email-rules) | Messages/templates | 1 | 0 | 2026-02-17 23:03:44.508547 | 3 / 9 | 3 / 6 | SettingsPage.tsx; TicketDetail.tsx; GET /api/email-rules; POST /api/tickets/:id/send-completion-email | companies, email_templates | — | Active |
| [email_templates](#table-email-templates) | Messages/templates | 3 | 0 | 2026-10-19 20:09:13.654 | 4 / 11 | 3 / 6 | SettingsPage.tsx; TicketDetail.tsx; GET /api/email-templates; GET /api/email-logs | companies | email_logs, email_rules | Active |
| [equipment](#table-equipment) | Equipment | 23 | 0 | 2026-04-07 16:43:01.093011 | 5 / 8 | 3 / 6 | TicketListView.tsx; EquipmentDetail.tsx; EquipmentList.tsx; GET /api/equipment/:id; GET /api/equipment-tickets | companies, users | equipment_files, equipment_tickets | Active |
| [equipment_files](#table-equipment-files) | Equipment | 0 | 0 | — | 2 / 3 | 2 / 4 | EquipmentDetail.tsx; GET /api/equipment/:equipmentId/files | companies, equipment, users | — | Active |
| [equipment_ticket_status_history](#table-equipment-ticket-status-history) | Equipment | 13 | 0 | 2026-06-24 17:21:18.545261 | 1 / 2 | 1 / 3 | EquipmentDetail.tsx; EquipmentList.tsx; EquipmentTicketDetail.tsx; GET /api/equipment-tickets/:ticketId/history | equipment_tickets, users | — | Active |
| [equipment_tickets](#table-equipment-tickets) | Equipment | 6 | 0 | 2026-06-24 17:21:18.494 | 6 / 11 | 3 / 6 | TicketListView.tsx; EquipmentDetail.tsx; EquipmentList.tsx; GET /api/equipment; GET /api/equipment-tickets | companies, equipment, users | equipment_ticket_status_history | Active |
| [flag_photos](#table-flag-photos) | Notes/photos/flags | 0 | 0 | — | 5 / 4 | 2 / 2 | AppSidebar.tsx; FlagDetailPage.tsx; FlagsInboxPage.tsx; POST /api/m/flags; POST /api/m/flags/:id/photos | companies, flags, users | — | Active |
| [flags](#table-flags) | Notes/photos/flags | 0 | 0 | — | 8 / 6 | 2 / 2 | AppSidebar.tsx; FlagDetailPage.tsx; FlagsInboxPage.tsx; POST /api/m/flags; POST /api/m/flags/:id/photos | companies, crews, customers, tickets, users | flag_photos | Active |
| [mailbox_accounts](#table-mailbox-accounts) | Messages/templates | 1 | 0 | 2026-05-11 18:29:13.107 | 32 / 58 | 18 / 41 | ComposeDrawer.tsx; CrewAssignmentBoard.tsx; DeleteCommunicationButton.tsx; POST /api/m/flags; GET / | companies, users | communications, mailbox_backfill_runs, mailbox_sync_runs, unsorted_emails | Active |
| [mailbox_backfill_runs](#table-mailbox-backfill-runs) | Messages/templates | 1 | 0 | 2026-05-11 18:56:04.18 | 5 / 12 | 2 / 9 | POST /:id/backfill; GET /:id/backfill/status | companies, mailbox_accounts | — | Active |
| [mailbox_sync_runs](#table-mailbox-sync-runs) | Messages/templates | 0 | — | — | 4 / 3 | 3 / 7 | GET /sync-summary; POST /:id/sync | companies, mailbox_accounts | — | Active |
| [maintenance_crews](#table-maintenance-crews) | Crews | 5 | 0 | 2026-06-14 19:02:31.660149 | 7 / 14 | 9 / 13 | CustomerSchedulingSection.tsx; ExtraBillableCampaignView.tsx; SchedulePreview.tsx; GET /api/crews; POST /api/crews | companies, crews | maintenance_visit_configs, schedule_blocks | Active |
| [maintenance_visit_configs](#table-maintenance-visit-configs) | Scheduling | 45 | 0 | 2026-06-14 19:36:54.566806 | 2 / 5 | 3 / 5 | CustomerSchedulingSection.tsx; ScheduleViewer.tsx; WeeklySchedulerPage.tsx; GET /api/customers/:customerId/maintenance-config; PUT /api/customers/:customerId/maintenance-config | companies, customers, maintenance_crews | schedule_blocks | Active |
| [mobile_auth_tokens](#table-mobile-auth-tokens) | Auth | 0 | 0 | — | 1 / 5 | 3 / 9 | See source ledger | companies, users | — | Active |
| [notes](#table-notes) | Notes/photos/flags | 12 | 2 | 2026-10-07 17:02:50.414419 | 1 / 3 | 4 / 8 | CustomerDetail.tsx; GET /api/customers/:customerId/notes; GET /api/admin/parent-customer-audit | companies, customers, users | — | Active |
| [plant_catalog_items](#table-plant-catalog-items) | Plants | 2596 | 0 | 2026-07-15 16:08:01.92 | 6 / 10 | 2 / 5 | PlantLibrary.tsx; PlantMatches.tsx; PlantPaletteDraft.tsx; POST /api/proposals/:id/plant-items; GET /api/plant-library/items | companies | plant_palette_items, proposal_plant_items | Active |
| [plant_enrichment](#table-plant-enrichment) | Plants | 886 | 0 | 2026-07-15 17:32:40.332 | 7 / 12 | 3 / 7 | PlantLibrary.tsx; PlantMatches.tsx; PlantPaletteDraft.tsx; POST /api/proposals/:id/plant-items; GET /api/plant-library/items | companies | — | Active |
| [plant_palette_items](#table-plant-palette-items) | Plants | 0 | 0 | — | 4 / 17 | 4 / 4 | PlantPaletteDraft.tsx; ProposalDraft.tsx; ProposalMaker.tsx; GET /api/proposals/:id; PATCH /api/proposals/:id | companies, plant_catalog_items, plant_palettes | — | Active |
| [plant_palettes](#table-plant-palettes) | Plants | 1 | 1 | 2026-08-04 16:28:23.42 | 6 / 18 | 6 / 6 | PlantPaletteDraft.tsx; PlantPalettes.tsx; ProposalDraft.tsx; GET /api/proposals/:id; PATCH /api/proposals/:id | companies, customers, users | plant_palette_items, proposals | Active |
| [plant_sync_runs](#table-plant-sync-runs) | Plants | 16 | — | — | 2 / 2 | 8 / 9 | PlantLibrary.tsx; PlantMatches.tsx; GET /api/plant-library/sync-status; GET /api/plant-library/enrichment-status | companies | — | Active |
| [property_management_companies](#table-property-management-companies) | Contacts/directory | 8 | 0 | 2025-12-31 18:26:21.371148 | 5 / 13 | 4 / 9 | LegacyCopyCard.tsx; CustomerDetail.tsx; NewContractPage.tsx; POST /api/admin/contract-center/copy-legacy; GET /api/property-management-companies | companies | agreements, property_managers | Active |
| [property_manager_emails](#table-property-manager-emails) | Contacts/directory | 21 | 0 | 2026-04-27 18:22:51.452545 | 1 / 3 | 4 / 10 | CustomerDetail.tsx; NewContractPage.tsx; NewTicket.tsx; GET /api/property-managers; GET /api/property-managers/:managerId/emails | companies, property_managers | — | Active |
| [property_manager_phones](#table-property-manager-phones) | Contacts/directory | 18 | 0 | 2026-04-27 18:22:51.48874 | 1 / 3 | 4 / 10 | CustomerDetail.tsx; NewContractPage.tsx; NewTicket.tsx; GET /api/property-managers; GET /api/property-managers/:managerId/phones | companies, property_managers | — | Active |
| [property_managers](#table-property-managers) | Contacts/directory | 21 | 0 | 2026-04-27 18:22:51.416601 | 3 / 7 | 3 / 8 | CustomerLocationEditor.tsx; CustomerSearchInput.tsx; UnsortedTab.tsx; PATCH /api/customers/:id; GET /api/property-managers | companies, property_management_companies | property_manager_emails, property_manager_phones | Active |
| [property_site_notes](#table-property-site-notes) | Notes/photos/flags | 0 | 0 | — | 3 / 5 | 3 / 3 | [id].tsx; [id].tsx; new.tsx; GET /api/m/tickets/:id; GET /api/customers/:id/site-notes | companies, customers | — | Active |
| [proposal_files](#table-proposal-files) | Proposals/worksheets | 308 | 113 | 2026-10-15 17:02:24.300375 | 10 / 37 | 5 / 10 | CustomerDetail.tsx; ProposalDraft.tsx; ProposalMaker.tsx; GET /api/admin/parent-customer-audit; GET /api/proposals | companies, proposals | — | Active |
| [proposal_plant_items](#table-proposal-plant-items) | Plants | 3 | 3 | 2026-08-11 19:29:18.189194 | 4 / 27 | 4 / 4 | CustomerDetail.tsx; ProposalDraft.tsx; ProposalMaker.tsx; GET /api/admin/parent-customer-audit; GET /api/proposals | companies, plant_catalog_items, proposals | — | Active |
| [proposal_versions](#table-proposal-versions) | Proposals/worksheets | 164 | 50 | 2026-10-15 17:04:08.246225 | 4 / 8 | 1 / 2 | ProposalDraft.tsx; ProposalVersion.tsx; POST /api/proposals/:id/finalize; GET /api/proposals/:id/versions | companies, proposals, users | — | Active |
| [proposals](#table-proposals) | Proposals/worksheets | 111 | 33 | 2026-10-06 22:29:42.214236 | 8 / 30 | 4 / 8 | CustomerDetail.tsx; ProposalDraft.tsx; ProposalMaker.tsx; GET /api/admin/parent-customer-audit; GET /api/proposals | companies, customers, plant_palettes, tickets, users, visual_scope_sheets | crew_worksheets, proposal_files, proposal_plant_items, proposal_versions | Active |
| [qbo_connections](#table-qbo-connections) | QuickBooks | 1 | — | 2026-10-19 19:49:44.657 | 6 / 21 | 7 / 17 | GET /connection; GET /callback | companies | — | Active |
| [qbo_customer_cache](#table-qbo-customer-cache) | QuickBooks | 237 | 208 | 2026-10-13 23:21:45.755591 | 1 / 2 | 4 / 8 | POST /customers/import-seed | companies, customers | — | Active |
| [rate_card_items](#table-rate-card-items) | Contracts/scope/rates | 43 | 43 | 2026-10-14 15:37:08.149673 | 4 / 17 | 4 / 6 | AuditImportCard.tsx; ContractSettings.tsx; LegacyCopyCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | companies | — | Active |
| [recent_property_views](#table-recent-property-views) | Other | 0 | — | — | 2 / 2 | 1 / 1 | [id].tsx; index.tsx; GET /api/m/properties; GET /api/m/sync | companies, customers, users | — | Active |
| [schedule_blocks](#table-schedule-blocks) | Scheduling | 224 | 0 | 2026-06-14 19:37:39.274018 | 1 / 2 | 5 / 9 | WeeklySchedulerPage.tsx; GET /api/schedule-templates/:templateId/blocks | maintenance_crews, maintenance_visit_configs, weekly_schedule_templates | — | Active |
| [scope_preset_lines](#table-scope-preset-lines) | Contracts/scope/rates | 0 | — | — | 0 / 0 | 0 / 0 | See source ledger | scope_presets | — | Dead |
| [scope_presets](#table-scope-presets) | Contracts/scope/rates | 0 | 0 | — | 0 / 0 | 0 / 0 | See source ledger | companies | scope_preset_lines | Dead |
| [seasons](#table-seasons) | Seasons | 1 | 0 | 2026-03-18 04:36:21.686975 | 4 / 15 | 3 / 6 | BillingQueueTab.tsx; CrewAssignmentBoard.tsx; ExtraBillableCampaignView.tsx; GET /api/dashboard/pulse; GET /api/campaigns | companies | campaigns | Active |
| [service_plan_template_items](#table-service-plan-template-items) | Services/templates | 0 | 0 | — | 2 / 6 | 2 / 3 | ServiceFulfillmentPanel.tsx; ServicePlanTemplatesAdmin.tsx; GET /api/service-plan-templates; POST /api/service-plan-templates | service_plan_templates | — | Active |
| [service_plan_templates](#table-service-plan-templates) | Services/templates | 0 | 0 | — | 2 / 6 | 3 / 6 | ServiceFulfillmentPanel.tsx; ServicePlanTemplatesAdmin.tsx; GET /api/service-plan-templates; POST /api/service-plan-templates | companies | customer_service_plans, service_plan_template_items | Active |
| [service_type_template_items](#table-service-type-template-items) | Services/templates | 0 | 0 | — | 3 / 3 | 4 / 4 | TicketWorkItemsCard.tsx; WorkItemTemplatesAdmin.tsx; GET /api/service-type-templates; POST /api/service-type-templates/:id/items | service_type_templates | — | Active |
| [service_type_templates](#table-service-type-templates) | Services/templates | 0 | 0 | — | 3 / 7 | 3 / 3 | TicketWorkItemsCard.tsx; WorkItemTemplatesAdmin.tsx; GET /api/service-type-templates; POST /api/service-type-templates/:id/items | companies | service_type_template_items | Active |
| [settings](#table-settings) | Organization/settings | 1 | 0 | 2026-05-05 03:29:09.948 | 3 / 19 | 4 / 9 | ComposeDrawer.tsx; DeleteCommunicationButton.tsx; CommunicationsCenter.tsx; GET /; POST /:id/sync | companies | — | Active |
| [sheet_templates](#table-sheet-templates) | Other | 0 | 0 | — | 1 / 2 | 3 / 6 | VisualScopeEditor.tsx; GET /api/sheet-templates | companies | — | Active |
| [snow_event_attachments](#table-snow-event-attachments) | Snow | 0 | 0 | — | 1 / 2 | 2 / 4 | GET /api/snow-events/:eventId/attachments | companies, snow_events, users | — | Active |
| [snow_event_property_impacts](#table-snow-event-property-impacts) | Snow | 0 | 0 | — | 3 / 8 | 4 / 9 | CustomerDetail.tsx; NewSnowEvent.tsx; SnowEventDetail.tsx; GET /api/snow-events; GET /api/snow-events/:eventId/impacts | companies, customers, snow_events | — | Active |
| [snow_events](#table-snow-events) | Snow | 0 | 0 | — | 3 / 14 | 3 / 8 | CustomerDetail.tsx; NewSnowEvent.tsx; SnowEventDetail.tsx; GET /api/snow-events; GET /api/snow-events/:id | companies, users | snow_event_attachments, snow_event_property_impacts | Active |
| [style_presets](#table-style-presets) | Other | 16 | 16 | 2026-08-27 22:54:53.359007 | 2 / 3 | 4 / 8 | VisualScopeEditor.tsx; GET /api/style-presets | companies | — | Active |
| [term_billing_months](#table-term-billing-months) | Contracts/scope/rates | 1422 | 1422 | 2026-10-19 17:54:41.687287 | 5 / 12 | 8 / 12 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, companies | — | Active |
| [term_documents](#table-term-documents) | Contracts/scope/rates | 66 | 14 | 2026-10-13 22:37:15.808 | 5 / 12 | 4 / 9 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, companies, contract_masters, users | — | Active |
| [term_legacy_sources](#table-term-legacy-sources) | Contracts/scope/rates | 99 | 99 | 2026-10-19 17:54:41.687287 | 5 / 13 | 2 / 5 | AuditImportCard.tsx; CustomerContracts.tsx; LegacyCopyCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, companies | — | Active |
| [term_rates](#table-term-rates) | Contracts/scope/rates | 2463 | 2463 | 2026-10-19 17:54:41.687287 | 3 / 12 | 7 / 12 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, companies | — | Active |
| [term_scope_lines](#table-term-scope-lines) | Contracts/scope/rates | 721 | 721 | 2026-10-19 17:54:41.687287 | 3 / 12 | 7 / 12 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, companies | — | Active |
| [term_status_history](#table-term-status-history) | Contracts/scope/rates | 72 | 72 | 2026-10-19 17:54:41.687287 | 2 / 12 | 3 / 14 | AuditImportCard.tsx; GET /api/admin/contract-center/current-export; GET /api/admin/contract-center/audit-export/batches | agreement_terms, companies, users | — | Active |
| [ticket_comment_mentions](#table-ticket-comment-mentions) | Tickets | 14 | 1 | 2026-10-08 14:22:43.607823 | 1 / 1 | 1 / 2 | TicketDetail.tsx | ticket_comments, users | — | Active |
| [ticket_comments](#table-ticket-comments) | Tickets | 87 | 29 | 2026-10-12 23:01:11.781531 | 1 / 8 | 4 / 13 | BillingView.tsx; SettingsPage.tsx; TicketDetail.tsx; POST /api/tickets/:id/create-invoice; POST /api/tickets/create-invoice-from-project | tickets, users | ticket_comment_mentions | Active |
| [ticket_field_values](#table-ticket-field-values) | Tickets | 792 | — | — | 1 / 8 | 3 / 7 | BatchTicketDialog.tsx; BillingQueueTab.tsx; BillingView.tsx; POST /api/ticket-types/init-project; POST /api/migrate-approved-projects | ticket_type_fields, tickets, users | — | Active |
| [ticket_links](#table-ticket-links) | Tickets | 65 | 33 | 2026-10-12 20:41:20.746074 | 5 / 18 | 3 / 11 | AppSidebar.tsx; BatchTicketDialog.tsx; BillingQueueTab.tsx; GET /api/dashboard/action-queue; GET /api/dashboard/pulse | tickets | — | Active |
| [ticket_notes](#table-ticket-notes) | Tickets | 0 | 0 | — | 7 / 6 | 2 / 2 | TicketDetail.tsx; [id].tsx; GET /api/m/tickets/:id; GET /api/m/sync | companies, tickets, users | — | Active |
| [ticket_notifications](#table-ticket-notifications) | Tickets | 711 | 90 | 2026-10-19 16:38:33.382526 | 4 / 7 | 5 / 18 | BatchTicketDialog.tsx; BillingQueueTab.tsx; BillingView.tsx; GET /api/notifications; GET /api/notifications/unread-count | companies, tickets, users | — | Active |
| [ticket_photos](#table-ticket-photos) | Tickets | 0 | 0 | — | 8 / 8 | 2 / 2 | TicketDetail.tsx; [id].tsx; GET /api/m/tickets/:id; PATCH /api/m/work-items/:id | companies, tickets, users | — | Active |
| [ticket_sources](#table-ticket-sources) | Tickets | 318 | 67 | 2026-10-19 16:38:33.308564 | 1 / 1 | 1 / 2 | BatchTicketDialog.tsx; BillingQueueTab.tsx; BillingView.tsx | tickets | — | Active |
| [ticket_status_history](#table-ticket-status-history) | Tickets | 1566 | 363 | 2026-10-19 16:38:33.264367 | 2 / 5 | 4 / 17 | BatchTicketDialog.tsx; BillingQueueTab.tsx; BillingView.tsx; GET /api/customers/:id/parent-rollup; GET /api/tickets/:ticketId/status-history | ticket_type_statuses, tickets, users | — | Active |
| [ticket_type_fields](#table-ticket-type-fields) | Tickets | 59 | 0 | 2026-03-04 19:22:00.965155 | 4 / 28 | 4 / 31 | BatchTicketDialog.tsx; BillingQueueTab.tsx; BillingView.tsx; POST /api/setup/initialize; POST /api/ticket-types/init-rfp | ticket_type_statuses, ticket_types | ticket_field_values | Active |
| [ticket_type_statuses](#table-ticket-type-statuses) | Tickets | 47 | 2 | 2026-10-08 17:24:01.053206 | 19 / 72 | 10 / 37 | AppSidebar.tsx; BatchTicketDialog.tsx; BillingQueueTab.tsx; POST /api/setup/initialize; GET /api/m/properties/:id | ticket_types | ticket_status_history, ticket_type_fields, tickets | Active |
| [ticket_types](#table-ticket-types) | Tickets | 6 | 0 | 2026-03-04 19:22:00.508007 | 17 / 73 | 10 / 35 | AppSidebar.tsx; BatchTicketDialog.tsx; BillingQueueTab.tsx; POST /api/setup/initialize; GET /api/dashboard/action-queue | companies | ticket_type_fields, ticket_type_statuses, tickets | Active |
| [ticket_work_items](#table-ticket-work-items) | Tickets | 0 | 0 | — | 3 / 9 | 7 / 6 | TicketWorkItemsCard.tsx; [id].tsx; GET /api/m/tickets/:id; PATCH /api/m/work-items/:id | tickets, users | — | Active |
| [tickets](#table-tickets) | Tickets | 538 | 100 | 2026-10-19 16:39:07.12 | 40 / 97 | 13 / 37 | AppSidebar.tsx; BatchTicketDialog.tsx; BillingQueueTab.tsx; GET /api/m/today; POST /api/m/tickets/:id/start | companies, contracts, crews, customers, ticket_type_statuses, ticket_types, tickets, users | campaign_items, crew_worksheets, email_logs, flags, proposals, ticket_comments, ticket_field_values, ticket_links, ticket_notes, ticket_notifications, ticket_photos, ticket_sources, ticket_status_history, ticket_work_items, tickets, visits | Active |
| [unsorted_emails](#table-unsorted-emails) | Messages/templates | 843 | 0 | 2026-05-11 18:56:00.095653 | 11 / 37 | 7 / 13 | ComposeDrawer.tsx; DeleteCommunicationButton.tsx; LogCommunicationForm.tsx; GET /sync-summary; POST /:id/sync | companies, mailbox_accounts, users | — | Active |
| [users](#table-users) | Auth | 14 | 1 | 2026-09-08 22:25:19.800314 | 49 / 129 | 9 / 26 | AccountSidePanel.tsx; AppSidebar.tsx; BatchTicketDialog.tsx; POST /api/auth/register; POST /api/user/switch-company | companies | agreement_terms, campaign_checklist_audit_log, campaign_crew_members, campaign_crews, campaign_item_task_completions, campaign_items, campaigns, chemical_notification_templates, communication_audit_log, communication_automation_rules, communication_templates, communications, company_users, contract_builder_documents, contract_documents, contract_masters, contract_status_history, crew_worksheet_versions, crew_worksheets, crews, customer_rate_sheets, email_logs, equipment, equipment_files, equipment_ticket_status_history, equipment_tickets, flag_photos, flags, mailbox_accounts, mobile_auth_tokens, notes, plant_palettes, proposal_versions, proposals, recent_property_views, snow_event_attachments, snow_events, term_documents, term_status_history, ticket_comment_mentions, ticket_comments, ticket_field_values, ticket_notes, ticket_notifications, ticket_photos, ticket_status_history, ticket_work_items, tickets, unsorted_emails, visits, visual_scope_sheets | Active |
| [visits](#table-visits) | Scheduling | 0 | 0 | — | 11 / 12 | 8 / 7 | GET /api/visits; GET /api/visits/summary | companies, crews, customers, tickets, users | — | Active |
| [visual_scope_sheets](#table-visual-scope-sheets) | Maps | 6 | 0 | 2026-10-06 21:49:57.344 | 5 / 22 | 4 / 10 | CrewWorksheetDraft.tsx; CrewWorksheetPrint.tsx; CustomerDetail.tsx; GET /api/m/properties/:id; GET /api/crew-worksheets/:id/pdf | companies, customers, users | crew_worksheets, proposals | Active |
| [weekly_schedule_templates](#table-weekly-schedule-templates) | Scheduling | 7 | 0 | 2026-06-14 19:02:01.664962 | 2 / 6 | 4 / 8 | SchedulePreview.tsx; ScheduleViewer.tsx; WeeklySchedulerPage.tsx; GET /api/schedule-templates; GET /api/schedule-templates/:id | companies | schedule_blocks | Active |

### Additional production infrastructure tables

Environment: production. Observed at 2026-10-19 21:06:43.202118+00. These are outside the 113 declared tables and are not dead-table candidates. No session/credential row values were read.

| Table | Production rows | Purpose |
|---|---:|---|
| `session` | 7 | Session store |
| `_migration_audit_log` | 0 | Migration tracking/audit infrastructure |
| `_applied_sql_migrations` | 0 | Migration tracking/audit infrastructure |
| `_chem_notif_legacy_cleanup` | 1 | One-time chemical-template cleanup marker |

## Appendix B — full source evidence ledger

Each table lists every direct query site and statically resolved read/write routine found by the helper, including route labels. Client consumer files are endpoint matches, not independent DB writers. Frozen routes and unreachable legacy/test fixture definitions remain visible so retirement work does not mistake source remnants for absent dependencies.

<a id="table-agreement-terms"></a>
### agreement_terms

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 18 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 54 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 20 from; 72 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 56 from; 75 innerJoin; 167 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 22 insert
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 46 update; 48 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 19 getTerm; 29 lockTerm; 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 43 writeTerm
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-agreements"></a>
### agreements

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 17 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 53 from; 91 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 15 from; 25 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 55 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 13 delete; 15 insert; 63 delete; 67 delete
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 17 insert
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 35 insert
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 98 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 14 getAgreement; 24 lockAgreement; 29 lockTerm; 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-campaign-checklist-audit-log"></a>
### campaign_checklist_audit_log

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4232 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4227 insert; 4273 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 15167 GET /api/campaigns/:id/items/:itemId/checklist/audit
- `artifacts/api-server/src/storage.ts`: 4231 getCampaignChecklistAuditLog

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle
- `artifacts/api-server/src/storage.ts`: 4226 createCampaignChecklistAuditLog; 4249 toggleCampaignChecklistTaskTx

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`

<a id="table-campaign-checklist-tasks"></a>
### campaign_checklist_tasks

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4200 from; 4232 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4204 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 14163 GET /api/campaigns/:id; 15084 GET /api/campaigns/:id/checklist-tasks; 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle; 15167 GET /api/campaigns/:id/items/:itemId/checklist/audit
- `artifacts/api-server/src/storage.ts`: 4199 getCampaignChecklistTasks; 4231 getCampaignChecklistAuditLog

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 14034 POST /api/campaigns
- `artifacts/api-server/src/storage.ts`: 4203 createCampaignChecklistTask

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`

<a id="table-campaign-crew-members"></a>
### campaign_crew_members

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3950 from; 4041 from; 4050 from; 4061 from; 4108 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4002 insert; 4020 insert; 4045 insert; 4056 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/extraBillableAccess.ts`: 36 canAccessExtraBillableCampaignItem
- `artifacts/api-server/src/routes/routes.ts`: 13997 GET /api/campaigns; 14024 GET /api/me/extra-billable-batches; 14163 GET /api/campaigns/:id; 14735 GET /api/campaigns/:id/crews; 14835 POST /api/campaigns/:id/crews/:crewId/members; 17889 POST /api/campaigns/:id/items/:itemId/completion-photos/upload; 17982 POST /api/campaigns/:id/items/:itemId/completion-photos; 18020 DELETE /api/campaigns/:id/items/:itemId/completion-photos
- `artifacts/api-server/src/storage.ts`: 3943 getCampaignCrews; 4040 getCampaignCrewMembers; 4044 addCampaignCrewMember; 4060 getCampaignIdsForUserCrews; 4068 getMyExtraBillableBatches

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 14754 POST /api/campaigns/:id/crews; 14790 PATCH /api/campaigns/:id/crews/:crewId; 14835 POST /api/campaigns/:id/crews/:crewId/members; 14853 DELETE /api/campaigns/:id/crews/:crewId/members/:userId
- `artifacts/api-server/src/storage.ts`: 3996 createCampaignCrew; 4010 updateCampaignCrew; 4044 addCampaignCrewMember; 4055 removeCampaignCrewMember

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/MyExtraBillableBatchesWidget.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyBatchesPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`

<a id="table-campaign-crews"></a>
### campaign_crews

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/linkCrews.ts`: 32 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 120 from
- `artifacts/api-server/src/storage.ts`: 3944 from; 3991 from; 4061 innerJoin; 4097 from; 4108 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/linkCrews.ts`: 45 update
- `artifacts/api-server/src/storage.ts`: 4001 insert; 4014 update; 4030 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/extraBillableAccess.ts`: 36 canAccessExtraBillableCampaignItem
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 107 listCrewsWithSupervisor; 169 GET /api/crews
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 13997 GET /api/campaigns; 14024 GET /api/me/extra-billable-batches; 14163 GET /api/campaigns/:id; 14735 GET /api/campaigns/:id/crews; 14790 PATCH /api/campaigns/:id/crews/:crewId; 14819 DELETE /api/campaigns/:id/crews/:crewId; 14835 POST /api/campaigns/:id/crews/:crewId/members; 14853 DELETE /api/campaigns/:id/crews/:crewId/members/:userId; 14868 PATCH /api/campaigns/:id/items/:itemId/crew; 14897 POST /api/campaigns/:campaignId/items/bulk-assign-crew; 17889 POST /api/campaigns/:id/items/:itemId/completion-photos/upload; 17982 POST /api/campaigns/:id/items/:itemId/completion-photos; 18020 DELETE /api/campaigns/:id/items/:itemId/completion-photos
- `artifacts/api-server/src/storage.ts`: 3943 getCampaignCrews; 3990 getCampaignCrewById; 4060 getCampaignIdsForUserCrews; 4068 getMyExtraBillableBatches

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 14754 POST /api/campaigns/:id/crews; 14790 PATCH /api/campaigns/:id/crews/:crewId; 14819 DELETE /api/campaigns/:id/crews/:crewId
- `artifacts/api-server/src/storage.ts`: 3996 createCampaignCrew; 4010 updateCampaignCrew; 4029 deleteCampaignCrew

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/MyExtraBillableBatchesWidget.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyBatchesPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-campaign-item-task-completions"></a>
### campaign_item_task_completions

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4209 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4213 insert; 4218 delete; 4260 delete; 4267 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 14163 GET /api/campaigns/:id; 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle
- `artifacts/api-server/src/storage.ts`: 4208 getCampaignItemTaskCompletions

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle
- `artifacts/api-server/src/storage.ts`: 4212 createCampaignItemTaskCompletion; 4217 deleteCampaignItemTaskCompletion; 4249 toggleCampaignChecklistTaskTx

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`

<a id="table-campaign-items"></a>
### campaign_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/routes.ts`: 10309 innerJoin; 14916 from; 14994 innerJoin
- `artifacts/api-server/src/storage.ts`: 3719 from; 3767 from; 3771 from; 3777 from; 3827 from; 3876 from; 3889 from; 3954 from; 4034 from; 4124 from; 5068 raw SQL

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 14937 update
- `artifacts/api-server/src/storage.ts`: 3912 insert; 3917 update; 3922 delete; 3937 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/extraBillablePhotos.ts`: 144 loadAndAuthorize; 191 POST /api/campaigns/:campaignId/items/:itemId/photos/drop; 245 DELETE /api/campaigns/:campaignId/items/:itemId/photos/*storageKey; 280 POST /api/campaigns/:campaignId/items/:targetItemId/photos/move; 379 GET /api/campaigns/:campaignId/items/:itemId/photo-urls
- `artifacts/api-server/src/routes/routes.ts`: 10212 GET /api/customers/:id/campaign-items; 10271 GET /api/customers/:id/annual-service-rollup; 13997 GET /api/campaigns; 14024 GET /api/me/extra-billable-batches; 14163 GET /api/campaigns/:id; 14294 GET /api/campaigns/:id/items/:itemId/notification-recipient; 14308 emailPreviewHandler; 14465 GET /api/campaigns/:id/items/:itemId/template-variables; 14639 POST /api/campaigns/:id/items; 14700 DELETE /api/campaigns/:id/items/:itemId; 14735 GET /api/campaigns/:id/crews; 14819 DELETE /api/campaigns/:id/crews/:crewId; 14868 PATCH /api/campaigns/:id/items/:itemId/crew; 14897 POST /api/campaigns/:campaignId/items/bulk-assign-crew; 14961 GET /api/operations/customer-service-summaries; 15064 GET /api/operations/items; 15074 GET /api/customers/:customerId/campaign-items; 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle; 15167 GET /api/campaigns/:id/items/:itemId/checklist/audit; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15852 POST /api/campaigns/:id/items/:itemId/complete-work; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16228 PATCH /api/campaigns/:id/items/:itemId/weather; 16263 POST /api/campaigns/:id/items/:itemId/label; 16328 POST /api/campaign-visits/:id/label; 16455 GET /api/seasons/:id/report; 17058 GET /api/customers/:id/campaign-items; 17068 GET /api/properties/:id/campaign-items; 17111 GET /api/operations/overdue; 17166 GET /api/operations/due-this-week; 17224 GET /api/operations/missing-obligations; 17327 GET /api/operations/exceptions; 17534 GET /api/customers/:id/service-fulfillment; 17889 POST /api/campaigns/:id/items/:itemId/completion-photos/upload; 17946 POST /api/campaigns/:id/items/:itemId/label-pdf/upload; 17982 POST /api/campaigns/:id/items/:itemId/completion-photos; 18020 DELETE /api/campaigns/:id/items/:itemId/completion-photos; 18070 GET /api/campaigns/:id/items/:itemId/completion-photo-urls; 18102 POST /api/campaigns/:id/items/:itemId/complete-work-v2; 18218 resolveChemItemEmailContext; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email
- `artifacts/api-server/src/storage.ts`: 3701 getCampaigns; 3766 getCampaignItems; 3770 getCampaignItemById; 3775 getCampaignItemsByCustomer; 3825 getCampaignItemsByProperty; 3875 getCampaignItemsByCustomerId; 3888 getCampaignItemsGlobal; 3943 getCampaignCrews; 4033 countCampaignItemsForCrew; 4068 getMyExtraBillableBatches; 5053 getServiceFulfillment

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/extraBillablePhotos.ts`: 191 POST /api/campaigns/:campaignId/items/:itemId/photos/drop; 245 DELETE /api/campaigns/:campaignId/items/:itemId/photos/*storageKey; 280 POST /api/campaigns/:campaignId/items/:targetItemId/photos/move
- `artifacts/api-server/src/routes/routes.ts`: 14034 POST /api/campaigns; 14639 POST /api/campaigns/:id/items; 14700 DELETE /api/campaigns/:id/items/:itemId; 14868 PATCH /api/campaigns/:id/items/:itemId/crew; 14897 POST /api/campaigns/:campaignId/items/bulk-assign-crew; 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15852 POST /api/campaigns/:id/items/:itemId/complete-work; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16228 PATCH /api/campaigns/:id/items/:itemId/weather; 16263 POST /api/campaigns/:id/items/:itemId/label; 16301 DELETE /api/campaigns/:id/items/:itemId/label; 16328 POST /api/campaign-visits/:id/label; 16362 DELETE /api/campaign-visits/:id/label; 17889 POST /api/campaigns/:id/items/:itemId/completion-photos/upload; 17946 POST /api/campaigns/:id/items/:itemId/label-pdf/upload; 18020 DELETE /api/campaigns/:id/items/:itemId/completion-photos; 18102 POST /api/campaigns/:id/items/:itemId/complete-work-v2; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email
- `artifacts/api-server/src/storage.ts`: 3904 createCampaignItem; 3916 updateCampaignItem; 3921 deleteCampaignItem; 3925 createCampaignWithItems

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/extraBillablePhotos.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/MyExtraBillableBatchesWidget.tsx`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyBatchesPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/SeasonDetail.tsx`

<a id="table-campaigns"></a>
### campaigns

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 120 innerJoin
- `artifacts/api-server/src/routes/routes.ts`: 10309 from; 14994 from
- `artifacts/api-server/src/storage.ts`: 3705 from; 3748 from; 3777 innerJoin; 3827 innerJoin; 3876 innerJoin; 3889 innerJoin; 4097 innerJoin; 4108 innerJoin; 5068 raw SQL; 5350 from; 5358 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3753 insert; 3758 update; 3763 delete; 3927 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 107 listCrewsWithSupervisor; 169 GET /api/crews
- `artifacts/api-server/src/routes/extraBillablePhotos.ts`: 144 loadAndAuthorize; 191 POST /api/campaigns/:campaignId/items/:itemId/photos/drop; 245 DELETE /api/campaigns/:campaignId/items/:itemId/photos/*storageKey; 280 POST /api/campaigns/:campaignId/items/:targetItemId/photos/move; 379 GET /api/campaigns/:campaignId/items/:itemId/photo-urls
- `artifacts/api-server/src/routes/routes.ts`: 10212 GET /api/customers/:id/campaign-items; 10271 GET /api/customers/:id/annual-service-rollup; 13997 GET /api/campaigns; 14024 GET /api/me/extra-billable-batches; 14163 GET /api/campaigns/:id; 14294 GET /api/campaigns/:id/items/:itemId/notification-recipient; 14308 emailPreviewHandler; 14465 GET /api/campaigns/:id/items/:itemId/template-variables; 14555 PATCH /api/campaigns/:id; 14639 POST /api/campaigns/:id/items; 14700 DELETE /api/campaigns/:id/items/:itemId; 14735 GET /api/campaigns/:id/crews; 14754 POST /api/campaigns/:id/crews; 14868 PATCH /api/campaigns/:id/items/:itemId/crew; 14897 POST /api/campaigns/:campaignId/items/bulk-assign-crew; 14961 GET /api/operations/customer-service-summaries; 15064 GET /api/operations/items; 15074 GET /api/customers/:customerId/campaign-items; 15084 GET /api/campaigns/:id/checklist-tasks; 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle; 15167 GET /api/campaigns/:id/items/:itemId/checklist/audit; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15852 POST /api/campaigns/:id/items/:itemId/complete-work; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16228 PATCH /api/campaigns/:id/items/:itemId/weather; 16263 POST /api/campaigns/:id/items/:itemId/label; 16301 DELETE /api/campaigns/:id/items/:itemId/label; 16440 PATCH /api/campaigns/:id/season; 16455 GET /api/seasons/:id/report; 17058 GET /api/customers/:id/campaign-items; 17068 GET /api/properties/:id/campaign-items; 17111 GET /api/operations/overdue; 17166 GET /api/operations/due-this-week; 17224 GET /api/operations/missing-obligations; 17327 GET /api/operations/exceptions; 17534 GET /api/customers/:id/service-fulfillment; 17889 POST /api/campaigns/:id/items/:itemId/completion-photos/upload; 17946 POST /api/campaigns/:id/items/:itemId/label-pdf/upload; 17982 POST /api/campaigns/:id/items/:itemId/completion-photos; 18020 DELETE /api/campaigns/:id/items/:itemId/completion-photos; 18102 POST /api/campaigns/:id/items/:itemId/complete-work-v2; 18218 resolveChemItemEmailContext; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 19027 GET /api/chemical-notification-templates/:id/campaigns; 19040 DELETE /api/chemical-notification-templates/:id
- `artifacts/api-server/src/storage.ts`: 3701 getCampaigns; 3747 getCampaignById; 3775 getCampaignItemsByCustomer; 3825 getCampaignItemsByProperty; 3875 getCampaignItemsByCustomerId; 3888 getCampaignItemsGlobal; 4068 getMyExtraBillableBatches; 5053 getServiceFulfillment; 5349 getCampaignsByTemplate; 5357 getCampaignNotificationTemplate

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 14034 POST /api/campaigns; 14555 PATCH /api/campaigns/:id; 14718 DELETE /api/campaigns/:id; 15096 POST /api/campaigns/:id/items/:itemId/checklist/:taskId/toggle; 15186 PATCH /api/campaigns/:id/items/:itemId; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16440 PATCH /api/campaigns/:id/season
- `artifacts/api-server/src/storage.ts`: 3752 createCampaign; 3757 updateCampaign; 3762 deleteCampaign; 3925 createCampaignWithItems

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/extraBillablePhotos.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/MyExtraBillableBatchesWidget.tsx`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyBatchesPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/SeasonDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-chemical-notification-templates"></a>
### chemical_notification_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 5296 from; 5304 from; 5363 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 1866 raw SQL
- `artifacts/api-server/src/storage.ts`: 5312 insert; 5317 update; 5326 update; 5335 update; 5344 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 10914 seedEmailTemplatesAndRules; 14034 POST /api/campaigns; 14163 GET /api/campaigns/:id; 14308 emailPreviewHandler; 14465 GET /api/campaigns/:id/items/:itemId/template-variables; 14555 PATCH /api/campaigns/:id; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 18218 resolveChemItemEmailContext; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18959 GET /api/chemical-notification-templates; 18973 GET /api/chemical-notification-templates/:id; 19062 GET /api/chemical-notification-templates/:id/label-url; 19086 POST /api/chemical-notification-templates/:id/label
- `artifacts/api-server/src/services/chemLabelService.ts`: 54 resolveChemLabelAttachment
- `artifacts/api-server/src/services/emailService.ts`: 743 resolveChemicalNotificationTemplate; 780 renderChemicalNotificationTemplate
- `artifacts/api-server/src/storage.ts`: 5295 getChemicalNotificationTemplates; 5303 getChemicalNotificationTemplate; 5357 getCampaignNotificationTemplate
- `artifacts/api-server/src/templates/seed.ts`: 474 seedChemicalNotificationTemplates

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 1844 migrateChemicalNotificationTemplatesTable; 2603 registerRoutes; 10914 seedEmailTemplatesAndRules; 18988 POST /api/chemical-notification-templates; 19007 handleUpdateChemicalNotificationTemplate; 19040 DELETE /api/chemical-notification-templates/:id; 19086 POST /api/chemical-notification-templates/:id/label; 19113 DELETE /api/chemical-notification-templates/:id/label; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 5311 createChemicalNotificationTemplate; 5316 updateChemicalNotificationTemplate; 5325 setChemicalNotificationTemplateLabel; 5334 clearChemicalNotificationTemplateLabel; 5343 deleteChemicalNotificationTemplate
- `artifacts/api-server/src/templates/seed.ts`: 474 seedChemicalNotificationTemplates

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`

<a id="table-chemical-products"></a>
### chemical_products

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/routes.ts`: 14344 from; 15456 from
- `artifacts/api-server/src/services/chemLabelService.ts`: 66 from
- `artifacts/api-server/src/storage.ts`: 5260 from; 5268 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5276 insert; 5281 update; 5290 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 14308 emailPreviewHandler; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 17691 GET /api/chemical-products; 17832 GET /api/chemical-products/:id/label-pdf-url
- `artifacts/api-server/src/services/chemLabelService.ts`: 54 resolveChemLabelAttachment
- `artifacts/api-server/src/storage.ts`: 5259 getChemicalProducts; 5267 getChemicalProductById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 17703 POST /api/chemical-products; 17852 PATCH /api/chemical-products/:id; 17874 DELETE /api/chemical-products/:id
- `artifacts/api-server/src/storage.ts`: 5275 createChemicalProduct; 5280 updateChemicalProduct; 5289 deleteChemicalProduct

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ChemicalProductsAdmin.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`

<a id="table-communication-audit-log"></a>
### communication_audit_log

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4887 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4882 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 16554 GET /api/communications/audit-log
- `artifacts/api-server/src/storage.ts`: 4886 getCommunicationAuditLogs

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2657 writeCommAuditLog; 10174 PATCH /api/email-rules/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16769 POST /api/communications/:id/restore; 16785 POST /api/communications/clear-seed-data; 16804 POST /api/communications/restore-batch; 16917 PATCH /api/communications/:id/cancel-schedule; 16946 POST /api/communication-templates; 16963 PATCH /api/communication-templates/:id; 16979 POST /api/communication-templates/:id/archive
- `artifacts/api-server/src/storage.ts`: 4881 createCommunicationAuditLog

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`

<a id="table-communication-automation-rules"></a>
### communication_automation_rules

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4908 from; 4914 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4920 insert; 4925 update; 4933 delete; 4938 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2443 seedAutomationRulesBootstrap; 17007 GET /api/automation-rules; 17046 POST /api/automation-rules/:id/run; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 4907 getCommunicationAutomationRules; 4913 getCommunicationAutomationRuleById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2443 seedAutomationRulesBootstrap; 17015 POST /api/automation-rules; 17029 PATCH /api/automation-rules/:id; 17038 DELETE /api/automation-rules/:id; 17046 POST /api/automation-rules/:id/run; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 4919 createCommunicationAutomationRule; 4924 updateCommunicationAutomationRule; 4932 deleteCommunicationAutomationRule; 4937 updateCommunicationAutomationRuleLastRun

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`

<a id="table-communication-links"></a>
### communication_links

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4645 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4649 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 16653 GET /api/communications/:id
- `artifacts/api-server/src/storage.ts`: 4644 getCommunicationLinks

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/storage.ts`: 4648 createCommunicationLink

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`

<a id="table-communication-templates"></a>
### communication_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4383 leftJoin; 4479 leftJoin; 4622 from; 4626 from; 4771 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4632 insert; 4637 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2306 seedCommunicationsBootstrap; 2328 seedCommunicationTemplatesBootstrap; 2744 GET /api/customers/:id/parent-rollup; 8110 GET /api/admin/parent-customer-audit; 10224 GET /api/customers/:id/communications; 16528 GET /api/communications/analytics; 16566 GET /api/communications; 16625 GET /api/communications/templates; 16653 GET /api/communications/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16820 GET /api/communication-templates; 16876 GET /api/communication-templates; 16885 GET /api/communication-templates/:id; 16917 PATCH /api/communications/:id/cancel-schedule; 16938 GET /api/communication-templates; 16979 POST /api/communication-templates/:id/archive; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17544 GET /api/customers/:customerId/communications/summary; 17579 GET /api/customers/:customerId/communications/recent; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 154 isDuplicate; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/storage.ts`: 4284 getCommunications; 4478 getCommunicationById; 4617 getCommunicationTemplates; 4625 getCommunicationTemplateById; 4652 getCommunicationAnalytics

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2202 seedCommunicationTemplates; 2328 seedCommunicationTemplatesBootstrap; 16633 POST /api/communications/templates; 16829 POST /api/communication-templates; 16894 POST /api/communication-templates; 16904 PATCH /api/communication-templates/:id; 16946 POST /api/communication-templates; 16963 PATCH /api/communication-templates/:id; 16979 POST /api/communication-templates/:id/archive; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 4631 createCommunicationTemplate; 4636 updateCommunicationTemplate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`

<a id="table-communication-threads"></a>
### communication_threads

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4836 from; 4845 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4851 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 16841 GET /api/communication-threads
- `artifacts/api-server/src/storage.ts`: 4835 getCommunicationThreads; 4844 getCommunicationThreadById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 16662 POST /api/communications; 16853 POST /api/communication-threads
- `artifacts/api-server/src/storage.ts`: 4850 createCommunicationThread

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`

<a id="table-communications"></a>
### communications

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 491 from
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 500 from
- `artifacts/api-server/src/services/emailRouter.ts`: 110 from
- `artifacts/api-server/src/services/emailSyncService.ts`: 535 from; 625 from; 777 from
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 257 from
- `artifacts/api-server/src/storage.ts`: 4383 from; 4422 from; 4467 from; 4479 from; 4585 from; 4590 from; 4596 from; 4601 from; 4664 from; 4677 from; 4689 from; 4701 from; 4712 from; 4723 from; 4736 from; 4745 from; 4758 from; 4771 from; 4856 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 17658 raw SQL; 17666 raw SQL
- `artifacts/api-server/src/services/emailSyncService.ts`: 549 update; 663 insert; 834 insert
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 309 insert
- `artifacts/api-server/src/storage.ts`: 4523 insert; 4528 update; 4535 update; 4545 update; 4554 update; 4568 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 462 GET /sync-summary; 548 POST /:id/sync; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/routes.ts`: 2306 seedCommunicationsBootstrap; 2744 GET /api/customers/:id/parent-rollup; 8110 GET /api/admin/parent-customer-audit; 10224 GET /api/customers/:id/communications; 16528 GET /api/communications/analytics; 16566 GET /api/communications; 16644 GET /api/communications/stats; 16653 GET /api/communications/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16868 GET /api/communication-threads/:id/messages; 16917 PATCH /api/communications/:id/cancel-schedule; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17544 GET /api/customers/:customerId/communications/summary; 17579 GET /api/customers/:customerId/communications/recent; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 154 isDuplicate; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/services/emailRouter.ts`: 46 routeMessage
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 4284 getCommunications; 4466 getCommunicationByProviderMessageId; 4478 getCommunicationById; 4579 getCommunicationStats; 4652 getCommunicationAnalytics; 4855 getThreadMessages

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/routes.ts`: 118 seedCommunications; 2306 seedCommunicationsBootstrap; 16662 POST /api/communications; 16735 PATCH /api/communications/:id; 16746 DELETE /api/communications/:id; 16769 POST /api/communications/:id/restore; 16785 POST /api/communications/clear-seed-data; 16804 POST /api/communications/restore-batch; 16917 PATCH /api/communications/:id/cancel-schedule; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17600 POST /api/customers/:customerId/communications; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 120 POST /:id/route
- `artifacts/api-server/src/services/automationService.ts`: 169 trySendAutomationEmail; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 4522 createCommunication; 4527 updateCommunication; 4534 deleteCommunication; 4544 restoreCommunication; 4552 deleteSeedCommunications; 4566 restoreCommunications

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`

<a id="table-companies"></a>
### companies

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 12 from
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 116 raw SQL
- `artifacts/api-server/src/lib/linkCrews.ts`: 20 from; 24 from
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 770 from
- `artifacts/api-server/src/lib/plantSync.ts`: 152 from
- `artifacts/api-server/src/storage.ts`: 722 from; 726 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 17 insert; 53 delete
- `artifacts/api-server/src/lib/crewLinks.ts`: 16 update
- `artifacts/api-server/src/storage.ts`: 693 raw SQL; 731 insert; 736 update; 744 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auth.ts`: 244 GET /api/auth/me; 284 POST /api/user/switch-company
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 70 convertExtraBillableToTask
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 769 enrichAllCompanies; 782 startPlantEnrichmentScheduler
- `artifacts/api-server/src/lib/plantSync.ts`: 150 syncAllCompanies; 165 startPlantSyncScheduler
- `artifacts/api-server/src/routes/routes.ts`: 1102 migrateFirstBankHierarchy; 1169 migrateProjectSchedulingStatus; 1196 fixProjectDisplayOrders; 1242 removeProjectInvoicingFields; 1278 fixEstimateRequestBillingBehavior; 1315 migrateEstimateSentToProposalWorkflow; 1412 migrateProjectNoEstimateTicketType; 2306 seedCommunicationsBootstrap; 2328 seedCommunicationTemplatesBootstrap; 2443 seedAutomationRulesBootstrap; 2603 registerRoutes; 4024 GET /api/admin/companies; 4080 DELETE /api/admin/companies/:id; 4370 GET /api/company; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 13153 generateCrewWorksheetPdf; 13419 GET /api/crew-worksheets/:id/pdf; 14308 emailPreviewHandler; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules; 19127 POST /api/chemical-notification-templates/preview; 19764 migrateTicketTypeRename; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 721 getCompanies; 725 getCompanyById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture; 50 removeAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/lib/crewLinks.ts`: 15 recordCrewLinkChoice; 24 replacePlannerLink
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 176 POST /api/crews; 225 PATCH /api/crews/:id; 272 DELETE /api/crews/:id
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 4038 POST /api/admin/companies; 4057 PATCH /api/admin/companies/:id; 4080 DELETE /api/admin/companies/:id; 4385 PATCH /api/company; 8567 POST /api/maintenance-crews; 8600 PATCH /api/maintenance-crews/:id; 8915 POST /api/admin/reset-for-setup; 14754 POST /api/campaigns/:id/crews; 14790 PATCH /api/campaigns/:id/crews/:crewId
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 730 createCompany; 735 updateCompany; 743 deleteCompany; 3996 createCampaignCrew; 4010 updateCampaignCrew

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/AccountSidePanel.tsx`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/CustomerSchedulingSection.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/SchedulePreview.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/hooks/use-auth.tsx`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetPrint.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ScheduleViewer.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/SuperAdminDashboard.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`

<a id="table-company-users"></a>
### company_users

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/mobileAuth.ts`: 58 from; 155 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 186 from; 235 from; 293 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 599 innerJoin
- `artifacts/api-server/src/routes/flags.ts`: 285 from; 876 from
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 98 from
- `artifacts/api-server/src/services/emailSyncService.ts`: 295 innerJoin
- `artifacts/api-server/src/storage.ts`: 748 from; 752 from; 756 from; 763 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 21 insert
- `artifacts/api-server/src/routes/routes.ts`: 7889 update
- `artifacts/api-server/src/storage.ts`: 692 raw SQL; 770 insert; 775 update; 783 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auth.ts`: 27 setupAuth; 166 POST /api/auth/register; 284 POST /api/user/switch-company
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/mobileAuth.ts`: 40 authenticateMobileLogin; 128 requireMobileAuth
- `artifacts/api-server/src/objectAcl.ts`: 56 hasMember
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 136 registerCrewsAndMobileRoutes; 176 POST /api/crews; 225 PATCH /api/crews/:id; 289 GET /api/crews/eligible-supervisors; 314 POST /api/m/auth/login
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue
- `artifacts/api-server/src/routes/flags.ts`: 275 notifyOfficeOfNewFlag; 363 registerFlagsRoutes; 403 POST /api/m/flags; 866 PATCH /api/flags/:id
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 219 registerMobileTicketPhotosNotesRoutes
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/routes.ts`: 2306 seedCommunicationsBootstrap; 2443 seedAutomationRulesBootstrap; 2603 registerRoutes; 4098 GET /api/companies/users; 4197 GET /api/company-users; 4230 GET /api/team-members; 4281 PATCH /api/company-users/:id; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7877 PATCH /api/company-users/:id/tags; 7982 POST /api/admin/migrate-invoices; 8216 GET /api/tickets/:id/details; 10963 GET /api/reports/:type; 14034 POST /api/campaigns; 14555 PATCH /api/campaigns/:id; 14754 POST /api/campaigns/:id/crews; 14790 PATCH /api/campaigns/:id/crews/:crewId; 14835 POST /api/campaigns/:id/crews/:crewId/members; 18218 resolveChemItemEmailContext; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 19866 runStartupMigrations
- `artifacts/api-server/src/services/emailSyncService.ts`: 277 sendSyncErrorNotification; 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/storage.ts`: 747 getCompanyUsersByUserId; 751 getCompanyUsersByCompanyId; 755 getCompanyUser; 762 getCompanyUserById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/routes/routes.ts`: 4123 POST /api/companies/users/create; 4259 POST /api/companies/users; 4281 PATCH /api/company-users/:id; 4355 DELETE /api/company-users/:id; 7877 PATCH /api/company-users/:id/tags; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 769 createCompanyUser; 774 updateCompanyUser; 782 deleteCompanyUser

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/MentionTextarea.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/MailboxViewAsPicker.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/use-auth.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FlagDetailPage.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MailboxAccountsSettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- `artifacts/highplains-crm/src/pages/UsersPage.tsx`
- `artifacts/highplains-mobile/contexts/AuthContext.tsx`
- `artifacts/highplains-mobile/lib/api.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-contacts"></a>
### contacts

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 11 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1513 from
- `artifacts/api-server/src/routes/routes.ts`: 11008 from
- `artifacts/api-server/src/services/emailRouter.ts`: 69 from
- `artifacts/api-server/src/storage.ts`: 897 from; 902 from; 4383 leftJoin; 4479 leftJoin; 4856 leftJoin; 6016 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 682 raw SQL; 908 insert; 913 update; 921 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1500 GET /api/m/properties/:id
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/qbo.ts`: 573 POST /customers/duplicate-check; 653 POST /customers/create
- `artifacts/api-server/src/routes/routes.ts`: 2306 seedCommunicationsBootstrap; 2744 GET /api/customers/:id/parent-rollup; 2934 PATCH /api/customers/:id; 3124 GET /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 8110 GET /api/admin/parent-customer-audit; 10224 GET /api/customers/:id/communications; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 10963 GET /api/reports/:type; 14294 GET /api/campaigns/:id/items/:itemId/notification-recipient; 14308 emailPreviewHandler; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16566 GET /api/communications; 16653 GET /api/communications/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16868 GET /api/communication-threads/:id/messages; 16917 PATCH /api/communications/:id/cancel-schedule; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17544 GET /api/customers/:customerId/communications/summary; 17579 GET /api/customers/:customerId/communications/recent; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 154 isDuplicate; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/chemRecipient.ts`: 38 resolveChemRecipientEmail
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/services/emailRouter.ts`: 46 routeMessage
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 896 getContactsByCustomerId; 901 getContactById; 4284 getCommunications; 4478 getCommunicationById; 4855 getThreadMessages; 5996 getCustomerWithPrimaryContactForQbo

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2934 PATCH /api/customers/:id; 3134 POST /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 3302 DELETE /api/contacts/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 907 createContact; 912 updateContact; 920 deleteContact

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/CustomerLocationEditor.tsx`
- `artifacts/highplains-crm/src/components/CustomerSearchInput.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/CustomerRouteMap.tsx`
- `artifacts/highplains-crm/src/pages/CustomersList.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`

<a id="table-contract-builder-documents"></a>
### contract_builder_documents

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 1709 from; 1715 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 688 raw SQL; 1722 insert; 1727 update; 1735 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 5027 GET /api/contract-builder/documents; 5040 GET /api/contract-builder/documents/:id; 5189 POST /api/contract-builder/documents/:id/export-pdf; 5373 POST /api/contract-builder/documents/:id/publish-and-create
- `artifacts/api-server/src/storage.ts`: 1704 getContractBuilderDocuments; 1714 getContractBuilderDocumentById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 5053 POST /api/contract-builder/documents; 5074 PATCH /api/contract-builder/documents/:id; 5098 DELETE /api/contract-builder/documents/:id; 5189 POST /api/contract-builder/documents/:id/export-pdf; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1721 createContractBuilderDocument; 1726 updateContractBuilderDocument; 1734 deleteContractBuilderDocument

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`

<a id="table-contract-builder-sections"></a>
### contract_builder_sections

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 1743 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 687 raw SQL; 1755 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 5113 GET /api/contract-builder/documents/:id/sections; 5189 POST /api/contract-builder/documents/:id/export-pdf; 5373 POST /api/contract-builder/documents/:id/publish-and-create
- `artifacts/api-server/src/storage.ts`: 1739 getContractBuilderSections

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 5123 PUT /api/contract-builder/documents/:id/sections; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1748 upsertContractBuilderSections

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`

<a id="table-contract-builder-variables"></a>
### contract_builder_variables

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 1778 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 686 raw SQL; 1789 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 5151 GET /api/contract-builder/documents/:id/variables; 5189 POST /api/contract-builder/documents/:id/export-pdf; 5373 POST /api/contract-builder/documents/:id/publish-and-create
- `artifacts/api-server/src/storage.ts`: 1774 getContractBuilderVariables

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 5161 PUT /api/contract-builder/documents/:id/variables; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1782 upsertContractBuilderVariables

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`

<a id="table-contract-documents"></a>
### contract_documents

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 16 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 57 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 93 from
- `artifacts/api-server/src/storage.ts`: 1039 from; 1045 from; 1052 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 30 insert
- `artifacts/api-server/src/storage.ts`: 680 raw SQL; 1034 insert; 1060 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/routes.ts`: 3694 POST /api/contracts/:contractId/documents; 3749 GET /api/contracts/:contractId/documents; 3759 GET /api/contracts/:contractId/documents/current
- `artifacts/api-server/src/storage.ts`: 1038 getContractDocuments; 1044 getContractDocumentById; 1051 getCurrentContractDocument

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/routes/routes.ts`: 3694 POST /api/contracts/:contractId/documents; 3772 DELETE /api/contracts/:contractId/documents/:docId; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1033 createContractDocument; 1059 deleteContractDocument

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`

<a id="table-contract-masters"></a>
### contract_masters

**Direct SELECT/join/SQL sites**
- None found.

**Direct insert/update/delete/raw/generic-writer sites**
- None found.

**Resolved readers / endpoint wrappers**
- None found.

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- None found.

**Matched screens/components/client modules**
- None statically matched.

<a id="table-contract-monthly-amounts"></a>
### contract_monthly_amounts

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/auditEngine.ts`: 72 from
- `artifacts/api-server/src/lib/contractAuditData.ts`: 13 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 92 from
- `artifacts/api-server/src/routes/routes.ts`: 3412 from
- `artifacts/api-server/src/storage.ts`: 1064 from; 1223 from; 1359 from; 1608 from; 1645 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 1073 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auditEngine.ts`: 64 buildContractAuditRows
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/routes.ts`: 3397 GET /api/contracts; 3875 GET /api/contracts/:contractId/monthly-amounts; 4528 GET /api/customers/:customerId/all-monthly-amounts/:year; 4585 GET /api/dashboard/monthly-revenue; 4596 GET /api/dashboard/top-customers; 4618 GET /api/revenue/overview; 4641 GET /api/revenue/contract-audit; 4663 GET /api/revenue/exceptions; 4867 GET /api/revenue/export/audit; 4886 GET /api/revenue/export/exceptions; 4932 GET /api/revenue/export/filtered; 4958 GET /api/revenue/export/matrix
- `artifacts/api-server/src/storage.ts`: 1063 getContractMonthlyAmounts; 1218 getRevenueOverview; 1355 getRevenueExceptions; 1604 getMonthlyRevenueData; 1644 getTopCustomers

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3885 PUT /api/contracts/:contractId/monthly-amounts
- `artifacts/api-server/src/storage.ts`: 1069 upsertContractMonthlyAmounts

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ContractServices.tsx`
- `artifacts/highplains-crm/src/components/RevenueChart.tsx`
- `artifacts/highplains-crm/src/components/RevenueMatrixPanel.tsx`
- `artifacts/highplains-crm/src/components/ScheduleSummary.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/ContractsOverview.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/RevenueOverview.tsx`

<a id="table-contract-services"></a>
### contract_services

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 14 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 91 from
- `artifacts/api-server/src/storage.ts`: 1511 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 678 raw SQL; 1523 insert; 1537 update; 1549 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/routes.ts`: 2548 autoPopulateServicePlansFromContract; 3473 POST /api/customers/:customerId/contracts; 3527 POST /api/contracts; 3580 PATCH /api/contracts/:id; 3789 GET /api/contracts/:contractId/services; 3799 POST /api/contracts/:contractId/services; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 8216 GET /api/tickets/:id/details; 10271 GET /api/customers/:id/annual-service-rollup; 14961 GET /api/operations/customer-service-summaries; 17224 GET /api/operations/missing-obligations
- `artifacts/api-server/src/storage.ts`: 1510 getContractServices

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3799 POST /api/contracts/:contractId/services; 3838 PATCH /api/contracts/:contractId/services/:serviceId; 3858 DELETE /api/contracts/:contractId/services/:serviceId; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1521 createContractService; 1527 updateContractService; 1548 deleteContractService

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ContractServices.tsx`
- `artifacts/highplains-crm/src/components/ScheduleSummary.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractsOverview.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-contract-status-history"></a>
### contract_status_history

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/contractCenter.ts`: 94 from
- `artifacts/api-server/src/storage.ts`: 1010 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 679 raw SQL; 1005 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/storage.ts`: 1009 getContractStatusHistory

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3473 POST /api/customers/:customerId/contracts; 3527 POST /api/contracts; 3580 PATCH /api/contracts/:id; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1004 createContractStatusHistory

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ContractServices.tsx`
- `artifacts/highplains-crm/src/components/ScheduleSummary.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractsOverview.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`

<a id="table-contract-templates"></a>
### contract_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 1701 from

**Direct insert/update/delete/raw/generic-writer sites**
- None found.

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 5018 GET /api/contract-templates; 5189 POST /api/contract-builder/documents/:id/export-pdf; 5373 POST /api/contract-builder/documents/:id/publish-and-create
- `artifacts/api-server/src/storage.ts`: 1700 getContractTemplates

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- None found.

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`

<a id="table-contracts"></a>
### contracts

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/auditEngine.ts`: 71 from
- `artifacts/api-server/src/lib/contractAuditData.ts`: 12 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 56 from; 95 from
- `artifacts/api-server/src/lib/legacyContractFreeze.ts`: 18 from; 28 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 90 from; 94 innerJoin
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1518 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 515 from; 876 from
- `artifacts/api-server/src/routes/routes.ts`: 11086 from
- `artifacts/api-server/src/storage.ts`: 948 from; 954 from; 981 from; 1222 from; 1358 from; 1563 from; 1607 from; 1645 leftJoin; 1669 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 25 insert
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 34 update
- `artifacts/api-server/src/storage.ts`: 681 raw SQL; 988 insert; 993 update; 1001 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auditEngine.ts`: 64 buildContractAuditRows
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/legacyContractFreeze.ts`: 15 hasFrozenLegacyRows
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1500 GET /api/m/properties/:id
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue; 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/routes.ts`: 2744 GET /api/customers/:id/parent-rollup; 3092 DELETE /api/customers/:id; 3397 GET /api/contracts; 3463 GET /api/customers/:customerId/contracts; 3473 POST /api/customers/:customerId/contracts; 3527 POST /api/contracts; 3580 PATCH /api/contracts/:id; 3667 POST /api/contracts/:contractId/documents/upload-url; 3799 POST /api/contracts/:contractId/services; 4080 DELETE /api/admin/companies/:id; 4528 GET /api/customers/:customerId/all-monthly-amounts/:year; 4561 GET /api/dashboard/stats; 4585 GET /api/dashboard/monthly-revenue; 4596 GET /api/dashboard/top-customers; 4607 GET /api/dashboard/upcoming-renewals; 4618 GET /api/revenue/overview; 4641 GET /api/revenue/contract-audit; 4663 GET /api/revenue/exceptions; 4867 GET /api/revenue/export/audit; 4886 GET /api/revenue/export/exceptions; 4932 GET /api/revenue/export/filtered; 4958 GET /api/revenue/export/matrix; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 8110 GET /api/admin/parent-customer-audit; 8216 GET /api/tickets/:id/details; 10271 GET /api/customers/:id/annual-service-rollup; 10963 GET /api/reports/:type; 14961 GET /api/operations/customer-service-summaries; 17224 GET /api/operations/missing-obligations
- `artifacts/api-server/src/storage.ts`: 947 getContractsByCustomerId; 953 getAllContracts; 980 getContractById; 1218 getRevenueOverview; 1355 getRevenueExceptions; 1557 getDashboardStats; 1604 getMonthlyRevenueData; 1644 getTopCustomers; 1668 getUpcomingRenewals

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/routes/routes.ts`: 3473 POST /api/customers/:customerId/contracts; 3527 POST /api/contracts; 3580 PATCH /api/contracts/:id; 3650 DELETE /api/contracts/:id; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 987 createContract; 992 updateContract; 1000 deleteContract

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/ContractServices.tsx`
- `artifacts/highplains-crm/src/components/CustomerLocationEditor.tsx`
- `artifacts/highplains-crm/src/components/CustomerSearchInput.tsx`
- `artifacts/highplains-crm/src/components/RevenueChart.tsx`
- `artifacts/highplains-crm/src/components/RevenueMatrixPanel.tsx`
- `artifacts/highplains-crm/src/components/ScheduleSummary.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractsOverview.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/CustomerRouteMap.tsx`
- `artifacts/highplains-crm/src/pages/CustomersList.tsx`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/RevenueOverview.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`

<a id="table-crew-worksheet-number-counters"></a>
### crew_worksheet_number_counters

**Direct SELECT/join/SQL sites**
- None found.

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3546 raw SQL

**Resolved readers / endpoint wrappers**
- None found.

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 12871 generateCrewWorksheetNumberWithRetry; 12885 POST /api/crew-worksheets; 12925 generateCrewWorksheetFromProposalHandler
- `artifacts/api-server/src/storage.ts`: 3545 generateCrewWorksheetNumber

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetMaker.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetPrint.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`

<a id="table-crew-worksheet-photos"></a>
### crew_worksheet_photos

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3366 from; 3558 from; 3564 from; 3584 from; 3597 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3516 insert; 3570 insert; 3575 update; 3593 update; 3604 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 13029 POST /api/crew-worksheets/:id/photos; 13079 PATCH /api/crew-worksheets/:id/photos/:photoId; 13093 POST /api/crew-worksheets/:id/photos/reorder; 13116 POST /api/crew-worksheets/:id/photos/bulk-delete; 13140 DELETE /api/crew-worksheets/:id/photos/:photoId
- `artifacts/api-server/src/storage.ts`: 3363 _enrichCrewWorksheets; 3557 getCrewWorksheetPhotos; 3563 getCrewWorksheetPhotoById; 3582 reorderCrewWorksheetPhotos

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 12925 generateCrewWorksheetFromProposalHandler; 13029 POST /api/crew-worksheets/:id/photos; 13079 PATCH /api/crew-worksheets/:id/photos/:photoId; 13093 POST /api/crew-worksheets/:id/photos/reorder; 13116 POST /api/crew-worksheets/:id/photos/bulk-delete; 13140 DELETE /api/crew-worksheets/:id/photos/:photoId
- `artifacts/api-server/src/storage.ts`: 3476 createCrewWorksheetFromProposal; 3569 createCrewWorksheetPhoto; 3574 updateCrewWorksheetPhoto; 3582 reorderCrewWorksheetPhotos; 3603 deleteCrewWorksheetPhoto

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`

<a id="table-crew-worksheet-versions"></a>
### crew_worksheet_versions

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3348 from; 3613 from; 3623 from; 3633 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3608 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 13487 GET /api/crew-worksheets/:id/versions; 13496 GET /api/crew-worksheets/:id/versions/:versionId/download
- `artifacts/api-server/src/storage.ts`: 3346 _getCrewWorksheetVersionsMap; 3612 getCrewWorksheetVersions; 3622 getCrewWorksheetVersionById; 3632 getNextCrewWorksheetVersionNumber

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/storage.ts`: 3607 createCrewWorksheetVersion

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`

<a id="table-crew-worksheets"></a>
### crew_worksheets

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3406 from; 3423 from; 3439 from; 3455 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3472 insert; 3491 insert; 3534 update; 3542 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 12824 GET /api/crew-worksheets; 12843 GET /api/crew-worksheets/:id; 12853 GET /api/customers/:customerId/crew-worksheets; 12862 GET /api/tickets/:ticketId/crew-worksheets; 12961 PATCH /api/crew-worksheets/:id; 12988 DELETE /api/crew-worksheets/:id; 13000 POST /api/crew-worksheets/:id/photos/upload-url; 13029 POST /api/crew-worksheets/:id/photos; 13093 POST /api/crew-worksheets/:id/photos/reorder; 13116 POST /api/crew-worksheets/:id/photos/bulk-delete; 13419 GET /api/crew-worksheets/:id/pdf; 13442 GET /api/crew-worksheets/:id/visual-scope-sheets; 13453 GET /api/crew-worksheets/:id/visual-scope.png; 13477 POST /api/crew-worksheets/:id/finalize; 13496 GET /api/crew-worksheets/:id/versions/:versionId/download
- `artifacts/api-server/src/storage.ts`: 3405 getCrewWorksheets; 3422 getCrewWorksheetsByCustomer; 3438 getCrewWorksheetsForTicket; 3454 getCrewWorksheetById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 12885 POST /api/crew-worksheets; 12925 generateCrewWorksheetFromProposalHandler; 12961 PATCH /api/crew-worksheets/:id; 12988 DELETE /api/crew-worksheets/:id
- `artifacts/api-server/src/storage.ts`: 3471 createCrewWorksheet; 3476 createCrewWorksheetFromProposal; 3533 updateCrewWorksheet; 3541 deleteCrewWorksheet

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetMaker.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetPrint.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-crews"></a>
### crews

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 17 innerJoin; 26 innerJoin
- `artifacts/api-server/src/lib/crewLinks.ts`: 21 from
- `artifacts/api-server/src/lib/linkCrews.ts`: 30 from
- `artifacts/api-server/src/lib/visitSync.ts`: 28 from; 66 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 108 from; 145 from; 162 from; 355 from; 392 from; 1748 from; 1923 from; 2158 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 893 innerJoin
- `artifacts/api-server/src/routes/flags.ts`: 77 from; 562 from; 763 leftJoin; 817 leftJoin
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 73 from
- `artifacts/api-server/src/routes/visits.ts`: 54 leftJoin; 80 leftJoin
- `artifacts/api-server/src/storage.ts`: 2182 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/linkCrews.ts`: 39 update
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 149 update; 210 insert; 252 update; 277 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/crewLinks.ts`: 19 validateStandingCrew; 34 validatePlannerOwner
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/lib/visitSync.ts`: 27 validateVisitCrew; 61 visitMirrorUpdates; 73 syncTicketFromVisits
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 107 listCrewsWithSupervisor; 137 POST /api/crews/order; 158 GET /api/crews/board; 169 GET /api/crews; 354 resolveSupervisorCrewId; 368 GET /api/m/today; 461 POST /api/m/tickets/:id/start; 574 GET /api/m/tickets/:id; 693 PATCH /api/m/work-items/:id; 785 POST /api/m/tickets/:id/complete; 1731 GET /api/m/me; 1773 GET /api/m/me/week; 1828 GET /api/m/me/recent-completions; 1911 GET /api/m/sync; 2157 resolveSupervisorCrewIdLocal
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/flags.ts`: 76 resolveSupervisorCrewId; 403 POST /api/m/flags; 727 GET /api/flags; 812 GET /api/flags/:id
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 72 resolveSupervisorCrewId; 86 loadMobileTicketForCaller; 221 GET /api/m/tickets/:id/photos; 249 POST /api/m/tickets/:id/photos; 397 GET /api/m/tickets/:id/notes; 414 POST /api/m/tickets/:id/notes
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 8546 GET /api/maintenance-crews; 8567 POST /api/maintenance-crews; 8600 PATCH /api/maintenance-crews/:id; 14754 POST /api/campaigns/:id/crews; 14790 PATCH /api/campaigns/:id/crews/:crewId
- `artifacts/api-server/src/routes/visits.ts`: 47 GET /api/visits; 76 GET /api/visits/summary; 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id
- `artifacts/api-server/src/storage.ts`: 2177 getMaintenanceCrews; 3996 createCampaignCrew; 4010 updateCampaignCrew

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 137 POST /api/crews/order; 176 POST /api/crews; 225 PATCH /api/crews/:id; 272 DELETE /api/crews/:id
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/visits.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/CustomerSchedulingSection.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/SchedulePreview.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/FlagDetailPage.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ScheduleViewer.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`
- `artifacts/highplains-mobile/app/(tabs)/me/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/me/notifications.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/contexts/AuthContext.tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-customer-map-documents"></a>
### customer_map_documents

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2154 from; 2160 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 675 raw SQL; 2167 insert; 2172 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8458 GET /api/customers/:customerId/map-documents
- `artifacts/api-server/src/storage.ts`: 2153 getCustomerMapDocuments; 2159 getCustomerMapDocumentById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 8467 POST /api/customers/:customerId/map-documents; 8489 DELETE /api/customers/:customerId/map-documents/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2166 createCustomerMapDocument; 2171 deleteCustomerMapDocument

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`

<a id="table-customer-map-layers"></a>
### customer_map_layers

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2122 from; 2128 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 676 raw SQL; 2135 insert; 2140 update; 2148 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8326 GET /api/customers/:customerId/map-layers; 8335 POST /api/customers/:customerId/map-layers
- `artifacts/api-server/src/storage.ts`: 2121 getCustomerMapLayers; 2127 getCustomerMapLayerById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 8335 POST /api/customers/:customerId/map-layers; 8386 PATCH /api/customers/:customerId/map-layers/:id; 8402 DELETE /api/customers/:customerId/map-layers/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2134 createCustomerMapLayer; 2139 updateCustomerMapLayer; 2147 deleteCustomerMapLayer

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/PropertyMapsPage.tsx`

<a id="table-customer-rate-sheets"></a>
### customer_rate_sheets

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 15 from
- `artifacts/api-server/src/lib/legacyContractFreeze.ts`: 20 from; 31 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 98 from
- `artifacts/api-server/src/storage.ts`: 1096 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 1103 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/legacyContractFreeze.ts`: 15 hasFrozenLegacyRows
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/routes.ts`: 3092 DELETE /api/customers/:id; 3926 GET /api/customers/:customerId/rate-sheet; 4080 DELETE /api/admin/companies/:id
- `artifacts/api-server/src/storage.ts`: 1095 getCustomerRateSheet

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3941 PUT /api/customers/:customerId/rate-sheet
- `artifacts/api-server/src/storage.ts`: 1102 upsertCustomerRateSheet

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/CustomerLocationEditor.tsx`
- `artifacts/highplains-crm/src/components/CustomerSearchInput.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/CustomerRouteMap.tsx`
- `artifacts/highplains-crm/src/pages/CustomersList.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`

<a id="table-customer-service-plans"></a>
### customer_service_plans

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/contractCenter.ts`: 97 from
- `artifacts/api-server/src/storage.ts`: 4952 from; 4977 from; 5024 from; 5054 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5028 insert; 5033 update; 5045 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/contractCenter.ts`: 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/routes.ts`: 8110 GET /api/admin/parent-customer-audit; 17388 GET /api/service-plan-templates; 17395 POST /api/service-plan-templates; 17413 PATCH /api/service-plan-templates/:id; 17444 GET /api/customers/:id/service-plans; 17475 POST /api/customers/:id/service-plans/from-template; 17534 GET /api/customers/:id/service-fulfillment
- `artifacts/api-server/src/storage.ts`: 4943 getServicePlanTemplates; 4971 getServicePlanTemplateById; 5016 getCustomerServicePlans; 5053 getServiceFulfillment

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2548 autoPopulateServicePlansFromContract; 3473 POST /api/customers/:customerId/contracts; 3527 POST /api/contracts; 3580 PATCH /api/contracts/:id; 3799 POST /api/contracts/:contractId/services; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 17452 POST /api/customers/:id/service-plans; 17475 POST /api/customers/:id/service-plans/from-template; 17511 PATCH /api/customers/:customerId/service-plans/:planId; 17526 DELETE /api/customers/:customerId/service-plans/:planId
- `artifacts/api-server/src/storage.ts`: 5027 createCustomerServicePlan; 5032 updateCustomerServicePlan; 5044 deleteCustomerServicePlan

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ContractServices.tsx`
- `artifacts/highplains-crm/src/components/ScheduleSummary.tsx`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/ServicePlanTemplatesAdmin.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractsOverview.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`

<a id="table-customers"></a>
### customers

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/auditEngine.ts`: 70 from
- `artifacts/api-server/src/lib/backfillVisits.ts`: 26 leftJoin
- `artifacts/api-server/src/lib/contractAuditData.ts`: 10 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 52 from; 90 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 67 from
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 26 from
- `artifacts/api-server/src/lib/legacyContractFreeze.ts`: 28 innerJoin; 31 innerJoin
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 50 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 99 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 50 from; 87 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 400 leftJoin; 532 leftJoin; 594 leftJoin; 871 from; 1402 innerJoin; 1445 from; 1475 from; 1503 from; 1840 leftJoin; 1925 leftJoin; 2066 innerJoin
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 789 from
- `artifacts/api-server/src/routes/flags.ts`: 376 from; 454 from; 557 from; 701 from; 763 leftJoin; 817 leftJoin
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 80 from
- `artifacts/api-server/src/routes/routes.ts`: 2706 from; 11008 innerJoin; 11086 innerJoin; 19258 from; 19326 from; 19717 raw SQL; 19729 raw SQL
- `artifacts/api-server/src/routes/visits.ts`: 54 leftJoin; 101 from
- `artifacts/api-server/src/services/emailRouter.ts`: 139 from; 176 from
- `artifacts/api-server/src/storage.ts`: 787 from; 798 from; 799 from; 807 from; 838 from; 846 from; 852 from; 857 from; 869 from; 954 innerJoin; 1558 from; 1583 from; 1645 from; 1669 innerJoin; 2852 from; 2975 leftJoin; 3048 leftJoin; 3057 leftJoin; 3090 leftJoin; 3122 leftJoin; 3154 leftJoin; 3406 leftJoin; 3423 leftJoin; 3439 leftJoin; 3455 leftJoin; 3642 leftJoin; 3652 leftJoin; 3662 leftJoin; 4383 leftJoin; 4479 leftJoin; 4758 leftJoin; 4856 leftJoin; 5824 from; 5831 from; 5872 from; 6010 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 23 insert
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 27 insert; 31 update; 32 update
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 70 insert
- `artifacts/api-server/src/routes/routes.ts`: 1922 raw SQL; 19717 raw SQL; 19729 raw SQL
- `artifacts/api-server/src/storage.ts`: 683 raw SQL; 862 insert; 885 update; 893 delete; 5844 update; 5857 update; 5891 insert; 5925 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auditEngine.ts`: 64 buildContractAuditRows
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/due-date-notifications.ts`: 6 checkAndCreateDueDateNotifications; 98 runDueDateNotifications
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/legacyContractFreeze.ts`: 15 hasFrozenLegacyRows
- `artifacts/api-server/src/lib/ticketAssignmentNotification.ts`: 7 notifyTicketAssignment; 35 pushReturnedTicket
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes; 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 368 GET /api/m/today; 531 loadMobileTicket; 574 GET /api/m/tickets/:id; 785 POST /api/m/tickets/:id/complete; 864 ensureAdminCustomerAccess; 882 GET /api/customers/:id/site-notes; 895 POST /api/customers/:id/site-notes; 910 PATCH /api/customers/:customerId/site-notes/:id; 934 DELETE /api/customers/:customerId/site-notes/:id; 1395 GET /api/m/properties; 1472 POST /api/m/properties/:id/view; 1500 GET /api/m/properties/:id; 1828 GET /api/m/me/recent-completions; 1911 GET /api/m/sync
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue; 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/flags.ts`: 367 GET /api/flags/customer-search; 403 POST /api/m/flags; 694 GET /api/m/properties/search; 727 GET /api/flags; 812 GET /api/flags/:id
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/qbo.ts`: 455 POST /customers/bind; 573 POST /customers/duplicate-check; 653 POST /customers/create; 801 POST /customers/promote
- `artifacts/api-server/src/routes/routes.ts`: 118 seedCommunications; 1004 ensureToDoTicketType; 1086 seedAllTicketTypes; 1102 migrateFirstBankHierarchy; 2306 seedCommunicationsBootstrap; 2603 registerRoutes; 2679 GET /api/customers; 2703 GET /api/customers/route; 2717 GET /api/customers/:id; 2744 GET /api/customers/:id/parent-rollup; 2890 POST /api/customers; 2934 PATCH /api/customers/:id; 3092 DELETE /api/customers/:id; 3134 POST /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 3328 POST /api/customers/:customerId/notes; 3397 GET /api/contracts; 3473 POST /api/customers/:customerId/contracts; 3527 POST /api/contracts; 3580 PATCH /api/contracts/:id; 4080 DELETE /api/admin/companies/:id; 4506 GET /api/customers/:customerId/revenue/:year; 4528 GET /api/customers/:customerId/all-monthly-amounts/:year; 4561 GET /api/dashboard/stats; 4575 GET /api/dashboard/customer-growth; 4596 GET /api/dashboard/top-customers; 4607 GET /api/dashboard/upcoming-renewals; 4641 GET /api/revenue/contract-audit; 4663 GET /api/revenue/exceptions; 4867 GET /api/revenue/export/audit; 4886 GET /api/revenue/export/exceptions; 4932 GET /api/revenue/export/filtered; 4958 GET /api/revenue/export/matrix; 5189 POST /api/contract-builder/documents/:id/export-pdf; 5373 POST /api/contract-builder/documents/:id/publish-and-create; 5796 POST /api/ticket-types/init-todo; 6115 POST /api/customers/geocode-missing; 6196 GET /api/tickets/my; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7982 POST /api/admin/migrate-invoices; 8110 GET /api/admin/parent-customer-audit; 8216 GET /api/tickets/:id/details; 9430 POST /api/equipment; 9970 GET /api/snow-events/:eventId/impacts; 10005 POST /api/snow-events/:eventId/impacts/bulk; 10064 POST /api/snow-events/:eventId/generate-tickets; 10197 GET /api/email-logs; 10212 GET /api/customers/:id/campaign-items; 10224 GET /api/customers/:id/communications; 10271 GET /api/customers/:id/annual-service-rollup; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 10963 GET /api/reports/:type; 11191 GET /api/proposals; 11199 POST /api/proposals; 11232 GET /api/proposals/:id; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 11303 GET /api/customers/:id/proposals; 11311 GET /api/tickets/:ticketId/proposals; 11362 POST /api/proposals/:id/files; 11510 GET /api/proposals/:id/plant-items; 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 12732 GET /api/proposals/:id/versions/:versionId/download; 12824 GET /api/crew-worksheets; 12843 GET /api/crew-worksheets/:id; 12853 GET /api/customers/:customerId/crew-worksheets; 12862 GET /api/tickets/:ticketId/crew-worksheets; 12925 generateCrewWorksheetFromProposalHandler; 12961 PATCH /api/crew-worksheets/:id; 12988 DELETE /api/crew-worksheets/:id; 13000 POST /api/crew-worksheets/:id/photos/upload-url; 13029 POST /api/crew-worksheets/:id/photos; 13093 POST /api/crew-worksheets/:id/photos/reorder; 13116 POST /api/crew-worksheets/:id/photos/bulk-delete; 13153 generateCrewWorksheetPdf; 13419 GET /api/crew-worksheets/:id/pdf; 13442 GET /api/crew-worksheets/:id/visual-scope-sheets; 13453 GET /api/crew-worksheets/:id/visual-scope.png; 13477 POST /api/crew-worksheets/:id/finalize; 13496 GET /api/crew-worksheets/:id/versions/:versionId/download; 13533 GET /api/visual-scope-sheets; 13541 GET /api/visual-scope-sheets/:id; 13550 GET /api/visual-scope-sheets/:id/base-image; 13581 POST /api/visual-scope-sheets; 13613 DELETE /api/visual-scope-sheets/:id; 13644 POST /api/visual-scope-sheets/:id/replace-base-image; 13664 GET /api/customers/:id/visual-scope-sheets; 13673 POST /api/visual-scope-sheets/:id/capture-highres; 13773 handleVsExport; 13803 GET /api/visual-scope-sheets/:id/export/base; 13804 GET /api/visual-scope-sheets/:id/export/overlay; 13805 GET /api/visual-scope-sheets/:id/export/combined; 13808 POST /api/visual-scope-sheets/:id/export-png; 13849 POST /api/visual-scope-sheets/:id/export-pdf; 14034 POST /api/campaigns; 14163 GET /api/campaigns/:id; 14294 GET /api/campaigns/:id/items/:itemId/notification-recipient; 14308 emailPreviewHandler; 14639 POST /api/campaigns/:id/items; 14961 GET /api/operations/customer-service-summaries; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16054 GET /api/weather; 16455 GET /api/seasons/:id/report; 16528 GET /api/communications/analytics; 16566 GET /api/communications; 16653 GET /api/communications/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16853 POST /api/communication-threads; 16868 GET /api/communication-threads/:id/messages; 16917 PATCH /api/communications/:id/cancel-schedule; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17111 GET /api/operations/overdue; 17166 GET /api/operations/due-this-week; 17224 GET /api/operations/missing-obligations; 17327 GET /api/operations/exceptions; 17452 POST /api/customers/:id/service-plans; 17475 POST /api/customers/:id/service-plans/from-template; 17544 GET /api/customers/:customerId/communications/summary; 17579 GET /api/customers/:customerId/communications/recent; 17600 POST /api/customers/:customerId/communications; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules; 19127 POST /api/chemical-notification-templates/preview; 19233 GET /api/plant-palettes; 19307 GET /api/plant-palettes/:id; 19712 reconcileIsParentFlags; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 120 POST /:id/route
- `artifacts/api-server/src/routes/visits.ts`: 47 GET /api/visits; 91 POST /api/visits
- `artifacts/api-server/src/services/automationService.ts`: 35 getSourceRecords; 154 isDuplicate; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/chemRecipient.ts`: 38 resolveChemRecipientEmail
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/services/emailRouter.ts`: 46 routeMessage
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 786 getCustomers; 790 getCustomersPaginated; 804 getCustomerSearch; 837 getCustomerById; 844 getCustomersByIds; 851 getChildCustomers; 856 getParentCustomers; 866 updateCustomer; 953 getAllContracts; 1557 getDashboardStats; 1582 getCustomerGrowthData; 1644 getTopCustomers; 1668 getUpcomingRenewals; 2840 getSnowEventPropertyImpacts; 2969 getEmailLogs; 3046 _getVsSheetMap; 3056 getProposals; 3089 getProposalsByCustomer; 3121 getProposalsForTicket; 3153 getProposalById; 3405 getCrewWorksheets; 3422 getCrewWorksheetsByCustomer; 3438 getCrewWorksheetsForTicket; 3454 getCrewWorksheetById; 3641 getVisualScopeSheets; 3651 getVisualScopeSheetsForCustomer; 3661 getVisualScopeSheet; 4284 getCommunications; 4478 getCommunicationById; 4652 getCommunicationAnalytics; 4855 getThreadMessages; 5814 bindQboCustomer; 5863 promoteQboCustomerToCrm; 5996 getCustomerWithPrimaryContactForQbo
- `artifacts/api-server/src/utils/parentGuard.ts`: 15 assertNotParentCustomer

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/qbo.ts`: 298 POST /customers/pull; 455 POST /customers/bind; 486 POST /customers/unbind; 653 POST /customers/create; 801 POST /customers/promote
- `artifacts/api-server/src/routes/routes.ts`: 1004 ensureToDoTicketType; 1086 seedAllTicketTypes; 1102 migrateFirstBankHierarchy; 1919 backfillCustomerType; 2890 POST /api/customers; 2934 PATCH /api/customers/:id; 3092 DELETE /api/customers/:id; 3134 POST /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 5796 POST /api/ticket-types/init-todo; 6115 POST /api/customers/geocode-missing; 8915 POST /api/admin/reset-for-setup; 16054 GET /api/weather; 19712 reconcileIsParentFlags; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 861 createCustomer; 866 updateCustomer; 892 deleteCustomer; 5814 bindQboCustomer; 5856 unbindQboCustomer; 5863 promoteQboCustomerToCrm; 5919 refreshStaleDisplayNames

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/visits.ts`
- `artifacts/highplains-crm/src/components/AnnualServiceRollup.tsx`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/CommunicationListTab.tsx`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/ContractServices.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/CustomerGrowthChart.tsx`
- `artifacts/highplains-crm/src/components/CustomerLocationEditor.tsx`
- `artifacts/highplains-crm/src/components/CustomerSchedulingSection.tsx`
- `artifacts/highplains-crm/src/components/CustomerSearchInput.tsx`
- `artifacts/highplains-crm/src/components/CustomerServiceChecklist.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/LayerMapViewer.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/SchedulePreview.tsx`
- `artifacts/highplains-crm/src/components/ScheduleSummary.tsx`
- `artifacts/highplains-crm/src/components/ServiceChecklistPanel.tsx`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/components/customer/CustomersViewSwitcher.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/CommunicationsQuickViewModal.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/components/customer/dashboard/CustomerDashboard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/last-viewed-customer.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx`
- `artifacts/highplains-crm/src/pages/ContractsOverview.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetMaker.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetPrint.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/CustomerRouteMap.tsx`
- `artifacts/highplains-crm/src/pages/CustomersList.tsx`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentDetail.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentList.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentTicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldCustomerList.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FlagDetailPage.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/NewEquipment.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx`
- `artifacts/highplains-crm/src/pages/PlantPalettes.tsx`
- `artifacts/highplains-crm/src/pages/PropertyMapsPage.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`
- `artifacts/highplains-crm/src/pages/RevenueOverview.tsx`
- `artifacts/highplains-crm/src/pages/ScheduleViewer.tsx`
- `artifacts/highplains-crm/src/pages/SeasonDetail.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- `artifacts/highplains-crm/src/pages/VisualScopeDraft.tsx`
- `artifacts/highplains-crm/src/pages/VisualScopeEditor.tsx`
- `artifacts/highplains-crm/src/pages/VisualScopeList.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`
- `artifacts/highplains-mobile/app/(tabs)/me/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-email-logs"></a>
### email_logs

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2975 from; 3005 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 83 raw SQL
- `artifacts/api-server/src/storage.ts`: 3012 insert; 3017 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 10197 GET /api/email-logs; 10897 POST /api/email-logs/:id/resend
- `artifacts/api-server/src/services/emailService.ts`: 364 resendEmail
- `artifacts/api-server/src/storage.ts`: 2969 getEmailLogs; 3004 getEmailLogById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/flags.ts`: 275 notifyOfficeOfNewFlag; 403 POST /api/m/flags
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 10418 POST /api/tickets/:id/send-completion-email; 10897 POST /api/email-logs/:id/resend; 10914 seedEmailTemplatesAndRules; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 17046 POST /api/automation-rules/:id/run; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules
- `artifacts/api-server/src/services/automationService.ts`: 169 trySendAutomationEmail; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 12 sendEmailCommunication; 44 sendCommunication
- `artifacts/api-server/src/services/emailService.ts`: 245 sendEmail; 312 processEmailEvent; 364 resendEmail
- `artifacts/api-server/src/services/emailSyncService.ts`: 277 sendSyncErrorNotification; 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 41 migrateRemoveChemicalEmailTemplates
- `artifacts/api-server/src/storage.ts`: 3011 createEmailLog; 3016 updateEmailLog

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-email-rules"></a>
### email_rules

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 56 raw SQL
- `artifacts/api-server/src/storage.ts`: 2943 from; 2948 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 71 raw SQL
- `artifacts/api-server/src/storage.ts`: 2957 insert; 2962 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 10167 GET /api/email-rules; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 10914 seedEmailTemplatesAndRules
- `artifacts/api-server/src/services/emailService.ts`: 312 processEmailEvent
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 41 migrateRemoveChemicalEmailTemplates
- `artifacts/api-server/src/storage.ts`: 2942 getEmailRules; 2947 getEmailRulesByEvent

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 10174 PATCH /api/email-rules/:id; 10914 seedEmailTemplatesAndRules
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 41 migrateRemoveChemicalEmailTemplates
- `artifacts/api-server/src/storage.ts`: 2956 createEmailRule; 2961 updateEmailRule

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-email-templates"></a>
### email_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2910 from; 2916 from; 2923 from; 2975 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 89 raw SQL
- `artifacts/api-server/src/storage.ts`: 2930 insert; 2935 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 10140 GET /api/email-templates; 10197 GET /api/email-logs; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 10914 seedEmailTemplatesAndRules
- `artifacts/api-server/src/services/emailService.ts`: 312 processEmailEvent
- `artifacts/api-server/src/storage.ts`: 2909 getEmailTemplates; 2915 getEmailTemplateById; 2922 getEmailTemplateByName; 2969 getEmailLogs

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 10151 PATCH /api/email-templates/:id; 10914 seedEmailTemplatesAndRules
- `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`: 41 migrateRemoveChemicalEmailTemplates
- `artifacts/api-server/src/storage.ts`: 2929 createEmailTemplate; 2934 updateEmailTemplate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-equipment"></a>
### equipment

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2531 from; 2537 from; 2631 from; 2674 from; 2692 innerJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2571 insert; 2576 update; 2584 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9412 GET /api/equipment/:id; 9657 GET /api/equipment-tickets; 9683 GET /api/equipment-tickets-list; 10963 GET /api/reports/:type
- `artifacts/api-server/src/storage.ts`: 2530 getEquipment; 2536 getEquipmentById; 2616 getEquipmentTickets; 2661 getEquipmentTicketsWithEquipmentName

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9430 POST /api/equipment; 9463 PATCH /api/equipment/:id; 9507 DELETE /api/equipment/:id
- `artifacts/api-server/src/storage.ts`: 2570 createEquipment; 2575 updateEquipment; 2583 deleteEquipment

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentDetail.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentList.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentTicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewEquipment.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-equipment-files"></a>
### equipment_files

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2590 from; 2599 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2606 insert; 2611 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9537 GET /api/equipment/:equipmentId/files
- `artifacts/api-server/src/storage.ts`: 2589 getEquipmentFiles; 2598 getEquipmentFileById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9574 POST /api/equipment/:equipmentId/files; 9620 DELETE /api/equipment/:equipmentId/files/:fileId
- `artifacts/api-server/src/storage.ts`: 2605 createEquipmentFile; 2610 deleteEquipmentFile

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/EquipmentDetail.tsx`

<a id="table-equipment-ticket-status-history"></a>
### equipment_ticket_status_history

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2750 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2745 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9841 GET /api/equipment-tickets/:ticketId/history
- `artifacts/api-server/src/storage.ts`: 2749 getEquipmentTicketStatusHistory

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9742 POST /api/equipment-tickets; 9778 PATCH /api/equipment-tickets/:id
- `artifacts/api-server/src/storage.ts`: 2744 createEquipmentTicketStatusHistory

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/EquipmentDetail.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentList.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentTicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`

<a id="table-equipment-tickets"></a>
### equipment_tickets

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2547 from; 2641 from; 2656 from; 2692 from; 2710 from; 2717 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2726 insert; 2731 update; 2739 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9397 GET /api/equipment; 9657 GET /api/equipment-tickets; 9683 GET /api/equipment-tickets-list; 9709 GET /api/equipment/:equipmentId/tickets; 9724 GET /api/equipment-tickets/:id; 9778 PATCH /api/equipment-tickets/:id
- `artifacts/api-server/src/storage.ts`: 2543 getEquipmentWithTicketCounts; 2616 getEquipmentTickets; 2661 getEquipmentTicketsWithEquipmentName; 2709 getEquipmentTicketById; 2716 getEquipmentTicketsByEquipmentId

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9742 POST /api/equipment-tickets; 9778 PATCH /api/equipment-tickets/:id; 9826 DELETE /api/equipment-tickets/:id
- `artifacts/api-server/src/storage.ts`: 2725 createEquipmentTicket; 2730 updateEquipmentTicket; 2738 deleteEquipmentTicket

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentDetail.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentList.tsx`
- `artifacts/highplains-crm/src/pages/EquipmentTicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewEquipment.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-flag-photos"></a>
### flag_photos

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/flags.ts`: 439 from; 622 from; 676 from; 782 from; 838 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/flags.ts`: 516 insert; 659 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/flags.ts`: 403 POST /api/m/flags; 599 POST /api/m/flags/:id/photos; 727 GET /api/flags; 812 GET /api/flags/:id

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/flags.ts`: 403 POST /api/m/flags; 599 POST /api/m/flags/:id/photos

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/pages/FlagDetailPage.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-flags"></a>
### flags

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/flags.ts`: 434 from; 538 from; 606 from; 719 from; 763 from; 803 from; 817 from; 905 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/flags.ts`: 501 insert; 914 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/flags.ts`: 403 POST /api/m/flags; 599 POST /api/m/flags/:id/photos; 716 GET /api/flags/unread-count; 727 GET /api/flags; 812 GET /api/flags/:id; 866 PATCH /api/flags/:id

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/flags.ts`: 403 POST /api/m/flags; 866 PATCH /api/flags/:id

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/pages/FlagDetailPage.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-mailbox-accounts"></a>
### mailbox_accounts

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 55 from; 84 from; 117 from; 155 from; 218 from; 332 from; 356 from; 444 from; 470 from; 556 from; 604 from; 628 from; 682 from; 735 from; 785 from; 819 from; 857 from; 881 from
- `artifacts/api-server/src/routes/routes.ts`: 17640 from; 19927 raw SQL; 19942 raw SQL
- `artifacts/api-server/src/services/emailSyncService.ts`: 427 from; 738 from; 997 from
- `artifacts/api-server/src/services/gmailSender.ts`: 112 from
- `artifacts/api-server/src/services/googleOAuth.ts`: 68 from; 130 from
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 172 from
- `artifacts/api-server/src/services/mailboxScope.ts`: 43 from; 56 from; 76 from
- `artifacts/api-server/src/storage.ts`: 5400 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 236 insert; 411 update; 415 update; 668 insert; 714 update; 742 update; 766 update; 795 delete
- `artifacts/api-server/src/routes/routes.ts`: 19942 raw SQL
- `artifacts/api-server/src/services/emailSyncService.ts`: 476 update; 502 update; 514 update; 594 update; 897 update
- `artifacts/api-server/src/services/googleOAuth.ts`: 95 update; 114 update; 121 update; 149 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/flags.ts`: 275 notifyOfficeOfNewFlag; 403 POST /api/m/flags
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 23 GET /; 75 GET /:id/oauth/status; 108 GET /:id/oauth/connect; 150 GET /mine; 203 POST /mine; 274 GET /oauth/callback; 435 POST /:id/oauth/disconnect; 462 GET /sync-summary; 548 POST /:id/sync; 596 GET /:id/sync-runs; 621 GET /:id; 677 PATCH /:id; 727 POST /:id/admin-disconnect; 779 DELETE /:id/permanent; 814 POST /:id/backfill; 852 GET /:id/backfill/status; 876 POST /:id/backfill/:runId/cancel
- `artifacts/api-server/src/routes/routes.ts`: 4491 GET /api/mailbox-accounts/personal; 10418 POST /api/tickets/:id/send-completion-email; 10897 POST /api/email-logs/:id/resend; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16566 GET /api/communications; 17046 POST /api/automation-rules/:id/run; 17600 POST /api/customers/:customerId/communications; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations; 19915 migrateMailboxVisibilitySettings
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 19 GET /; 120 POST /:id/route
- `artifacts/api-server/src/services/automationService.ts`: 169 trySendAutomationEmail; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 12 sendEmailCommunication; 44 sendCommunication
- `artifacts/api-server/src/services/emailService.ts`: 312 processEmailEvent; 364 resendEmail
- `artifacts/api-server/src/services/emailSyncService.ts`: 277 sendSyncErrorNotification; 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/gmailSender.ts`: 108 sendEmail
- `artifacts/api-server/src/services/googleOAuth.ts`: 67 getValidAccessToken; 129 revokeTokens
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/services/mailboxScope.ts`: 42 getPersonalMailboxIdForUser; 55 getSharedMailboxIds; 75 getMailboxById; 87 resolveVisibleMailboxes
- `artifacts/api-server/src/storage.ts`: 5399 getCompanyPersonalMailboxes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/flags.ts`: 275 notifyOfficeOfNewFlag; 403 POST /api/m/flags
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 203 POST /mine; 274 GET /oauth/callback; 435 POST /:id/oauth/disconnect; 548 POST /:id/sync; 640 POST /; 677 PATCH /:id; 727 POST /:id/admin-disconnect; 761 DELETE /:id; 779 DELETE /:id/permanent; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/routes.ts`: 10418 POST /api/tickets/:id/send-completion-email; 10897 POST /api/email-logs/:id/resend; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 17046 POST /api/automation-rules/:id/run; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations; 19915 migrateMailboxVisibilitySettings
- `artifacts/api-server/src/services/automationService.ts`: 169 trySendAutomationEmail; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 12 sendEmailCommunication; 44 sendCommunication
- `artifacts/api-server/src/services/emailService.ts`: 312 processEmailEvent; 364 resendEmail
- `artifacts/api-server/src/services/emailSyncService.ts`: 277 sendSyncErrorNotification; 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/gmailSender.ts`: 108 sendEmail
- `artifacts/api-server/src/services/googleOAuth.ts`: 67 getValidAccessToken; 129 revokeTokens
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/SharedMailboxesAndOversightPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-mailbox-backfill-runs"></a>
### mailbox_backfill_runs

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 157 from; 436 from; 477 from
- `artifacts/api-server/src/storage.ts`: 5385 from; 5452 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5371 insert; 5376 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 814 POST /:id/backfill; 852 GET /:id/backfill/status; 876 POST /:id/backfill/:runId/cancel
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 435 requestCancel; 459 getActiveBackfill; 463 getBackfillHistory; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 5384 getActiveMailboxBackfillRun; 5451 getMailboxBackfillHistory

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 814 POST /:id/backfill; 876 POST /:id/backfill/:runId/cancel
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 435 requestCancel; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 5370 createMailboxBackfillRun; 5375 updateMailboxBackfillRun

**Matched screens/components/client modules**
- None statically matched.

<a id="table-mailbox-sync-runs"></a>
### mailbox_sync_runs

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 483 from; 520 from; 581 from; 608 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 794 delete
- `artifacts/api-server/src/services/emailSyncService.ts`: 449 insert; 972 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 462 GET /sync-summary; 548 POST /:id/sync; 596 GET /:id/sync-runs

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync; 779 DELETE /:id/permanent
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 419 finalizeOnce; 953 finalizeSyncRun; 995 syncAllMailboxes; 1031 tick

**Matched screens/components/client modules**
- None statically matched.

<a id="table-maintenance-crews"></a>
### maintenance_crews

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/crewLinks.ts`: 26 from; 37 from
- `artifacts/api-server/src/lib/linkCrews.ts`: 31 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 119 from
- `artifacts/api-server/src/routes/routes.ts`: 8616 from
- `artifacts/api-server/src/storage.ts`: 2178 from; 2188 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/crewLinks.ts`: 31 update; 32 update
- `artifacts/api-server/src/lib/linkCrews.ts`: 38 update
- `artifacts/api-server/src/routes/routes.ts`: 8589 insert; 8621 update
- `artifacts/api-server/src/storage.ts`: 672 raw SQL; 2195 insert; 2200 update; 2208 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/crewLinks.ts`: 24 replacePlannerLink; 34 validatePlannerOwner
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 107 listCrewsWithSupervisor; 169 GET /api/crews; 176 POST /api/crews; 225 PATCH /api/crews/:id
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 8546 GET /api/maintenance-crews; 8555 GET /api/maintenance-crews/:id; 8567 POST /api/maintenance-crews; 8600 PATCH /api/maintenance-crews/:id
- `artifacts/api-server/src/storage.ts`: 2177 getMaintenanceCrews; 2187 getMaintenanceCrewById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/crewLinks.ts`: 24 replacePlannerLink
- `artifacts/api-server/src/lib/linkCrews.ts`: 7 linkCrewsByName
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 176 POST /api/crews; 225 PATCH /api/crews/:id
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 8567 POST /api/maintenance-crews; 8600 PATCH /api/maintenance-crews/:id; 8635 DELETE /api/maintenance-crews/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2194 createMaintenanceCrew; 2199 updateMaintenanceCrew; 2207 deleteMaintenanceCrew

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/CustomerSchedulingSection.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/SchedulePreview.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ScheduleViewer.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`

<a id="table-maintenance-visit-configs"></a>
### maintenance_visit_configs

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2213 from; 2233 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 671 raw SQL; 2220 insert; 2225 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8649 GET /api/customers/:customerId/maintenance-config; 8658 PUT /api/customers/:customerId/maintenance-config; 8688 GET /api/maintenance-visit-configs
- `artifacts/api-server/src/storage.ts`: 2212 getMaintenanceVisitConfig; 2232 getMaintenanceVisitConfigs

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 8658 PUT /api/customers/:customerId/maintenance-config; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2219 createMaintenanceVisitConfig; 2224 updateMaintenanceVisitConfig

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/CustomerSchedulingSection.tsx`
- `artifacts/highplains-crm/src/pages/ScheduleViewer.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`

<a id="table-mobile-auth-tokens"></a>
### mobile_auth_tokens

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/mobileAuth.ts`: 136 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/mobileAuth.ts`: 96 insert; 107 update; 171 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/mobileAuth.ts`: 128 requireMobileAuth
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 136 registerCrewsAndMobileRoutes
- `artifacts/api-server/src/routes/flags.ts`: 363 registerFlagsRoutes
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 219 registerMobileTicketPhotosNotesRoutes
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/mobileAuth.ts`: 88 issueMobileToken; 106 revokeTokenByHash; 128 requireMobileAuth
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 136 registerCrewsAndMobileRoutes; 314 POST /api/m/auth/login; 345 POST /api/m/auth/logout
- `artifacts/api-server/src/routes/flags.ts`: 363 registerFlagsRoutes
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 219 registerMobileTicketPhotosNotesRoutes
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/highplains-mobile/contexts/AuthContext.tsx`
- `artifacts/highplains-mobile/lib/api.ts`

<a id="table-notes"></a>
### notes

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 925 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 677 raw SQL; 931 insert; 936 update; 944 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 3318 GET /api/customers/:customerId/notes; 8110 GET /api/admin/parent-customer-audit
- `artifacts/api-server/src/storage.ts`: 924 getNotesByCustomerId

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3328 POST /api/customers/:customerId/notes; 3355 PATCH /api/notes/:id; 3381 DELETE /api/notes/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 930 createNote; 935 updateNote; 943 deleteNote

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`

<a id="table-plant-catalog-items"></a>
### plant_catalog_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 533 from
- `artifacts/api-server/src/routes/routes.ts`: 11538 from; 18555 from; 18731 from; 19417 from; 19422 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/plantSync.ts`: 45 insert; 92 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 530 getVarietiesToEnrich; 621 enrichPlants; 769 enrichAllCompanies; 782 startPlantEnrichmentScheduler
- `artifacts/api-server/src/routes/routes.ts`: 11519 POST /api/proposals/:id/plant-items; 18532 GET /api/plant-library/items; 18682 POST /api/plant-library/enrich; 18698 GET /api/plant-library/matches; 19393 POST /api/plant-palettes/:id/items

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/plantSync.ts`: 15 syncPlantAvailability; 150 syncAllCompanies; 165 startPlantSyncScheduler
- `artifacts/api-server/src/routes/routes.ts`: 18516 POST /api/plant-library/sync

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/PlantLibrary.tsx`
- `artifacts/highplains-crm/src/pages/PlantMatches.tsx`
- `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`

<a id="table-plant-enrichment"></a>
### plant_enrichment

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 550 from
- `artifacts/api-server/src/routes/routes.ts`: 11546 from; 18574 from; 18720 from; 18846 from; 18874 from; 19432 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 598 update; 724 insert
- `artifacts/api-server/src/routes/routes.ts`: 18836 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 530 getVarietiesToEnrich; 621 enrichPlants; 769 enrichAllCompanies; 782 startPlantEnrichmentScheduler
- `artifacts/api-server/src/routes/routes.ts`: 11519 POST /api/proposals/:id/plant-items; 18532 GET /api/plant-library/items; 18682 POST /api/plant-library/enrich; 18698 GET /api/plant-library/matches; 18778 POST /api/plant-library/matches/:varietyKey; 18864 GET /api/plant-library/photo/:varietyKey; 19393 POST /api/plant-palettes/:id/items

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 585 scrapeAndEnrichVariety; 621 enrichPlants; 769 enrichAllCompanies; 782 startPlantEnrichmentScheduler
- `artifacts/api-server/src/routes/routes.ts`: 18682 POST /api/plant-library/enrich; 18778 POST /api/plant-library/matches/:varietyKey

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/PlantLibrary.tsx`
- `artifacts/highplains-crm/src/pages/PlantMatches.tsx`
- `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`

<a id="table-plant-palette-items"></a>
### plant_palette_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/routes.ts`: 19320 from; 19443 from; 19551 from
- `artifacts/api-server/src/storage.ts`: 3183 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 19448 insert; 19486 update; 19509 delete; 19556 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 11232 GET /api/proposals/:id; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 11362 POST /api/proposals/:id/files; 11510 GET /api/proposals/:id/plant-items; 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 12732 GET /api/proposals/:id/versions/:versionId/download; 12925 generateCrewWorksheetFromProposalHandler; 19307 GET /api/plant-palettes/:id; 19393 POST /api/plant-palettes/:id/items; 19526 POST /api/plant-palettes/:id/duplicate
- `artifacts/api-server/src/storage.ts`: 3153 getProposalById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 19393 POST /api/plant-palettes/:id/items; 19472 PATCH /api/plant-palettes/:id/items/:itemId; 19501 DELETE /api/plant-palettes/:id/items/:itemId; 19526 POST /api/plant-palettes/:id/duplicate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`

<a id="table-plant-palettes"></a>
### plant_palettes

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/routes.ts`: 11257 from; 19248 from; 19315 from; 19404 from; 19534 from
- `artifacts/api-server/src/storage.ts`: 3180 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 19290 insert; 19362 update; 19382 delete; 19462 update; 19517 update; 19540 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 11232 GET /api/proposals/:id; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 11362 POST /api/proposals/:id/files; 11510 GET /api/proposals/:id/plant-items; 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 12732 GET /api/proposals/:id/versions/:versionId/download; 12925 generateCrewWorksheetFromProposalHandler; 19233 GET /api/plant-palettes; 19307 GET /api/plant-palettes/:id; 19393 POST /api/plant-palettes/:id/items; 19526 POST /api/plant-palettes/:id/duplicate
- `artifacts/api-server/src/storage.ts`: 3153 getProposalById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 19274 POST /api/plant-palettes; 19338 PATCH /api/plant-palettes/:id; 19374 DELETE /api/plant-palettes/:id; 19393 POST /api/plant-palettes/:id/items; 19501 DELETE /api/plant-palettes/:id/items/:itemId; 19526 POST /api/plant-palettes/:id/duplicate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx`
- `artifacts/highplains-crm/src/pages/PlantPalettes.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`

<a id="table-plant-sync-runs"></a>
### plant_sync_runs

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/routes.ts`: 18647 from; 18669 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 628 insert; 648 update; 733 update; 751 update; 761 update
- `artifacts/api-server/src/lib/plantSync.ts`: 21 insert; 121 update; 138 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 18638 GET /api/plant-library/sync-status; 18660 GET /api/plant-library/enrichment-status

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/lib/plantEnrichment.ts`: 621 enrichPlants; 769 enrichAllCompanies; 782 startPlantEnrichmentScheduler
- `artifacts/api-server/src/lib/plantSync.ts`: 15 syncPlantAvailability; 150 syncAllCompanies; 165 startPlantSyncScheduler
- `artifacts/api-server/src/routes/routes.ts`: 18516 POST /api/plant-library/sync; 18682 POST /api/plant-library/enrich

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/PlantLibrary.tsx`
- `artifacts/highplains-crm/src/pages/PlantMatches.tsx`

<a id="table-property-management-companies"></a>
### property_management_companies

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 70 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 100 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 93 from
- `artifacts/api-server/src/storage.ts`: 2378 from; 2384 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 22 insert
- `artifacts/api-server/src/storage.ts`: 2391 insert; 2396 update; 2404 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes; 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 9024 GET /api/property-management-companies; 9034 GET /api/property-management-companies/:id; 17111 GET /api/operations/overdue; 17166 GET /api/operations/due-this-week; 17224 GET /api/operations/missing-obligations; 17327 GET /api/operations/exceptions
- `artifacts/api-server/src/storage.ts`: 2377 getPropertyManagementCompanies; 2383 getPropertyManagementCompanyById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/routes/routes.ts`: 9047 POST /api/property-management-companies; 9065 PATCH /api/property-management-companies/:id; 9083 DELETE /api/property-management-companies/:id
- `artifacts/api-server/src/storage.ts`: 2390 createPropertyManagementCompany; 2395 updatePropertyManagementCompany; 2403 deletePropertyManagementCompany

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`

<a id="table-property-manager-emails"></a>
### property_manager_emails

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2461 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2469 insert; 2474 update; 2482 delete; 2487 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9102 GET /api/property-managers; 9209 GET /api/property-managers/:managerId/emails
- `artifacts/api-server/src/storage.ts`: 2460 getPropertyManagerEmails

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3134 POST /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 9219 POST /api/property-managers/:managerId/emails; 9237 PATCH /api/property-manager-emails/:id; 9254 DELETE /api/property-manager-emails/:id; 9329 PUT /api/property-managers/:id/contacts
- `artifacts/api-server/src/storage.ts`: 2468 createPropertyManagerEmail; 2473 updatePropertyManagerEmail; 2481 deletePropertyManagerEmail; 2486 deletePropertyManagerEmailsByManager

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-property-manager-phones"></a>
### property_manager_phones

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2496 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2504 insert; 2509 update; 2517 delete; 2522 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9102 GET /api/property-managers; 9269 GET /api/property-managers/:managerId/phones
- `artifacts/api-server/src/storage.ts`: 2495 getPropertyManagerPhones

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3134 POST /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 9279 POST /api/property-managers/:managerId/phones; 9297 PATCH /api/property-manager-phones/:id; 9314 DELETE /api/property-manager-phones/:id; 9329 PUT /api/property-managers/:id/contacts
- `artifacts/api-server/src/storage.ts`: 2503 createPropertyManagerPhone; 2508 updatePropertyManagerPhone; 2516 deletePropertyManagerPhone; 2521 deletePropertyManagerPhonesByManager

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-property-managers"></a>
### property_managers

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2410 from; 2416 from; 2425 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2432 insert; 2437 update; 2445 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2934 PATCH /api/customers/:id; 9102 GET /api/property-managers; 9131 GET /api/property-managers/:id; 9329 PUT /api/property-managers/:id/contacts
- `artifacts/api-server/src/storage.ts`: 2409 getPropertyManagers; 2415 getPropertyManagersByCompany; 2424 getPropertyManagerById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 3134 POST /api/customers/:customerId/contacts; 3215 PATCH /api/contacts/:id; 9144 POST /api/property-managers; 9162 PATCH /api/property-managers/:id; 9180 DELETE /api/property-managers/:id
- `artifacts/api-server/src/storage.ts`: 2431 createPropertyManager; 2436 updatePropertyManager; 2444 deletePropertyManager

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/CustomerLocationEditor.tsx`
- `artifacts/highplains-crm/src/components/CustomerSearchInput.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/CustomerRouteMap.tsx`
- `artifacts/highplains-crm/src/pages/CustomersList.tsx`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-property-site-notes"></a>
### property_site_notes

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 885 from; 1527 from
- `artifacts/api-server/src/services/site-notes.ts`: 22 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 903 insert; 919 update; 937 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 574 GET /api/m/tickets/:id; 882 GET /api/customers/:id/site-notes; 1500 GET /api/m/properties/:id; 1911 GET /api/m/sync
- `artifacts/api-server/src/services/site-notes.ts`: 14 getSiteNotesForProperty

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 895 POST /api/customers/:id/site-notes; 910 PATCH /api/customers/:customerId/site-notes/:id; 934 DELETE /api/customers/:customerId/site-notes/:id

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`

<a id="table-proposal-files"></a>
### proposal_files

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3070 from; 3102 from; 3134 from; 3165 from; 3219 from; 3225 from; 3231 from; 3241 from; 3265 from; 3288 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3251 insert; 3256 update; 3280 update; 3299 delete; 3304 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8110 GET /api/admin/parent-customer-audit; 11191 GET /api/proposals; 11232 GET /api/proposals/:id; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 11303 GET /api/customers/:id/proposals; 11311 GET /api/tickets/:ticketId/proposals; 11362 POST /api/proposals/:id/files; 11418 POST /api/proposals/:id/files/reorder; 11444 PATCH /api/proposals/:id/files/:fileId; 11457 POST /api/proposals/:id/files/bulk-delete; 11489 DELETE /api/proposals/:id/files/:fileId; 11510 GET /api/proposals/:id/plant-items; 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder; 11667 generateProposalPdf; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 12732 GET /api/proposals/:id/versions/:versionId/download; 12925 generateCrewWorksheetFromProposalHandler; 17046 POST /api/automation-rules/:id/run; 18940 POST /api/_internal/run-automation-rules
- `artifacts/api-server/src/services/automationService.ts`: 35 getSourceRecords; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 3056 getProposals; 3089 getProposalsByCustomer; 3121 getProposalsForTicket; 3153 getProposalById; 3218 getProposalFiles; 3224 getProposalFileById; 3230 getProposalEstimatePdf; 3240 getProposalEstimatePdfs; 3263 reorderProposalImageFiles

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 11362 POST /api/proposals/:id/files; 11418 POST /api/proposals/:id/files/reorder; 11444 PATCH /api/proposals/:id/files/:fileId; 11457 POST /api/proposals/:id/files/bulk-delete; 11489 DELETE /api/proposals/:id/files/:fileId
- `artifacts/api-server/src/storage.ts`: 3250 createProposalFile; 3255 updateProposalFile; 3263 reorderProposalImageFiles; 3298 deleteProposalFile; 3302 deleteProposalFiles

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`

<a id="table-proposal-plant-items"></a>
### proposal_plant_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3073 from; 3105 from; 3137 from; 3169 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 11550 insert; 11591 update; 11613 delete; 11635 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8110 GET /api/admin/parent-customer-audit; 11191 GET /api/proposals; 11232 GET /api/proposals/:id; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 11303 GET /api/customers/:id/proposals; 11311 GET /api/tickets/:ticketId/proposals; 11362 POST /api/proposals/:id/files; 11510 GET /api/proposals/:id/plant-items; 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 12732 GET /api/proposals/:id/versions/:versionId/download; 12925 generateCrewWorksheetFromProposalHandler; 17046 POST /api/automation-rules/:id/run; 18940 POST /api/_internal/run-automation-rules
- `artifacts/api-server/src/services/automationService.ts`: 35 getSourceRecords; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 3056 getProposals; 3089 getProposalsByCustomer; 3121 getProposalsForTicket; 3153 getProposalById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`

<a id="table-proposal-versions"></a>
### proposal_versions

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 3028 from; 3317 from; 3327 from; 3337 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 3312 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 12587 POST /api/proposals/:id/finalize; 12723 GET /api/proposals/:id/versions; 12732 GET /api/proposals/:id/versions/:versionId/download; 12765 GET /api/proposals/:id/versions/:versionId/visual-scope/:type
- `artifacts/api-server/src/storage.ts`: 3026 _getVersionsForProposals; 3316 getProposalVersions; 3326 getProposalVersionById; 3336 getNextVersionNumber

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 12587 POST /api/proposals/:id/finalize
- `artifacts/api-server/src/storage.ts`: 3311 createProposalVersion

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`

<a id="table-proposals"></a>
### proposals

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/routes.ts`: 1936 raw SQL; 1943 raw SQL; 1962 raw SQL
- `artifacts/api-server/src/storage.ts`: 3057 from; 3090 from; 3122 from; 3154 from; 3376 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 1951 raw SQL
- `artifacts/api-server/src/storage.ts`: 3202 insert; 3207 update; 3215 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 1929 migrateProposalNumbers; 8110 GET /api/admin/parent-customer-audit; 11191 GET /api/proposals; 11232 GET /api/proposals/:id; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 11303 GET /api/customers/:id/proposals; 11311 GET /api/tickets/:ticketId/proposals; 11362 POST /api/proposals/:id/files; 11510 GET /api/proposals/:id/plant-items; 11519 POST /api/proposals/:id/plant-items; 11576 PATCH /api/proposals/:id/plant-items/:itemId; 11604 DELETE /api/proposals/:id/plant-items/:itemId; 11623 POST /api/proposals/:id/plant-items/reorder; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 12732 GET /api/proposals/:id/versions/:versionId/download; 12925 generateCrewWorksheetFromProposalHandler; 17046 POST /api/automation-rules/:id/run; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/services/automationService.ts`: 35 getSourceRecords; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 3056 getProposals; 3089 getProposalsByCustomer; 3121 getProposalsForTicket; 3153 getProposalById; 3363 _enrichCrewWorksheets

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 1929 migrateProposalNumbers; 11199 POST /api/proposals; 11241 PATCH /api/proposals/:id; 11278 DELETE /api/proposals/:id; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 3201 createProposal; 3206 updateProposal; 3214 deleteProposal

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`

<a id="table-qbo-connections"></a>
### qbo_connections

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/services/qboClient.ts`: 234 from; 251 from; 286 from; 341 from; 375 from
- `artifacts/api-server/src/storage.ts`: 5462 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/services/qboClient.ts`: 185 update; 218 update; 277 delete; 329 update
- `artifacts/api-server/src/storage.ts`: 5470 insert; 5493 delete; 5501 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/qbo.ts`: 96 GET /connection; 138 GET /callback; 241 POST /disconnect; 254 POST /test; 288 assertConnected; 298 POST /customers/pull; 399 GET /customers/cache; 419 GET /customers/mapping; 455 POST /customers/bind; 486 POST /customers/unbind; 536 liveQboCustomerQuery; 573 POST /customers/duplicate-check; 653 POST /customers/create; 801 POST /customers/promote; 908 POST /customers/import-seed
- `artifacts/api-server/src/services/qboClient.ts`: 202 ensureFreshToken; 250 revokeConnection; 280 qboRequest; 340 getCompanyInfo; 373 run
- `artifacts/api-server/src/storage.ts`: 5461 getQboConnection

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/qbo.ts`: 138 GET /callback; 241 POST /disconnect; 254 POST /test; 298 POST /customers/pull; 536 liveQboCustomerQuery; 573 POST /customers/duplicate-check; 653 POST /customers/create
- `artifacts/api-server/src/services/qboClient.ts`: 174 upsertRefreshedTokens; 202 ensureFreshToken; 245 refreshTokens; 250 revokeConnection; 280 qboRequest; 340 getCompanyInfo; 373 run
- `artifacts/api-server/src/storage.ts`: 5469 upsertQboConnection; 5492 deleteQboConnection; 5496 updateQboConnectionStatus

**Matched screens/components/client modules**
- None statically matched.

<a id="table-qbo-customer-cache"></a>
### qbo_customer_cache

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 5624 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5551 insert; 5580 update; 5587 update; 5808 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/qbo.ts`: 908 POST /customers/import-seed
- `artifacts/api-server/src/storage.ts`: 5623 getQboCacheRow

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/qbo.ts`: 298 POST /customers/pull; 536 liveQboCustomerQuery; 573 POST /customers/duplicate-check; 653 POST /customers/create; 908 POST /customers/import-seed
- `artifacts/api-server/src/storage.ts`: 5509 upsertQboCustomerCache; 5575 deactivateMissingQboCustomers; 5802 writeSeedSuggestion

**Matched screens/components/client modules**
- None statically matched.

<a id="table-rate-card-items"></a>
### rate_card_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 22 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 63 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 84 from; 112 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 35 insert
- `artifacts/api-server/src/routes/contractCenter.ts`: 121 insert; 139 insert; 167 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 62 activeCard
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes; 71 POST /api/admin/contract-center/copy-legacy; 109 GET /api/contract-center/rate-card
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/routes/contractCenter.ts`: 118 POST /api/contract-center/rate-card/seed-defaults; 130 POST /api/contract-center/rate-card; 150 PATCH /api/contract-center/rate-card/:id

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/ContractSettings.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/rateCardUtils.ts`
- `artifacts/highplains-crm/src/pages/NewContractPage.tsx`

<a id="table-recent-property-views"></a>
### recent_property_views

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1402 from; 2066 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1484 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1395 GET /api/m/properties; 1911 GET /api/m/sync

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1472 POST /api/m/properties/:id/view

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/index.tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`

<a id="table-schedule-blocks"></a>
### schedule_blocks

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2298 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 669 raw SQL; 2304 insert; 2309 update; 2317 delete; 2321 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8795 GET /api/schedule-templates/:templateId/blocks
- `artifacts/api-server/src/storage.ts`: 2297 getScheduleBlocks

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 8811 POST /api/schedule-templates/:templateId/blocks; 8838 PATCH /api/schedule-blocks/:id; 8854 DELETE /api/schedule-blocks/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2303 createScheduleBlock; 2308 updateScheduleBlock; 2316 deleteScheduleBlock; 2320 deleteScheduleBlocksByTemplate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`

<a id="table-scope-preset-lines"></a>
### scope_preset_lines

**Direct SELECT/join/SQL sites**
- None found.

**Direct insert/update/delete/raw/generic-writer sites**
- None found.

**Resolved readers / endpoint wrappers**
- None found.

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- None found.

**Matched screens/components/client modules**
- None statically matched.

<a id="table-scope-presets"></a>
### scope_presets

**Direct SELECT/join/SQL sites**
- None found.

**Direct insert/update/delete/raw/generic-writer sites**
- None found.

**Resolved readers / endpoint wrappers**
- None found.

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- None found.

**Matched screens/components/client modules**
- None statically matched.

<a id="table-seasons"></a>
### seasons

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 867 from
- `artifacts/api-server/src/storage.ts`: 3721 from; 4177 from; 4181 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4186 insert; 4191 update; 4196 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/routes.ts`: 13997 GET /api/campaigns; 14163 GET /api/campaigns/:id; 16386 GET /api/seasons; 16412 PATCH /api/seasons/:id; 16430 DELETE /api/seasons/:id; 16440 PATCH /api/campaigns/:id/season; 16455 GET /api/seasons/:id/report; 17111 GET /api/operations/overdue; 17166 GET /api/operations/due-this-week; 17224 GET /api/operations/missing-obligations; 17327 GET /api/operations/exceptions
- `artifacts/api-server/src/storage.ts`: 3701 getCampaigns; 4176 getSeasons; 4180 getSeasonById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 16394 POST /api/seasons; 16412 PATCH /api/seasons/:id; 16430 DELETE /api/seasons/:id
- `artifacts/api-server/src/storage.ts`: 4185 createSeason; 4190 updateSeason; 4195 deleteSeason

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/SeasonDetail.tsx`
- `artifacts/highplains-crm/src/pages/SeasonsPage.tsx`

<a id="table-service-plan-template-items"></a>
### service_plan_template_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4948 from; 4975 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5007 delete; 5010 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 17388 GET /api/service-plan-templates; 17395 POST /api/service-plan-templates; 17413 PATCH /api/service-plan-templates/:id; 17475 POST /api/customers/:id/service-plans/from-template
- `artifacts/api-server/src/storage.ts`: 4943 getServicePlanTemplates; 4971 getServicePlanTemplateById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 17395 POST /api/service-plan-templates; 17413 PATCH /api/service-plan-templates/:id
- `artifacts/api-server/src/storage.ts`: 5006 upsertServicePlanTemplateItems

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/ServicePlanTemplatesAdmin.tsx`

<a id="table-service-plan-templates"></a>
### service_plan_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 4944 from; 4972 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 4989 insert; 4994 update; 5002 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 17388 GET /api/service-plan-templates; 17395 POST /api/service-plan-templates; 17413 PATCH /api/service-plan-templates/:id; 17475 POST /api/customers/:id/service-plans/from-template
- `artifacts/api-server/src/storage.ts`: 4943 getServicePlanTemplates; 4971 getServicePlanTemplateById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 17395 POST /api/service-plan-templates; 17413 PATCH /api/service-plan-templates/:id; 17434 DELETE /api/service-plan-templates/:id
- `artifacts/api-server/src/storage.ts`: 4988 createServicePlanTemplate; 4993 updateServicePlanTemplate; 5001 deleteServicePlanTemplate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/ServicePlanTemplatesAdmin.tsx`

<a id="table-service-type-template-items"></a>
### service_type_template_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 965 from; 1090 from; 1322 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1096 insert; 1112 update; 1130 delete; 1160 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 952 GET /api/service-type-templates; 1080 POST /api/service-type-templates/:id/items; 1301 POST /api/tickets/:id/work-items/load-template

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1080 POST /api/service-type-templates/:id/items; 1103 PATCH /api/service-type-templates/:templateId/items/:id; 1127 DELETE /api/service-type-templates/:templateId/items/:id; 1150 POST /api/service-type-templates/:id/items/reorder

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/WorkItemTemplatesAdmin.tsx`

<a id="table-service-type-templates"></a>
### service_type_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 955 from; 1064 from; 1310 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1008 insert; 1024 update; 1042 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 952 GET /api/service-type-templates; 1057 ensureTemplateAccess; 1080 POST /api/service-type-templates/:id/items; 1103 PATCH /api/service-type-templates/:templateId/items/:id; 1127 DELETE /api/service-type-templates/:templateId/items/:id; 1150 POST /api/service-type-templates/:id/items/reorder; 1301 POST /api/tickets/:id/work-items/load-template

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1000 POST /api/service-type-templates; 1015 PATCH /api/service-type-templates/:id; 1039 DELETE /api/service-type-templates/:id

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/WorkItemTemplatesAdmin.tsx`

<a id="table-settings"></a>
### settings

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/services/mailboxScope.ts`: 31 from
- `artifacts/api-server/src/services/qboClient.ts`: 357 from
- `artifacts/api-server/src/storage.ts`: 1016 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 19920 raw SQL
- `artifacts/api-server/src/storage.ts`: 691 raw SQL; 1021 insert; 1026 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 23 GET /; 548 POST /:id/sync
- `artifacts/api-server/src/routes/qbo.ts`: 96 GET /connection; 270 GET /write-enabled; 653 POST /customers/create
- `artifacts/api-server/src/routes/routes.ts`: 4408 GET /api/settings; 4451 GET /api/settings/mail; 11667 generateProposalPdf; 12552 GET /api/proposals/:id/pdf; 12587 POST /api/proposals/:id/finalize; 13153 generateCrewWorksheetPdf; 13419 GET /api/crew-worksheets/:id/pdf; 16566 GET /api/communications
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 19 GET /; 120 POST /:id/route
- `artifacts/api-server/src/services/mailboxScope.ts`: 30 loadConfig; 87 resolveVisibleMailboxes
- `artifacts/api-server/src/services/qboClient.ts`: 355 isQboWriteEnabled
- `artifacts/api-server/src/storage.ts`: 1015 getSettings

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/routes/routes.ts`: 4426 PATCH /api/settings; 4465 PATCH /api/settings/mail; 8915 POST /api/admin/reset-for-setup; 19866 runStartupMigrations; 19915 migrateMailboxVisibilitySettings
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1020 createSettings; 1025 updateSettings

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetPrint.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/SharedMailboxesAndOversightPage.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`

<a id="table-sheet-templates"></a>
### sheet_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 5232 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5240 insert; 5245 update; 5254 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 13955 GET /api/sheet-templates
- `artifacts/api-server/src/storage.ts`: 5231 getSheetTemplates

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 13962 POST /api/sheet-templates; 13979 PATCH /api/sheet-templates/:id; 13987 DELETE /api/sheet-templates/:id
- `artifacts/api-server/src/storage.ts`: 5239 createSheetTemplate; 5244 updateSheetTemplate; 5253 deleteSheetTemplate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/VisualScopeEditor.tsx`

<a id="table-snow-event-attachments"></a>
### snow_event_attachments

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2821 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2830 insert; 2835 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9937 GET /api/snow-events/:eventId/attachments
- `artifacts/api-server/src/storage.ts`: 2820 getSnowEventAttachments

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9945 POST /api/snow-events/:eventId/attachments; 9961 DELETE /api/snow-events/:eventId/attachments/:id
- `artifacts/api-server/src/storage.ts`: 2829 createSnowEventAttachment; 2834 deleteSnowEventAttachment

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`

<a id="table-snow-event-property-impacts"></a>
### snow_event_property_impacts

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2768 from; 2841 from; 2864 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2884 insert; 2889 update; 2897 delete; 2902 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9859 GET /api/snow-events; 9970 GET /api/snow-events/:eventId/impacts; 9978 GET /api/customers/:customerId/snow-impacts; 10005 POST /api/snow-events/:eventId/impacts/bulk; 10064 POST /api/snow-events/:eventId/generate-tickets
- `artifacts/api-server/src/storage.ts`: 2756 getSnowEvents; 2840 getSnowEventPropertyImpacts; 2863 getSnowEventPropertyImpactsByCustomer

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9986 POST /api/snow-events/:eventId/impacts; 10005 POST /api/snow-events/:eventId/impacts/bulk; 10037 PATCH /api/snow-events/:eventId/impacts/:id; 10050 DELETE /api/snow-events/:eventId/impacts/:id; 10064 POST /api/snow-events/:eventId/generate-tickets
- `artifacts/api-server/src/storage.ts`: 2883 createSnowEventPropertyImpact; 2888 updateSnowEventPropertyImpact; 2896 deleteSnowEventPropertyImpact; 2901 deleteSnowEventPropertyImpactsByEvent

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/NewSnowEvent.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventsList.tsx`

<a id="table-snow-events"></a>
### snow_events

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2757 from; 2796 from; 2875 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2802 insert; 2807 update; 2815 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 9859 GET /api/snow-events; 9867 GET /api/snow-events/:id; 9895 PATCH /api/snow-events/:id; 9911 POST /api/snow-events/:id/lock; 9923 DELETE /api/snow-events/:id; 9978 GET /api/customers/:customerId/snow-impacts; 9986 POST /api/snow-events/:eventId/impacts; 10005 POST /api/snow-events/:eventId/impacts/bulk; 10037 PATCH /api/snow-events/:eventId/impacts/:id; 10050 DELETE /api/snow-events/:eventId/impacts/:id; 10064 POST /api/snow-events/:eventId/generate-tickets
- `artifacts/api-server/src/storage.ts`: 2756 getSnowEvents; 2795 getSnowEventById; 2863 getSnowEventPropertyImpactsByCustomer

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 9876 POST /api/snow-events; 9895 PATCH /api/snow-events/:id; 9911 POST /api/snow-events/:id/lock; 9923 DELETE /api/snow-events/:id; 10064 POST /api/snow-events/:eventId/generate-tickets
- `artifacts/api-server/src/storage.ts`: 2801 createSnowEvent; 2806 updateSnowEvent; 2814 deleteSnowEvent

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/NewSnowEvent.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventsList.tsx`

<a id="table-style-presets"></a>
### style_presets

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 5155 from; 5189 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 5169 insert; 5174 update; 5183 delete; 5217 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 13914 GET /api/style-presets
- `artifacts/api-server/src/storage.ts`: 5154 getStylePresets; 5188 seedDefaultStylePresets

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 13914 GET /api/style-presets; 13922 POST /api/style-presets; 13938 PATCH /api/style-presets/:id; 13946 DELETE /api/style-presets/:id
- `artifacts/api-server/src/storage.ts`: 5168 createStylePreset; 5173 updateStylePreset; 5182 deleteStylePreset; 5188 seedDefaultStylePresets

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/VisualScopeEditor.tsx`

<a id="table-term-billing-months"></a>
### term_billing_months

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 25 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 80 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 61 from; 118 from; 173 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 29 insert
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 26 insert
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 53 generic replaceRows
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 45 generic replaceRows
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 104 generic replaceRows; 122 generic replaceRows; 140 generic replaceRows; 194 generic replaceRows

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-term-documents"></a>
### term_documents

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 19 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 55 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 81 from
- `artifacts/api-server/src/lib/contractRenewalBrowserFixture.ts`: 14 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 220 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 31 insert
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 27 insert
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 54 insert
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 222 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-term-legacy-sources"></a>
### term_legacy_sources

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 21 from
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 58 from
- `artifacts/api-server/src/routes/contractCenter.ts`: 65 from; 101 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 75 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 30 insert
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 29 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes; 62 GET /api/contract-center/copy-status; 71 POST /api/admin/contract-center/copy-legacy
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/api-server/src/routes/contractCenter.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`
- `artifacts/highplains-crm/src/components/contracts/CustomerContracts.tsx`
- `artifacts/highplains-crm/src/components/contracts/LegacyCopyCard.tsx`

<a id="table-term-rates"></a>
### term_rates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 24 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 79 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 172 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 28 insert
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 25 insert
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 52 generic replaceRows
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 44 generic replaceRows
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 103 generic replaceRows; 135 generic replaceRows; 193 generic replaceRows

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-term-scope-lines"></a>
### term_scope_lines

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 23 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 78 from
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 171 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 27 insert
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 24 insert
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 51 generic replaceRows
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 43 generic replaceRows
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 102 generic replaceRows; 134 generic replaceRows; 192 generic replaceRows

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-term-status-history"></a>
### term_status_history

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 20 from
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 82 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 28 insert
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 51 insert; 59 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/contractAuditData.ts`: 8 loadAuditData
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/routes/contractAudit.ts`: 18 GET /api/admin/contract-center/current-export; 22 GET /api/admin/contract-center/audit-export/batches; 30 GET /api/admin/contract-center/audit-export; 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/contractAuditExecution.ts`: 10 writeCustomer; 40 executeAuditImport
- `artifacts/api-server/src/lib/contractCenterCopyExecution.ts`: 10 executeLegacyCopy
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 43 writeTerm; 58 addHistory
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalExecution.ts`: 12 executeRenewalImport
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 33 seedRenewalSource; 60 createRenewalFixture; 69 addRenewalCustomer
- `artifacts/api-server/src/routes/contractAudit.ts`: 45 POST /api/admin/contract-center/import
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/contractAudit.ts`
- `artifacts/highplains-crm/src/components/contracts/AuditImportCard.tsx`

<a id="table-ticket-comment-mentions"></a>
### ticket_comment_mentions

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2087 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2082 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/storage.ts`: 2086 getTicketCommentMentions

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 7705 POST /api/tickets/:ticketId/comments
- `artifacts/api-server/src/storage.ts`: 2081 createTicketCommentMention

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-ticket-comments"></a>
### ticket_comments

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2055 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 74 insert
- `artifacts/api-server/src/storage.ts`: 658 raw SQL; 2073 insert; 2078 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7684 GET /api/tickets/:ticketId/comments; 7982 POST /api/admin/migrate-invoices; 8216 GET /api/tickets/:id/details
- `artifacts/api-server/src/storage.ts`: 2054 getTicketComments

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7705 POST /api/tickets/:ticketId/comments; 7779 DELETE /api/ticket-comments/:id; 7982 POST /api/admin/migrate-invoices; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2072 createTicketComment; 2077 deleteTicketComment

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`

<a id="table-ticket-field-values"></a>
### ticket_field_values

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2008 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 659 raw SQL; 2014 delete; 2022 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/routes/routes.ts`: 734 migrateApprovedEstimateRequestTickets; 2603 registerRoutes; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 7532 GET /api/tickets/:ticketId/field-values; 8216 GET /api/tickets/:id/details
- `artifacts/api-server/src/storage.ts`: 2007 getTicketFieldValues

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 6348 POST /api/tickets; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2012 deleteTicketFieldValuesByFieldIds; 2021 upsertTicketFieldValue

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-links"></a>
### ticket_links

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/ticketLinkSummary.ts`: 28 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 549 from; 930 from
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 75 from
- `artifacts/api-server/src/storage.ts`: 2105 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 657 raw SQL; 2112 insert; 2117 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/lib/ticketLinkSummary.ts`: 19 getInvoiceLinkSummaries; 71 withInvoiceLinkSummaries
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue; 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 6196 GET /api/tickets/my; 6226 GET /api/tickets; 6250 GET /api/tickets/:id; 6284 GET /api/customers/:customerId/tickets; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7796 GET /api/tickets/:ticketId/links; 7982 POST /api/admin/migrate-invoices; 8216 GET /api/tickets/:id/details
- `artifacts/api-server/src/storage.ts`: 2104 getTicketLinks

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7837 POST /api/tickets/:ticketId/links; 7858 DELETE /api/ticket-links/:id; 7982 POST /api/admin/migrate-invoices; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2111 createTicketLink; 2116 deleteTicketLink

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketSchedulingPanel.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-notes"></a>
### ticket_notes

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 626 from; 2024 from
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 400 from; 425 from; 449 from; 469 from; 529 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 436 insert; 481 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 574 GET /api/m/tickets/:id; 1911 GET /api/m/sync
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 397 GET /api/m/tickets/:id/notes; 414 POST /api/m/tickets/:id/notes; 466 DELETE /api/m/notes/:noteId; 513 GET /api/tickets/:id/mobile-notes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 414 POST /api/m/tickets/:id/notes; 466 DELETE /api/m/notes/:noteId

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-ticket-notifications"></a>
### ticket_notifications

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/due-date-notifications.ts`: 57 from
- `artifacts/api-server/src/storage.ts`: 2326 from; 2332 from; 2362 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 656 raw SQL; 2343 insert; 2348 update; 2356 update; 2367 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/due-date-notifications.ts`: 6 checkAndCreateDueDateNotifications; 98 runDueDateNotifications
- `artifacts/api-server/src/routes/routes.ts`: 8872 GET /api/notifications; 8882 GET /api/notifications/unread-count
- `artifacts/api-server/src/storage.ts`: 2325 getNotificationsByUser; 2331 getUnreadNotificationCount; 2361 getNotificationsWithDueDateType

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/due-date-notifications.ts`: 6 checkAndCreateDueDateNotifications; 98 runDueDateNotifications
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/ticketAssignmentNotification.ts`: 7 notifyTicketAssignment
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 7705 POST /api/tickets/:ticketId/comments; 8892 PATCH /api/notifications/:id/read; 8905 POST /api/notifications/read-all; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2342 createNotification; 2347 markNotificationRead; 2355 markAllNotificationsRead; 2366 dismissDueDateNotificationsForTicket

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/NotificationsDropdown.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/NotificationsPage.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-photos"></a>
### ticket_photos

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 622 from; 2019 from
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 224 from; 258 from; 351 from; 372 from; 504 from; 555 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 332 insert; 392 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 574 GET /api/m/tickets/:id; 693 PATCH /api/m/work-items/:id; 1911 GET /api/m/sync
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 221 GET /api/m/tickets/:id/photos; 249 POST /api/m/tickets/:id/photos; 369 DELETE /api/m/photos/:photoId; 488 GET /api/tickets/:id/mobile-photos; 544 workItemMissingRequiredPhoto

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 249 POST /api/m/tickets/:id/photos; 369 DELETE /api/m/photos/:photoId

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-ticket-sources"></a>
### ticket_sources

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2097 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 2092 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/storage.ts`: 2096 getTicketSource

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 6348 POST /api/tickets
- `artifacts/api-server/src/storage.ts`: 2091 createTicketSource

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-status-history"></a>
### ticket_status_history

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2042 from; 2049 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/visitSync.ts`: 91 insert
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 59 insert
- `artifacts/api-server/src/storage.ts`: 660 raw SQL; 2037 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 2744 GET /api/customers/:id/parent-rollup; 7667 GET /api/tickets/:ticketId/status-history; 8216 GET /api/tickets/:id/details
- `artifacts/api-server/src/storage.ts`: 2041 getTicketStatusHistory; 2047 getTicketStatusHistoryForTickets

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/visitSync.ts`: 73 syncTicketFromVisits
- `artifacts/api-server/src/routes/routes.ts`: 734 migrateApprovedEstimateRequestTickets; 2603 registerRoutes; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/visits.ts`: 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2036 createTicketStatusHistory

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/visits.ts`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-type-fields"></a>
### ticket_type_fields

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 1888 from; 1894 from; 1901 from; 1907 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 664 raw SQL; 1914 insert; 1919 update; 1927 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/routes/routes.ts`: 364 ensureRFPRequestTicketType; 588 ensureEstimateRequestTicketType; 734 migrateApprovedEstimateRequestTickets; 805 ensureTaskTicketType; 896 ensureProjectTicketType; 1086 seedAllTicketTypes; 1169 migrateProjectSchedulingStatus; 1242 removeProjectInvoicingFields; 1315 migrateEstimateSentToProposalWorkflow; 1412 migrateProjectNoEstimateTicketType; 2603 registerRoutes; 5695 POST /api/ticket-types/init-rfp; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 6032 GET /api/ticket-types/:ticketTypeId/fields; 6041 GET /api/ticket-type-statuses/:statusId/fields; 6073 PATCH /api/ticket-type-fields/:id; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 8216 GET /api/tickets/:id/details; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 1887 getTicketTypeFields; 1893 getTicketTypeFieldsByStatus; 1899 getTicketTypeFieldsByStatuses; 1906 getTicketTypeFieldById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/routes/routes.ts`: 280 ensureInvoiceTicketType; 364 ensureRFPRequestTicketType; 588 ensureEstimateRequestTicketType; 805 ensureTaskTicketType; 896 ensureProjectTicketType; 1086 seedAllTicketTypes; 1169 migrateProjectSchedulingStatus; 1242 removeProjectInvoicingFields; 1315 migrateEstimateSentToProposalWorkflow; 1412 migrateProjectNoEstimateTicketType; 2603 registerRoutes; 5695 POST /api/ticket-types/init-rfp; 5720 POST /api/ticket-types/init-invoice; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 6050 POST /api/ticket-types/:ticketTypeId/fields; 6073 PATCH /api/ticket-type-fields/:id; 6099 DELETE /api/ticket-type-fields/:id; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7982 POST /api/admin/migrate-invoices; 8915 POST /api/admin/reset-for-setup; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1913 createTicketTypeField; 1918 updateTicketTypeField; 1926 deleteTicketTypeField

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-type-statuses"></a>
### ticket_type_statuses

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/due-date-notifications.ts`: 14 leftJoin
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 24 innerJoin
- `artifacts/api-server/src/lib/backfillVisits.ts`: 17 innerJoin; 26 innerJoin
- `artifacts/api-server/src/lib/schedulingStatuses.ts`: 62 from
- `artifacts/api-server/src/lib/visitSync.ts`: 36 from; 78 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1546 leftJoin
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 480 SQL interpolation
- `artifacts/api-server/src/routes/routes.ts`: 1542 raw SQL; 5981 from; 8970 from
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 39 from
- `artifacts/api-server/src/routes/visits.ts`: 54 leftJoin
- `artifacts/api-server/src/storage.ts`: 1849 from; 1856 from; 1865 from; 1946 leftJoin; 1949 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/schedulingStatuses.ts`: 79 update; 81 insert; 90 update
- `artifacts/api-server/src/routes/routes.ts`: 1525 raw SQL; 1702 raw SQL; 1712 raw SQL
- `artifacts/api-server/src/storage.ts`: 665 raw SQL; 1871 insert; 1876 update; 1884 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/due-date-notifications.ts`: 6 checkAndCreateDueDateNotifications; 98 runDueDateNotifications
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 7 backfillScheduleBy
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/lib/schedulingStatuses.ts`: 36 migrateSchedulingStatuses
- `artifacts/api-server/src/lib/ticketLinkSummary.ts`: 19 getInvoiceLinkSummaries; 71 withInvoiceLinkSummaries
- `artifacts/api-server/src/lib/visitSync.ts`: 32 schedulableTicket; 73 syncTicketFromVisits
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1500 GET /api/m/properties/:id
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 210 getPulseTicketTypeContext; 394 GET /api/dashboard/action-queue; 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/routes.ts`: 280 ensureInvoiceTicketType; 364 ensureRFPRequestTicketType; 588 ensureEstimateRequestTicketType; 734 migrateApprovedEstimateRequestTickets; 805 ensureTaskTicketType; 896 ensureProjectTicketType; 1004 ensureToDoTicketType; 1086 seedAllTicketTypes; 1169 migrateProjectSchedulingStatus; 1196 fixProjectDisplayOrders; 1242 removeProjectInvoicingFields; 1278 fixEstimateRequestBillingBehavior; 1315 migrateEstimateSentToProposalWorkflow; 1412 migrateProjectNoEstimateTicketType; 1451 backfillTicketTypeCapabilities; 1552 migrateTicketTypeCapabilities; 2603 registerRoutes; 2744 GET /api/customers/:id/parent-rollup; 5695 POST /api/ticket-types/init-rfp; 5720 POST /api/ticket-types/init-invoice; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 5796 POST /api/ticket-types/init-todo; 5914 GET /api/ticket-types/:ticketTypeId/statuses; 5948 GET /api/ticket-type-statuses; 5957 PATCH /api/ticket-type-statuses/:id; 6196 GET /api/tickets/my; 6226 GET /api/tickets; 6250 GET /api/tickets/:id; 6284 GET /api/customers/:customerId/tickets; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 7796 GET /api/tickets/:ticketId/links; 7982 POST /api/admin/migrate-invoices; 8216 GET /api/tickets/:id/details; 8946 POST /api/admin/migrate-estimate-to-project; 10064 POST /api/snow-events/:eventId/generate-tickets; 10418 POST /api/tickets/:id/send-completion-email; 10963 GET /api/reports/:type; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/schedulingStatus.ts`: 9 GET /api/scheduling-status
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/visits.ts`: 47 GET /api/visits; 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id
- `artifacts/api-server/src/storage.ts`: 1848 getTicketTypeStatuses; 1854 getTicketTypeStatusesByTypeIds; 1861 getAllTicketTypeStatuses; 1930 getTickets

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/lib/schedulingStatuses.ts`: 36 migrateSchedulingStatuses
- `artifacts/api-server/src/routes/routes.ts`: 280 ensureInvoiceTicketType; 364 ensureRFPRequestTicketType; 588 ensureEstimateRequestTicketType; 805 ensureTaskTicketType; 896 ensureProjectTicketType; 1004 ensureToDoTicketType; 1086 seedAllTicketTypes; 1169 migrateProjectSchedulingStatus; 1196 fixProjectDisplayOrders; 1315 migrateEstimateSentToProposalWorkflow; 1412 migrateProjectNoEstimateTicketType; 1451 backfillTicketTypeCapabilities; 1552 migrateTicketTypeCapabilities; 1685 backfillStatusActionTypes; 2603 registerRoutes; 5695 POST /api/ticket-types/init-rfp; 5720 POST /api/ticket-types/init-invoice; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 5796 POST /api/ticket-types/init-todo; 5923 POST /api/ticket-types/:ticketTypeId/statuses; 5957 PATCH /api/ticket-type-statuses/:id; 6016 DELETE /api/ticket-type-statuses/:id; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7982 POST /api/admin/migrate-invoices; 8915 POST /api/admin/reset-for-setup; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1870 createTicketTypeStatus; 1875 updateTicketTypeStatus; 1883 deleteTicketTypeStatus

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/schedulingStatus.ts`
- `artifacts/api-server/src/routes/visits.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketSchedulingPanel.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`

<a id="table-ticket-types"></a>
### ticket_types

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 24 innerJoin
- `artifacts/api-server/src/lib/backfillVisits.ts`: 17 innerJoin; 26 innerJoin
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 91 raw SQL; 125 raw SQL
- `artifacts/api-server/src/lib/schedulingStatuses.ts`: 55 from
- `artifacts/api-server/src/lib/visitSync.ts`: 35 from; 76 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 480 SQL interpolation
- `artifacts/api-server/src/routes/routes.ts`: 1525 raw SQL; 19800 from
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 37 from
- `artifacts/api-server/src/routes/visits.ts`: 54 leftJoin
- `artifacts/api-server/src/storage.ts`: 1812 from; 1818 from; 1826 from; 1862 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 146 raw SQL
- `artifacts/api-server/src/routes/routes.ts`: 1483 raw SQL; 1504 raw SQL; 19781 raw SQL; 19816 raw SQL; 19824 raw SQL
- `artifacts/api-server/src/storage.ts`: 666 raw SQL; 1831 insert; 1836 update; 1844 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 7 backfillScheduleBy
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 70 convertExtraBillableToTask
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/lib/schedulingStatuses.ts`: 36 migrateSchedulingStatuses
- `artifacts/api-server/src/lib/ticketLinkSummary.ts`: 19 getInvoiceLinkSummaries; 71 withInvoiceLinkSummaries
- `artifacts/api-server/src/lib/visitSync.ts`: 32 schedulableTicket; 73 syncTicketFromVisits
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 210 getPulseTicketTypeContext; 394 GET /api/dashboard/action-queue; 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/routes.ts`: 280 ensureInvoiceTicketType; 364 ensureRFPRequestTicketType; 588 ensureEstimateRequestTicketType; 734 migrateApprovedEstimateRequestTickets; 805 ensureTaskTicketType; 896 ensureProjectTicketType; 1004 ensureToDoTicketType; 1086 seedAllTicketTypes; 1169 migrateProjectSchedulingStatus; 1196 fixProjectDisplayOrders; 1242 removeProjectInvoicingFields; 1278 fixEstimateRequestBillingBehavior; 1315 migrateEstimateSentToProposalWorkflow; 1412 migrateProjectNoEstimateTicketType; 1451 backfillTicketTypeCapabilities; 1552 migrateTicketTypeCapabilities; 2603 registerRoutes; 2744 GET /api/customers/:id/parent-rollup; 5682 GET /api/ticket-types; 5695 POST /api/ticket-types/init-rfp; 5720 POST /api/ticket-types/init-invoice; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 5796 POST /api/ticket-types/init-todo; 5821 GET /api/ticket-types/:id; 5862 PATCH /api/ticket-types/:id; 5948 GET /api/ticket-type-statuses; 6196 GET /api/tickets/my; 6226 GET /api/tickets; 6250 GET /api/tickets/:id; 6284 GET /api/customers/:customerId/tickets; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 7796 GET /api/tickets/:ticketId/links; 7982 POST /api/admin/migrate-invoices; 8216 GET /api/tickets/:id/details; 8946 POST /api/admin/migrate-estimate-to-project; 10064 POST /api/snow-events/:eventId/generate-tickets; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 10963 GET /api/reports/:type; 19764 migrateTicketTypeRename; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/schedulingStatus.ts`: 9 GET /api/scheduling-status
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/visits.ts`: 47 GET /api/visits; 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id
- `artifacts/api-server/src/storage.ts`: 1811 getTicketTypes; 1817 getTicketTypeById; 1824 getTicketTypesByIds; 1861 getAllTicketTypeStatuses

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 70 convertExtraBillableToTask
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/routes/routes.ts`: 280 ensureInvoiceTicketType; 364 ensureRFPRequestTicketType; 588 ensureEstimateRequestTicketType; 805 ensureTaskTicketType; 896 ensureProjectTicketType; 1004 ensureToDoTicketType; 1086 seedAllTicketTypes; 1169 migrateProjectSchedulingStatus; 1412 migrateProjectNoEstimateTicketType; 1451 backfillTicketTypeCapabilities; 1552 migrateTicketTypeCapabilities; 2603 registerRoutes; 5695 POST /api/ticket-types/init-rfp; 5720 POST /api/ticket-types/init-invoice; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 5796 POST /api/ticket-types/init-todo; 5834 POST /api/ticket-types; 5862 PATCH /api/ticket-types/:id; 5898 DELETE /api/ticket-types/:id; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7982 POST /api/admin/migrate-invoices; 8915 POST /api/admin/reset-for-setup; 19764 migrateTicketTypeRename; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1830 createTicketType; 1835 updateTicketType; 1843 deleteTicketType

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/schedulingStatus.ts`
- `artifacts/api-server/src/routes/visits.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketSchedulingPanel.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`

<a id="table-ticket-work-items"></a>
### ticket_work_items

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 550 from; 707 from
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 545 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 771 update; 1215 insert; 1245 update; 1263 delete; 1289 update; 1331 delete; 1339 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 549 listWorkItems; 574 GET /api/m/tickets/:id; 693 PATCH /api/m/work-items/:id; 785 POST /api/m/tickets/:id/complete; 1187 GET /api/tickets/:id/work-items; 1202 POST /api/tickets/:id/work-items; 1301 POST /api/tickets/:id/work-items/load-template; 1911 GET /api/m/sync
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 544 workItemMissingRequiredPhoto

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 693 PATCH /api/m/work-items/:id; 1202 POST /api/tickets/:id/work-items; 1237 PATCH /api/tickets/:ticketId/work-items/:id; 1260 DELETE /api/tickets/:ticketId/work-items/:id; 1277 POST /api/tickets/:id/work-items/reorder; 1301 POST /api/tickets/:id/work-items/load-template

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`

<a id="table-tickets"></a>
### tickets

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/due-date-notifications.ts`: 14 from
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 24 from
- `artifacts/api-server/src/lib/backfillVisits.ts`: 17 from; 26 from
- `artifacts/api-server/src/lib/visitSync.ts`: 24 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 400 from; 470 from; 532 from; 594 from; 707 innerJoin; 1176 from; 1546 from; 1800 from; 1840 from; 1925 from; 1982 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 468 from; 477 from; 885 from; 893 from; 917 from
- `artifacts/api-server/src/routes/flags.ts`: 464 from
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 101 from; 496 from; 521 from; 545 innerJoin
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 56 from; 66 from
- `artifacts/api-server/src/routes/routes.ts`: 8983 from
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 30 from
- `artifacts/api-server/src/routes/visits.ts`: 54 leftJoin
- `artifacts/api-server/src/storage.ts`: 1946 from; 1949 from; 1959 from; 1967 from; 1972 from; 1978 from; 1984 from; 2975 leftJoin; 5092 raw SQL

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 35 update
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 164 raw SQL
- `artifacts/api-server/src/lib/visitSync.ts`: 90 update
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 492 update; 839 update
- `artifacts/api-server/src/routes/routes.ts`: 19810 raw SQL; 19836 raw SQL
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 51 update; 71 update
- `artifacts/api-server/src/storage.ts`: 661 raw SQL; 1990 insert; 1995 update; 2003 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/due-date-notifications.ts`: 6 checkAndCreateDueDateNotifications; 98 runDueDateNotifications
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 7 backfillScheduleBy
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/ticketLinkSummary.ts`: 19 getInvoiceLinkSummaries; 71 withInvoiceLinkSummaries
- `artifacts/api-server/src/lib/ticketPatchTransaction.ts`: 10 transactionalTicketPatch
- `artifacts/api-server/src/lib/visitSync.ts`: 21 lockVisitTickets; 32 schedulableTicket; 73 syncTicketFromVisits
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 368 GET /api/m/today; 461 POST /api/m/tickets/:id/start; 531 loadMobileTicket; 574 GET /api/m/tickets/:id; 693 PATCH /api/m/work-items/:id; 785 POST /api/m/tickets/:id/complete; 1173 ensureAdminTicketAccess; 1187 GET /api/tickets/:id/work-items; 1202 POST /api/tickets/:id/work-items; 1237 PATCH /api/tickets/:ticketId/work-items/:id; 1260 DELETE /api/tickets/:ticketId/work-items/:id; 1277 POST /api/tickets/:id/work-items/reorder; 1301 POST /api/tickets/:id/work-items/load-template; 1500 GET /api/m/properties/:id; 1773 GET /api/m/me/week; 1828 GET /api/m/me/recent-completions; 1911 GET /api/m/sync
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue; 842 GET /api/dashboard/pulse
- `artifacts/api-server/src/routes/flags.ts`: 403 POST /api/m/flags
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 86 loadMobileTicketForCaller; 221 GET /api/m/tickets/:id/photos; 249 POST /api/m/tickets/:id/photos; 397 GET /api/m/tickets/:id/notes; 414 POST /api/m/tickets/:id/notes; 488 GET /api/tickets/:id/mobile-photos; 513 GET /api/tickets/:id/mobile-notes; 544 workItemMissingRequiredPhoto
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/routes.ts`: 734 migrateApprovedEstimateRequestTickets; 1278 fixEstimateRequestBillingBehavior; 1315 migrateEstimateSentToProposalWorkflow; 2603 registerRoutes; 2744 GET /api/customers/:id/parent-rollup; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 6196 GET /api/tickets/my; 6226 GET /api/tickets; 6250 GET /api/tickets/:id; 6284 GET /api/customers/:customerId/tickets; 6294 GET /api/contracts/:contractId/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7368 DELETE /api/tickets/batch; 7447 POST /api/tickets/create-invoice-from-project; 7532 GET /api/tickets/:ticketId/field-values; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 7667 GET /api/tickets/:ticketId/status-history; 7684 GET /api/tickets/:ticketId/comments; 7705 POST /api/tickets/:ticketId/comments; 7796 GET /api/tickets/:ticketId/links; 7982 POST /api/admin/migrate-invoices; 8110 GET /api/admin/parent-customer-audit; 8216 GET /api/tickets/:id/details; 8946 POST /api/admin/migrate-estimate-to-project; 9522 GET /api/equipment/:id/linked-tickets; 10197 GET /api/email-logs; 10418 POST /api/tickets/:id/send-completion-email; 10635 GET /api/tickets/:id/photo-urls; 10669 POST /api/tickets/:id/photos; 10738 DELETE /api/tickets/:id/photos/*storageKey; 10771 POST /api/tickets/:id/preview-completion-email; 10963 GET /api/reports/:type; 17046 POST /api/automation-rules/:id/run; 17534 GET /api/customers/:id/service-fulfillment; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/visits.ts`: 47 GET /api/visits; 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id
- `artifacts/api-server/src/services/automationService.ts`: 35 getSourceRecords; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/storage.ts`: 1930 getTickets; 1958 getTicketById; 1965 getTicketsByIds; 1971 getTicketsByCustomerId; 1977 getTicketsByContractId; 1983 getTicketsByEquipmentId; 2969 getEmailLogs; 5053 getServiceFulfillment

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/backfillScheduleBy.ts`: 7 backfillScheduleBy
- `artifacts/api-server/src/lib/convertExtraBillableToTask.ts`: 70 convertExtraBillableToTask
- `artifacts/api-server/src/lib/invoiceCompletion.ts`: 19 propagateInvoiceCompletion
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/lib/visitSync.ts`: 73 syncTicketFromVisits
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 461 POST /api/m/tickets/:id/start; 785 POST /api/m/tickets/:id/complete
- `artifacts/api-server/src/routes/routes.ts`: 734 migrateApprovedEstimateRequestTickets; 1278 fixEstimateRequestBillingBehavior; 1315 migrateEstimateSentToProposalWorkflow; 2603 registerRoutes; 5745 POST /api/ticket-types/init-project; 5772 POST /api/migrate-approved-projects; 6348 POST /api/tickets; 6571 POST /api/tickets/batch; 7289 POST /api/tickets/:id/create-invoice; 7368 DELETE /api/tickets/batch; 7430 DELETE /api/tickets/:id; 7447 POST /api/tickets/create-invoice-from-project; 7553 PUT /api/tickets/:ticketId/field-values/:fieldId; 7982 POST /api/admin/migrate-invoices; 8915 POST /api/admin/reset-for-setup; 10064 POST /api/snow-events/:eventId/generate-tickets; 10418 POST /api/tickets/:id/send-completion-email; 10669 POST /api/tickets/:id/photos; 10738 DELETE /api/tickets/:id/photos/*storageKey; 19764 migrateTicketTypeRename; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/visits.ts`: 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 1989 createTicket; 1994 updateTicket; 2002 deleteTicket

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/api-server/src/routes/visits.ts`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/ServiceFulfillmentPanel.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketSchedulingPanel.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/Dashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/ShopManagerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-mobile/app/(tabs)/me/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/today/tickets/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-unsorted-emails"></a>
### unsorted_emails

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 510 from
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 87 from; 109 from; 128 from
- `artifacts/api-server/src/services/emailSyncService.ts`: 558 from; 640 from; 792 from
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 267 from
- `artifacts/api-server/src/storage.ts`: 4403 from; 4499 from; 5420 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 178 update; 202 update; 222 update; 243 update
- `artifacts/api-server/src/services/emailSyncService.ts`: 690 insert; 862 insert
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 337 insert

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 462 GET /sync-summary; 548 POST /:id/sync; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/routes.ts`: 2306 seedCommunicationsBootstrap; 2744 GET /api/customers/:id/parent-rollup; 4491 GET /api/mailbox-accounts/personal; 8110 GET /api/admin/parent-customer-audit; 10224 GET /api/customers/:id/communications; 16566 GET /api/communications; 16653 GET /api/communications/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16917 PATCH /api/communications/:id/cancel-schedule; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17544 GET /api/customers/:customerId/communications/summary; 17579 GET /api/customers/:customerId/communications/recent; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 19 GET /; 101 GET /:id; 120 POST /:id/route
- `artifacts/api-server/src/services/automationService.ts`: 154 isDuplicate; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills
- `artifacts/api-server/src/storage.ts`: 4284 getCommunications; 4478 getCommunicationById; 5399 getCompanyPersonalMailboxes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/index.ts`: 47 callback@47
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 548 POST /:id/sync; 814 POST /:id/backfill
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 120 POST /:id/route; 194 POST /:id/archive; 214 POST /:id/spam; 234 POST /:id/assign
- `artifacts/api-server/src/services/emailSyncService.ts`: 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxBackfillService.ts`: 153 runBackfill; 399 startBackfill; 474 requeueInterruptedBackfills

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/SharedMailboxesAndOversightPage.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`

<a id="table-users"></a>
### users

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 88 from
- `artifacts/api-server/src/mobileAuth.ts`: 36 from; 149 from
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 108 leftJoin; 162 leftJoin; 305 from; 1738 from; 2090 from
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 599 from
- `artifacts/api-server/src/routes/flags.ts`: 285 innerJoin
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 98 innerJoin
- `artifacts/api-server/src/routes/routes.ts`: 4206 from; 4242 from; 14351 from; 15463 from; 18202 from; 19927 raw SQL; 19942 raw SQL
- `artifacts/api-server/src/services/emailSyncService.ts`: 287 from; 295 from
- `artifacts/api-server/src/services/mailboxScope.ts`: 68 from
- `artifacts/api-server/src/services/pushNotifications.ts`: 112 from
- `artifacts/api-server/src/storage.ts`: 630 from; 635 from; 641 from; 646 from; 2055 leftJoin; 2772 from; 3028 leftJoin; 3317 leftJoin; 3327 leftJoin; 3348 leftJoin; 3372 from; 3613 leftJoin; 3623 leftJoin; 3720 from; 3950 innerJoin; 3963 from; 4097 innerJoin; 4108 innerJoin; 4232 leftJoin; 4383 leftJoin; 4403 leftJoin; 4479 leftJoin; 4499 leftJoin; 4745 leftJoin; 4856 leftJoin; 4887 leftJoin; 5400 leftJoin

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 19 insert; 54 delete
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1876 update
- `artifacts/api-server/src/services/pushNotifications.ts`: 87 update; 170 update
- `artifacts/api-server/src/storage.ts`: 697 raw SQL; 705 insert; 710 update; 716 update

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/auth.ts`: 27 setupAuth; 166 POST /api/auth/register; 284 POST /api/user/switch-company; 346 GET /api/setup/status; 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/contractCenterPersistence.ts`: 65 fullDetail
- `artifacts/api-server/src/lib/rfbInvoiceAutoCreate.ts`: 119 maybeAutoCreateInvoiceOnRfb
- `artifacts/api-server/src/lib/ticketAssignmentNotification.ts`: 35 pushReturnedTicket
- `artifacts/api-server/src/mobileAuth.ts`: 32 findUserByLogin; 40 authenticateMobileLogin; 128 requireMobileAuth
- `artifacts/api-server/src/routes/contractCenter.ts`: 59 registerContractCenterRoutes
- `artifacts/api-server/src/routes/contractCenterLifecycle.ts`: 35 registerContractCenterLifecycle
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 107 listCrewsWithSupervisor; 136 registerCrewsAndMobileRoutes; 158 GET /api/crews/board; 169 GET /api/crews; 289 GET /api/crews/eligible-supervisors; 314 POST /api/m/auth/login; 1731 GET /api/m/me; 1911 GET /api/m/sync
- `artifacts/api-server/src/routes/dashboardQueue.ts`: 394 GET /api/dashboard/action-queue
- `artifacts/api-server/src/routes/flags.ts`: 275 notifyOfficeOfNewFlag; 363 registerFlagsRoutes; 403 POST /api/m/flags; 866 PATCH /api/flags/:id
- `artifacts/api-server/src/routes/mailboxAccounts.ts`: 23 GET /; 548 POST /:id/sync
- `artifacts/api-server/src/routes/mobileTicketPhotosNotes.ts`: 219 registerMobileTicketPhotosNotesRoutes
- `artifacts/api-server/src/routes/pendingInvoices.ts`: 25 GET /api/pending-invoices
- `artifacts/api-server/src/routes/routes.ts`: 2306 seedCommunicationsBootstrap; 2603 registerRoutes; 2744 GET /api/customers/:id/parent-rollup; 4098 GET /api/companies/users; 4123 POST /api/companies/users/create; 4197 GET /api/company-users; 4230 GET /api/team-members; 4281 PATCH /api/company-users/:id; 4491 GET /api/mailbox-accounts/personal; 6348 POST /api/tickets; 7289 POST /api/tickets/:id/create-invoice; 7447 POST /api/tickets/create-invoice-from-project; 7684 GET /api/tickets/:ticketId/comments; 7705 POST /api/tickets/:ticketId/comments; 7982 POST /api/admin/migrate-invoices; 8110 GET /api/admin/parent-customer-audit; 8216 GET /api/tickets/:id/details; 9859 GET /api/snow-events; 10224 GET /api/customers/:id/communications; 10418 POST /api/tickets/:id/send-completion-email; 10771 POST /api/tickets/:id/preview-completion-email; 10963 GET /api/reports/:type; 12587 POST /api/proposals/:id/finalize; 12723 GET /api/proposals/:id/versions; 12732 GET /api/proposals/:id/versions/:versionId/download; 12765 GET /api/proposals/:id/versions/:versionId/visual-scope/:type; 13487 GET /api/crew-worksheets/:id/versions; 13496 GET /api/crew-worksheets/:id/versions/:versionId/download; 13997 GET /api/campaigns; 14024 GET /api/me/extra-billable-batches; 14163 GET /api/campaigns/:id; 14308 emailPreviewHandler; 14735 GET /api/campaigns/:id/crews; 15167 GET /api/campaigns/:id/items/:itemId/checklist/audit; 15186 PATCH /api/campaigns/:id/items/:itemId; 15712 POST /api/campaigns/:id/items/:itemId/send-pre-comm; 15891 POST /api/campaigns/:id/items/:itemId/send-post-comm; 16455 GET /api/seasons/:id/report; 16528 GET /api/communications/analytics; 16554 GET /api/communications/audit-log; 16566 GET /api/communications; 16653 GET /api/communications/:id; 16662 POST /api/communications; 16746 DELETE /api/communications/:id; 16868 GET /api/communication-threads/:id/messages; 16917 PATCH /api/communications/:id/cancel-schedule; 16998 POST /api/communications/seed; 17046 POST /api/automation-rules/:id/run; 17111 GET /api/operations/overdue; 17166 GET /api/operations/due-this-week; 17224 GET /api/operations/missing-obligations; 17327 GET /api/operations/exceptions; 17544 GET /api/customers/:customerId/communications/summary; 17579 GET /api/customers/:customerId/communications/recent; 18186 resolveChemApplicator; 18218 resolveChemItemEmailContext; 18360 previewCompletionEmailHandler; 18417 POST /api/campaigns/:id/items/:itemId/send-completion-email; 18940 POST /api/_internal/run-automation-rules; 19866 runStartupMigrations; 19915 migrateMailboxVisibilitySettings
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/routes/unsortedEmails.ts`: 19 GET /; 120 POST /:id/route
- `artifacts/api-server/src/services/automationService.ts`: 154 isDuplicate; 189 runRule; 264 runAutomationRule; 279 runAllAutomationRules
- `artifacts/api-server/src/services/communicationProvider.ts`: 44 sendCommunication
- `artifacts/api-server/src/services/emailSyncService.ts`: 277 sendSyncErrorNotification; 394 syncMailbox; 995 syncAllMailboxes; 1031 tick
- `artifacts/api-server/src/services/mailboxScope.ts`: 67 getUserNameById; 87 resolveVisibleMailboxes
- `artifacts/api-server/src/services/pushNotifications.ts`: 105 sendPushToUser
- `artifacts/api-server/src/storage.ts`: 629 getUserById; 634 getUserByEmail; 639 getUserByPhone; 645 hasAnyUsers; 2054 getTicketComments; 2756 getSnowEvents; 3026 _getVersionsForProposals; 3316 getProposalVersions; 3326 getProposalVersionById; 3346 _getCrewWorksheetVersionsMap; 3363 _enrichCrewWorksheets; 3612 getCrewWorksheetVersions; 3622 getCrewWorksheetVersionById; 3701 getCampaigns; 3943 getCampaignCrews; 4068 getMyExtraBillableBatches; 4231 getCampaignChecklistAuditLog; 4284 getCommunications; 4478 getCommunicationById; 4652 getCommunicationAnalytics; 4855 getThreadMessages; 4886 getCommunicationAuditLogs; 5399 getCompanyPersonalMailboxes

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/auth.ts`: 166 POST /api/auth/register; 265 PATCH /api/auth/language; 357 POST /api/setup/initialize
- `artifacts/api-server/src/lib/contractAuditFixture.ts`: 11 createAuditFixture; 50 removeAuditFixture
- `artifacts/api-server/src/lib/contractParentFixture.ts`: 24 createParentFixture
- `artifacts/api-server/src/lib/contractRenewalFixture.ts`: 60 createRenewalFixture
- `artifacts/api-server/src/lib/ticketAssignmentNotification.ts`: 35 pushReturnedTicket
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1869 PATCH /api/m/me/notification-prefs; 1889 POST /api/m/me/push-subscriptions; 2143 DELETE /api/m/me/push-subscriptions
- `artifacts/api-server/src/routes/flags.ts`: 866 PATCH /api/flags/:id
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes; 4123 POST /api/companies/users/create; 4281 PATCH /api/company-users/:id; 6348 POST /api/tickets; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/routes/ticketOwnerResponse.ts`: 18 registerTicketOwnerResponseRoutes
- `artifacts/api-server/src/services/pushNotifications.ts`: 85 pruneToken; 105 sendPushToUser; 161 addPushSubscription; 183 removePushSubscription
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 700 createUser; 709 updateUserPassword; 715 updateUserLanguage

**Matched screens/components/client modules**
- `artifacts/api-server/src/auth.ts`
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/dashboardQueue.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/pendingInvoices.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/App.tsx`
- `artifacts/highplains-crm/src/components/AccountSidePanel.tsx`
- `artifacts/highplains-crm/src/components/AppSidebar.tsx`
- `artifacts/highplains-crm/src/components/BatchTicketDialog.tsx`
- `artifacts/highplains-crm/src/components/BillingQueueTab.tsx`
- `artifacts/highplains-crm/src/components/BillingView.tsx`
- `artifacts/highplains-crm/src/components/ComposeDrawer.tsx`
- `artifacts/highplains-crm/src/components/CrewAssignmentBoard.tsx`
- `artifacts/highplains-crm/src/components/ExtraBillableCampaignView.tsx`
- `artifacts/highplains-crm/src/components/MentionTextarea.tsx`
- `artifacts/highplains-crm/src/components/MyExtraBillableBatchesWidget.tsx`
- `artifacts/highplains-crm/src/components/QuickAddToDo.tsx`
- `artifacts/highplains-crm/src/components/TicketListView.tsx`
- `artifacts/highplains-crm/src/components/TicketWorkItemsCard.tsx`
- `artifacts/highplains-crm/src/components/WeatherCapturePanel.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/DeleteCommunicationButton.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/LogCommunicationForm.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/MailboxViewAsPicker.tsx`
- `artifacts/highplains-crm/src/components/customer/communications/UnsortedTab.tsx`
- `artifacts/highplains-crm/src/components/dashboard/NeedsYouQueue.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyCard.tsx`
- `artifacts/highplains-crm/src/components/extraBillable/PropertyPhotoSheet.tsx`
- `artifacts/highplains-crm/src/hooks/use-auth.tsx`
- `artifacts/highplains-crm/src/hooks/useItemPhotoUrls.ts`
- `artifacts/highplains-crm/src/lib/billing.ts`
- `artifacts/highplains-crm/src/lib/schedulingStatus.ts`
- `artifacts/highplains-crm/src/pages/CampaignDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignItemDetail.tsx`
- `artifacts/highplains-crm/src/pages/CampaignsList.tsx`
- `artifacts/highplains-crm/src/pages/CommunicationsCenter.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewsAdmin.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/FieldCrewDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FieldHomeDashboard.tsx`
- `artifacts/highplains-crm/src/pages/FlagDetailPage.tsx`
- `artifacts/highplains-crm/src/pages/FlagsInboxPage.tsx`
- `artifacts/highplains-crm/src/pages/GlobalOperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/MailboxAccountsSettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/MyBatchesPage.tsx`
- `artifacts/highplains-crm/src/pages/MyTickets.tsx`
- `artifacts/highplains-crm/src/pages/NewSnowEvent.tsx`
- `artifacts/highplains-crm/src/pages/NewTicket.tsx`
- `artifacts/highplains-crm/src/pages/OperationsPage.tsx`
- `artifacts/highplains-crm/src/pages/ParentCustomerDashboard.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/ProposalMaker.tsx`
- `artifacts/highplains-crm/src/pages/ProposalVersion.tsx`
- `artifacts/highplains-crm/src/pages/SeasonDetail.tsx`
- `artifacts/highplains-crm/src/pages/SettingsPage.tsx`
- `artifacts/highplains-crm/src/pages/SetupPage.tsx`
- `artifacts/highplains-crm/src/pages/SharedMailboxesAndOversightPage.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventDetail.tsx`
- `artifacts/highplains-crm/src/pages/SnowEventsList.tsx`
- `artifacts/highplains-crm/src/pages/TicketDetail.tsx`
- `artifacts/highplains-crm/src/pages/TicketsList.tsx`
- `artifacts/highplains-crm/src/pages/UsersPage.tsx`
- `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/CommunicationsToolbar.tsx`
- `artifacts/highplains-crm/src/pages/communications/InboxTab.tsx`
- `artifacts/highplains-crm/src/pages/communications/SentTab.tsx`
- `artifacts/highplains-mobile/app/(tabs)/me/index.tsx`
- `artifacts/highplains-mobile/app/(tabs)/me/notifications.tsx`
- `artifacts/highplains-mobile/contexts/AuthContext.tsx`
- `artifacts/highplains-mobile/lib/api.ts`
- `artifacts/highplains-mobile/lib/persisted-query-client.ts`
- `artifacts/highplains-mobile/lib/push.ts`
- `artifacts/highplains-mobile/lib/upload-queue.ts`

<a id="table-visits"></a>
### visits

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 33 raw SQL
- `artifacts/api-server/src/lib/visitSync.ts`: 42 from; 62 from
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 19 from
- `artifacts/api-server/src/routes/visits.ts`: 54 from; 80 from; 122 from; 148 from; 151 from; 176 from; 179 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 35 insert
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 31 delete; 47 update; 52 insert
- `artifacts/api-server/src/routes/visits.ts`: 103 insert; 128 update; 163 update; 181 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/visitSync.ts`: 41 appendVisitOrder; 61 visitMirrorUpdates; 73 syncTicketFromVisits
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes
- `artifacts/api-server/src/routes/visits.ts`: 47 GET /api/visits; 76 GET /api/visits/summary; 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/lib/backfillVisits.ts`: 9 backfillVisitsFromTickets
- `artifacts/api-server/src/lib/visitTicketCompatibility.ts`: 12 applyVisitTicketEdit
- `artifacts/api-server/src/routes/routes.ts`: 2603 registerRoutes
- `artifacts/api-server/src/routes/visits.ts`: 91 POST /api/visits; 114 POST /api/visits/reorder; 138 PATCH /api/visits/:id; 171 DELETE /api/visits/:id

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/visits.ts`

<a id="table-visual-scope-sheets"></a>
### visual_scope_sheets

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1535 from
- `artifacts/api-server/src/storage.ts`: 3048 from; 3642 from; 3652 from; 3662 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/routes/routes.ts`: 1749 raw SQL
- `artifacts/api-server/src/storage.ts`: 3684 insert; 3689 update; 3698 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`: 1500 GET /api/m/properties/:id
- `artifacts/api-server/src/routes/routes.ts`: 13153 generateCrewWorksheetPdf; 13419 GET /api/crew-worksheets/:id/pdf; 13442 GET /api/crew-worksheets/:id/visual-scope-sheets; 13453 GET /api/crew-worksheets/:id/visual-scope.png; 13533 GET /api/visual-scope-sheets; 13541 GET /api/visual-scope-sheets/:id; 13550 GET /api/visual-scope-sheets/:id/base-image; 13613 DELETE /api/visual-scope-sheets/:id; 13644 POST /api/visual-scope-sheets/:id/replace-base-image; 13664 GET /api/customers/:id/visual-scope-sheets; 13673 POST /api/visual-scope-sheets/:id/capture-highres; 13773 handleVsExport; 13803 GET /api/visual-scope-sheets/:id/export/base; 13804 GET /api/visual-scope-sheets/:id/export/overlay; 13805 GET /api/visual-scope-sheets/:id/export/combined; 13808 POST /api/visual-scope-sheets/:id/export-png; 13849 POST /api/visual-scope-sheets/:id/export-pdf
- `artifacts/api-server/src/storage.ts`: 3046 _getVsSheetMap; 3641 getVisualScopeSheets; 3651 getVisualScopeSheetsForCustomer; 3661 getVisualScopeSheet

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 1746 clearInvalidVisualScopeBaseImages; 13581 POST /api/visual-scope-sheets; 13600 PATCH /api/visual-scope-sheets/:id; 13613 DELETE /api/visual-scope-sheets/:id; 13644 POST /api/visual-scope-sheets/:id/replace-base-image; 13673 POST /api/visual-scope-sheets/:id/capture-highres; 19866 runStartupMigrations
- `artifacts/api-server/src/storage.ts`: 3683 createVisualScopeSheet; 3688 updateVisualScopeSheet; 3697 deleteVisualScopeSheet

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/crewsAndMobile.ts`
- `artifacts/api-server/src/routes/flags.ts`
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/pages/CrewWorksheetDraft.tsx`
- `artifacts/highplains-crm/src/pages/CrewWorksheetPrint.tsx`
- `artifacts/highplains-crm/src/pages/CustomerDetail.tsx`
- `artifacts/highplains-crm/src/pages/ProposalDraft.tsx`
- `artifacts/highplains-crm/src/pages/VisualScopeDraft.tsx`
- `artifacts/highplains-crm/src/pages/VisualScopeEditor.tsx`
- `artifacts/highplains-crm/src/pages/VisualScopeList.tsx`
- `artifacts/highplains-mobile/app/(tabs)/properties/[id].tsx`
- `artifacts/highplains-mobile/app/flag/new.tsx`

<a id="table-weekly-schedule-templates"></a>
### weekly_schedule_templates

**Direct SELECT/join/SQL sites**
- `artifacts/api-server/src/storage.ts`: 2238 from; 2244 from

**Direct insert/update/delete/raw/generic-writer sites**
- `artifacts/api-server/src/storage.ts`: 670 raw SQL; 2251 insert; 2256 update; 2264 delete

**Resolved readers / endpoint wrappers**
- `artifacts/api-server/src/routes/routes.ts`: 8698 GET /api/schedule-templates; 8707 GET /api/schedule-templates/:id; 8795 GET /api/schedule-templates/:templateId/blocks; 8811 POST /api/schedule-templates/:templateId/blocks
- `artifacts/api-server/src/storage.ts`: 2237 getWeeklyScheduleTemplates; 2243 getWeeklyScheduleTemplateById

**Resolved writers / endpoint wrappers (reachability qualification applies)**
- `artifacts/api-server/src/routes/routes.ts`: 8719 POST /api/schedule-templates; 8740 PATCH /api/schedule-templates/:id; 8756 DELETE /api/schedule-templates/:id; 8915 POST /api/admin/reset-for-setup
- `artifacts/api-server/src/storage.ts`: 650 deleteAllUsers; 2250 createWeeklyScheduleTemplate; 2255 updateWeeklyScheduleTemplate; 2263 deleteWeeklyScheduleTemplate

**Matched screens/components/client modules**
- `artifacts/api-server/src/routes/routes.ts`
- `artifacts/highplains-crm/src/components/SchedulePreview.tsx`
- `artifacts/highplains-crm/src/pages/ScheduleViewer.tsx`
- `artifacts/highplains-crm/src/pages/WeeklySchedulerPage.tsx`

## Appendix C — vocabulary lists and mappings

### Source declarations side by side

Source-only observations from the inspected workspace revision. Detected service/catalog/map/application lists are reproduced as keys, not translated labels. RollupServiceType lists its additional union members; ROLLUP_SERVICE_LABELS gives the complete expanded rollup set. Plant-category and communication-template taxonomies are included as non-service dimensions, not aliases.

| Declaration | Source reference | Values |
|---|---|---|
| PLANT_CATEGORIES | `artifacts/api-server/src/lib/plantAvailability.ts:17` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| TREEFARM_CATEGORIES | `artifacts/api-server/src/lib/plantEnrichment.ts:67` | `/plants/deciduous-trees`, `/plants/shrubs`, `/plants/evergreens`, `/plants/perennials`, `/plants/fruit-trees`, `/plants/roses`, `/plants/vines`, `/plants/ornamental-grasses` |
| CONTRACT_SERVICE_TO_PLAN_CATEGORY | `artifacts/api-server/src/routes/routes.ts:2528` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| CONTRACT_TYPE_DEFAULT_CATEGORIES | `artifacts/api-server/src/routes/routes.ts:2539` | `Chemical`, `Snow`, `Irrigation` |
| PALETTE_CATEGORY_TOKEN_ORDER | `artifacts/api-server/src/routes/routes.ts:12080` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| PALETTE_CATEGORY_LABEL_MAP | `artifacts/api-server/src/routes/routes.ts:12081` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| validCategories | `artifacts/api-server/src/routes/routes.ts:14064` | `general`, `chemical`, `irrigation`, `extra_billable` |
| SCOPE_CATALOG | `artifacts/api-server/src/shared/contractCatalog.ts:17` | `mowing`, `aeration`, `fall_aeration`, `cleanups`, `shrub_trimming`, `ornamental_grass`, `tree_pruning`, `native_areas`, `retention_pond`, `pool`, `chemical`, `crabgrass`, `pet_station`, `winter_visits`, `winter_watering`, `irrigation_open`, `irrigation_inspection`, `irrigation_winterization`, `backflow`, `snow_walks`, `snow_drives`, `snow_alleys`, `ice_melt`, `snow_stakes`, `other` |
| LEGACY_SERVICE_TO_SCOPE | `artifacts/api-server/src/shared/contractCatalog.ts:52` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_winterization`, `snow_removal`, `other` |
| ServiceType | `artifacts/api-server/src/shared/serviceCatalog.ts:1` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| SERVICE_CATALOG | `artifacts/api-server/src/shared/serviceCatalog.ts:24` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| RollupServiceType | `artifacts/api-server/src/shared/serviceCatalog.ts:97` | `irrigation_open`, `irrigation_close`, `irrigation_custom`, `general` |
| ROLLUP_SERVICE_LABELS | `artifacts/api-server/src/shared/serviceCatalog.ts:103` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_custom`, `general` |
| LAYER_TYPES | `artifacts/highplains-crm/src/components/LayerMapViewer.tsx:25` | `base`, `community`, `snow`, `custom` |
| SERVICE_TYPES | `artifacts/highplains-crm/src/components/WorkItemTemplatesAdmin.tsx:58` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| ServiceTypeFilter | `artifacts/highplains-crm/src/hooks/use-revenue-filters.ts:3` | `all`, `maintenance`, `chemical` |
| SERVICE_TYPE_OPTIONS | `artifacts/highplains-crm/src/pages/ChemicalNotificationTemplates.tsx:76` | `broadleaf_weed_control`, `fertilizer_application`, `pre_emergent_application`, `crabgrass_treatment`, `fungicide_application`, `insecticide_application`, `aeration_overseeding`, `custom` |
| variableServiceMap | `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx:230` | `irrigation`, `handshovel`, `plow`, `plowtruck`, `atv`, `skid`, `snow`, `icemelt`, `ice_melt` |
| categoryLabels | `artifacts/highplains-crm/src/pages/ContractBuilderPage.tsx:1321` | `header`, `terms`, `maintenance`, `irrigation`, `snow`, `payments`, `acceptance` |
| SERVICE_TYPE_LABELS | `artifacts/highplains-crm/src/pages/ContractsOverview.tsx:44` | `Maintenance`, `Chemical`, `Snow`, `Irrigation`, `Other` |
| LAYER_TYPES | `artifacts/highplains-crm/src/pages/CustomerDetail.tsx:2712` | `base`, `community`, `snow`, `custom` |
| CATEGORIES | `artifacts/highplains-crm/src/pages/PlantLibrary.tsx:20` | ``, `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| CATEGORY_ORDER | `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx:36` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| CATEGORY_LABELS | `artifacts/highplains-crm/src/pages/PlantPaletteDraft.tsx:45` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| LAYER_TYPES | `artifacts/highplains-crm/src/pages/PropertyMapsPage.tsx:25` | `base`, `community`, `snow`, `custom` |
| enum(category) | `artifacts/highplains-crm/src/pages/communications/AllCommunicationsTab.tsx:1533` | `proposal_follow_up`, `irrigation_approval_request`, `service_update`, `chemical_notice`, `snow_event_notice`, `winter_watering`, `billing_reminder`, `general_outreach` |
| SCOPE_CATALOG | `artifacts/highplains-crm/src/shared/contractCatalog.ts:17` | `mowing`, `aeration`, `fall_aeration`, `cleanups`, `shrub_trimming`, `ornamental_grass`, `tree_pruning`, `native_areas`, `retention_pond`, `pool`, `chemical`, `crabgrass`, `pet_station`, `winter_visits`, `winter_watering`, `irrigation_open`, `irrigation_inspection`, `irrigation_winterization`, `backflow`, `snow_walks`, `snow_drives`, `snow_alleys`, `ice_melt`, `snow_stakes`, `other` |
| LEGACY_SERVICE_TO_SCOPE | `artifacts/highplains-crm/src/shared/contractCatalog.ts:52` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_winterization`, `snow_removal`, `other` |
| enum(serviceType) | `artifacts/highplains-crm/src/shared/schema.ts:321` | `Maintenance`, `Chemical`, `Snow`, `Irrigation`, `Other` |
| enum(serviceType) | `artifacts/highplains-crm/src/shared/schema.ts:526` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| enum(category) | `artifacts/highplains-crm/src/shared/schema.ts:559` | `header`, `terms`, `maintenance`, `irrigation`, `snow`, `payments`, `acceptance` |
| SCOPE_LINES | `artifacts/highplains-crm/src/shared/schema.ts:644` | `landscape`, `irrigation`, `snow` |
| TicketServiceType | `artifacts/highplains-crm/src/shared/schema.ts:1064` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| MapLayerType | `artifacts/highplains-crm/src/shared/schema.ts:1322` | `community_outline`, `mowing`, `native_grass`, `landscape_beds`, `pet_stations`, `atv_route`, `truck_plow`, `hand_shovel`, `ice_melt`, `custom` |
| enum(category) | `artifacts/highplains-crm/src/shared/schema.ts:1371` | `base`, `community`, `snow`, `custom` |
| enum(layerType) | `artifacts/highplains-crm/src/shared/schema.ts:1372` | `community_outline`, `mowing`, `native_grass`, `landscape_beds`, `pet_stations`, `atv_route`, `truck_plow`, `hand_shovel`, `ice_melt`, `ice_melt_buckets`, `custom` |
| SNOW_SERVICE_TYPES | `artifacts/highplains-crm/src/shared/schema.ts:1854` | `Plow`, `ATV`, `Hand Shovel`, `Ice Melt`, `Slicer / De-icer`, `Haul Off / Storage` |
| COMMUNICATION_TEMPLATE_CATEGORIES | `artifacts/highplains-crm/src/shared/schema.ts:2717` | `proposal_follow_up`, `irrigation_approval_request`, `service_update`, `chemical_notice`, `snow_event_notice`, `winter_watering`, `billing_reminder`, `general_outreach` |
| COMMUNICATION_TEMPLATE_CATEGORY_LABELS | `artifacts/highplains-crm/src/shared/schema.ts:2728` | `proposal_follow_up`, `irrigation_approval_request`, `service_update`, `chemical_notice`, `snow_event_notice`, `winter_watering`, `billing_reminder`, `general_outreach` |
| SERVICE_PLAN_CATEGORIES | `artifacts/highplains-crm/src/shared/schema.ts:3472` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_winterization`, `snow_removal`, `other` |
| SERVICE_PLAN_CATEGORY_LABELS | `artifacts/highplains-crm/src/shared/schema.ts:3489` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_winterization`, `snow_removal`, `other` |
| PLANT_CATEGORY_LABELS | `artifacts/highplains-crm/src/shared/schema.ts:3669` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |
| ServiceType | `artifacts/highplains-crm/src/shared/serviceCatalog.ts:1` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| SERVICE_CATALOG | `artifacts/highplains-crm/src/shared/serviceCatalog.ts:24` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| RollupServiceType | `artifacts/highplains-crm/src/shared/serviceCatalog.ts:97` | `irrigation_open`, `irrigation_close`, `irrigation_custom`, `general` |
| ROLLUP_SERVICE_LABELS | `artifacts/highplains-crm/src/shared/serviceCatalog.ts:103` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_custom`, `general` |
| enum(serviceType) | `lib/db/src/schema/schema.ts:309` | `Maintenance`, `Chemical`, `Snow`, `Irrigation`, `Other` |
| enum(serviceType) | `lib/db/src/schema/schema.ts:514` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| enum(category) | `lib/db/src/schema/schema.ts:547` | `header`, `terms`, `maintenance`, `irrigation`, `snow`, `payments`, `acceptance` |
| SCOPE_LINES | `lib/db/src/schema/schema.ts:632` | `landscape`, `irrigation`, `snow` |
| TicketServiceType | `lib/db/src/schema/schema.ts:1077` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning` |
| MapLayerType | `lib/db/src/schema/schema.ts:1348` | `community_outline`, `mowing`, `native_grass`, `landscape_beds`, `pet_stations`, `atv_route`, `truck_plow`, `hand_shovel`, `ice_melt`, `custom` |
| enum(category) | `lib/db/src/schema/schema.ts:1397` | `base`, `community`, `snow`, `custom` |
| enum(layerType) | `lib/db/src/schema/schema.ts:1398` | `community_outline`, `mowing`, `native_grass`, `landscape_beds`, `pet_stations`, `atv_route`, `truck_plow`, `hand_shovel`, `ice_melt`, `ice_melt_buckets`, `custom` |
| SNOW_SERVICE_TYPES | `lib/db/src/schema/schema.ts:1880` | `Plow`, `ATV`, `Hand Shovel`, `Ice Melt`, `Slicer / De-icer`, `Haul Off / Storage` |
| COMMUNICATION_TEMPLATE_CATEGORIES | `lib/db/src/schema/schema.ts:2730` | `proposal_follow_up`, `irrigation_approval_request`, `service_update`, `chemical_notice`, `snow_event_notice`, `winter_watering`, `billing_reminder`, `general_outreach` |
| COMMUNICATION_TEMPLATE_CATEGORY_LABELS | `lib/db/src/schema/schema.ts:2741` | `proposal_follow_up`, `irrigation_approval_request`, `service_update`, `chemical_notice`, `snow_event_notice`, `winter_watering`, `billing_reminder`, `general_outreach` |
| SERVICE_PLAN_CATEGORIES | `lib/db/src/schema/schema.ts:3483` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_winterization`, `snow_removal`, `other` |
| SERVICE_PLAN_CATEGORY_LABELS | `lib/db/src/schema/schema.ts:3500` | `mowing`, `pet_station`, `chemical`, `shrub_trimming`, `ornamental_grass`, `aeration`, `cleanups`, `tree_pruning`, `irrigation_open`, `irrigation_close`, `irrigation_winterization`, `snow_removal`, `other` |
| enum(category) | `lib/db/src/schema/schema.ts:4020` | `tree`, `shrub`, `perennial`, `shrub_rose`, `vine`, `ornamental_grass` |

The source scanner found no independent full service-key enum in the mobile app. Its service-type fields/API payloads and translated labels must still be checked on a future catalog migration. Campaigns also use general / chemical / irrigation / extra_billable with subtype-dependent mapping; these categories are not individual fulfillment service keys.

### Key membership matrix

| Key | Ticket/legacy service | Service plan | Contract scope | Map layer | Chemical application | Mapping / difference |
|---|---|---|---|---|---|---|
| `Chemical` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `Maintenance` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `Snow` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `aeration` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `aeration_overseeding` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `atv_route` | — | — | — | yes | — | Different domain or source-only key; no automatic mapping established. |
| `backflow` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `base` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `broadleaf_weed_control` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `chemical` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `cleanups` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `community` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `community_outline` | — | — | — | yes | — | Different domain or source-only key; no automatic mapping established. |
| `crabgrass` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `crabgrass_treatment` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `custom` | — | — | — | yes | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `extra_billable` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `fall_aeration` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `fertilizer_application` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `fungicide_application` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `general` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `hand_shovel` | — | — | — | yes | — | Different domain or source-only key; no automatic mapping established. |
| `ice_melt` | — | — | yes | yes | — | Scope key; identical spelling wherever checked as present. |
| `ice_melt_buckets` | — | — | — | — | — | Stored production map key absent from declared MapLayerType. |
| `insecticide_application` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `irrigation_close` | — | yes | — | — | — | Explicit legacy mapping to irrigation_winterization requires review. |
| `irrigation_inspection` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `irrigation_open` | — | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `irrigation_winterization` | — | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `landscape_beds` | — | — | — | yes | — | Different domain or source-only key; no automatic mapping established. |
| `mowing` | yes | yes | yes | yes | — | Scope key; identical spelling wherever checked as present. |
| `native_areas` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `native_grass` | — | — | — | yes | — | Related to native_areas but geometry versus service is not a spelling-only alias. |
| `ornamental_grass` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `other` | — | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `other:drain-pans` | — | — | — | — | — | Stored custom contract-scope key; preserve it, do not collapse to other. |
| `other:fenceline-trim` | — | — | — | — | — | Stored custom contract-scope key; preserve it, do not collapse to other. |
| `other:parking-lot-sweep` | — | — | — | — | — | Stored custom contract-scope key; preserve it, do not collapse to other. |
| `other:trash-pickup` | — | — | — | — | — | Stored custom contract-scope key; preserve it, do not collapse to other. |
| `pet_station` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `pet_stations` | — | — | — | yes | — | Spelling variant of pet_station; map geometry versus service must still be distinguished. |
| `pool` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `pre_emergent_application` | — | — | — | — | yes | Chemical application subtype, not a one-to-one alias of generic chemical service. |
| `retention_pond` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `shrub_trimming` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `snow` | — | — | — | — | — | Different domain or source-only key; no automatic mapping established. |
| `snow_alleys` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `snow_drives` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `snow_removal` | — | yes | — | — | — | Legacy mapping to snow_walks is review-required and not a universal snow-service equivalence. |
| `snow_stakes` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `snow_walks` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `tree_pruning` | yes | yes | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `truck_plow` | — | — | — | yes | — | Different domain or source-only key; no automatic mapping established. |
| `winter_visits` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |
| `winter_watering` | — | — | yes | — | — | Scope key; identical spelling wherever checked as present. |

### Actual production distinct values and counts

**Environment: production; observed at 2026-10-19T20:59:08.778Z. All counts in this table belong to this observation.** Nulls are counted explicitly. Empty means no rows, not a missing column.

| Holder column | Production distinct values with row counts | Non-null distinct count |
|---|---|---:|
| `campaign_items.service_plan_category` | `(null)`: 456 | 0 |
| `campaigns.category` | `chemical`: 6; `extra_billable`: 1; `general`: 4 | 3 |
| `campaigns.subtype` | `(null)`: 11 | 0 |
| `chemical_notification_templates.service_type` | `aeration_overseeding`: 1; `broadleaf_weed_control`: 1; `crabgrass_treatment`: 1; `custom`: 1; `fertilizer_application`: 2; `fungicide_application`: 1; `insecticide_application`: 1; `pre_emergent_application`: 1 | 8 |
| `contract_services.service_type` | `pet_station`: 1 | 1 |
| `contracts.service_type` | `Chemical`: 11; `Maintenance`: 51; `Snow`: 40 | 3 |
| `customer_map_layers.category` | `base`: 43; `community`: 86; `custom`: 13; `snow`: 79 | 4 |
| `customer_map_layers.layer_type` | `atv_route`: 13; `community_outline`: 43; `custom`: 13; `hand_shovel`: 24; `ice_melt`: 13; `ice_melt_buckets`: 1; `landscape_beds`: 32; `mowing`: 38; `native_grass`: 12; `pet_stations`: 4; `truck_plow`: 28 | 11 |
| `customer_service_plans.service_category` | `pet_station`: 1; `snow_removal`: 5 | 2 |
| `property_site_notes.service_type` | No rows | 0 |
| `scope_preset_lines.service_key` | No rows | 0 |
| `service_plan_template_items.service_category` | No rows | 0 |
| `service_type_templates.service_type` | No rows | 0 |
| `term_scope_lines.service_key` | `aeration`: 52; `backflow`: 41; `chemical`: 51; `cleanups`: 52; `crabgrass`: 2; `fall_aeration`: 3; `ice_melt`: 40; `irrigation_inspection`: 50; `irrigation_open`: 52; `irrigation_winterization`: 52; `mowing`: 52; `native_areas`: 34; `ornamental_grass`: 2; `other:drain-pans`: 17; `other:fenceline-trim`: 1; `other:parking-lot-sweep`: 1; `other:trash-pickup`: 1; `pet_station`: 14; `retention_pond`: 6; `shrub_trimming`: 52; `snow_drives`: 30; `snow_stakes`: 3; `snow_walks`: 40; `tree_pruning`: 31; `winter_visits`: 23; `winter_watering`: 19 | 26 |
| `tickets.service_type` | `(null)`: 538 | 0 |

Production visits has no service_key column at the metadata observation time; it is therefore not assigned a fabricated empty distribution.

## Appendix D — production foreign-key graph

**Environment: production; metadata observed at 2026-10-19T20:51:37.22478+00:00.** Definitions are schema metadata only. This includes actual ON DELETE behavior, not assumed ownership.

| Referencing table | Referenced table | Constraint definition |
|---|---|---|
| `agreement_terms` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `agreement_terms` | `users` | `FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL` |
| `agreement_terms` | `contract_masters` | `FOREIGN KEY (master_id) REFERENCES contract_masters(id) ON DELETE SET NULL` |
| `agreement_terms` | `agreement_terms` | `FOREIGN KEY (renewed_from_term_id) REFERENCES agreement_terms(id) ON DELETE SET NULL` |
| `agreement_terms` | `agreements` | `FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE` |
| `agreements` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `agreements` | `property_management_companies` | `FOREIGN KEY (property_management_company_id) REFERENCES property_management_companies(id) ON DELETE SET NULL` |
| `agreements` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `campaign_checklist_audit_log` | `campaign_items` | `FOREIGN KEY (campaign_item_id) REFERENCES campaign_items(id) ON DELETE CASCADE` |
| `campaign_checklist_audit_log` | `users` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `campaign_checklist_audit_log` | `campaign_checklist_tasks` | `FOREIGN KEY (campaign_checklist_task_id) REFERENCES campaign_checklist_tasks(id) ON DELETE CASCADE` |
| `campaign_checklist_tasks` | `campaigns` | `FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE` |
| `campaign_crew_members` | `campaign_crews` | `FOREIGN KEY (campaign_crew_id) REFERENCES campaign_crews(id) ON DELETE CASCADE` |
| `campaign_crew_members` | `users` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `campaign_crews` | `users` | `FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `campaign_crews` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `campaign_crews` | `campaigns` | `FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE` |
| `campaign_crews` | `crews` | `FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE SET NULL` |
| `campaign_item_task_completions` | `campaign_checklist_tasks` | `FOREIGN KEY (campaign_checklist_task_id) REFERENCES campaign_checklist_tasks(id) ON DELETE CASCADE` |
| `campaign_item_task_completions` | `campaign_items` | `FOREIGN KEY (campaign_item_id) REFERENCES campaign_items(id) ON DELETE CASCADE` |
| `campaign_item_task_completions` | `users` | `FOREIGN KEY (completed_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `campaign_items` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL` |
| `campaign_items` | `campaign_crews` | `FOREIGN KEY (assigned_campaign_crew_id) REFERENCES campaign_crews(id) ON DELETE SET NULL` |
| `campaign_items` | `email_logs` | `FOREIGN KEY (chem_pre_email_log_id) REFERENCES email_logs(id) ON DELETE SET NULL` |
| `campaign_items` | `email_logs` | `FOREIGN KEY (chem_post_email_log_id) REFERENCES email_logs(id) ON DELETE SET NULL` |
| `campaign_items` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `campaign_items` | `users` | `FOREIGN KEY (completed_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `campaign_items` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `campaign_items` | `campaigns` | `FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE` |
| `campaign_items` | `chemical_products` | `FOREIGN KEY (chemical_product_id) REFERENCES chemical_products(id) ON DELETE SET NULL` |
| `campaign_items` | `users` | `FOREIGN KEY (applicator_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `campaign_items` | `customers` | `FOREIGN KEY (property_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `campaign_items` | `customers` | `FOREIGN KEY (property_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `campaigns` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `campaigns` | `users` | `FOREIGN KEY (assigned_to_id2) REFERENCES users(id) ON DELETE SET NULL` |
| `campaigns` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `campaigns` | `users` | `FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL` |
| `campaigns` | `chemical_notification_templates` | `FOREIGN KEY (notification_template_id) REFERENCES chemical_notification_templates(id) ON DELETE SET NULL` |
| `campaigns` | `seasons` | `FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL` |
| `chemical_notification_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `chemical_notification_templates` | `users` | `FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL` |
| `chemical_products` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_audit_log` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_audit_log` | `communications` | `FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE SET NULL` |
| `communication_audit_log` | `communication_templates` | `FOREIGN KEY (template_id) REFERENCES communication_templates(id) ON DELETE SET NULL` |
| `communication_audit_log` | `users` | `FOREIGN KEY (action_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `communication_audit_log` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_audit_log` | `communication_templates` | `FOREIGN KEY (template_id) REFERENCES communication_templates(id) ON DELETE SET NULL` |
| `communication_audit_log` | `users` | `FOREIGN KEY (action_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `communication_audit_log` | `communications` | `FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE SET NULL` |
| `communication_audit_log` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_automation_rules` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_automation_rules` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `communication_links` | `communications` | `FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE` |
| `communication_links` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communication_templates` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `communication_threads` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communications` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `communications` | `communications` | `FOREIGN KEY (parent_communication_id) REFERENCES communications(id) ON DELETE SET NULL` |
| `communications` | `communication_templates` | `FOREIGN KEY (template_id) REFERENCES communication_templates(id) ON DELETE SET NULL` |
| `communications` | `communication_threads` | `FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE SET NULL` |
| `communications` | `users` | `FOREIGN KEY (sent_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `communications` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `communications` | `contacts` | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` |
| `communications` | `mailbox_accounts` | `FOREIGN KEY (mailbox_account_id) REFERENCES mailbox_accounts(id) ON DELETE SET NULL` |
| `company_users` | `users` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `company_users` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contacts` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contacts` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `contract_builder_documents` | `contracts` | `FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL` |
| `contract_builder_documents` | `users` | `FOREIGN KEY (created_by) REFERENCES users(id)` |
| `contract_builder_documents` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contract_builder_documents` | `users` | `FOREIGN KEY (updated_by) REFERENCES users(id)` |
| `contract_builder_documents` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `contract_builder_sections` | `contract_templates` | `FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE CASCADE` |
| `contract_builder_sections` | `contract_builder_documents` | `FOREIGN KEY (document_id) REFERENCES contract_builder_documents(id) ON DELETE CASCADE` |
| `contract_builder_variables` | `contract_builder_documents` | `FOREIGN KEY (document_id) REFERENCES contract_builder_documents(id) ON DELETE CASCADE` |
| `contract_documents` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contract_documents` | `users` | `FOREIGN KEY (uploaded_by) REFERENCES users(id)` |
| `contract_documents` | `contracts` | `FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE` |
| `contract_masters` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contract_masters` | `users` | `FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL` |
| `contract_monthly_amounts` | `contracts` | `FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE` |
| `contract_monthly_amounts` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contract_services` | `contracts` | `FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE` |
| `contract_services` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `contract_status_history` | `contracts` | `FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE` |
| `contract_status_history` | `users` | `FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE` |
| `contracts` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `contracts` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `crew_worksheet_number_counters` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `crew_worksheet_photos` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `crew_worksheet_photos` | `crew_worksheets` | `FOREIGN KEY (crew_worksheet_id) REFERENCES crew_worksheets(id) ON DELETE CASCADE` |
| `crew_worksheet_versions` | `users` | `FOREIGN KEY (finalized_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `crew_worksheet_versions` | `crew_worksheets` | `FOREIGN KEY (crew_worksheet_id) REFERENCES crew_worksheets(id) ON DELETE CASCADE` |
| `crew_worksheet_versions` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `crew_worksheets` | `visual_scope_sheets` | `FOREIGN KEY (visual_scope_sheet_id) REFERENCES visual_scope_sheets(id) ON DELETE SET NULL` |
| `crew_worksheets` | `users` | `FOREIGN KEY (assigned_crew_lead_id) REFERENCES users(id) ON DELETE SET NULL` |
| `crew_worksheets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `crew_worksheets` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `crew_worksheets` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `crew_worksheets` | `proposals` | `FOREIGN KEY (source_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL` |
| `crew_worksheets` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL` |
| `crews` | `users` | `FOREIGN KEY (supervisor_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `crews` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `customer_map_documents` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `customer_map_documents` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `customer_map_layers` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `customer_map_layers` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `customer_rate_sheets` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `customer_rate_sheets` | `users` | `FOREIGN KEY (last_updated_by) REFERENCES users(id)` |
| `customer_rate_sheets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `customer_service_plans` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `customer_service_plans` | `contracts` | `FOREIGN KEY (source_contract_ref) REFERENCES contracts(id) ON DELETE SET NULL` |
| `customer_service_plans` | `service_plan_templates` | `FOREIGN KEY (source_template_id) REFERENCES service_plan_templates(id) ON DELETE SET NULL` |
| `customer_service_plans` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `customers` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `email_logs` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `email_logs` | `email_templates` | `FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL` |
| `email_logs` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL` |
| `email_logs` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `email_logs` | `users` | `FOREIGN KEY (sent_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `email_rules` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `email_rules` | `email_templates` | `FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE` |
| `email_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `equipment` | `users` | `FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL` |
| `equipment` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `equipment_files` | `equipment` | `FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE` |
| `equipment_files` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `equipment_files` | `users` | `FOREIGN KEY (uploaded_by_id) REFERENCES users(id)` |
| `equipment_ticket_status_history` | `users` | `FOREIGN KEY (changed_by_id) REFERENCES users(id) ON DELETE CASCADE` |
| `equipment_ticket_status_history` | `equipment_tickets` | `FOREIGN KEY (ticket_id) REFERENCES equipment_tickets(id) ON DELETE CASCADE` |
| `equipment_tickets` | `users` | `FOREIGN KEY (reported_by_id) REFERENCES users(id) ON DELETE CASCADE` |
| `equipment_tickets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `equipment_tickets` | `equipment` | `FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE` |
| `equipment_tickets` | `users` | `FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL` |
| `flag_photos` | `users` | `FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `flag_photos` | `flags` | `FOREIGN KEY (flag_id) REFERENCES flags(id) ON DELETE CASCADE` |
| `flag_photos` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `flags` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL` |
| `flags` | `users` | `FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `flags` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `flags` | `users` | `FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `flags` | `customers` | `FOREIGN KEY (property_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `flags` | `crews` | `FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE SET NULL` |
| `mailbox_accounts` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `mailbox_accounts` | `users` | `FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `mailbox_backfill_runs` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `mailbox_backfill_runs` | `mailbox_accounts` | `FOREIGN KEY (mailbox_account_id) REFERENCES mailbox_accounts(id) ON DELETE CASCADE` |
| `mailbox_sync_runs` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `mailbox_sync_runs` | `mailbox_accounts` | `FOREIGN KEY (mailbox_account_id) REFERENCES mailbox_accounts(id) ON DELETE CASCADE` |
| `maintenance_crews` | `crews` | `FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE SET NULL` |
| `maintenance_crews` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `maintenance_visit_configs` | `maintenance_crews` | `FOREIGN KEY (preferred_crew_id) REFERENCES maintenance_crews(id) ON DELETE SET NULL` |
| `maintenance_visit_configs` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `maintenance_visit_configs` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `mobile_auth_tokens` | `users` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `mobile_auth_tokens` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `notes` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `notes` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `notes` | `users` | `FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE` |
| `plant_catalog_items` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `plant_enrichment` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `plant_palette_items` | `plant_catalog_items` | `FOREIGN KEY (plant_catalog_item_id) REFERENCES plant_catalog_items(id) ON DELETE SET NULL` |
| `plant_palette_items` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `plant_palette_items` | `plant_palettes` | `FOREIGN KEY (palette_id) REFERENCES plant_palettes(id) ON DELETE CASCADE` |
| `plant_palettes` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `plant_palettes` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `plant_palettes` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `plant_sync_runs` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `property_management_companies` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `property_manager_emails` | `property_managers` | `FOREIGN KEY (property_manager_id) REFERENCES property_managers(id) ON DELETE CASCADE` |
| `property_manager_emails` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `property_manager_phones` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `property_manager_phones` | `property_managers` | `FOREIGN KEY (property_manager_id) REFERENCES property_managers(id) ON DELETE CASCADE` |
| `property_managers` | `property_management_companies` | `FOREIGN KEY (property_management_company_id) REFERENCES property_management_companies(id) ON DELETE CASCADE` |
| `property_managers` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `property_site_notes` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `property_site_notes` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `proposal_files` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `proposal_files` | `proposals` | `FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE` |
| `proposal_plant_items` | `proposals` | `FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE` |
| `proposal_plant_items` | `plant_catalog_items` | `FOREIGN KEY (plant_catalog_item_id) REFERENCES plant_catalog_items(id) ON DELETE SET NULL` |
| `proposal_plant_items` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `proposal_versions` | `users` | `FOREIGN KEY (finalized_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `proposal_versions` | `proposals` | `FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE` |
| `proposal_versions` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `proposals` | `visual_scope_sheets` | `FOREIGN KEY (visual_scope_sheet_id) REFERENCES visual_scope_sheets(id) ON DELETE SET NULL` |
| `proposals` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `proposals` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `proposals` | `plant_palettes` | `FOREIGN KEY (plant_palette_id) REFERENCES plant_palettes(id) ON DELETE SET NULL` |
| `proposals` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `proposals` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL` |
| `qbo_connections` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `qbo_customer_cache` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `qbo_customer_cache` | `customers` | `FOREIGN KEY (seed_customer_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `rate_card_items` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `recent_property_views` | `users` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `recent_property_views` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `recent_property_views` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `schedule_blocks` | `weekly_schedule_templates` | `FOREIGN KEY (template_id) REFERENCES weekly_schedule_templates(id) ON DELETE CASCADE` |
| `schedule_blocks` | `maintenance_crews` | `FOREIGN KEY (crew_id) REFERENCES maintenance_crews(id) ON DELETE CASCADE` |
| `schedule_blocks` | `maintenance_visit_configs` | `FOREIGN KEY (visit_config_id) REFERENCES maintenance_visit_configs(id) ON DELETE CASCADE` |
| `scope_preset_lines` | `scope_presets` | `FOREIGN KEY (preset_id) REFERENCES scope_presets(id) ON DELETE CASCADE` |
| `scope_presets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `seasons` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `service_plan_template_items` | `service_plan_templates` | `FOREIGN KEY (template_id) REFERENCES service_plan_templates(id) ON DELETE CASCADE` |
| `service_plan_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `service_type_template_items` | `service_type_templates` | `FOREIGN KEY (template_id) REFERENCES service_type_templates(id) ON DELETE CASCADE` |
| `service_type_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `settings` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `sheet_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `snow_event_attachments` | `users` | `FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `snow_event_attachments` | `snow_events` | `FOREIGN KEY (snow_event_id) REFERENCES snow_events(id) ON DELETE CASCADE` |
| `snow_event_attachments` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `snow_event_property_impacts` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `snow_event_property_impacts` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `snow_event_property_impacts` | `snow_events` | `FOREIGN KEY (snow_event_id) REFERENCES snow_events(id) ON DELETE CASCADE` |
| `snow_events` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `snow_events` | `users` | `FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `style_presets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_billing_months` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_billing_months` | `agreement_terms` | `FOREIGN KEY (term_id) REFERENCES agreement_terms(id) ON DELETE CASCADE` |
| `term_documents` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_documents` | `agreement_terms` | `FOREIGN KEY (term_id) REFERENCES agreement_terms(id) ON DELETE CASCADE` |
| `term_documents` | `users` | `FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL` |
| `term_documents` | `contract_masters` | `FOREIGN KEY (master_id) REFERENCES contract_masters(id) ON DELETE SET NULL` |
| `term_legacy_sources` | `agreement_terms` | `FOREIGN KEY (term_id) REFERENCES agreement_terms(id) ON DELETE CASCADE` |
| `term_legacy_sources` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_rates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_rates` | `agreement_terms` | `FOREIGN KEY (term_id) REFERENCES agreement_terms(id) ON DELETE CASCADE` |
| `term_scope_lines` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_scope_lines` | `agreement_terms` | `FOREIGN KEY (term_id) REFERENCES agreement_terms(id) ON DELETE CASCADE` |
| `term_status_history` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `term_status_history` | `agreement_terms` | `FOREIGN KEY (term_id) REFERENCES agreement_terms(id) ON DELETE CASCADE` |
| `term_status_history` | `users` | `FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL` |
| `ticket_comment_mentions` | `users` | `FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `ticket_comment_mentions` | `ticket_comments` | `FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE CASCADE` |
| `ticket_comments` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_comments` | `users` | `FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE` |
| `ticket_field_values` | `ticket_type_fields` | `FOREIGN KEY (field_id) REFERENCES ticket_type_fields(id) ON DELETE CASCADE` |
| `ticket_field_values` | `users` | `FOREIGN KEY (captured_by_id) REFERENCES users(id) ON DELETE CASCADE` |
| `ticket_field_values` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_links` | `tickets` | `FOREIGN KEY (target_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_links` | `tickets` | `FOREIGN KEY (source_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_notes` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `ticket_notes` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_notes` | `users` | `FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `ticket_notifications` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_notifications` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `ticket_notifications` | `users` | `FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE` |
| `ticket_photos` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `ticket_photos` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_photos` | `users` | `FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `ticket_sources` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_status_history` | `ticket_type_statuses` | `FOREIGN KEY (to_status_id) REFERENCES ticket_type_statuses(id) ON DELETE CASCADE` |
| `ticket_status_history` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_status_history` | `ticket_type_statuses` | `FOREIGN KEY (from_status_id) REFERENCES ticket_type_statuses(id) ON DELETE SET NULL` |
| `ticket_status_history` | `users` | `FOREIGN KEY (changed_by_id) REFERENCES users(id) ON DELETE CASCADE` |
| `ticket_type_fields` | `ticket_types` | `FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE` |
| `ticket_type_fields` | `ticket_type_statuses` | `FOREIGN KEY (status_id) REFERENCES ticket_type_statuses(id) ON DELETE CASCADE` |
| `ticket_type_statuses` | `ticket_types` | `FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE` |
| `ticket_types` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `ticket_work_items` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `ticket_work_items` | `users` | `FOREIGN KEY (completed_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `tickets` | `crews` | `FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE SET NULL` |
| `tickets` | `users` | `FOREIGN KEY (completed_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `tickets` | `tickets` | `FOREIGN KEY (follow_up_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL` |
| `tickets` | `users` | `FOREIGN KEY (lead_tech_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `tickets` | `ticket_types` | `FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT` |
| `tickets` | `users` | `FOREIGN KEY (accepted_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `tickets` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `tickets` | `ticket_type_statuses` | `FOREIGN KEY (current_status_id) REFERENCES ticket_type_statuses(id) ON DELETE RESTRICT` |
| `tickets` | `users` | `FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL` |
| `tickets` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE` |
| `tickets` | `contracts` | `FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL` |
| `tickets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `tickets` | `users` | `FOREIGN KEY (delegated_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `unsorted_emails` | `mailbox_accounts` | `FOREIGN KEY (mailbox_account_id) REFERENCES mailbox_accounts(id) ON DELETE SET NULL` |
| `unsorted_emails` | `users` | `FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `unsorted_emails` | `users` | `FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL` |
| `unsorted_emails` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `users` | `companies` | `FOREIGN KEY (default_company_id) REFERENCES companies(id) ON DELETE SET NULL` |
| `visits` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `visits` | `tickets` | `FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE` |
| `visits` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL` |
| `visits` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `visits` | `crews` | `FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE SET NULL` |
| `visual_scope_sheets` | `users` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL` |
| `visual_scope_sheets` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |
| `visual_scope_sheets` | `customers` | `FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE` |
| `weekly_schedule_templates` | `companies` | `FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE` |

## Appendix E — comparison SELECTs

These statements only return aggregate counts and allowed crew/catalog names. Each check's production observation timestamp is recorded in its corresponding section. No customer/contact values or message bodies are returned by these comparisons.

### crew_links

```sql
SELECT jsonb_build_object('standing', (SELECT count(*) FROM crews), 'standing_active',(SELECT count(*) FROM crews WHERE is_active=true),'planner',(SELECT count(*) FROM maintenance_crews),'planner_linked',(SELECT count(*) FROM maintenance_crews WHERE crew_id IS NOT NULL),'planner_names',(SELECT jsonb_agg(name ORDER BY name) FROM maintenance_crews),'campaign',(SELECT count(*) FROM campaign_crews),'campaign_linked',(SELECT count(*) FROM campaign_crews WHERE crew_id IS NOT NULL),'campaign_names',(SELECT jsonb_agg(name ORDER BY name) FROM campaign_crews),'campaign_members',(SELECT count(*) FROM campaign_crew_members),'worksheets_with_crew_label',(SELECT count(*) FROM crew_worksheets WHERE coalesce(crew_label,'')<>''),'worksheets_with_lead',(SELECT count(*) FROM crew_worksheets WHERE assigned_crew_lead_id IS NOT NULL),'tickets_with_crew_members',(SELECT count(*) FROM tickets WHERE crew_member_user_ids IS NOT NULL AND cardinality(crew_member_user_ids)>0));
```

### customer_shape

```sql
SELECT jsonb_build_object('total',count(*),'parent_flag',count(*) FILTER (WHERE is_parent='true'),'child',count(*) FILTER (WHERE parent_customer_id IS NOT NULL),'standalone',count(*) FILTER (WHERE parent_customer_id IS NULL AND is_parent<>'true'),'parents_with_children',(SELECT count(*) FROM customers p WHERE EXISTS (SELECT 1 FROM customers c WHERE c.parent_customer_id=p.id)),'flag_false_with_children',(SELECT count(*) FROM customers p WHERE p.is_parent<>'true' AND EXISTS (SELECT 1 FROM customers c WHERE c.parent_customer_id=p.id)),'management_text_present',count(*) FILTER (WHERE nullif(trim(management_company),'') IS NOT NULL),'management_fk_present',count(*) FILTER (WHERE property_management_company_id IS NOT NULL)) FROM customers;
```

### campaign_copy_drift

```sql
SELECT jsonb_build_object('joined',count(*),'name',count(*) FILTER (WHERE i.customer_name IS DISTINCT FROM c.name),'city',count(*) FILTER (WHERE coalesce(i.customer_city,'') IS DISTINCT FROM coalesce(c.city,'')),'property_customer_ids_differ',count(*) FILTER (WHERE i.property_id IS NOT NULL AND i.property_id<>i.customer_id),'unresolved_property', (SELECT count(*) FROM campaign_items WHERE property_id IS NULL),'category_missing',(SELECT count(*) FROM campaign_items WHERE service_plan_category IS NULL)) FROM campaign_items i JOIN customers c ON c.id=i.customer_id AND c.company_id=i.company_id;
```

### communication_copy_drift

```sql
SELECT jsonb_build_object('customer_copies',count(*) FILTER (WHERE m.customer_name IS NOT NULL AND c.id IS NOT NULL),'customer_name',count(*) FILTER (WHERE m.customer_name IS NOT NULL AND c.id IS NOT NULL AND m.customer_name IS DISTINCT FROM c.name),'contact_copies',count(*) FILTER (WHERE m.contact_name IS NOT NULL AND ct.id IS NOT NULL),'contact_name',count(*) FILTER (WHERE m.contact_name IS NOT NULL AND ct.id IS NOT NULL AND m.contact_name IS DISTINCT FROM ct.name),'sender_copies',count(*) FILTER (WHERE m.sent_by_name IS NOT NULL AND u.id IS NOT NULL),'sender_name',count(*) FILTER (WHERE m.sent_by_name IS NOT NULL AND u.id IS NOT NULL AND m.sent_by_name IS DISTINCT FROM u.name)) FROM communications m LEFT JOIN customers c ON c.id=m.customer_id AND c.company_id=m.company_id LEFT JOIN contacts ct ON ct.id=m.contact_id AND ct.company_id=m.company_id LEFT JOIN users u ON u.id=m.sent_by_id;
```

### management_copy_drift

```sql
SELECT jsonb_build_object('both_present',count(*) FILTER (WHERE nullif(trim(c.management_company),'') IS NOT NULL),'text_fk_name_different',count(*) FILTER (WHERE nullif(trim(c.management_company),'') IS NOT NULL AND lower(trim(c.management_company)) IS DISTINCT FROM lower(trim(p.name)))) FROM customers c JOIN property_management_companies p ON p.id=c.property_management_company_id AND p.company_id=c.company_id;
```

### company_settings_drift

```sql
SELECT jsonb_build_object('pairs',count(*),'company_name',count(*) FILTER (WHERE s.company_name IS DISTINCT FROM c.name)) FROM settings s JOIN companies c ON c.id=s.company_id;
```

### message_history_overlap

```sql
SELECT jsonb_build_object('email_logs_communications_same_provider_id',(SELECT count(*) FROM email_logs e WHERE e.provider_message_id IS NOT NULL AND EXISTS(SELECT 1 FROM communications c WHERE c.company_id=e.company_id AND c.provider_message_id=e.provider_message_id)),'unsorted_resolved',(SELECT count(*) FROM unsorted_emails WHERE resolved_to_communication_id IS NOT NULL),'resolved_link_missing',(SELECT count(*) FROM unsorted_emails u WHERE resolved_to_communication_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM communications c WHERE c.id=u.resolved_to_communication_id AND c.company_id=u.company_id)),'unsorted_communications_same_provider_id',(SELECT count(*) FROM unsorted_emails e WHERE e.provider_message_id IS NOT NULL AND EXISTS(SELECT 1 FROM communications c WHERE c.company_id=e.company_id AND c.provider_message_id=e.provider_message_id)));
```

### ticket_invoice_links

```sql
SELECT jsonb_build_object('links',count(*),'missing_or_cross_company',count(*) FILTER (WHERE s.id IS NULL OR t.id IS NULL OR s.company_id<>t.company_id),'parents_multiple',(SELECT count(*) FROM (SELECT source_ticket_id FROM ticket_links WHERE link_type='invoice_for' GROUP BY source_ticket_id HAVING count(*)>1)x)) FROM ticket_links l LEFT JOIN tickets s ON s.id=l.source_ticket_id LEFT JOIN tickets t ON t.id=l.target_ticket_id WHERE l.link_type='invoice_for';
```

### schedule_mirror

```sql
SELECT jsonb_build_object('visits',(SELECT count(*) FROM visits),'ticket_visits',(SELECT count(*) FROM visits WHERE ticket_id IS NOT NULL),'tickets_crew',(SELECT count(*) FROM tickets WHERE crew_id IS NOT NULL),'tickets_due',(SELECT count(*) FROM tickets WHERE due_date IS NOT NULL),'tickets_route_order',(SELECT count(*) FROM tickets WHERE route_order IS NOT NULL),'planner_blocks',(SELECT count(*) FROM schedule_blocks),'campaign_target_dates',(SELECT count(*) FROM campaign_items WHERE target_date IS NOT NULL),'campaign_backup_dates',(SELECT count(*) FROM campaign_items WHERE backup_date IS NOT NULL));
```

### contract_scope_coverage

```sql
SELECT jsonb_build_object('legacy_customers',(SELECT count(DISTINCT customer_id) FROM contracts),'cc_customers',(SELECT count(DISTINCT customer_id) FROM agreements),'legacy_customers_without_cc',(SELECT count(DISTINCT c.customer_id) FROM contracts c WHERE NOT EXISTS(SELECT 1 FROM agreements a WHERE a.customer_id=c.customer_id AND a.company_id=c.company_id)),'cc_customers_without_legacy',(SELECT count(DISTINCT a.customer_id) FROM agreements a WHERE NOT EXISTS(SELECT 1 FROM contracts c WHERE a.customer_id=c.customer_id AND a.company_id=c.company_id)),'active_terms_without_included_scope',(SELECT count(*) FROM agreement_terms t WHERE t.status='active' AND NOT EXISTS(SELECT 1 FROM term_scope_lines s WHERE s.term_id=t.id AND s.included=true)),'scope_missing_quantity',(SELECT count(*) FROM term_scope_lines WHERE included=true AND quantity IS NULL),'scope_missing_months',(SELECT count(*) FROM term_scope_lines WHERE included=true AND (month_spread IS NULL OR month_spread::text IN ('{}','[]','null'))));
```

### term_rate_snapshots

```sql
SELECT jsonb_build_object('joined',count(*),'price_diff',count(*) FILTER (WHERE t.price_cents IS DISTINCT FROM r.price_cents OR t.price_text IS DISTINCT FROM r.price_text),'card_snapshot_diff',count(*) FILTER (WHERE t.card_price_cents IS DISTINCT FROM r.price_cents OR t.card_price_text IS DISTINCT FROM r.price_text),'label_diff',count(*) FILTER (WHERE t.label IS DISTINCT FROM r.label)) FROM term_rates t JOIN rate_card_items r ON r.company_id=t.company_id AND r.rate_key=t.rate_key;
```

### worksheet_snapshots

```sql
SELECT jsonb_build_object('joined',count(*),'title_snapshot_diff',count(*) FILTER (WHERE w.source_proposal_title_snapshot IS NOT NULL AND w.source_proposal_title_snapshot IS DISTINCT FROM p.title),'number_snapshot_diff',count(*) FILTER (WHERE w.source_proposal_number_snapshot IS NOT NULL AND w.source_proposal_number_snapshot IS DISTINCT FROM p.proposal_number)) FROM crew_worksheets w JOIN proposals p ON p.id=w.source_proposal_id AND p.company_id=w.company_id;
```

### notes_overlap

```sql
SELECT jsonb_build_object('ticket_notes_also_comments',(SELECT count(*) FROM ticket_notes n WHERE EXISTS(SELECT 1 FROM ticket_comments c WHERE c.ticket_id=n.ticket_id AND c.body=n.body)),'tickets_with_inline_photos',(SELECT count(*) FROM tickets WHERE photos IS NOT NULL AND photos::text NOT IN ('[]','{}','null')),'campaigns_with_photos',(SELECT count(*) FROM campaign_items WHERE photos IS NOT NULL AND photos::text NOT IN ('[]','{}','null')),'campaigns_with_completion_photos',(SELECT count(*) FROM campaign_items WHERE completion_photo_storage_keys IS NOT NULL AND completion_photo_storage_keys::text NOT IN ('[]','{}','null')),'tickets_with_completion_photos',(SELECT count(*) FROM tickets WHERE completion_photo_storage_keys IS NOT NULL AND completion_photo_storage_keys::text NOT IN ('[]','{}','null')));
```

### documents

```sql
SELECT jsonb_build_object('legacy_term_same_object',(SELECT count(*) FROM contract_documents c WHERE EXISTS(SELECT 1 FROM term_documents d WHERE d.storage_object_path=c.storage_object_path AND d.company_id=c.company_id)),'proposals_with_ticket',(SELECT count(*) FROM proposals WHERE ticket_id IS NOT NULL),'worksheets_with_proposal',(SELECT count(*) FROM crew_worksheets WHERE source_proposal_id IS NOT NULL));
```

### contact_drift

```sql
SELECT jsonb_build_object('contacts_with_manager',(SELECT count(*) FROM contacts WHERE property_manager_id IS NOT NULL),'linked_contact_names',(SELECT count(*) FROM contacts c JOIN property_managers p ON p.id=c.property_manager_id AND p.company_id=c.company_id WHERE c.name IS DISTINCT FROM p.name),'linked_contact_email_sets',(SELECT count(*) FROM contacts c JOIN property_managers p ON p.id=c.property_manager_id AND p.company_id=c.company_id WHERE (SELECT coalesce(array_agg(lower(trim(x)) ORDER BY lower(trim(x))),ARRAY[]::text[]) FROM unnest(c.emails) x) IS DISTINCT FROM (SELECT coalesce(array_agg(lower(trim(e.email)) ORDER BY lower(trim(e.email))),ARRAY[]::text[]) FROM property_manager_emails e WHERE e.property_manager_id=p.id AND e.company_id=p.company_id)),'manager_scalar_email_populated',(SELECT count(*) FROM property_managers WHERE nullif(trim(email),'') IS NOT NULL),'manager_scalar_email_not_in_children',(SELECT count(*) FROM property_managers p WHERE nullif(trim(email),'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM property_manager_emails e WHERE e.property_manager_id=p.id AND e.company_id=p.company_id AND lower(trim(e.email))=lower(trim(p.email)))),'manager_scalar_phone_populated',(SELECT count(*) FROM property_managers WHERE nullif(trim(phone),'') IS NOT NULL),'manager_scalar_phone_not_in_children',(SELECT count(*) FROM property_managers p WHERE nullif(trim(phone),'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM property_manager_phones e WHERE e.property_manager_id=p.id AND e.company_id=p.company_id AND regexp_replace(e.phone,'[^0-9]','','g')=regexp_replace(p.phone,'[^0-9]','','g'))));
```

### cc_2027_scope

```sql
SELECT jsonb_build_object('terms_2027',count(DISTINCT t.id),'included_lines',count(s.id),'quantity_missing',count(s.id) FILTER(WHERE s.quantity IS NULL),'month_spread_missing',count(s.id) FILTER(WHERE s.month_spread IS NULL OR s.month_spread::text IN ('[]','{}','null'))) FROM agreement_terms t LEFT JOIN term_scope_lines s ON s.term_id=t.id AND s.company_id=t.company_id AND s.included=true WHERE t.season_label LIKE '%2027%';
```

### plant_snapshots

```sql
SELECT jsonb_build_object('proposal_joined',(SELECT count(*) FROM proposal_plant_items i JOIN plant_catalog_items p ON p.id=i.plant_catalog_item_id),'proposal_name_snapshot_difference',(SELECT count(*) FROM proposal_plant_items i JOIN plant_catalog_items p ON p.id=i.plant_catalog_item_id WHERE i.name_snapshot IS DISTINCT FROM p.common_name),'palette_items',(SELECT count(*) FROM plant_palette_items));
```

### scope_comparable

```sql
SELECT jsonb_build_object('joined',count(*),'quantity_diff',count(*) FILTER(WHERE p.expected_quantity IS DISTINCT FROM s.annual_count)) FROM customer_service_plans p JOIN contracts c ON c.customer_id=p.customer_id AND c.company_id=p.company_id AND extract(year from c.start_date)=p.year JOIN contract_services s ON s.contract_id=c.id AND s.service_type=p.service_category AND s.company_id=p.company_id;
```

### legacy_copy_links

```sql
SELECT jsonb_build_object('links',count(*),'missing_legacy',count(*) FILTER(WHERE c.id IS NULL),'missing_term',count(*) FILTER(WHERE t.id IS NULL),'companies_mismatch',count(*) FILTER(WHERE c.company_id<>l.company_id OR t.company_id<>l.company_id)) FROM term_legacy_sources l LEFT JOIN contracts c ON c.id=l.legacy_contract_id LEFT JOIN agreement_terms t ON t.id=l.term_id;
```

### crew_initialization

```sql
SELECT jsonb_build_object('companies',count(*),'initialized',count(*) FILTER(WHERE crew_links_initialized_at IS NOT NULL)) FROM companies;
```

### campaign_service_plan_mapping

```sql
SELECT jsonb_build_object('items_using_service_plan_category',count(*) FILTER (WHERE service_plan_category IS NOT NULL),'target_and_backup',count(*) FILTER (WHERE target_date IS NOT NULL AND backup_date IS NOT NULL),'ticket_linked',count(*) FILTER (WHERE ticket_id IS NOT NULL)) FROM campaign_items;
```

### contact_phone_drift

```sql
SELECT jsonb_build_object('linked',count(*),'phone_set_drift',count(*) FILTER(WHERE (SELECT coalesce(array_agg(v ORDER BY v),ARRAY[]::text[]) FROM (SELECT regexp_replace(x,'[^0-9]','','g') v FROM unnest(c.phones)x)d) IS DISTINCT FROM (SELECT coalesce(array_agg(v ORDER BY v),ARRAY[]::text[]) FROM (SELECT regexp_replace(pn.phone,'[^0-9]','','g') v FROM property_manager_phones pn WHERE pn.property_manager_id=p.id AND pn.company_id=p.company_id)d))) FROM contacts c JOIN property_managers p ON p.id=c.property_manager_id AND p.company_id=c.company_id;
```

### qbo_display_mirror

```sql
SELECT jsonb_build_object('linked',count(*),'display_name_drift',count(*) FILTER(WHERE c.qbo_display_name IS DISTINCT FROM q.display_name)) FROM customers c JOIN qbo_customer_cache q ON q.company_id=c.company_id AND q.qbo_id=c.qbo_customer_id;
```

### season_alignment

```sql
SELECT jsonb_build_object('terms',count(*),'labels_disagree_with_dates',count(*) FILTER(WHERE season_label ~ '^[0-9]{4}$' AND extract(year from start_date)::text<>season_label),'campaigns_with_season',(SELECT count(*) FROM campaigns WHERE season_id IS NOT NULL),'template_season_windows',(SELECT count(*) FROM weekly_schedule_templates WHERE season_start_month IS NOT NULL AND season_end_month IS NOT NULL)) FROM agreement_terms;
```

## Audit output boundary

The source helper is optional and unused by application imports. No application test suite, migrations, seeds, boot functions, workflow restart or publish command was run. Source-script execution and structural report checks are the verification for this documentation-only audit.
