# High Plains Property Maintenance CRM

## Overview
The High Plains Property Maintenance CRM centralizes and streamlines operations for landscaping companies by providing robust management for customers, contacts, notes, and contracts. It features a mobile-first ticketing system for field crew task management, aiming to enhance service delivery efficiency and operational management. Key capabilities include role-based access control, advanced contract generation, and comprehensive communication tools. The project's vision is to become the leading operational CRM for property maintenance businesses.

## User Preferences
Preferred communication style: Simple, everyday language.
Test login credentials: randy@highplainsprop.com / Soccer03 (field role); mike@highplainsprop.com / Soccer03 (admin role)

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter, and TanStack Query, utilizing Shadcn/ui and Radix UI primitives. Styling is managed with Tailwind CSS, supporting custom theming and light/dark modes. The system offers full Spanish/English localization using i18next and react-i18next, with user language preferences stored and a toggle for switching.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access control (Admin, Office, Field Manager, Chemical Manager, Field, Irrigation Manager, Shop Manager). Data is persisted in PostgreSQL (Neon serverless) using Drizzle ORM and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) stores contract PDF documents, visual scope images, and ticket PDF attachments with company-scoped ACL and presigned URL uploads.

#### Core Features
- **Contract Management:** Full lifecycle management, templating, variable substitution, and PDF export for 8 service types.
- **Ticketing System:** Mobile-first, configurable ticket types, custom workflows, 3-phase project workflow, linked tickets, and automated invoice ticket generation.
- **Weekly Schedule System:** Template-based drag-and-drop scheduling with capacity indicators and PDF export.
- **Property Maps System:** KML-based layer mapping for field crews to view customer-specific property zones and service areas.
- **Ticket Notifications:** In-app notifications for various ticket events.
- **Property Management:** Tracks Property Management Companies and Managers, integrated with customer management.
- **Equipment Tracking:** CRUD operations for various equipment types, status tracking, and dedicated equipment ticketing workflows.
- **Revenue Tracking:** Tracks contracted revenue by service type, with monthly/YTD totals, annual projections, and drill-down capabilities.
- **Customer Detail Page:** Consolidated view of all customer information.
- **Snow Storm Billing/Tracking:** Manages winter weather events, service assignments, and automated invoice ticket generation.
- **First-Time Setup Flow:** Initial setup for creating the first company and admin user.
- **Reports:** Exportable lists (Customer/Property, Contacts, Equipment, Contracts, Tickets Summary) with sortable, searchable data tables and CSV export.
- **Email Notification System:** Transactional email notifications via SendGrid for events like "Work Completed" tickets, using a template/rule engine.
- **Proposal Maker:** Tool for creating customer proposals, capturing scope, images, and generating branded PDF outputs.
- **Visual Scope Sheet Tool (VS1-VS4+):** Satellite map-based tool for creating property scope imagery with an interactive SVG overlay editor, server-side PNG export, texture fill system, style presets, and sheet templates. Advanced UX includes multi-select, grouping, alignment tools, keyboard shortcuts, snap-to-grid, and object list panel.
- **Campaign System:** Batch property checklist system for organizing work (General, Chemical, Irrigation) with task assignment, tracking, notes, photos, and role-based permissions. Chemical campaigns include a 3-step communication workflow with automated emails and weather capture. Irrigation campaigns feature property-specific checklists. Chemical products catalog and detailed visit planning are integrated.
- **Email Tracking System:** Manages inbound and outbound emails, tracking mailbox accounts, unsorted emails, and linking communications to customer records. Includes an Unsorted Inbox for routing and assigning emails.
- **Communication Command Center:** Analytics dashboard for Admin/Office roles with a three-panel layout, section filtering, stat cards, breakdown widgets, and date range filtering.
- **Seasons Management System:** Allows grouping campaigns into named time periods for aggregated reporting, with CRUD operations and per-season reports.
- **Checklist-Driven Navigation Panel:** A right-side detail panel for campaign item checklists enabling navigation to related screens, accessible from global operations and customer detail pages.
- **Field Role Layout (FieldAppLayout):** Mobile-first layout for operational roles with a sticky top bar, scrollable content, and a floating home button. The dashboard shows assigned tickets and role-specific navigation cards.
- **Communications Center (Comm Center):** A communication lifecycle management system for admin and office roles. Features a three-panel layout with navigation, a filterable list of communications (email, SMS, note, letter), and a detail panel. Functionality includes schedule-send, follow-up creation and queue management, and dashboard widgets.

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