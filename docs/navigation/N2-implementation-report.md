# N2 — Section rail and Settings

## Scope and layout

- Reused the merged N1 desktop shell. Work is limited to the CRM; no API business logic, DDL, migrations, native-app code, mobile authentication, publication, or production writes changed.
- Added the exported `RailItem`, `RailSection`, `SectionRail` and `SectionRailLayout` interfaces. Every item is a real Wouter anchor with push navigation, stable default `rail-<key>` test ID, optional badge and active `aria-current="page"`. Empty groups are omitted.
- Desktop rail: 236px wide, 20px bold title, 10.5px uppercase section labels, 34px rows, 6px row radius. Long labels retain their complete accessible names and desktop title tooltips.
- Below 768px the rail becomes a single horizontally scrollable pill row without group labels. It responds to viewport changes.
- **Shell approach:** `isRailPage` removes `main`'s outer padding on Settings destinations. `SectionRailLayout` owns `p-6 md:p-8` on its `flex-1 min-w-0` content pane, not around the rail. My Mailbox is explicitly excluded.

## Settings and permissions

`SETTINGS_SECTIONS` is the single ordered destination table. `settingsRailFor(user)` filters by role and translates labels on each render:

| Group | Key / URL suffix | Admin | Office |
|---|---|---|---|
| Company | company | yes | — |
| Company | seasons | yes | — |
| Company | benchmarks | yes | — |
| Company | crews | yes | — |
| Company | property-management | yes | yes |
| Services & catalog | service-plans | yes | — |
| Services & catalog | work-item-templates | yes | — |
| Services & catalog | chemical-products | yes | — |
| Services & catalog | contracts | yes | — |
| Communication | email-templates | yes | — |
| Communication | notification-templates | yes | — |
| Communication | shared-mailboxes | yes | — |
| Integrations | billing | yes | — |
| Integrations | qbo-customers | yes | — |
| System | features | yes | — |
| System | database | yes | — |

All URLs retain `/dashboard/settings/`. The supplied English and Spanish labels are in both locale files; stable keys, URLs and test IDs are not translated.

- Section selection is derived from the current URL on every render, rather than initial state. Rail clicks push history. Admin default: Company; office default: Property managers. Office direct links to Contracts fall back to Property managers. The existing contracts admin guard remains.
- All section bodies, forms, mutation handlers and data ownership remain intact. The existing OAuth callback's query cleanup still uses replacement navigation; rail selection does not.
- Removed the notification-template stub tab and standalone destinations from valid inline sections. There was no shared-mailbox stub body in the merged starting version; its tab trigger and inline-valid entry were removed.
- Chemical notification templates, Shared Mailboxes & Oversight, and QBO customer mapping wrap their original content in the same rail, with their matching active keys.
- My Mailbox remains personal, reachable from the profile menu and outside the rail.
- Existing route permissions and Platform Admin behavior are unchanged. In particular, office users retain authorized direct access to QBO mapping and shared mailboxes, although those links are deliberately absent from their Settings rail.
- QBO controls were not reorganized: the existing billing settings body remains under Billing; the existing connection controls remain under Feature flags.

## Seasons

- The unchanged service-month form appears first under **Service months / Meses de servicio**.
- **Season records / Registros de temporadas** follows, rendering the extracted `SeasonRecords` list, existing create/edit/delete controls and detail destinations. Season names now also have keyboard-accessible real detail anchors.
- Removed the temporary Season records arrow link and its unused locale entries.
- The protected old list route redirects to `/dashboard/settings/seasons` using the existing raw-query-preserving redirect. Encoded delimiters are preserved.
- `/dashboard/seasons/:id` and its permissions remain unchanged. Its back control and Seasons breadcrumb now return to Settings Seasons.
- Company service months and season records are still separate stores. No derivation or consolidation was introduced.

## Final rail tokens and contrast

The supplied values pass WCAG 4.5:1 for both required text pairs. **No lightness adjustment was necessary.** All eight tokens are defined in both themes and exposed in Tailwind under `rail`.

| CSS token | Light HSL | Dark HSL |
|---|---|---|
| `--rail` | `80 20% 98%` | `150 8% 11%` |
| `--rail-border` | `80 8% 89%` | `150 5% 18%` |
| `--rail-foreground` | `80 5% 23%` | `150 5% 85%` |
| `--rail-muted` | `80 5% 36%` | `150 6% 62%` |
| `--rail-hover` | `80 12% 92%` | `150 6% 16%` |
| `--rail-active` | `80 35% 87%` | `80 30% 22%` |
| `--rail-active-foreground` | `80 5% 15%` | `80 20% 92%` |
| `--rail-active-icon` | `80 61% 30%` | `80 55% 60%` |

| Pair | Light ratio | Dark ratio |
|---|---|---|
| `rail-muted` on `rail` | **6.1400:1** | **6.5168:1** |
| `rail-active-foreground` on `rail-active` | **11.8980:1** | **8.2530:1** |

Ratios use sRGB relative luminance converted from the actual CSS HSL triplets, without rounding intermediate RGB values.

## Validation

Captured before editing, after refreshing declarations:

- `pnpm run typecheck:libs`: passed.
- `pnpm --filter @workspace/highplains-crm run typecheck`: **221 existing diagnostics**.
- Selected baseline Vitest suite: **4 files, 46 tests passed** (existing navigation, QBO and billing-access regressions).

Final focused command:

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  src/components/nav \
  src/pages/SettingsPage.qbo.test.ts \
  src/pages/SettingsPage.navigation.test.tsx \
  src/components/BillingAccess.regression.test.tsx
```

Result: **7 files, 69 tests passed**. Coverage includes:

- real anchors, accessible nav name, current-page state, empty sections, badges/test IDs;
- push history and same-mounted-page Back/Forward, direct Benchmarks URL and defaults;
- narrow pill rendering and desktop resize behavior;
- exact ordered admin/office destinations and both supplied language tables;
- route permission preservation, Platform Admin visibility, office contracts fallback;
- independent season records and service-month controls, create-dialog opening, detail anchors;
- query-preserving old Seasons redirects and updated detail back/breadcrumb destinations;
- QuickBooks rail links, existing billing/connection controls and parsed OAuth-connect response.

Final CRM typecheck: **221 diagnostics, zero additions and zero removals** when compared by file, diagnostic code and message, ignoring shifted line numbers. Existing diagnostics are not claimed as fixed.

| Existing diagnostic file | Count |
|---|---|
| shared/schema.ts | 155 |
| pages/ProposalDraft.tsx | 26 |
| pages/CustomerDetail.tsx | 9 |
| components/ScheduleSummary.tsx | 6 |
| pages/TicketDetail.tsx | 5 |
| components/ServicePlanTemplatesAdmin.tsx | 3 |
| pages/VisualScopeEditor.tsx | 3 |
| App.tsx | 2 |
| components/customer/communications/UnsortedTab.tsx | 2 |
| pages/CrewWorksheetPrint.tsx | 2 |
| pages/ProposalVersion.tsx | 2 |
| pages/SettingsPage.tsx | 2 |
| components/LoadingScreen.tsx | 1 |
| components/ServiceFulfillmentPanel.tsx | 1 |
| pages/CustomerRouteMap.tsx | 1 |
| pages/communications/InboxTab.tsx | 1 |

Raw baseline and final checks are retained in ignored `generated-artifacts/n2/`. `git diff --check` passed. Both managed web/API workflows started successfully; the web workflow has the existing PostCSS `from` warning, and the API has the existing PostgreSQL SSL compatibility warning.

## Authenticated browser evidence

Verification used a disposable lowercase-email development account and real sign-in sessions. Actual `/api/auth/me` responses confirmed admin and office roles; authentication responses were not mocked. Only the fixture's membership role was changed, and no existing account or password was modified.

Confirmed in the signed-in browser:

- Direct Benchmarks load, Company → Benchmarks navigation and Back/Forward restore both the body and current rail item.
- All 16 rail destinations were traversed; the three standalone pages were individually checked after loading for their matching active state.
- The legacy Seasons URL preserved `?year=2026&q=a%26b` exactly. Service months preceded Season records; New Season opened and Cancel closed the dialog without saving.
- The development company had no season records. The create dialog was checked, but detail navigation could not be exercised against an existing record. Vitest covers the actual detail anchors and back/breadcrumb destinations.
- My Mailbox had no Settings rail. Office Settings showed only Company → Property managers.
- A fresh office session at `/dashboard/settings/contracts` showed Property managers and no Contract defaults body. `/dashboard/contracts` correctly remained accessible as the separate Contract Center; an initial test-path misunderstanding was corrected without changing app code.
- Desktop rail and row measurements were exactly 236px and 34px.
- At a 1440px desktop viewport the rail occupied x=256–492 and the content pane began at x=492, flush against it. Its 32px padding put the content title at x=524.
- At 390×844 the pill row had 2,140px of content inside a 390px scrolling viewport. A real horizontal wheel moved it from scrollLeft 0 to 1,300; clicking the initially offscreen Shared mailboxes pill opened the correct page. Document and body stayed 390px wide, with no page-wide horizontal overflow and no group labels.

Screenshots saved under ignored `generated-artifacts/n2/`:

| State | File |
|---|---|
| Admin Settings → Benchmarks, desktop | `admin-settings.png` |
| Office Settings → Property managers, desktop | `office-settings.png` |
| Admin Settings, 390×844 scrolling pill row | `admin-settings-390.png` |
| Standalone notification templates, English/light | `chemical-notification-templates-en-light.png` |
| Standalone notification templates, English/dark | `chemical-notification-templates-en-dark.png` |
| Standalone notification templates, Spanish/light | `chemical-notification-templates-es-light.png` |
| Standalone notification templates, Spanish/dark | `chemical-notification-templates-es-dark.png` |

The Spanish captures show translated shell/rail copy and the standalone page's existing English internals, intentionally unchanged under this slice. The existing document language attribute also stays `en`; this slice does not change the app-wide language infrastructure.

Observed existing/environment states: generic 404 resource responses on dashboard loads, 503 responses in Database and QBO mapping, a generic 403 resource response on the office Settings Contracts fallback (which rendered correctly), the disconnected QBO empty state, the existing New Season dialog description warning, and the login password autocomplete warning. No external QBO/email actions or business records were written.

**Final signed-in verdict: passed.** The fixture was signed out, removed with its membership, and verified absent; its temporary credential file was also removed. The standalone page and mobile screenshots were visually inspected before delivery.

## Changed files

- `src/components/nav/SectionRail.tsx`, `SettingsRailLayout.tsx`, `settingsNav.ts`
- `src/components/nav/SectionRail.test.tsx`, `settingsNav.test.ts`, `routes.regression.test.tsx`
- `src/components/nav/QueryPreservingRedirect.tsx`
- `src/App.tsx`, `src/index.css`, `tailwind.config.ts`
- `src/i18n/locales/en.ts`, `es.ts`
- `src/pages/SettingsPage.tsx`, `SettingsPage.qbo.test.ts`, `SettingsPage.navigation.test.tsx`
- `src/pages/ChemicalNotificationTemplates.tsx`, `SharedMailboxesAndOversightPage.tsx`, `QboCustomerMapping.tsx`
- `src/pages/SeasonsPage.tsx`, `SeasonDetail.tsx`
- This report and the navigation decision memory.

Paths above are relative to `artifacts/highplains-crm/`, except this report and memory.

## Follow-up scope

The already-queued N3 slice covers applying this shared rail to other page families. No overlapping rail rollout or unrelated feature suggestions are added here.
