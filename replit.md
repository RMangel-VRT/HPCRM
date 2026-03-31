# High Plains Property Maintenance CRM

## Overview
The High Plains Property Maintenance CRM centralizes and streamlines operations for landscaping companies. It provides robust management for customers, contacts, notes, and contracts, complemented by a mobile-first ticketing system for field crew task management. The platform aims to enhance service delivery efficiency and operational management within the property maintenance sector, featuring role-based access control and advanced contract generation. The project's vision is to become the leading operational CRM for property maintenance businesses.

## User Preferences
Preferred communication style: Simple, everyday language.
Test login credentials: randy@highplainsprop.com / Soccer03

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter, and TanStack Query. It utilizes Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access control (Admin, Office, Field Manager, Chemical Manager, Field, Irrigation Manager, Shop Manager). Data is persisted in PostgreSQL (Neon serverless) using Drizzle ORM and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) stores contract PDF documents, visual scope images, and ticket PDF attachments with company-scoped ACL and presigned URL uploads.

#### Key Features
-   **Internationalization (i18n):** Full Spanish/English localization using i18next and react-i18next.
-   **Contract Management:** Comprehensive contract lifecycle management system with stateful editing, validation, permission-based access, and support for 8 service types, including a Contract Builder for template-based generation, preview, auto-save, publish, and PDF export.
-   **Ticketing System:** Mobile-first system for field crews with configurable ticket types, custom workflows, and step-specific data capture. Manages a 3-phase project workflow (Sales/Estimating, Field Execution, Billing) with linked tickets categorized by work type to drive billing behavior.
-   **Weekly Schedule System:** Comprehensive scheduling for assigning properties to crews using template-based drag-and-drop, including capacity indicators and PDF export.
-   **Property Maps System:** KML-based layer mapping for field crews to view customer-specific property zones.
-   **Ticket Notifications:** In-app notifications for ticket assignments, completions, mentions, and due dates.
-   **Property Management:** Tracks Property Management Companies and Managers, integrated with customer management.
-   **Equipment Tracking:** Manages various equipment types with CRUD, status tracking, and dedicated ticketing workflows.
-   **Revenue Tracking:** Tracks contracted revenue by service type, offering monthly/YTD totals and annual projections.
-   **Contracts Overview:** Summary page for Admin and Office roles with search, filter, and sortable table.
-   **Customer Detail Page:** Consolidated view of customer information with tabs for Overview, Contacts, Notes, Operations, Maps, Billing, and Settings.
-   **Snow Storm Billing/Tracking:** Manages winter weather events, property impacts, service assignments, and automated invoice ticket generation.
-   **First-Time Setup Flow:** Initial setup for creating the first company and admin user upon deployment.
-   **Reports:** Reporting tool for Admin and Office roles generating exportable lists (Customer/Property, Contacts, Equipment, Contracts, Tickets) with CSV export.
-   **Email Notification System:** Transactional email notifications via SendGrid for events like "Work Completed" tickets, using a template/rule engine with logs.
-   **Proposal Maker:** Tool for Admin and Office roles to create customer proposals, capturing scope, images, and generating branded PDF outputs.
-   **Visual Scope Sheet Tool (VS1-VS5):** Satellite map-based tool for Admin and Office roles to create property scope imagery with interactive SVG overlay editing, server-side PNG export, high-resolution base image capture, integration with Proposal Maker, and "finalize-grade freezing" for immutable visual assets.
-   **Campaign System:** Batch property checklist system for organizing work across multiple properties. Supports General, Chemical, and Irrigation campaigns. Chemical campaigns include a 3-step communication workflow with automated email notifications and weather condition recording. Irrigation campaigns feature per-property checklists with presets and custom options.
-   **Communication Command Center:** Analytics dashboard for Admin and Office roles displaying communication metrics, filtered lists, and deep-linking to details.
-   **Seasons Management System:** Allows grouping campaigns into named time periods for aggregated reporting, accessible to admin, office, and chemical_manager roles.
-   **Communications Center:** Compose and tracking center for admin and office users to author and record outbound communications (email, SMS, note, letter), with template auto-fill, token resolution, and status tracking.
-   **Field Role Layout (FieldAppLayout):** Mobile-first layout for operational roles (field_manager, chemical_manager, irrigation_manager, shop_manager, landscape_supervisor) with a simplified UI and role-specific navigation.

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