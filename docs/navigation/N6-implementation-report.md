# N6 — Clearer side-menu headings

## Implementation

- `SectionRail.tsx`: labelled desktop groups use 11px, 700-weight uppercase headings, 0.1em tracking, and `text-rail-heading`. Each heading is an `h3` with a React instance-unique ID referenced by its list's `aria-labelledby`.
- The first visible labelled group has 2px top padding and no top border. Later labelled groups have a 1px rail-border line and 14px top padding. Heading-to-item and group bottom spacing are 6px.
- Unlabelled groups retain their previous appearance without headings, heading associations, or new desktop borders. Empty groups are filtered before rendering.
- Below 768px, the existing pills remain unchanged and headings stay hidden. Thin, non-shrinking vertical lines appear only between visible groups.
- `CustomerSubNav.tsx`: expanded groups match the heading typography and spacing while preserving their existing accessible group labels. Collapsed navigation stays icon-only, with 1px lines only between visible groups. Permission and snow filtering still occur before grouping.
- Item geometry, active styles, badge logic, links, labels, translations, role permissions, keyboard handling, customer switchers, and main page content are unchanged.
- No native mobile, API, schema, or lasting business-data changes. The user authorized isolated temporary development screenshot fixtures; those fixtures and their sessions were removed after capture.

## Secondary-menu audit

Searched CRM navigation containers and independently rendered uppercase/tracked labels. Only `SectionRail` and `CustomerSubNav` render secondary-menu group headings. No additional independent secondary-menu implementation was changed.

Excluded the primary sidebar, dashboard content, notification content headings, and Hardscape Catalog's page-header eyebrow. Hardscape navigation itself uses the shared Estimates rail.

## Contrast

WCAG relative luminance was calculated by converting HSL to sRGB, linearizing each channel, applying the 0.2126/0.7152/0.0722 luminance weights, and taking `(lighter + 0.05) / (darker + 0.05)`.

| Theme | Final `--rail-heading` | Existing `--rail` background | Contrast |
| --- | --- | --- | --- |
| Light | `83 63% 26%` | `80 20% 98%` | **5.83:1** |
| Dark | `80 45% 68%` | `150 8% 11%` | **10.14:1** |

Both supplied colors exceed 4.5:1 without adjustment. The new token is exposed as Tailwind `rail.heading`; every existing rail color is preserved.

## Validation against pre-edit baseline

| Check | Before | After |
| --- | --- | --- |
| `pnpm run typecheck:libs` | Passed; declarations refreshed before CRM baseline | No shared-library changes |
| `pnpm --filter @workspace/highplains-crm run typecheck` | Failed with 221 existing TypeScript diagnostics | Identical output; 221 diagnostics, no additions or changes |
| Requested Vitest suites | 7 files, 53 tests passed | 8 files, 66 tests passed |
| `git diff --check` | Clean | Clean |

Vitest command:

```sh
pnpm --filter @workspace/highplains-crm exec vitest run \
  src/components/nav/SectionRail.test.tsx \
  src/components/customer/CustomerSubNav.test.tsx \
  src/components/nav/settingsNav.test.ts \
  src/pages/SettingsPage.navigation.test.tsx \
  src/pages/SettingsPage.qbo.test.ts \
  src/pages/communications/CommunicationsSecondaryNav.test.tsx \
  src/pages/FlagsInboxPage.navigation.test.tsx \
  src/pages/EstimatesBoardPage.rendered.test.tsx
```

The pre-edit run used the same command without the new customer test file. Added coverage includes heading/list associations across multiple rail instances, first/later group spacing and borders, unlabelled groups, empty-group filtering, zero/one/multiple mobile groups, permission-filtered customer groups, collapsed separators, badges, active selection, actions, and existing arrow-key behavior.

The CRM workflow restarted successfully. Its existing PostCSS `from`-option warning remains; no startup failure occurred. Detailed local validation logs are in the ignored `generated-artifacts/n6/` directory.

## Signed-in screenshots

All requested states were captured and visually inspected. Browser capture IDs below identify the screenshots displayed in the completion conversation; the browser capture service did not export local PNG/JPG files.

| State | Browser screenshot ID |
| --- | --- |
| Settings, light | `wude0d` |
| Settings, dark | `d5kof5` |
| Expanded customer rail, light | `uhkszm` |
| Expanded customer rail, dark | `7f4hqr` |
| Inbox rail, light | `xckwew` |
| Settings phone pills, exactly 390 × 844 | `ku0pmj` |
| Collapsed customer icon-only rail | `wa8s9x` |

The Settings screenshots show green group headings and intervening rules. The customer screenshots show matching heading treatment; the collapsed screenshot shows icon-only navigation with between-group rules. Inbox retains its unlabelled-group appearance. The 390px screenshot shows the horizontal pills without headings. Browser inspection also confirmed Settings H3-to-UL `aria-labelledby` associations, a light heading color of `rgb(76, 108, 25)`, and zero headings within the phone pill rail.

The documented development login was initially rejected. After explicit user approval, an isolated temporary company, admin user/membership, and customer were provisioned exclusively for screenshot capture. Empty content and the Inbox “No mailbox connected” state are expected for these fixtures; no forms were submitted and no existing business records or accounts were modified.

The browser logged out after capture. Cleanup then removed the temporary company, customer, membership, user, and sessions, and a read-only count confirmed zero remaining fixture company/customer/user rows. The private local fixture-access file was deleted. The earlier login blocker is resolved for this verification; it did not require changing existing credentials.
