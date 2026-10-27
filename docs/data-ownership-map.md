# High Plains CRM: Data ownership map

> **The rule:** every fact has exactly one owner. Any other copy is either a **snapshot** (frozen on purpose, such as signed prices or the crew that actually did completed work) or an **automatic mirror** maintained by one named function. If two places can disagree and nothing reconciles them, that's a bug.
>
> **How things are retired, always in this order:**
> 1. pick the owner;
> 2. copy the data in;
> 3. switch every reader and writer to the owner;
> 4. **freeze** the old holder (writes rejected);
> 5. **drop** it only after a full season with no readers.
>
> Never drop first.
>
> Source: `docs/data-ownership-audit.md` (production, Oct 19, 2026). The status column is updated as slices land.

| Fact | Owner | Allowed copies (snapshot / mirror) | Being retired | Status |
|---|---|---|---|---|
| **Contract coverage and form** | `agreement_terms.line` / `agreement_terms.form`, independently per signed season | None | `agreements.line` / `agreements.form` removed by the separately approved cleanup | Season-only; renewals never rewrite prior seasons |
| **Standing crew** (name, supervisor, color, hours, active, order) | `crews` (Settings → Crews) | **Mirror:** `tickets.crew_id` via `syncTicketFromVisits`. **Snapshots:** crew and lead on completed work and worksheets. | `maintenance_crews` name/color/hours/active (O1 freezes; the table later becomes routes), `campaign_crews` name/color (O1 derives them) | **O1 merged** |
| **Campaign team membership** (who is on this campaign's team) | `campaign_crew_members`, with each team **linked to a standing crew** | — | — | Kept: a distinct fact |
| **A dated crew trip** | `visits` | **Mirror:** ticket crew/date/order via `syncTicketFromVisits` | `schedule_blocks` (with the routes rebuild), `campaign_items.target_date` (with campaigns → visits) | Live (P3-2/P3-3) |
| **Recurring weekly pattern** | *Routes* (to build) | — | `weekly_schedule_templates`, `schedule_blocks`, `maintenance_visit_configs` | Planned |
| **What a property is owed** (scope, quantity, months) | Contract Center `term_scope_lines` | **Snapshot:** each term's copied scope | legacy `contracts`, `contract_services`, `contract_monthly_amounts`, `customer_service_plans`, `service_plan_*` | Legacy writes frozen. **Readers still on legacy:** revenue, dashboard, snow, tickets, mobile. |
| **Service names** | One service-key registry (to build) | — | ~12 separate lists (audit area C) | Planned (O2) |
| **Current default rates** | `rate_card_items` | **Snapshot:** `term_rates` (negotiated, per term) | `customer_rate_sheets` (writes frozen) | Mostly done |
| **Estimate equipment/fee names, units and optional prefills** | CRM `estimate_quick_items` (Estimates → Catalogs → Equipment & Fees) | None; future free-typed estimate lines remain allowed | — | Live; separate from fleet equipment |
| **Six fixed invoice umbrella identities and company bindings** | CRM `qbo_umbrella_items`; six permanent company keys, provisioned by migration and `provisionUmbrellas` | **Snapshots:** linked QBO item name/type refreshed by `pullItems` or successful link/create. Missing bindings retain identity but clear snapshot freshness. | — | Live; unlink never deletes a permanent umbrella |
| **QuickBooks Item facts** (remote identity/name/type/active/income account) | QuickBooks Online | **Automatic mirror:** `qbo_item_cache`, maintained by `pullItems` and successful `createItem`; full pulls update mirror and binding snapshots in one company-serialized transaction. Existing-item links only read the mirror. | — | Live; no automatic QBO writes |
| **Irrigation part facts** (SKU, name, specs, category, cost, price, active) | IrrigoPro Parts Catalog | **Read-only CSV mirror:** `irrigation_catalog_items`, sole writer `irrigationCatalog.import`; run audit in `irrigation_sync_runs`. [Import contract](irrigation-catalog-import.md) | — | CSV mirror; no CRM item editing |
| **Company / manager directory** | `property_management_companies` + `property_managers` (+ emails, phones) | — | `customers.management_company` text, duplicated contact channels in `contacts` | Planned. 5 drifted rows. |
| **Organization name and branding** | `companies` | `settings` holds overrides only | the duplicate name in `settings` | Planned (small) |
| **Property display name** | `customers` | campaign completion emails already sent (snapshot) | `campaign_items.customer_name` / `customer_city` copies (7 drifted) | Planned (small) |
| **Job lifecycle** | `tickets` | — | — | Kept |
| **Invoice charges** | Invoice tickets + `ticket_links` | Billing and To invoice are projections | — | Done (C3) |
| **Dead tables** | — | — | `contract_masters`, `scope_presets`, `scope_preset_lines` (empty; nothing reads them) | Drop after confirming at a publish |

**Reviewed and kept separate on purpose** (audit areas D, G–J, L, M): rates vs term snapshots, template families, message history vs mailbox import, notes and photos by source, equipment tickets, seasons vs term dates, documents. To revisit later; not contradictions today.
