# N1: One shell for every role, the new sidebar, and Operations broken up

> Assumes `00-RULES-N.md`. **Line numbers are from GitHub `a77f060`**; find code by its content. **No schema change.**
>
> What bites hardest here:
> - **The billing sidebar rule** (rule 4).
> - **Every role must land somewhere it is allowed.** `crew_supervisor` isn't allowed on `/dashboard` today.
> - **No item may link to a route that denies that role** (rule 10).
>
> A few items are deliberate stop-gaps: My Tickets, My Batches, Route map and Maintenance planner as separate items. N3 folds them into section rails. Ship them as listed.

## 1. Every role gets the sidebar shell

- **`App.tsx` ~L386.** Delete the `isFieldAppRole` branch that renders `FieldAppLayout`, and the `FIELD_APP_ROLES` / `isFieldAppRole` definitions at ~L205 if nothing else uses them. Every authenticated user now gets the `SidebarProvider` layout (~L401).
- **Delete** `components/FieldAppLayout.tsx` and `components/AccountSidePanel.tsx`. Only `FieldAppLayout` imports the panel. Its contents (theme, language, help, log out) move to the profile menu (§4).
- **`pages/Dashboard.tsx`:** keep the branch that renders `FieldHomeDashboard` for field roles.
- **In `pages/FieldHomeDashboard.tsx`:**
  - remove the nav-button grid (the `navButtons.map(...)` block ~L278) and `getNavButtons()`. The sidebar replaces them.
  - Keep every widget: the My Tickets summary, `NeedsYouQueue` for field managers, the batches widget, campaigns, and the landscape supervisor tabs.
  - Remove the phone-only `pb-20`.
- **Crew supervisors have no working web page today.**
  - `/dashboard` denies `crew_supervisor`. So does `/dashboard/tickets/my`, whose `access` is `canViewBilling || allFieldRoles`, and `allFieldRoles` doesn't include `crew_supervisor`. Today's "My Tickets" link sends them to Access denied.
  - **The one deliberate permission change in this pack:**
    - Add `crew_supervisor` to the `access` of `/dashboard/tickets/my` and `/dashboard/tickets/:id` (~L247–256). Do **not** add it to `allFieldRoles` itself; other routes use that list.
    - **Server:** in `GET /api/tickets/:id` (routes.ts ~L6264), add `crew_supervisor` to the roles that may only view tickets assigned to them, next to field_manager, chemical_manager and irrigation_manager. Otherwise the new route would expose every ticket by URL.
    - `GET /api/tickets/my` already returns only the caller's assigned tickets.
  - **Landing:** in `lib/landing.tsx`, `defaultRedirectPath` sends `crew_supervisor` to `/dashboard/tickets/my`. Keep the billing and mapping rules ahead of it.
  - **Tests:**
    - A crew supervisor can open their own ticket.
    - They get 403 on someone else's ticket.
    - They land on My Tickets.
- **On small screens** the shadcn sidebar already becomes an off-canvas sheet behind `SidebarTrigger`. Confirm it at 390px wide for a field role.

## 2. The sidebar is data, not branches

Replace the `getDashboardItems` / `getCrmItems` / `getManagementItems` / `getMyAccountItems` / `getAdminItems` branches in `components/AppSidebar.tsx` with a single config in a new file, `components/nav/navConfig.ts`.

- **The config:** `NAV_GROUPS: { key, labelKey | null, items: NavItemDef[] }[]`.
- **Each item:** `NavItemDef = { key, labelKey, icon, href(user) | href: string, visible(user): boolean, badge?: "billing" | "scheduling" | "flags" | "unsorted", activeMatch?: string[] }`.
- **The function:** `getNavForUser(user)` returns only the visible groups and items. `AppSidebar` renders that output and nothing else. Export it so the tests can call it.

`AO` below means admin or office. "Field roles" means the five former field-app roles plus `field`.

| Group | Item (key) | Label (en / es) | href | Visible to |
|---|---|---|---|---|
| (none) | `dashboard` | Dashboard / Panel | `/dashboard` | admin, office, field_manager, chemical_manager, irrigation_manager, shop_manager, landscape_supervisor, field |
| (none) | `inbox` | Inbox / Bandeja de entrada | `commsTabHref(lastCommsTab)` (as today) | AO. Keep today's comms sub-tabs under it and the unsorted badge. |
| (none) | `flags` | Flags / Alertas | `/dashboard/flags` | AO. Unread badge as today. |
| Work / Trabajo | `tickets` | Tickets / Tickets | `/dashboard/tickets` | AO |
| Work | `myTickets` | My Tickets / Mis tickets *(stop-gap, N3)* | `/dashboard/tickets/my` | everyone except mapping. Landscape supervisors keep the label "My Work" / "Mi trabajo". |
| Work | `myBatches` | My Batches / Mis lotes *(stop-gap, N3)* | `/dashboard/my-batches` | field, field_manager, landscape_supervisor (AO already reach it from the batches widget; don't add it for them) |
| Work | `scheduling` | Scheduling / Programación | `/dashboard/scheduling` | the existing `canSchedule` (AO, field_manager), with its badge |
| Work | `planner` | Maintenance planner / Planificador de mantenimiento *(stop-gap)* | `/dashboard/schedule` | AO, irrigation_manager. It was the Operations › Schedule tab and the irrigation manager's "Schedule". |
| Work | `campaigns` | Campaigns / Campañas | `/dashboard/campaigns` | AO, field_manager, chemical_manager, irrigation_manager |
| Work | `equipment` | Equipment / Equipo | `/dashboard/equipment` | AO, shop_manager |
| Work | `snow` | Snow / Nieve | `/dashboard/snow` | AO, field_manager. **Seasonal order:** first in Work from November through April, last otherwise. Use the Colorado month from `localDateString(now)` in the client's `shared/scheduleBy.ts`, which already formats in `America/Denver`. Take `now` as a parameter so the tests can pass a fixed time. `lib/companyDay.ts` is server-only. |
| Customers / Clientes | `customers` | Customers / Clientes | AO and field_manager: `/dashboard/customers` (keep the last-viewed resolver and click handler as today). chemical_manager, irrigation_manager, landscape_supervisor: `/dashboard/field-customers`. | those five roles |
| Customers | `contracts` | Contracts / Contratos | `/dashboard/contracts` | AO |
| Customers | `propertyMaps` | Property maps / Mapas de propiedades | `/dashboard/maps` | AO, mapping (keep its "Customer Maps" label), field, field_manager, chemical_manager, irrigation_manager, landscape_supervisor |
| Customers | `routeMap` | Route map / Mapa de rutas *(stop-gap, N3)* | `/dashboard/customers/map` | admin, field_manager, chemical_manager, irrigation_manager, shop_manager, landscape_supervisor (the route's own list; office is not on it) |
| Business / Negocio | `billing` | Billing / Facturación | `/dashboard/billing` | `showBillingSidebar(user)` only, with its badge. (N4 renames it.) |
| Business | `revenue` | Revenue / Ingresos | `/dashboard/revenue` | AO |
| Business | `reports` | Reports / Reportes | `/dashboard/reports` | AO |
| footer | `settings` | Settings / Configuración | `/dashboard/settings` | AO |
| footer | `team` | Team / Equipo de trabajo | `/dashboard/users` | admin |

**Removed from the sidebar:**
- **Operations:** it's broken up (§5).
- **Seasons:** reached from Settings for now (§6); N2 merges it.
- **Tools:** moves to the top-bar menu (§3).
- **Shared Mailboxes, Notification Templates, Crews:** already Settings tabs.
- **The My Account group:** My Mailbox moves to the profile menu.

**Keep as they are:**
- The super-admin path: the Platform Admin group, plus My Tickets and Billing when `showBillingSidebar`.
- The `isCustomerDetail` styling.
- `guardLinkClick`.
- The active-state rules: `/dashboard` exact, comms by prefix, everything else by prefix.

**Tests** (`components/nav/navConfig.test.ts`):
- **One `it.each` row per role.** Each row asserts the exact ordered item keys for that role. It's the table above, written out per role, including super admin.
- **Billing rule:** admin (tagged or not) sees `billing`. Office without the tag sees it. Office with the `billing` tag does not. field_manager with the tag does not.
- **Snow ordering:** run under `TZ=UTC` and `TZ=America/Denver`. 2026-11-01 06:30 UTC (Oct 31 in Colorado) puts Snow last; 2026-11-01 07:30 UTC puts it first.
- **Route check:** for every role, each visible item's path is in that route's `allowedRoles` in `App.tsx`. Hard-code a small map in the test; don't import App.
- **Landing:** `crew_supervisor` lands on `/dashboard/tickets/my`.

## 3. Top bar: Tools and New

**Where:** in the `App.tsx` header (~L415), between `SidebarTrigger` and `NotificationsDropdown`. Both menus are shadcn `DropdownMenu`s, and both are **AO only**.

**Tools / Herramientas:**
- Proposal Maker / Creador de propuestas → `/dashboard/tools/proposals`
- Visual Scope / Alcance visual → `/dashboard/tools/visual-scope`
- Crew Worksheets / Hojas de trabajo de cuadrilla → `/dashboard/tools/crew-worksheets`
- Plant Library / Biblioteca de plantas → `/dashboard/tools/plant-library`
- Each row has a one-line hint underneath:
  - Proposal Maker: "Usually opened from an estimate request" / "Normalmente se abre desde una solicitud de estimado"
  - Crew Worksheets: "Usually made from a proposal" / "Normalmente se crea desde una propuesta"

**New / Nuevo**, a primary button:
- **Task / Tarea** expands in place to three rows. Each opens `/dashboard/tickets/new?workType=…`:
  - **Contract work / Trabajo de contrato** (`contract`), hint "Covered by the contract, no invoice" / "Incluido en el contrato, sin factura"
  - **Billable work / Trabajo facturable** (`extra_work`), hint "Extra work that needs an invoice" / "Trabajo adicional que requiere factura"
  - **To-Do / Pendiente** (`admin`), hint "A person's job, never on the crew calendar" / "Tarea personal, nunca en el calendario de cuadrillas"
- **Estimate request / Solicitud de estimado** → `/dashboard/tickets/new?workType=estimate_request`
- **Contract / Contrato** → `/dashboard/contracts/new`, hint "New customer agreement" / "Nuevo acuerdo con el cliente"
- A separator, then **More… / Más…** → `/dashboard/tickets/new`, hint "RFP, invoice, shop to-do, project" / "RFP, factura, pendiente de taller, proyecto"

**`pages/NewTicket.tsx` (~L111):**
- Read `workType` from the query string next to `customerId`.
- If it's one of `contract | extra_work | admin | estimate_request | shop_todo` and the ticket types have loaded, run the same path as clicking that card (`handleSelectWorkType`) **once**. Anything else is ignored.
- `customerId` still works alongside it.
- The client labels stay "Billable", per `.agents/memory/task-billing-terminology.md`. The menu wording above is menu-only.

**`pages/ToolsPage.tsx`:** remove the two `available: false` cards (Snow Damage, Estimate Builder). Leave the route and the page as they are; nothing links to the page now.

**Don't add a search box.** ⌘K is its own project.

## 4. Profile menu

The sidebar footer becomes one button: avatar, name and `RoleBadge`, opening a `DropdownMenu` upward with:
- My Mailbox / Mi buzón → `/dashboard/settings/my-mailbox`
- Notifications / Notificaciones → `/dashboard/notifications`
- Language / Idioma: the existing EN/ES toggle, which keeps calling `PATCH /api/auth/language`
- Theme / Tema: the existing `ThemeToggle`
- Help & support / Ayuda y soporte: the existing help dialog, moved as is
- Log out / Cerrar sesión

Remove the separate footer buttons and the row of controls they sit in.

## 5. Operations broken up

All its tabs already have standalone routes except Service Checklists.

- **New page `pages/ServiceChecklistsPage.tsx`.** Move `ServiceChecklistsTab` and its helpers (`CustomerCard`, `CustomerDetailPanel`, `rankingLabel`, `rankingVariant`, `completionStatus`) out of `GlobalOperationsPage.tsx` unchanged.
  - Route: `/dashboard/campaigns/checklists`, allowed AO, field_manager, chemical_manager (the tab's roles today).
  - **Register it before `/dashboard/campaigns/:id`.** Otherwise "checklists" matches `:id`.
- **Campaigns list page:** add a "Service checklists" / "Listas de servicio" link button in its header for those same roles. It's a stop-gap; N3 replaces it with the rail.
- **`/dashboard/operations`** → `<Redirect>` to `/dashboard/campaigns`.
- **Delete** `pages/GlobalOperationsPage.tsx` and its lazy import (`App.tsx` ~L80). Also delete `pages/OperationsPage.tsx`: nothing imports it, but grep to confirm first.
- The "Operations Command Center" header badges go away with the page.

## 6. Seasons, until N2

The Seasons sidebar item goes, but `/dashboard/seasons` stays. In Settings › Seasons (the months card), add a "Season records →" / "Registros de temporadas →" link to `/dashboard/seasons`. N2 merges the two.

## i18n keys

Add to `nav`:
- `work`, `customersGroup`, `business`
- `flags`, `myBatches`, `myWork`, `planner`, `serviceChecklists`, `seasonRecords`

Add a new `topbar` block:
- `tools`, `new`, `task`, `contractWork`, `billableWork`, `todo`, `estimateRequest`, `contract`, `more`
- the hint strings

Add a new `profile` block: `myMailbox`, `notifications`, `language`, `theme`, `help`, `logOut`.

Use the en/es text given above.

## Report

- Screenshots of the sidebar for admin, office (untagged and billing-tagged), field_manager, chemical_manager, irrigation_manager, shop_manager, landscape_supervisor, crew_supervisor, field and mapping.
- Screenshots of the Tools and New menus, and the profile menu, in English and Spanish.
- One 390px screenshot for a field role.
- Test and typecheck results against the baseline.
