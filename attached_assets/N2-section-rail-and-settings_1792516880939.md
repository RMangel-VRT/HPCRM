# N2: The section rail, and Settings rebuilt on it

> Assumes `00-RULES-N.md` and N1. **Line numbers are from GitHub `a77f060`**; find code by its content. **No schema change.**
>
> What bites hardest here:
> - Settings stores its tab in the URL with `replace: true` and reads it only once (`getDefaultTab` in `useState`). Once the rail uses real links, the page has to follow the URL on every render.
> - Three Settings tabs are only stub cards linking to standalone routes. The rail must link to the real pages.

## 1. Tokens

Add these to `index.css` `:root` and the dark block. They are HSL triplets like the existing tokens.

| Token | Light | Dark |
|---|---|---|
| `--rail` | `80 20% 98%` | `150 8% 11%` |
| `--rail-border` | `80 8% 89%` | `150 5% 18%` |
| `--rail-foreground` | `80 5% 23%` | `150 5% 85%` |
| `--rail-muted` | `80 5% 36%` | `150 6% 62%` |
| `--rail-hover` | `80 12% 92%` | `150 6% 16%` |
| `--rail-active` | `80 35% 87%` | `80 30% 22%` |
| `--rail-active-foreground` | `80 5% 15%` | `80 20% 92%` |
| `--rail-active-icon` | `80 61% 30%` | `80 55% 60%` |

Expose them in `tailwind.config.ts` as `rail.DEFAULT`, `rail.border`, `rail.foreground`, `rail.muted`, `rail.hover`, `rail.active`, `rail.active-foreground` and `rail.active-icon`.

**Contrast check:**
- `--rail-muted` section labels on `--rail` must pass 4.5:1 in both themes.
- `--rail-active-foreground` on `--rail-active` must pass too.
- Adjust lightness only if one fails, and report the final values.

## 2. `components/nav/SectionRail.tsx`

```ts
type RailItem = { key: string; label: string; href: string; badge?: number; testId?: string };
type RailSection = { label?: string; items: RailItem[] };   // empty sections are dropped
export function SectionRail(props: { title: string; sections: RailSection[]; activeKey: string; ariaLabel: string }): JSX.Element;
export function SectionRailLayout(props: { rail: React.ReactNode; children: React.ReactNode }): JSX.Element;
```

**Look:** copy the model.
- A 236px column on `bg-rail` with a right border in `rail-border`.
- The title is 20px bold.
- Section labels are 10.5px, uppercase, `tracking-wide`, `text-rail-muted`.
- Items are 34px-tall rows with rounded corners (6px). Hover uses `bg-rail-hover`. The active item uses `bg-rail-active text-rail-active-foreground font-semibold`. A badge sits right-aligned as a small pill.

**Behavior:**
- Every item is a wouter `<Link>` (a real `<a href>`). Navigation pushes history, so Back works.
- The active item has `aria-current="page"`.
- The whole thing is a `<nav aria-label={ariaLabel}>`.
- `testId` defaults to `rail-<key>`.

**Under 768px:** the rail becomes one horizontally scrolling row of pills above the content (the same active colors, no section labels). `SectionRailLayout` handles the switch.

**Layout:** `SectionRailLayout` is a flex row: rail, then content (`flex-1 min-w-0`). Remove the main area's `p-6 md:p-8` padding around the rail itself, and keep it inside the content area. Follow how `App.tsx` ~L424 already skips padding for `isCustomerDetail`: add an `isRailPage` check, or let the layout add negative margins. Pick one and say which.

**Tests:**
- The active item gets `aria-current`.
- Empty sections are dropped.
- Clicking an item navigates.
- Under 768px the layout renders the pill row.

## 3. Settings on the rail

### 3a. The sections

| Section (en / es) | Item (en / es) | href | Visible to |
|---|---|---|---|
| Company / Empresa | Company profile / Perfil de la empresa | `/dashboard/settings/company` | admin |
| | Seasons / Temporadas | `/dashboard/settings/seasons` | admin |
| | Benchmarks / Referencias | `/dashboard/settings/benchmarks` | admin |
| | Crews / Cuadrillas | `/dashboard/settings/crews` | admin |
| | Property managers / Administradores de propiedades | `/dashboard/settings/property-management` | admin, office |
| Services & catalog / Servicios y catálogo | Service plans / Planes de servicio | `/dashboard/settings/service-plans` | admin |
| | Work item templates / Plantillas de trabajo | `/dashboard/settings/work-item-templates` | admin |
| | Chemical products / Productos químicos | `/dashboard/settings/chemical-products` | admin |
| | Contract defaults / Valores de contrato | `/dashboard/settings/contracts` | admin |
| Communication / Comunicación | Email templates / Plantillas de correo | `/dashboard/settings/email-templates` | admin |
| | Notification templates / Plantillas de notificación | `/dashboard/settings/notification-templates` (the standalone `ChemicalNotificationTemplates` route) | admin |
| | Shared mailboxes / Buzones compartidos | `/dashboard/settings/shared-mailboxes` (the standalone `SharedMailboxesAndOversightPage` route) | admin |
| Integrations / Integraciones | QuickBooks billing / Facturación de QuickBooks | `/dashboard/settings/billing` | admin |
| | QuickBooks customer mapping / Vinculación de clientes de QuickBooks | `/dashboard/settings/qbo-customers` (the standalone `QboCustomerMapping` route; no link anywhere today) | admin |
| System / Sistema | Feature flags / Funciones | `/dashboard/settings/features` | admin |
| | Database / Base de datos | `/dashboard/settings/database` | admin |

Put this table in one exported `SETTINGS_SECTIONS` constant (`components/nav/settingsNav.ts`), plus a `settingsRailFor(user)` helper. Every page below uses that helper.

### 3b. `pages/SettingsPage.tsx`

- **Replace `<TabsList>`** (~L617–655) with `SectionRailLayout` + `SectionRail title={t("settings.title")}`.
- **Derive the active tab from the URL on every render.** Use the `location` you already have and the same `validTabs` / default logic. Drop the `useState` and `handleTabChange`.
- **The contracts admin guard (~L104) stays as it is.**
- Keep each `TabsContent` body as it is. Either keep `<Tabs value={activeTab}>` with no `TabsList`, or switch to plain conditional rendering. Don't change any section's internals.
- **Remove** the `notification-templates` and `shared-mailboxes` stub tabs (the "Open Notification Templates" card ~L1395 and its twin) and their `validTabs` entries. Their URLs already route to the real pages, because those routes are registered before `/dashboard/settings/:tab`.
- **Office users** land on `property-management`, as today. Their rail shows only Company › Property managers.

### 3c. The standalone settings pages share the rail

Wrap `ChemicalNotificationTemplates`, `SharedMailboxesAndOversightPage` and `QboCustomerMapping` in the same `SectionRailLayout` / `SectionRail`, with the matching item active. Their page content and headers stay as they are.

**My Mailbox stays outside Settings.** It's personal, and it's reached from the profile menu (N1).

### 3d. Seasons in one place

- **Export the list body of `pages/SeasonsPage.tsx`** as `SeasonRecords`: the list, the create action and the links to `/dashboard/seasons/:id`, without the page header.
- **Settings › Seasons** renders two blocks:
  - the existing **Service months** card (mowing and cleanup months, unchanged);
  - then **Season records** / **Registros de temporadas** (`SeasonRecords`).
- Remove N1's stop-gap "Season records →" link.
- **`/dashboard/seasons`** → `<Redirect>` to `/dashboard/settings/seasons`. `/dashboard/seasons/:id` stays; point its back link and breadcrumb to `/dashboard/settings/seasons`.
- **These are two different stores**: company settings months vs. `seasons` rows. This slice only puts them on one page; it doesn't merge the data. That's an open question for Randy.

## 4. Tests

- **`settingsNav.test.ts`:**
  - admin sees every item;
  - office sees only Property managers;
  - every href is a route that allows that role.
- **Settings:**
  - Clicking a rail item changes the URL with a push (Back returns to the previous section).
  - Loading `/dashboard/settings/benchmarks` directly opens Benchmarks.
  - An office user on `/dashboard/settings/contracts` gets the default tab.
- **Redirect:** `/dashboard/seasons` → `/dashboard/settings/seasons`.
- **Update `SettingsPage.qbo.test.ts`** for the rail.

## Report

- Screenshots of Settings as admin and as office.
- Screenshots of one standalone settings page, in light and dark mode, in English and Spanish.
- The 390px pill-row view.
- The final rail token values and their contrast ratios.
