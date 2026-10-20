# High Plains CRM: Navigation design

**Status (Oct 20, 2026):**
- Randy approved the layout in the model.
- **Every role gets the desktop sidebar web app, and every role gets the phone app.**
- All the decisions the web slices need are made. Replit slices are not written yet.

**Model:** "High Plains Navigation Model" artifact, https://claude.ai/artifact/MpyogPM9ZPFGFcPfbS8PMY. It has a clickable proposed nav with a role switcher covering all 10 roles, plus a "today" reference board.
**Code checked against:** GitHub `a77f060`.

## Scope: one desktop web app for every role, the phone app for every role (Randy, Oct 20)

**Today the roles are split across three surfaces:**
- **Desktop `AppSidebar`:** admin, office, mapping. `field` and `crew_supervisor` also land here, but only get My Tickets.
- **`FieldAppLayout`**, a phone-style single column with a Home button and an account panel: `field_manager`, `chemical_manager`, `irrigation_manager`, `shop_manager`, `landscape_supervisor`. Their menu is `getNavButtons()` in `FieldHomeDashboard.tsx`.
- **Native app** (`artifacts/highplains-mobile`, Expo; tabs Today / Properties / Me, plus flags): `MOBILE_ALLOWED_ROLES` is `crew_supervisor`, `field_manager` and `landscape_supervisor`.

**The decision:**
- **Every role gets `AppSidebar` on a computer.** `FieldAppLayout` and its `isFieldAppRole` branch in `App.tsx` retire, and the AppSidebar role branches are rebuilt from the table below.
- **Every role gets the native app.** This is the next project: building the app for the app stores (see "Mobile implications" below).
- The web sidebar already collapses to a slide-out sheet on phones, which covers anyone who opens the web app on a phone in the meantime.

**Sidebar per role.** These are built from each role's current field menu, its route permissions, and the scheduling design.

| Role | Sidebar |
|---|---|
| Admin | Everything |
| Office | Everything except Team; Settings shows Property managers only |
| Field manager | Dashboard · Tickets (Mine, Batches) · Scheduling · Calendar · Campaigns · Snow · Customers · Maps |
| Chemical manager | Dashboard · Tickets · Campaigns · Customers · Maps |
| Irrigation manager | Dashboard · Tickets · Scheduling (irrigation crew) · Calendar · Campaigns · Customers · Maps |
| Shop manager | Dashboard · Tickets · Equipment · Maps (Route map) |
| Landscape supervisor | Dashboard · Tickets (Mine, Batches) · Customers · Maps |
| Crew supervisor | Tickets |
| Field crew | Tickets (Mine, Batches) |
| Mapping | Maps (Property maps) |

**Notes on the table:**
- **Dashboards:** at first, field roles get their current home content (`FieldHomeDashboard`, `ShopManagerDashboard`) at desktop width. A role-specific "Needs you" queue can follow later.
- **Customers:** field roles see a filtered view of the one Customers page. `/dashboard/field-customers` redirects to it.
- **My Batches** becomes a section of Tickets for the roles the route allows today: admin, office, field, field_manager and landscape_supervisor.
- **Only admin and office** get Inbox, Flags, Contracts, Business, Settings, the Tools menu and the New button.

## Mobile implications of "everyone gets the app" (checked at a77f060)

- **`MOBILE_ALLOWED_ROLES` does two jobs, and it must be split before it's widened.**
  - It gates **app login**: `mobileAuth.ts`, and the `/api/m/*` checks in `crewsAndMobile.ts` and `flags.ts`.
  - It defines **who can be a crew supervisor**: `crewsAndMobile.ts` ~L198 and ~L243 (supervisor validation) and `/api/crews/eligible-supervisors` (~L292).
  - Widening it as-is would make office, admin and shop staff selectable as crew supervisors.
  - **Split it into** `MOBILE_LOGIN_ROLES` (all roles) and `CREW_SUPERVISOR_ROLES` (crew_supervisor, field_manager, landscape_supervisor).
  - `crewsAndMobile.companyDay.test.ts` mocks the set, so the tests need updating too.
- **The app's endpoints assume a crew.** `/api/m/today` resolves `resolveSupervisorCrewId`, and `/api/m/me/week` and `/recent-completions` are "the supervisor's crew." A user without a crew gets an empty day.
- **So the app needs a home screen per role:**
  - crew supervisors: their crew's day, unchanged;
  - managers: their own tickets plus the crews' day;
  - office and admin: Needs you, customer lookup, flags.
- **Login takes `memberships[0]`.** A multi-role user gets whichever membership comes first, so a role switcher is needed eventually.
- The error strings ("Mobile access is for crew supervisors…") need to change.
- None of this blocks the web nav slices.

## What's wrong today

- 19 sidebar items in 5 groups. The group names describe nothing: "High Plains CRM" is just the app's name, and "Management" is a junk drawer.
- **Operations** is a page of 7 unrelated tabs. Its tab state is `useState` only, so it isn't in the URL: refresh resets to Campaigns and the back button skips tabs. Four of the tabs also exist as standalone routes.
- **Settings** has 15 flat tabs. Four of them (Seasons, Crews, Shared Mailboxes, Notification Templates) are also sidebar items.
- **Tools** has 8 cards, 2 of them "coming soon" with no route.
- Orphans with no link in the menus: QuickBooks customer mapping, Contract builder, `/dashboard/contracts/old`.
- The two "Seasons" screens store different data. The Settings tab holds mowing and cleanup months; `/dashboard/seasons` holds season records.
- **Field roles are stuck in a phone-sized layout on a desktop.**

## Approved layout (admin view)

- **Top:** Dashboard, Inbox (Inbox, Unsorted, Sent, All communications), **Flags** (its own item, red unread badge)
- **Work:** Tickets (Mine / Batches / All), Scheduling, Calendar, Campaigns (with Checklists), Equipment, Snow. Snow moves to the top of Work in winter.
- **Customers:** Customers, Contracts, Maps (Property maps + Route map)
- **Business:** Estimates, Invoicing, Revenue, Reports
- **Bottom:** Settings, Team, profile menu (My Mailbox, Notifications, EN/ES, theme, help, log out)
- **Top bar:**
  - ⌘K search
  - **Tools** menu: Proposal Maker, Visual Scope, Crew Worksheets, Plant Library (Library, Matches and Palettes as one page)
  - **New** button

## Decisions (Randy)

- The main sidebar stays **dark green**.
- Any page with sub-sections uses the **light-green secondary rail** from Settings, not tabs across the top. This applies to the customer page (its existing CustomerSubNav sections), Settings, Inbox, Flags, Tickets, Scheduling, Calendar, Campaigns, Maps, Invoicing and Plant Library. Every section gets its own URL.
- **Visual Scope, Plant Library, Proposal Maker and Crew Worksheets are tools, not nav items.** The Proposal Maker opens from an Estimate Request ticket (Estimating → Create Proposal). Crew worksheets are generated from a proposal (`POST /api/proposals/:id/crew-worksheets`) and show on the ticket.
- **The New menu is fixed at three choices,** not learned from usage:
  - **Task**, which expands to Contract work, Billable work, or To-Do
  - **Estimate request**
  - **Contract** (a new agreement)
  - **More…** opens the full picker: RFP, Invoice, Shop To-Do, Project.
  - Only admin and office see New, since they're the only roles that can create tickets.
- Label the Task choices **Contract work** / **Billable work**, so they don't collide with the top-level Contract item.
- **Contracts stays under Customers.**
- **Sales and Money merge into Business:** Estimates, Invoicing, Revenue, Reports.
- **Estimates** is a stage board of open Estimate Request and RFP tickets: a filtered view of existing tickets, not a new list.
- **Billing is renamed Invoicing.** The customer page's Financial › Billing and the QuickBooks billing settings follow.
- **The status label "Ready for billing" becomes "Ready to invoice."** Only the label changes: the key `ready_for_billing` stays, and `STATUS_KEY_BACKFILL` gets the new display name as an alias. `extraBillableBilling.ts` looks the status up by name, so it must be switched to the key in the same slice.
- **Flags keep their own spot in the sidebar**, with the red unread badge, even after flags start creating tickets. They don't merge into Inbox. Flags are photo field reports from the phone app (tag, note of up to 280 characters, property or ticket), with statuses New → Acknowledged → In progress → Resolved / Dismissed.
- **Inbox is email only:** Inbox, Unsorted, Sent, All communications.
- **Every role gets the phone app** (see Mobile implications).

## Settings sections

- **Company:** profile, Seasons (season records + service months on one page), benchmarks, Crews, property managers (office sees only this page)
- **Services & catalog:** service plans, work item templates, chemical products, contract defaults
- **Communication:** email templates, notification templates, shared mailboxes
- **Integrations:** QuickBooks (invoicing settings + customer mapping)
- **System:** feature flags, database (admin only)

## Rules for the slices

- **Keep the `/dashboard/` prefix** on every new route; the model's short URLs are illustrative. Every moved path gets a `<Redirect>`.
- The server builds links into the app, and they must keep working:
  - **in emails:** `flags.ts` (`/dashboard/flags/:id`) and `emailSyncService.ts` (`/dashboard/settings/mailbox-accounts`);
  - **in the dashboard queue:** `dashboardQueue.ts` (`/dashboard/tickets/:id`, `/dashboard/communications/:id`, `/dashboard/contracts/:id`);
  - **for visual scope:** `crewsAndMobile.ts` (`/dashboard/customers/:id/visual-scope/:id`).
- **Field-app paths that must redirect or keep working:** `/dashboard/tickets/my`, `/dashboard/my-batches`, `/dashboard/field-customers`, `/dashboard/customers/map`, `/dashboard/maps`, `/dashboard/schedule`, `/dashboard/campaigns`, `/dashboard/equipment`.
- **Before deleting `FieldAppLayout`,** check what `AccountSidePanel` holds and move it into the profile menu.
- The billing-tagged user's landing on My Tickets › To invoice stays.
- **Every new label goes in both `i18n/locales/en.ts` and `es.ts`.** The EN/ES toggle is live, and field staff use Spanish.
- Update the tests that depend on nav test IDs: `BillingAccess.regression.test.tsx`, `ContractCenter.board.test.tsx`, `CustomerContracts.rendered.test.tsx`, `TicketDetail.visits.rendered.test.tsx`, `SettingsPage.qbo.test.ts`.
- Calendar and Estimates appear in the sidebar only once their pages exist. No dead links.
- **Don't touch the native app or `MOBILE_ALLOWED_ROLES` in the nav slices.** That belongs to the mobile project.
- Rebase on current main. P3-3 (Scheduling) landed at `a77f060`, and Contract Center work is ongoing.
- No DDL in any slice.

## Proposed slice order

1. Regroup the sidebar and top bar: groups (Flags stays its own top item), Tools menu, New menu, profile menu. **Rebuild the role branches for all 10 roles from the table above, and route every role through `AppSidebar`** (retire `FieldAppLayout`). Add redirects and i18n.
2. Break up Operations into its standalone pages and delete the hub.
3. Build the secondary-rail component. Regroup Settings into sections with URLs, and remove the duplicate sidebar items.
4. Apply the rail to the customer page and the other pages with sections. Merge Tickets / My Tickets / My Batches, Maps, and the Plant pages. Fold field-customers into Customers.
5. Rename Billing to Invoicing, and "Ready for billing" to "Ready to invoice" (label and alias only; switch the name lookups to the key).
6. Estimates board (a new page).

## Still open (not blocking)

- Should the Settings service months be derived from the season records? This is a data-ownership question, and it can be decided in slice 3.
- Should `/dashboard/contracts/old` be retired?