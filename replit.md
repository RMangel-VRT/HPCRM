# High Plains Property Maintenance CRM

## Overview
The High Plains Property Maintenance CRM centralizes and streamlines operations for landscaping companies. It provides robust management for customers, contacts, notes, and contracts, featuring a mobile-first ticketing system for field crew task management. The system aims to enhance service delivery efficiency and operational management through capabilities like role-based access control, advanced contract generation, and comprehensive communication tools. The project's vision is to become the leading operational CRM for property maintenance businesses.

## User Preferences
Preferred communication style: Simple, everyday language.
Test login credentials: randy@highplainsprop.com / Soccer03 (field role); mike@highplainsprop.com / Soccer03 (admin role)

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter, and TanStack Query. It utilizes Shadcn/ui and Radix UI primitives for components, with styling managed by Tailwind CSS, supporting custom theming and light/dark modes. The system offers full Spanish/English localization using i18next and react-i18next, with user language preferences stored and a toggle for switching.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access control (Admin, Office, Field Manager, Chemical Manager, Field, Irrigation Manager, Shop Manager). Data is persisted in PostgreSQL (Neon serverless) using Drizzle ORM and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) is used for contract PDF documents, visual scope images, and ticket PDF attachments with company-scoped ACL and presigned URL uploads.

#### Core Features
- **Contract Management:** Full lifecycle management, templating, variable substitution, and PDF export for 8 service types.
- **Ticketing System:** Mobile-first, configurable ticket types, custom workflows, 3-phase project workflow, linked tickets, and automated invoice ticket generation.
- **Weekly Schedule System:** Template-based drag-and-drop scheduling with capacity indicators and PDF export.
- **Property Maps System:** KML-based layer mapping for field crews to view customer-specific property zones and service areas.
- **Property Management:** Tracks Property Management Companies and Managers, integrated with customer management.
- **Equipment Tracking:** CRUD operations for various equipment types, status tracking, and dedicated equipment ticketing workflows.
- **Revenue Tracking:** Tracks contracted revenue by service type, with monthly/YTD totals, annual projections, and drill-down capabilities.
- **Customer Detail Page:** Consolidated view of all customer information.
- **Snow Storm Billing/Tracking:** Manages winter weather events, service assignments, and automated invoice ticket generation.
- **Reports:** Exportable lists (Customer/Property, Contacts, Equipment, Contracts, Tickets Summary) with sortable, searchable data tables and CSV export.
- **Email Notification System:** Transactional email notifications via SendGrid for events like "Work Completed" tickets, using a template/rule engine.
- **Proposal Maker:** Tool for creating customer proposals, capturing scope, images, and generating branded PDF outputs.
- **Visual Scope Sheet Tool:** Satellite map-based tool for creating property scope imagery with an interactive SVG overlay editor, server-side PNG export, and integration with Proposal Maker. Features texture fills, style presets, and sheet templates, alongside advanced UX features like multi-select, grouping, alignment tools, and keyboard shortcuts.
- **Campaign System:** Batch property checklist system for organizing work (General, Chemical, Irrigation) with task assignment, completion tracking, notes, photos, and role-based permissions. Chemical campaigns include a 3-step communication workflow with automated emails and weather capture. Irrigation campaigns feature property-specific checklists.
- **Email Tracking System:** Manages company email inboxes, routes inbound emails, and extends communication records with detailed email metadata. Includes UI for unsorted inbox management and mailbox account settings.
- **Chemical Treatment Completion Notice:** Post-visit completion workflow for chemical treatment campaigns, including enhanced completion forms, completion details display, email management, and product settings.
- **Communication Command Center:** Analytics dashboard for Admin/Office roles with insights into communication activities.
- **Seasons Management System:** Allows grouping campaigns into named time periods for aggregated reporting, with CRUD operations and export capabilities.
- **Checklist-Driven Navigation Panel:** A right-side detail panel for campaign item checklists enabling navigation to related screens from global operations or customer-specific views.
- **Field Role Layout (FieldAppLayout):** Mobile-first layout for operational roles with a sticky top bar, scrollable content, and role-specific dashboards.

#### Communication Center
A comprehensive communication lifecycle management system accessible to admin and office roles. It features a three-panel layout for navigation (All, Drafts, Scheduled, Follow-Ups), a filterable list of communications, and a detail panel for content and actions. Functionality includes message threading, reply actions, a compose drawer, schedule-send for admins, follow-up creation and management, and dashboard widgets for quick access to communication states.

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