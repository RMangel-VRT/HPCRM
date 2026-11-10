# N1 desktop navigation implementation report

Date: October 20, 2026. Scope: existing CRM and API Server only.

## Delivered

- All authenticated web roles share the sidebar shell. The existing role-specific dashboard branch and field/shop widgets remain; only the field navigation grid and phone-only bottom padding were removed.
- Exported data-driven navigation provides exact ordered keys for ten roles and super admin, independent of translated labels. It retains all four live badges, last-viewed Customers resolution, remembered Inbox tab/sub-tabs, customer-detail styling, link guards, prefix activation and exact Dashboard activation.
- Billing sidebar visibility still uses `showBillingSidebar`, independently of billing authorization and billing-tagged landing.
- Crew supervisors land on My Tickets. Only the two specified client access predicates were extended. Server protection covers the actual web details and PATCH handlers, the related-ticket collection, and the entire ticket-specific web subtree. Another person's ticket is denied even for a billing-tagged crew supervisor; cross-company detail remains unavailable. All other roles and the separate native API retain their existing authorization.
- Admin/office Tools and New menus link to existing destinations. Task expands in place. Supported `workType` parameters follow the existing card-selection path once after ticket types and any requested customer load. Invalid values are ignored, customer selection is preserved, and ticket-form terminology remains Billable.
- The upward profile menu preserves mailbox, language persistence, theme, unchanged Help dialog and logout. Notifications is present only where the existing route permits access (not crew supervisor or mapping), preserving route restrictions.
- Service Checklists and all its helpers were extracted byte-for-byte unchanged into a protected standalone page before the campaign-detail routes. Campaigns exposes its temporary link to the same roles.
- Operations redirects to Campaigns with the original raw query string. Existing scheduler and mailbox-account aliases also preserve queries, including encoded delimiters.
- Settings › Seasons contains the temporary Season records link. All other routes, including Tools, Seasons and Billing, remain. Only unavailable Tools cards and the confirmed-unused old Operations pages were removed.
- Supplied English/Spanish menu copy and stable selectors are implemented. No schema changes, mobile changes, new section rails, placeholders, command search, publishing or production writes.

## Seasonal timestamp discrepancy

The supplied example labels `2026-11-01T06:30:00Z` as October 31 in Colorado. That is incorrect: Denver remains on daylight time (UTC−6) until 08:00 UTC that morning.

The implementation follows the explicitly required `localDateString(now)` client helper and actual `America/Denver` dates:

| Injected UTC time | Colorado local time | Snow order |
|---|---|---|
| 2026-11-01 05:30 | October 31, 23:30 MDT | Last |
| 2026-11-01 06:30 | November 1, 00:30 MDT | First |
| 2026-11-01 07:30 | November 1, 01:30 MDT | First |

All three cases are tested under both UTC and America/Denver process timezones. No fixed-offset workaround was introduced.

## Changed files

CRM:

- `src/App.tsx`: unified shell, topbar menus, narrow ticket predicates, checklist route and query-preserving aliases.
- `src/components/AppSidebar.tsx`: config-driven sidebar and upward profile menu.
- `src/components/nav/navConfig.ts`: exported definitions, role predicates, badges, seasonal ordering and resolved navigation.
- `src/components/nav/TopbarMenus.tsx`: Tools and New menus.
- `src/components/nav/QueryPreservingRedirect.tsx`: raw-query-preserving redirect helper.
- `src/lib/landing.tsx`: authorized login/default landings, retaining billing priority.
- `src/pages/NewTicket.tsx`: once-only supported work-type preselection.
- `src/pages/TicketDetail.tsx`: crew supervisor breadcrumb returns to the permitted My Tickets route rather than the office-only Tickets list; unauthorized Customer links are hidden for this newly enabled role.
- `src/pages/ServiceChecklistsPage.tsx`: unchanged checklist extraction and translated wrapper.
- `src/pages/CampaignsList.tsx`, `SettingsPage.tsx`, `ToolsPage.tsx`, `FieldHomeDashboard.tsx`: temporary links, removal of unavailable cards and old navigation-only UI.
- `src/i18n/locales/en.ts`, `es.ts`: supplied navigation/menu translations.
- Deleted `FieldAppLayout.tsx`, `AccountSidePanel.tsx`, `GlobalOperationsPage.tsx`, `OperationsPage.tsx` after checking their import sites.

Tests:

- `src/components/nav/navConfig.test.ts`
- `src/components/nav/routes.regression.test.tsx`
- `src/pages/NewTicket.preselection.test.tsx`
- `src/components/BillingAccess.regression.test.tsx`
- `src/lib/landing.regression.test.tsx`

API:

- `src/routes/routes.ts`: crew-supervisor assigned-ticket checks on base GET, actual details GET, transactional PATCH, scoped collection and linked-ticket response.
- `src/lib/crewSupervisorTicketAccess.ts`: crew-only ticket-subtree boundary registered after authentication and before ticket sub-routers. Existing collection actions retain their own guards.
- `src/lib/ticketLinkSummary.ts`: optional assignee scope filters both list roots and invoice/parent counterpart identities without changing the unscoped behavior or bulk query budget.
- `src/routes/billingDetail.test.ts`: own/other/billing-tagged/foreign-company cases using the actual extracted handler.
- `src/routes/crewSupervisorDetails.test.ts`: actual details handler and related-ticket collection regressions.
- `src/routes/crewSupervisorRelations.test.ts`: linked payload, forged link creation and outside-subtree deletion regressions using actual handlers.
- `src/lib/ticketLinkSummary.test.ts`: both summary directions, self/other/unassigned/foreign counterparts and root filtering.
- `src/routes/taskBilling.test.ts`: actual PATCH own/other/billing-tagged/foreign-company regressions.
- `src/lib/crewSupervisorTicketAccess.test.ts`: all ticket-subtree methods/data paths, tenant boundary, billing bypass prevention, native-path separation and unchanged other-role behavior.
- `src/shared/taskWebClient.test.ts`: replace the retired imperative sidebar-source assertion with the exported config assertion.

The requested ContractCenter, CustomerContracts, TicketDetail visits and Settings QBO regressions were inspected for old title-derived navigation selectors. None contained affected sidebar selectors. BillingAccess contained the affected `link-billing` selectors; these now use `nav-billing`. A repository search found no remaining old title-derived sidebar selectors in tests.

## Baseline-relative verification

Workspace declarations were refreshed with `pnpm run typecheck:libs` before recording baselines or editing. It passed.

| Check | Clean baseline | After implementation |
|---|---|---|
| CRM `run typecheck` | 221 diagnostics; exit 2 | 221 diagnostics; exit 2; no added/removed diagnostic messages after normalizing line numbers |
| API `run typecheck` | 735 diagnostics; exit 2 | 735 diagnostics; exit 2; no added/removed diagnostic messages after normalizing line numbers |
| CRM full Vitest | 32 files passed, 3 failed; 250 tests passed, 8 failed | 35 files passed, 3 failed; 301 tests passed, 8 failed |
| API full Vitest | 66 files passed, 2 failed, 7 skipped; 1356 tests passed, 7 failed, 31 skipped | 69 files passed, 2 failed, 7 skipped; 1430 tests passed, 7 failed, 31 skipped |
| API security focused regression run | — | 5 files, 191 tests passed; the subsequent full run additionally includes two related-ticket collection cases |
| CRM focused final regression run | — | 5 files, 60 tests passed, including crew breadcrumb, role matrix, redirects, billing, landings and work-type preselection |
| Nav config, `TZ=UTC` | — | 32 tests passed |
| Nav config, `TZ=America/Denver` | — | 32 tests passed |

A stale `taskWebClient` source assertion found during the first post-change run searched the removed imperative sidebar implementation. It was updated; the final full API run has exactly the baseline failures.

The crew breadcrumb/customer-link boundary was also confirmed in a final eight-test client route regression run after the security correction.

Baseline failures, not introduced by this slice:

- CRM: two CrewAssignmentBoard selection/pruning cases; five useTabParam cases requiring browser `window` in the node environment; one rateCardUtils grouping/count case.
- API: one plantEnrichment partial-sync assertion; six mailboxAccounts OAuth reconnect cases whose test imports require a missing standalone-test `DATABASE_URL`.
- Existing typecheck diagnostics span the shared schema/stub and existing client/server files. There are no new diagnostics from this slice.

Logs are stored outside Git in `generated-artifacts/navigation-n1/`. Checklist extraction was compared directly against the pre-edit source and found byte-identical. `git diff --check` passes. Both managed workflows were restarted after the implementation batch; API and Vite started successfully. Existing PostCSS and PostgreSQL SSL warnings remain.

## Ticket endpoint security correction

The completion check identified that the page requests `/api/tickets/:id/details`, not just the base ticket GET, and mutates through PATCH. The server scope was therefore extended beyond the literal base-GET example in the slice, but only for crew supervisors:

- Details rejects other assignees before loading comments, fields, or linked data.
- PATCH repeats the self-assignment check inside its existing ticket transaction, before the billing-status exception or any mutation. Billing tags do not bypass this restriction.
- A crew-only, company-scoped middleware boundary protects every ticket-specific web child endpoint, including comments, field values, links, photo URLs, mobile-photo/note mirrors, work items, worksheets, proposals and owner-response actions. Downstream role checks remain in place; passing this boundary does not grant a previously denied permission.
- The related-ticket collection forces the caller's own assignment even if the query supplies another assignee. The details payload does not expose clickable linked tickets assigned to someone else.
- The separate links endpoint checks the assigned parent and each counterpart's company and assignee, dropping inaccessible link identities entirely. Invoice/parent summaries on My Tickets, the ticket collection and customer-ticket lists receive the same crew-only assignee scope; both directions are filtered.
- Crew supervisors are explicitly denied administrative link creation and link/comment deletion. This rejects caller-supplied source/target IDs before creating a link and also closes deletion endpoints outside the ticket-prefix guard. Admin/office behavior remains unchanged.
- Actual details and PATCH handler regressions exercise positive, negative, billing-tagged and cross-company cases independently of the outer middleware. Separate middleware tests cover nested reads/writes and confirm all other roles and `/api/m` paths are untouched.
- Non-ticket-prefix dependencies used by the page were checked: contacts/emails/proposal creation are office-only UI paths; visit actions already have scheduling authorization; separate native-photo/note handlers retain their existing guards. No global field/mobile role list was changed.

Both sets of completion-check security findings were addressed: the actual detail/update/subtree boundary, then the separate linked payloads/list summaries and outside-subtree writes. Regression tests cover an assigned parent linked to a different owner's ticket, unassigned/foreign counterparts, forged source/target IDs, both deletion endpoints, and unchanged office/admin access. The final full API suite includes all these cases and has only the original baseline failures.

## Authenticated screenshots and interaction verification

The authenticated verification pass succeeded using one disposable development account with a lowercase email. Actual `/api/auth/me` responses confirmed every role/tag switch; authentication and role responses were not mocked. The documented existing-admin test login was rejected; no existing password was reset. An initially mixed-case disposable identifier exposed an existing account-creation/sign-in normalization mismatch; correcting the fixture allowed the same verification journey to proceed.

The disposable user and its exact membership were both verified absent after cleanup. No business records were created. Screenshot evidence is retained by the browser evidence interface under the IDs below; that interface did not expose a supported export to workspace image files.

### Required sidebar screenshots

Desktop: 1440 × 1100. Mobile: 390 × 844.

| Role/state | Screenshot ID |
|---|---|
| Admin | `63phuk` |
| Office, untagged | `hjy1qt` |
| Office, billing-tagged | `nn0xnv` |
| Field manager | `89b36u` |
| Chemical manager | `wpzs4z` |
| Irrigation manager | `cl6961` |
| Shop manager | `dmvmq1` |
| Landscape supervisor | `k3wlcv` |
| Crew supervisor, My Tickets landing | `7sq8l5` |
| Field | `kieyum` |
| Mapping | `xh3xa7` |
| Field manager, 390px, drawer open | `tw5zbb` |

The actual sidebar key sets matched the matrix. Billing is present for admin and untagged office, and absent for billing-tagged office and the other roles. Retired sidebar entries are absent. The 288px-wide off-canvas drawer is readable at 390px; field dashboard widgets remain behind it.

### Required menu screenshots

| Menu | English | Spanish |
|---|---|---|
| Tools | `6bj4lp` | `ogn72g` |
| New | `1uyohk` | `0zrgua` |
| Profile, opening upward | `2rtbsu` | `50ccv6` |

Expanded Task choices are additionally captured in `j91fop`. The EN/ES language toggle updated live and remained Spanish after reload; it was restored to English afterward. Dark theme/profile: `2dj4gi`. Existing Help dialog: `be7uo8`. Logout and final signed-out state: `9df5g7`, `9w62gk`.

### Destination/action evidence

- All four Tools destinations rendered: Proposal Maker `8nio50`, Visual Scope `i7vti8`, Crew Worksheets `4an1tj`, Plant Library `7vt8i3`.
- Estimate request reached the preselected customer-selection step (`55joi6`). Contract opened a blank wizard (`zgonb2`); More opened the existing type chooser (`nuoxqd`). No forms were submitted.
- Operations preserved `tab=services&customerId=test` on Campaigns (`kjqvqc`).
- The Campaigns Service checklists link opened `/dashboard/campaigns/checklists`, not the dynamic campaign-detail route.
- Settings Seasons link (`jm3jh4`) opened the existing Seasons route (`af8lng`).

Observed existing-page limitations: some role dashboards displayed temporary loading panels and 403/404 resource responses from unchanged dashboard data requests; some existing Spanish ticket-type descriptions/status labels remained English. This slice deliberately preserves dashboard widgets, route permissions and ticket-type copy outside its specified changes.
