# Design Guidelines: Landscaping CRM

## Design Approach

**Selected Framework:** Design System Approach using **Linear + Tailwind UI principles**

**Justification:** This is a utility-focused, information-dense B2B productivity tool where efficiency, learnability, and data clarity are paramount. Linear's clean aesthetic combined with Tailwind UI's professional patterns provides the perfect foundation for a modern enterprise CRM.

**Key Design Principles:**
- Clarity over decoration: Every element serves a functional purpose
- Spatial efficiency: Dense information layouts without feeling cramped
- Consistent patterns: Predictable interactions across all workflows
- Role-aware UI: Navigation and features adapt to user permissions

---

## Typography System

**Font Family:** Inter (Google Fonts)
- Primary: Inter (400, 500, 600, 700)
- Monospace: JetBrains Mono for data/codes

**Type Scale:**
- Page Titles: text-3xl font-semibold (30px)
- Section Headers: text-xl font-semibold (20px)
- Card/Panel Titles: text-lg font-medium (18px)
- Body Text: text-base (16px)
- Labels/Meta: text-sm font-medium (14px)
- Table Data: text-sm (14px)
- Captions/Helpers: text-xs (12px)

**Hierarchy Rules:**
- Page titles always include context breadcrumb above (text-sm)
- Section headers use subtle letter-spacing (tracking-tight)
- Form labels always font-medium for scannability
- Table headers uppercase with tracking-wide

---

## Layout System

**Spacing Primitives:** Tailwind units 2, 4, 6, 8, 12, 16
- Micro spacing (within components): 2, 4
- Component internal padding: 4, 6
- Component spacing: 8, 12
- Section spacing: 12, 16
- Page margins: 6, 8

**Grid Structure:**
- Main layout: Sidebar (w-64) + Content area (flex-1)
- Content max-width: max-w-7xl mx-auto
- Dashboard cards: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Form layouts: max-w-3xl (single column) or two-column grid (grid-cols-2 gap-6)
- Tables: full-width within content container

**Container Strategy:**
- Sidebar: Fixed width, full-height, sticky navigation
- Content wrapper: px-6 py-8 (mobile) to px-8 py-12 (desktop)
- Cards/Panels: p-6 with rounded-lg borders
- Modals/Dialogs: max-w-2xl for forms, max-w-4xl for data-heavy

---

## Component Library

### Navigation
**Sidebar Navigation:**
- Fixed left sidebar with company logo at top (h-16)
- Grouped nav items by function (CRM, Operations, Admin)
- Active state: subtle background, font-semibold
- Role-based visibility: Hide unavailable sections completely
- Bottom of sidebar: User profile with role badge

**Top Bar:**
- Height: h-16
- Right side: Search input (w-96) + Notifications icon + User menu
- Breadcrumb navigation below on content area

### Data Display
**Tables:**
- Striped rows for scannability (even row subtle background)
- Sticky headers on scroll
- Row hover state with subtle background change
- Action buttons: Right-aligned, icon-only with tooltips
- Pagination: Bottom, showing "1-10 of 247 results"
- Empty states: Centered with icon, message, and CTA

**Cards/Panels:**
- Border-based (not shadow-heavy)
- Header with title + optional action buttons
- Consistent padding (p-6)
- Dividers between sections (divide-y)
- Footer for meta info or actions

**Status Badges:**
- Pill shape (rounded-full px-3 py-1)
- Text: text-xs font-medium uppercase tracking-wide
- States: Active, Paused, Inactive, Open, Closed, etc.

### Forms
**Input Fields:**
- Label above input (text-sm font-medium mb-2)
- Input: h-10, px-4, rounded-md border
- Helper text below (text-xs)
- Error state: Border change + error message in context
- Required indicator: Red asterisk after label

**Form Layouts:**
- Single column for simple forms (max-w-md)
- Two-column grid for complex forms (grid-cols-2 gap-x-6 gap-y-6)
- Field groups with subtle background (p-4 rounded-lg)
- Action buttons: Right-aligned, primary + secondary pattern

**Select/Dropdowns:**
- Match text input height (h-10)
- Native selects for simple choices
- Custom dropdowns for multi-select or complex options

### Dashboards
**Revenue Dashboard (Phase 2):**
- Top: Summary cards grid (grid-cols-4 gap-6)
  - Each card: Large number (text-3xl font-bold) + label + trend indicator
- Middle: Bar chart showing monthly revenue (h-96)
- Bottom: Recent contracts table

**Filter Bar:**
- Above dashboard content
- Horizontal layout: Select dropdowns + Date range + Search
- Space-between alignment with "Clear filters" on right

### Modals/Dialogs
- Overlay: Semi-transparent backdrop
- Panel: Centered, max-w-2xl, p-6
- Header: text-xl font-semibold with close button (×)
- Content: Scrollable if needed (max-h-[80vh])
- Footer: Action buttons right-aligned

### Tickets Interface
**List View:**
- Compact rows with priority indicator (vertical bar on left)
- Columns: Title, Status badge, Assigned to avatar, Due date, Customer
- Click row to expand details inline or open modal

**Detail View:**
- Split: Left (2/3) main content, Right (1/3) metadata
- Comments: Timeline style with user avatar + timestamp
- Quick actions bar at top

---

## Interaction Patterns

**Loading States:**
- Skeleton screens for data tables (shimmer effect)
- Spinner for form submissions (disable button, show spinner)
- Optimistic updates where safe (add note instantly, rollback if fails)

**Empty States:**
- Centered layout with icon (text-gray-400, size-16)
- Heading: "No [entities] yet"
- Description: One-line explanation
- CTA: "Add your first [entity]" primary button

**Toast Notifications:**
- Top-right corner (fixed top-4 right-4)
- Auto-dismiss after 4s
- Types: Success, Error, Warning, Info
- Include icon + message + close button

**Confirmation Dialogs:**
- For destructive actions (delete, end contract)
- Clear heading: "Are you sure?"
- Explain consequences
- Buttons: "Cancel" (secondary) + "Delete" (destructive)

---

## Images

**No hero images required** - this is a utility application. Images are used functionally:

1. **Empty State Illustrations:**
   - Simple line art or icons for "No customers yet," "No tickets," etc.
   - Style: Minimalist, single-color line drawings
   - Placement: Center of empty table/list views

2. **User Avatars:**
   - Profile pictures in navigation, ticket assignments, note authors
   - Fallback to initials in colored circle if no image
   - Size: 8x8 for small, 10x10 for medium, 16x16 for profile

3. **Company Logo:**
   - Top of sidebar navigation
   - Max height: h-10, width: auto
   - Placeholder: Text-based logo if none provided

---

## Page-Specific Layouts

**Customers List:**
- Search + Filters at top (status, tags)
- Table with columns: Name, Status badge, Properties count, Last activity date
- Actions: View, Edit, Add Note

**Customer Detail:**
- Header: Customer name + status + action buttons (Edit, Add Property, Add Note)
- Tabs: Overview, Properties, Contacts, Notes, Contracts
- Overview tab: 2-column layout (Info + Recent activity)

**Contract Form:**
- Step indicator at top if multi-step
- Service type selection (radio cards with icons)
- Date pickers for start/end
- Monthly amounts: 12-row table with month name + amount input
- Auto-calculate totals shown in sticky footer

**Settings Page (Admin):**
- Tab navigation: Company, Seasons, Benchmarks, Feature Flags, Users
- Each section in card with form layout
- Save button: Sticky bottom or per-section

---

## Responsive Strategy

**Breakpoints:**
- Mobile: < 768px (sm)
- Tablet: 768-1024px (md)
- Desktop: > 1024px (lg)

**Mobile Adaptations:**
- Sidebar: Collapsible drawer (hamburger menu)
- Tables: Horizontal scroll or card-based view
- Multi-column grids: Stack to single column
- Forms: All fields full-width
- Dashboard: Summary cards stack vertically

---

## Accessibility

- All interactive elements: min h-10 touch target
- Form labels: Explicit for/id associations
- Focus states: Visible outline (ring-2) on all inputs/buttons
- ARIA labels for icon-only buttons
- Keyboard navigation: Tab order follows visual flow
- Skip to content link for screen readers