# N3 — Section rails across work pages

## Scope

Reused the merged N1 shell and N2 rail components. Changes are limited to the existing CRM. No route permissions, API business logic, DDL, migrations, native-app code, mobile authentication, or production data were changed. Nothing was published.

The uploaded N3 slice and shared rules control the implementation; the local clickable model was inspected for the shared multi-view/single-view behavior.

## Implementation

- **Work-page families:** `workNav.ts` declares role-filtered destinations and exact list-page matches. `WorkPageLayout` applies the shared rail at the shell boundary, so every loading/empty/success state gets the same navigation without rewriting the existing work pages. Single-view families omit the rail. Campaign and ticket details are excluded; plant-palette detail deliberately retains Palettes.
- **Tickets:** Mine, Batches, All use the existing permissions. The regular sidebar has one `tickets` key, landing on Mine and active across Mine/Batches/All/detail. Landscape supervisors keep “My Work.” Existing My Tickets tabs, the invoice query landing, the with-billing line, and landscape-supervisor internal tabs were not rewritten. Billing-tagged mapping users retain their authorized Mine link; ordinary mapping users do not acquire ticket access. The separate Platform Admin branch is unchanged.
- **Maps:** one `maps` sidebar key chooses the first route the role can actually open. Office, mapping, and field users have Property maps only; shop managers have Route map only; admin and eligible managers have both. Mapping keeps Customer Maps. Route map no longer also marks Customers active. Both map pages receive a constrained full-height layout with a separately scrollable rail/content pane. Property maps are contained within that pane, rather than a viewport-fixed overlay hiding navigation. Mapbox observes its container and resizes; Leaflet retains its existing size observer.
- **Campaigns:** Campaigns and Service checklists lists share the role-filtered rail. The temporary header link is removed. Campaign and campaign-item details have no rail.
- **Plants:** Library, Matches, Palettes share the Plant Library rail. Palettes stays active on draft detail. The existing single top-bar Plant Library entry remains.
- **Inbox:** replaced the secondary tab row with the shared rail and translated Inbox/Unsorted/Sent/All communications labels. Counts remain badges. All remains admin/office-only. Navigation reuses the shell’s existing `q`/`from`/`to`/`viewAs` URL contract for its `search`/`fromDate`/`toDate`/`viewAs` state. Entry/fallback redirects preserve query strings. Last-section storage/events and the sidebar unsorted badge remain; only nested Inbox sidebar items are removed.
- **Flags:** the status select is replaced by the five existing taxonomy statuses plus All, with the exact supplied Spanish labels. Status comes from the URL on every render, so missing/invalid status means New, and All omits the API status filter. Rail links preserve unrelated query values. New uses the independent unread-count query, not the currently filtered result count. Tag/crew/property/date filtering remains intact; flag detail has no rail.
- **Customer rail:** colors only, including the transition phantom. Existing section/role rules, collapse, badges, customer switcher, CustomersViewSwitcher, and left-border active identity are retained. Its background/active/hover/border/text now use the existing N2 rail tokens. The dark main sidebar keeps its boundary border instead of suppressing it beside the light rail.

All added labels exist in both locale files. No component hex colors were added.

## Baseline-relative automated checks

Baseline was recorded before source edits, after `pnpm run typecheck:libs` refreshed workspace declarations.

| Check | Baseline | Final |
|---|---|---|
| Workspace declaration refresh | Passed | Same refreshed declarations used |
| CRM `run typecheck` | 221 existing diagnostics, exit 2 | 221 diagnostics, exit 2; zero added/removed messages |
| Focused Vitest and requested regressions | 9 files, 101 tests passed | 13 files, 178 tests passed |

Baseline typecheck diagnostics are existing project errors, not a clean typecheck. Comparisons normalize source line/column positions but retain file names, diagnostic codes and full diagnostic text.

Focused coverage includes exact per-role sidebar keys and permitted destinations, consolidated active states, role-specific work-rail contents, single-view hiding, all work-route active items, palette detail, excluded details, map sizing classes, exact translations, communications role/count/query behavior, saved communications destinations, and Flags API/query defaults.

Existing BillingAccess, ContractCenter board, CustomerContracts, TicketDetail visits, and Settings QBO regressions are included. The shared rail’s existing live 390px/desktop resize test remains included.

Logs and the genuine pre-edit UI build are stored under ignored `generated-artifacts/n3/`. The build was saved before edits so customer before/after captures can use the same development data without reconstructing the old UI.

## Browser evidence and final verification

The documented demo account was absent in this task fork. Verification therefore used an isolated temporary development company with canonical disposable admin/field-manager accounts, a property, KML layer, draft palette and one flag per status. No existing account or password was changed. No production data was accessed or written.

One authenticated browser pass, resumed after its initial sign-in blocker, exercised every requested rail page. Screenshot evidence is stored by browser observation ID, **not** as image files; the capture service did not expose file export. The full observations are in ignored `generated-artifacts/n3/browser-report.md`.

### Customer before/after

Both pairs use the same temporary property, Detail view, and 1440×1000 viewport. The saved pre-edit build supplies the genuine before state.

| State | Before | After |
|---|---|---|
| Light | `9uzpau` | `dcg2f1` |
| Dark | `q2a85v` | `o8vg93` |
| Collapsed icon rail | `081nku` | `qxaovv` |

Expanded customer rail width remains 200px, collapsed width remains 48px. The global sidebar occupies x=8..256 with 248px width when expanded; the customer rail begins at x=256. Sections, badges, view switcher and active left-border identity remained present. The light rail now visibly contrasts with the dark main sidebar, with a retained boundary border; dark mode uses the dark rail token set. One initially returned dark screenshot (`22vu6q`) caught the sidebar mid-animation and is not used as the settled before/after comparison.

### Admin screenshot inventory

| Rail page / state | Screenshot ID |
|---|---|
| Tickets → Mine | `cy94v4` |
| Tickets → Batches | `ixum2s` |
| Tickets → All | `3st66f` |
| Maps → Property maps list | `4c672a` |
| Maps → selected property, real aerial tiles/KML polygon | `dhpf5p` |
| Maps → Route map | `gaekmj` |
| Route map at 1024px | `kgfnej` |
| Campaigns | `vgnotg` |
| Service checklists | `0khud2` |
| Plant Library → Library | `gfjcgp` |
| Plant Library → Matches | `hvnyxz` |
| Plant Library → Palettes | `zzc33h` |
| Palette draft detail | `632rf7` |
| Inbox, with search/date/viewAs filters | `sctaea` |
| Sent, reached by rail with all filters retained | `ytma9x` |
| Unsorted | `q8s0m7` |
| All communications | `9ye367` |
| Flags → default New / explicit New | `ohegbg` / `cj2aca` |
| Flags → Acknowledged | `a6mv4n` |
| Flags → In progress | `0tgfom` |
| Flags → Resolved | `0qjfqg` |
| Flags → Dismissed | `vkvsy5` |
| Flags → All | `0lgtun` |
| Flag detail, no status rail | `jvwl87` |

### Field-manager and mobile screenshots

These use a real field-manager session, not mocked authentication.

| State | Screenshot ID |
|---|---|
| Mine, Spanish Míos/Lotes, no All | `rr5l0i` (settled `8lwj2g`) |
| Batches, Spanish Lotes active | `tvgogx` |
| Property maps list, Spanish rail | `qjxa81` |
| Selected property, real aerial/KML map | `92ht41` |
| Route map, Spanish rail | `f3wicr` / `8efmaw` |
| Inbox at 390×844, English | `buudx5` |
| Inbox at 390×844, Spanish | `s7vo6a` |
| Inbox restored to desktop | `4vekm4` |

At 390px, body/document width was 390px. The Inbox pill row independently scrolled (`scrollWidth=467`, `clientWidth=390`, `overflow-x:auto`) without whole-page horizontal overflow. Desktop→mobile→desktop responded live. The new rail labels translated correctly; existing toolbar/mailbox/empty-state copy remains partly English and was not rewritten by this slice.

### Requests, map sizing, and limitations

- Inbox→Sent via the actual rail retained `q=a%26b`, both date values and `viewAs`, in the URL and controls. Sidebar re-entry reopened Sent as intended. It did not retain those filters after leaving the communications family; that is existing behavior, not a requirement added by this slice (only the last section is remembered).
- Flags Resolved requested `/api/flags?status=resolved&limit=100`; All requested `/api/flags?limit=100`. Missing status selected New; New’s unread badge stayed 1 while other filters were active. Tag filtering remained available. Browser Back/refresh retained the status behavior.
- Both admin and field-manager Route map containers measured **948×878px at 1440×1000**, **532×878px at 1024×1000**, then **948×878px** after restoration. The rail/content boundary remained independent and the real Property Maps rendered without covering the rail.
- **WebGL limitation:** this browser showed Route map’s explicit WebGL-required fallback, so actual Mapbox canvas rendering/resizing was not verified. Nonzero container height and live width resizing were verified for both roles, and the implementation invokes Mapbox resize through a container observer. Leaflet Property Maps rendered real tiles and the KML polygon successfully.
- A browser check accidentally used `/dashboard/tickets?tab=invoice` (All Tickets), rather than the specified `/dashboard/tickets/my?tab=invoice`. Dropping that unsupported All Tickets query is **not** an invoice-landing regression. The correct My Tickets invoice landing inside the new rail shell, internal tabs, landscape-supervisor behavior and with-billing line are covered by the passing `BillingHandoff.rendered.test.tsx` regression suite.
- Ticket/campaign detail data was absent in the isolated fixture. Exact route-matcher tests verify those detail boundaries; flag detail was additionally checked in the browser. No ticket or campaign mutation was performed.
- Two unidentified 403 resource responses occurred on the first field-manager Mine visit; the expected empty page rendered and refresh succeeded. No corresponding navigation denial was observed. Existing password-autocomplete and development resource warnings are not claimed as new navigation failures.

The browser's raw initial “failure” classification included the two out-of-scope/wrong-route checks clarified above. No application change was made to “fix” either by expanding scope.

The focused screenshot correction passed: `o8vg93` was captured after the dark customer page settled at sidebar x=8/width=248 and customer rail x=256/width=200, with Overview active. The tester appended the two scope corrections to its raw report without repeating the page-family pass.

**Cleanup:** the isolated company, both test users/memberships, property, palette, five flags and map layer were deleted. A read-only count check confirmed all seven fixture categories were zero afterward. Temporary verification files/builds remain ignored and are not application/deployment assets. No existing records were changed.

## Changed files

Paths below are relative to `artifacts/highplains-crm/`:

- `src/App.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/LayerMapViewer.tsx`
- `src/components/customer/CustomerSubNav.tsx`
- `src/components/nav/SectionRail.tsx`
- `src/components/nav/navConfig.ts`, `navConfig.test.ts`
- `src/components/nav/workNav.ts`, `WorkPageLayout.tsx`, `WorkPageLayout.test.tsx`
- `src/lib/flag-navigation.ts`
- `src/pages/CampaignsList.tsx`, `CustomerRouteMap.tsx`, `PropertyMapsPage.tsx`
- `src/pages/CommunicationsCenter.tsx`
- `src/pages/communications/CommunicationsSecondaryNav.tsx`, `CommunicationsSecondaryNav.test.tsx`
- `src/pages/FlagsInboxPage.tsx`, `FlagsInboxPage.navigation.test.tsx`
- `src/pages/BillingHandoff.rendered.test.tsx`
- `src/i18n/locales/en.ts`, `es.ts`
- This report lives at `docs/navigation/N3-implementation-report.md`.
- The existing authentication-fixture memory records the development-fixture isolation lesson, without credentials or identifiers.

## Follow-up scope

The already-queued N4 slice covers invoicing labels and the guarded status rename. Separate optional follow-ups cover verifying the Mapbox canvas in a WebGL-capable browser and retaining Inbox filters on sidebar re-entry (beyond the existing last-section behavior). No overlapping rename, native-app expansion, scheduling redesign, or customer-directory changes were added here.
