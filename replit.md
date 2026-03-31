# High Plains Property Maintenance CRM

## Overview
The High Plains Property Maintenance CRM centralizes and streamlines operations for landscaping companies. It provides robust management for customers, contacts, notes, and contracts, complemented by a mobile-first ticketing system for field crew task management. The platform aims to enhance service delivery efficiency and operational management within the property maintenance sector, featuring role-based access control and advanced contract generation. The project's vision is to become the leading operational CRM for property maintenance businesses.

## User Preferences
Preferred communication style: Simple, everyday language.
Test login credentials: randy@highplainsprop.com / Soccer03

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter, and TanStack Query. It utilizes Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes. The system supports full Spanish/English localization using i18next and react-i18next, with a user language preference stored and a toggle for instant switching.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access control (Admin, Office, Field Manager, Chemical Manager, Field, Irrigation Manager, Shop Manager). Data is persisted in PostgreSQL (Neon serverless) using Drizzle ORM and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) stores contract PDF documents, visual scope images, and ticket PDF attachments with company-scoped ACL and presigned URL uploads.

#### Core Features
- **Contract Management:** Comprehensive lifecycle management, stateful editing, validation, permission-based access, support for 8 service types, and a Contract Builder with templating, variable substitution, and PDF export.
- **Ticketing System:** Mobile-first, configurable ticket types, custom workflows, 3-phase project workflow (Sales/Estimating, Field Execution, Billing), linked tickets, and automated invoice ticket generation. Includes an RFP Request pipeline and delegation.
- **Weekly Schedule System:** Template-based drag-and-drop scheduling for assigning properties to crews, with capacity indicators and PDF export.
- **Property Maps System:** KML-based layer mapping for field crews to view customer-specific property zones and service areas.
- **Ticket Notifications:** In-app notifications for ticket assignments, completions, mentions, and due date reminders.
- **Property Management:** Tracks Property Management Companies and Managers, integrating them with customer management.
- **Equipment Tracking:** CRUD operations for various equipment types, status tracking, and dedicated equipment ticketing workflows.
- **Revenue Tracking:** Tracks contracted revenue by service type, with monthly/YTD totals, annual projections, and drill-down capabilities.
- **Customer Detail Page:** Consolidated view with 7 top-level tabs and sub-tabs for detailed information including billing.
- **Snow Storm Billing/Tracking:** Manages winter weather events, service assignments, and automated invoice ticket generation.
- **First-Time Setup Flow:** Initial setup for creating the first company and admin user.
- **Reports:** Exportable lists (Customer/Property, Contacts, Equipment, Contracts, Tickets Summary) with sortable, searchable data tables and CSV export.
- **Email Notification System:** Transactional email notifications via SendGrid for events like "Work Completed" tickets, using a template/rule engine with logs.
- **Proposal Maker:** Tool for creating customer proposals, capturing scope, images, and generating branded PDF outputs.
- **Visual Scope Sheet Tool (VS1-VS5):** Satellite map-based tool for creating property scope imagery, interactive SVG overlay editor, server-side PNG export, and integration with Proposal Maker. Includes high-resolution image capture and "finalize-grade freezing" for immutable visual assets.
- **Campaign System:** Batch property checklist system for organizing work (General, Chemical, Irrigation). Supports task assignment, completion tracking, notes, photos, and role-based permissions. Chemical campaigns include a 3-step communication workflow with automated emails and weather capture. Irrigation campaigns feature property-specific checklists with presets (Spring Turn-On, Winterization) and custom options.
- **Communication Command Center:** Analytics dashboard for Admin/Office roles with a three-panel layout, section filtering (Dashboard, All, Drafts, Sent, Scheduled, Follow-Ups), stat cards, breakdown widgets, and date range filtering. Supports deep-linking to filtered list views.
- **Seasons Management System:** Allows grouping campaigns into named time periods for aggregated reporting, accessible to admin, office, and chemical_manager roles. Features CRUD operations for seasons and per-season aggregated reports with CSV/PDF export.
- **Field Role Layout (FieldAppLayout):** Mobile-first layout for operational roles (field_manager, chemical_manager, irrigation_manager, shop_manager, landscape_supervisor) with a sticky top bar, scrollable content, and a floating home button. The dashboard for these roles shows assigned tickets and role-specific navigation cards.

#### Communication Center
- **Functionality:** Three-panel layout with left navigation (All, Drafts, Sent, Scheduled), center list, and right detail/preview.
- **Threading:** Messages grouped by `threadId` with reply-count badges and a conversation timeline in the detail panel.
- **Reply Action:** "Reply" button pre-fills compose drawer with "Re: {subject}" and links to the parent message, automatically creating or reusing a thread.
- **Compose Drawer:** Full compose form with customer/type/template selectors, subject/body, internal notes, and draft/send options.

#### Communications Center (Comm Center)
A communication lifecycle management system accessible to admin and office roles at `/dashboard/communications`. Features a left navigation panel with sections: All, Drafts, Scheduled, Follow-Ups — each with live count badges. The center panel shows a filterable list of communications (email, sms, note, letter) with type badges, status badges, and customer names. The right detail panel shows full communication content with action panels.

**Slice 6 lifecycle features:**
- **Schedule-Send (admin-only):** A datetime picker in the detail panel lets admins set `scheduledFor` on any communication. Non-admins see a disabled tooltip explaining the restriction.
- **Follow-Up Creation:** A checkbox + preset (2/5/7 days or custom date) panel lets any admin/office user attach a follow-up reminder to any communication. Sets `followUpDueAt` and `followUpStatus = "open"`.
- **Follow-Up Queue:** The Follow-Ups nav section filters to items with `followUpStatus = "open"` or `"snoozed"`. Overdue items (due date in the past) are highlighted in red. Each row has inline "Mark Done" (sets status to "done") and "Snooze" (popover with preset dates 1/3/7 days or custom) actions.
- **Dashboard Widgets:** Four clickable Communication widgets on the Dashboard (Drafts to Review, Scheduled for Today, Open Follow-Ups, Overdue Follow-Ups) link to the relevant Communications Center view via URL query param `?view=draft|scheduled|follow_ups`.
- **URL-driven section**: On mount, CommunicationsCenter reads `?view=` query param to pre-select the correct nav section.

Schema additions: `scheduled_for` timestamp, `follow_up_due_at` timestamp, `follow_up_status` text (none/open/done/snoozed), `parent_communication_id` varchar. Applied via `migrateCommunicationsSlice6()` startup migration which also creates the base `communications`, `communication_templates`, and `communication_links` tables if they don't exist.

API: `GET /api/communications?view=drafts|scheduled|followups`, `GET /api/communications/stats` (returns counts for dashboard widgets), `PATCH /api/communications/:id` (updates any communication fields; `scheduledFor` writes restricted to admin).

## External Dependencies

-   **UI Component Libraries:** Radix UI, Shadcn/ui, Lucide React, CMDK
-   **Form & Validation:** React Hook Form, Zod, @hookform/resolvers, Drizzle-Zod
-   **Date Handling:** date-fns
-   **Session & Security:** Passport.js (with passport-local), express-session, connect-pg-simple, Node.js crypto module
-   **Email:** SendGrid (@sendgrid/mail)
-   **PDF Generation:** PDFKit, pdf-lib
-   **Design System:** Google Fonts (Inter, JetBrains Mono)
-   **Mapping:** Mapbox
-   **Weather:** Open-Meteo API, Nominatim geocoding