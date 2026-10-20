# N3: The section rail on the other pages, and the stop-gap items folded in

> Assumes `00-RULES-N.md`, N1 and N2 (`SectionRail`, `SectionRailLayout`, rail tokens). **Line numbers are from GitHub `a77f060`**; find code by its content. **No schema change.**
>
> What bites hardest here:
> - Several rails span **separate routes**, not tabs inside one page, so each route renders the same rail with a different active item.
> - **Map pages are full-height.** The rail layout must not break their `h-full overflow-hidden` sizing.
> - **Communications carries its search, date and view-as filters in the query string.** Rail links must keep them.
>
> **Out of scope, unchanged:** the Scheduling board (P3-3 layout), the Billing page's Waiting/Recent switch, ticket detail.

## 1. Tickets: one sidebar item, three views

| Rail item (en / es) | Route | Visible to |
|---|---|---|
| Mine / Míos | `/dashboard/tickets/my` | everyone the route allows (N1) |
| Batches / Lotes | `/dashboard/my-batches` | admin, office, field, field_manager, landscape_supervisor |
| All / Todos | `/dashboard/tickets` | admin, office |

- **The rail title is "Tickets."** Render the rail on `MyTickets`, `MyBatchesPage` and `TicketsList`.
- **Inside MyTickets, nothing changes:**
  - the To invoice / Other tabs and `?tab=invoice`;
  - the landscape supervisor's My Work tabs;
  - the "with billing" line.
- **The rail is hidden when it would have only one item.** A crew supervisor's Tickets is just the page.
- **Sidebar (`navConfig.ts`):**
  - Remove the `myTickets` and `myBatches` items.
  - `tickets` becomes visible to everyone the My Tickets route allows, and its href is `/dashboard/tickets/my`.
  - Its `activeMatch` covers all three routes and `/dashboard/tickets/:id`.
  - The landscape supervisor's label stays "My Work".
- `BILLING_LANDING` (`/dashboard/tickets/my?tab=invoice`) is unchanged.

## 2. Maps: one sidebar item, two views

| Rail item (en / es) | Route | Visible to |
|---|---|---|
| Property maps / Mapas de propiedades | `/dashboard/maps` | that route's `allowedRoles` |
| Route map / Mapa de rutas | `/dashboard/customers/map` | that route's `allowedRoles` |

- **Render the rail on `PropertyMapsPage` and `CustomerRouteMap`,** keeping their full-height map layout.
  - The rail column scrolls on its own.
  - The map fills the rest of the space.
  - Confirm that the map resizes when the browser width changes.
- **Sidebar:**
  - Replace `propertyMaps` and `routeMap` with one `maps` item. Its href is the first view the role is allowed, and its `activeMatch` covers both routes.
  - Mapping keeps the "Customer Maps" label.
- With one view (office: property maps only; shop manager: route map only), there is no rail.

## 3. Campaigns

| Rail item (en / es) | Route | Visible to |
|---|---|---|
| Campaigns / Campañas | `/dashboard/campaigns` | that route's `allowedRoles` |
| Service checklists / Listas de servicio | `/dashboard/campaigns/checklists` | admin, office, field_manager, chemical_manager |

- The rail appears on the two list pages only, not on campaign detail or campaign item detail.
- Remove N1's stop-gap "Service checklists" header button.

## 4. Plant Library

| Rail item (en / es) | Route |
|---|---|
| Library / Biblioteca | `/dashboard/tools/plant-library` |
| Matches / Coincidencias | `/dashboard/tools/plant-matches` |
| Palettes / Paletas | `/dashboard/tools/plant-palette` (also active on `/dashboard/tools/plant-palette/:id`) |

- The rail title is "Plant Library."
- All three are admin and office, as the routes are.
- The top-bar Tools menu keeps one "Plant Library" row (N1).

## 5. Inbox (Communications)

- **Replace `CommunicationsSecondaryNav`'s tab row with `SectionRail`**, titled "Inbox" / "Bandeja de entrada". The items are Inbox, Unsorted, Sent, All communications.
  - Keep the existing labels, the counts as badges, and the admin/office-only rule for All.
  - The labels are hard-coded English today. Move them to i18n: `comms.inbox`, `comms.unsorted`, `comms.sent`, `comms.all`, with es "Bandeja de entrada", "Sin clasificar", "Enviados", "Todas las comunicaciones".
- **Each rail href keeps the shell's current `search`, `fromDate`, `toDate` and `viewAs` query values,** the same way the secondary nav builds its navigation today. Read how it does that and reuse it.
- `setLastCommsTab` / `commsTabHref` keep working, so the sidebar's Inbox link reopens the last section.
- **Sidebar:** remove the comms sub-items under Inbox (`sidebar-comms-subnav`). Keep the unsorted badge on the Inbox item.

## 6. Flags

- **Replace the status `<Select>`** (`FlagsInboxPage.tsx` ~L126) with a rail, titled "Flags" / "Alertas".
- **Items:** New, Acknowledged, In progress, Resolved, Dismissed, All. Use `FLAG_STATUSES` and the existing status labels, moved to i18n (es: "Nuevas", "Reconocidas", "En curso", "Resueltas", "Descartadas", "Todas").
- **The URL is `/dashboard/flags?status=<status>`.** No `status` means New, which matches today's default. `all` means no filter.
- Keep the tag filter as it is.
- The New item shows the unread count as a badge.
- Flag detail (`/dashboard/flags/:id`) has no rail.

## 7. Customer page: restyle only

- **`components/customer/CustomerSubNav.tsx` is already a sectioned rail.** Switch its colors from the dark sidebar tokens (`bg-sidebar-accent`, `bg-sidebar`, `border-sidebar-border`, `bg-sidebar-primary/20`) to the rail tokens: `bg-rail`, `bg-rail-active`, `border-rail-border`, badges on `bg-rail-hover`.
- **Keep its behavior:** collapse, sections, badges, `CustomersViewSwitcher`, the active-item left border (in `rail-active-icon`), and the section and role rules.
- **App.tsx's "phantom rail"** (~L425, `bg-sidebar border-sidebar-border`) mimics this rail during transitions. Switch it to `bg-rail border-rail-border` too.
- **AppSidebar's `isCustomerDetail` styling** (which joins the dark sidebar to the rail) needs a review: with a light rail, the joined edge should keep its border. Show before and after.

## 8. Tests

- **`navConfig.test.ts`:** update the per-role expected keys. `myTickets`, `myBatches`, `propertyMaps` and `routeMap` are gone; `tickets` and `maps` cover them. Keep the route-permission check.
- **For each new rail:**
  - the right items for each role;
  - the active item on each route;
  - no rail when only one item is visible.
- **Communications:** moving from Inbox to Sent keeps `search=` and `viewAs=`.
- **Flags:** `?status=resolved` lists resolved flags, and no `status` lists New.
- **Maps:** the map container keeps a non-zero height inside the rail layout (a rendered test, or a manual check in the report).

## Report

- Screenshots of each rail page as admin, plus a field manager on Tickets and on Maps.
- The customer page before and after, in light and dark mode.
- The 390px pill row on Inbox.
