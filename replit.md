# High Plains Property Maintenance CRM

## Overview
A CRM for High Plains Property Maintenance designed to streamline operations for landscaping companies. It manages customers, contacts, notes, contracts (service types, billing), and company settings. Key features include role-based access control, a vertical slice architecture, a Contract Builder for generating maintenance contracts, and a mobile-first Ticketing System for field crew task management. The project's vision is to enhance service delivery and operational efficiency within the property maintenance sector.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built using React 18+, TypeScript, Vite, Wouter, and TanStack Query. It leverages Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend is developed with Express.js and TypeScript. Authentication uses Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access (Admin, Office, Field Manager, Field, Irrigation Manager, Shop Manager). Data persistence is handled by PostgreSQL (Neon serverless) with Drizzle ORM, using UUIDs as primary keys and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) is utilized for contract PDF documents with company-scoped ACL and presigned URL uploads.

#### Contract Management
Provides comprehensive contract lifecycle management, including stateful editing, validation, and permission-based access. It supports 8 pre-defined service types, tracks mobilization fees, and auto-calculates annual counts based on monthly distributions.

#### Contract Builder
A document generation tool that creates landscape maintenance contracts using templates, variable substitution, and auto-population. It supports customer selection, section customization, preview, auto-save, publish, and PDF export, integrating seamlessly with CRM contract management.

#### Ticketing System
A mobile-first system for field crews featuring configurable ticket types, custom workflows, and step-specific data capture. It includes default ticket types and role-based access. Projects follow a 3-phase workflow (Sales/Estimating, Field Execution, Billing) with ticket linking. Tickets are categorized by work type (Contract Work, Extra Billable, Project, Admin, Estimate Request, Shop To-Do) which drives billing behavior. Key features include a 3-step ticket creation wizard, auto-creation of Invoice tickets for billable work, an RFP Request pipeline, and a delegation system for project workflow. Shop To-Do tickets are for internal maintenance, do not require a customer, and can link to equipment.

#### Weekly Schedule System
A comprehensive scheduling system that assigns properties to crews using a template-based approach with drag-and-drop functionality. It includes crew capacity indicators, a crew-oriented viewer, and PDF export options. Templates support duplication, renaming, deletion, and season settings.

#### Property Maps System
A KML-based layer mapping system that allows field crews to view customer-specific property zones and service areas. KML files are stored in object storage.

#### Ticket Notifications System
An in-app notification system for ticket assignments, completions, and due date reminders. Users can view, mark as read, and navigate to related tickets.

#### Property Management System
Tracks Property Management Companies and Property Managers, integrated into the customer management system. Customers can link to both a company and a manager. Features include settings for managing companies/managers, multi-contact support for managers, and auto-contact synchronization.

#### Equipment Tracking Module
A comprehensive system for managing various equipment types (trucks, mowers, trailers, etc.). It supports CRUD operations, type-specific fields, status tracking, search/filter capabilities, and detailed equipment pages with tabs for details, files, tickets, and service history. It includes a dedicated equipment ticketing system with categorized work and a defined status workflow.

#### Revenue Tracking System
Tracks contracted revenue, broken down by service type (Maintenance vs Chemical) for cost/income analysis. It provides an overview page with monthly and YTD totals, annual projections, and drill-down capabilities to view customer contributions.

#### Contracts Overview
A cross-customer contracts overview page for Admin and Office roles. It provides summary cards, search and filter functionalities (by service type and status), a sortable table of contracts, and links to customer details.

#### Customer Billing Tab
Consolidates all billing-related information on the customer detail page with sub-tabs for Contracts (management, uploads, monthly amounts), Rate Sheet (customer-specific hourly rates), Revenue (annual projection, monthly breakdown), and Monthly Summary (consolidated billing view).

#### Snow Storm Billing/Tracking System
A system for managing winter weather events, property impacts, service assignments, and automated invoice ticket generation. Features include event lists with stats, detailed event management, property impact tracking, service type assignments, snow range definitions, and a billing status flow. It integrates with the existing ticketing system for invoice generation and includes role-based access controls.

#### First-Time Setup Flow
When deployed with an empty database, the application initiates a first-time setup page, allowing the creation of the initial company and admin user, then auto-logs in. This setup page is inaccessible once any user exists.

## External Dependencies

- **UI Component Libraries:** Radix UI, Shadcn/ui, Lucide React, CMDK
- **Form & Validation:** React Hook Form, Zod, @hookform/resolvers, Drizzle-Zod
- **Date Handling:** date-fns
- **Session & Security:** Passport.js (with passport-local), express-session, connect-pg-simple, Node.js crypto module
- **Design System:** Google Fonts (Inter, JetBrains Mono)