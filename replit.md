# High Plains Property Maintenance CRM

## Overview
The High Plains Property Maintenance CRM is designed to centralize and streamline operations for landscaping companies. It offers robust management for customers, contacts, notes, and contracts, alongside a mobile-first ticketing system for field crew task management. The platform aims to boost service delivery efficiency and operational management within the property maintenance sector, featuring role-based access control and advanced contract generation capabilities. The project vision is to become the leading operational CRM for property maintenance businesses.

## User Preferences
Preferred communication style: Simple, everyday language.
Test login credentials: randy@highplainsprop.com / Soccer03

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter, and TanStack Query. It utilizes Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access control (Admin, Office, Field Manager, Chemical Manager, Field, Irrigation Manager, Shop Manager). Data is persisted in PostgreSQL (Neon serverless) using Drizzle ORM and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) is used for storing contract PDF documents, visual scope images, and ticket PDF attachments with company-scoped ACL and presigned URL uploads.

#### Internationalization (i18n)
The system supports full Spanish/English localization using i18next and react-i18next, with user language preferences stored and synced on login. A language toggle allows instant switching.

#### Contract Management
Features a comprehensive contract lifecycle management system with stateful editing, validation, permission-based access, and support for 8 pre-defined service types, including mobilization fees and annual count calculations. The Contract Builder enables generation of landscape maintenance contracts using templates, variable substitution, and auto-population, with preview, auto-save, publish, and PDF export functionalities.

#### Ticketing System
A mobile-first system for field crews featuring configurable ticket types, custom workflows, and step-specific data capture. It manages a 3-phase project workflow (Sales/Estimating, Field Execution, Billing) with linked tickets, categorized by work type (Contract Work, Extra Billable, Project, Admin, Estimate Request, Shop To-Do) to drive billing behavior. Includes a 3-step ticket creation wizard, auto-creation of Invoice tickets for billable work, an RFP Request pipeline, and a delegation system. Specific project ticket types allow skipping proposal steps, and a unified invoicing workflow automates invoice ticket generation and data propagation.

#### Weekly Schedule System
Provides a comprehensive scheduling system for assigning properties to crews using template-based drag-and-drop functionality, including crew capacity indicators, a crew-oriented viewer, and PDF export.

#### Property Maps System
Integrates a KML-based layer mapping system for field crews to view customer-specific property zones and service areas.

#### Ticket Notifications System
Features in-app notifications for ticket assignments, completions, mentions, and due date reminders, categorized for urgency and standard updates.

#### Property Management System
Tracks Property Management Companies and Property Managers, integrating them into customer management with multi-contact support.

#### Equipment Tracking Module
Manages various equipment types with CRUD operations, type-specific fields, status tracking, search/filter, and dedicated equipment ticketing workflows.

#### Revenue Tracking System
Tracks contracted revenue by service type, offering monthly and YTD totals, annual projections, and drill-down capabilities.

#### Contracts Overview
Provides an overview page for Admin and Office roles with summary cards, search/filter, and a sortable table for all contracts.

#### Customer Detail Page Layout
The Customer Detail page features a 3-row header for customer identification and actions, and 7 top-level tabs (Overview, Contacts, Notes, Operations, Maps, Billing, Settings) with sub-tabs for detailed information.

#### Customer Billing Tab
Consolidates all billing information on customer detail pages with dedicated sub-tabs for Contracts, Rate Sheet, Revenue, and Monthly Summary.

#### Snow Storm Billing/Tracking System
Manages winter weather events, property impacts, service assignments, and automated invoice ticket generation, integrated with the existing ticketing system.

#### First-Time Setup Flow
An initial setup page for creating the first company and admin user upon deployment with an empty database, accessible only once.

#### Reports
A reporting tool for Admin and Office roles generating exportable lists (Customer/Property List, Contacts by Customer, Equipment List, Contracts List, Tickets Summary) with sortable, searchable data tables and CSV export.

#### Email Notification System
Transactional email notifications powered by SendGrid for events like "Work Completed" tickets, utilizing a template/rule engine with email logs and resend capability.

#### Proposal Maker
A tool for Admin and Office roles to create customer proposals, capturing customer references, QB estimate numbers, scope of work, and supporting images. It integrates with Project and Estimate Request tickets, generating a branded PDF output by merging cover/scope pages, the original QB estimate PDF, and an optional photo appendix.

#### Visual Scope Sheet Tool (VS1-VS5)
A satellite map-based tool for Admin and Office roles to create property scope imagery. It supports creating draft sheets, an interactive SVG overlay editor for markup (polygons, lines, symbols, text), and server-side PNG export for various visualizations (base, overlay, combined). VS3.5 adds high-resolution base image capture via Mapbox Static Images API. VS4 integrates VS sheets into the Proposal Maker, allowing their inclusion in generated PDFs. VS5 adds a "finalize-grade freezing" mechanism, rendering and storing Visual Scope snapshots permanently in GCS when a proposal is finalized, ensuring immutability of visual assets.

#### Campaign System
A batch property checklist system for organizing work across multiple properties within a completion window. Admin/Office users create campaigns, select properties, and assign tasks. Field workers can mark items complete, add notes, and upload photos. Only admin users can skip items (with a required reason). Campaigns auto-complete and support archive/reactivate, search/filter, and progress tracking. Supports two categories: General and Chemical. Chemical campaigns include a 3-step communication workflow (Pre-Work Communication, Work Completion, Post-Completion Communication) with automated email notifications via SendGrid. Email recipients are resolved in priority order: property manager email first, then customer primary contact, with a manual email entry fallback in the compose modal when no email is found. Chemical campaign items show step indicators in the campaign detail list (including a "Skipped" visual state) and a full workflow stepper on the item detail page. Skipped chemical items display a dedicated banner replacing the stepper, with a reopen option for admin/office users. Role-based permissions control who can send communications (admin, office, chemical_manager) vs. complete work (all field roles).

## External Dependencies

-   **UI Component Libraries:** Radix UI, Shadcn/ui, Lucide React, CMDK
-   **Form & Validation:** React Hook Form, Zod, @hookform/resolvers, Drizzle-Zod
-   **Date Handling:** date-fns
-   **Session & Security:** Passport.js (with passport-local), express-session, connect-pg-simple, Node.js crypto module
-   **Email:** SendGrid (@sendgrid/mail) via Replit connector
-   **PDF Generation:** PDFKit, pdf-lib
-   **Design System:** Google Fonts (Inter, JetBrains Mono)
-   **Mapping:** Mapbox