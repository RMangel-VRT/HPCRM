# Landscaping CRM

## Overview
A multi-tenant SaaS Customer Relationship Management system designed for landscaping businesses. Its primary function is to manage customers, contacts, notes, contracts (including service types and billing), and company settings. The system implements role-based access control and a vertical slice architecture for data isolation. The aim is to provide a comprehensive CRM that streamlines operations and enhances service delivery for landscaping companies. Key capabilities include a Contract Builder for generating maintenance contracts and a mobile-first Ticketing System for field crew task management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend utilizes React 18+, TypeScript, Vite, Wouter for routing, and TanStack Query for state management. It employs Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend is built with Express.js and TypeScript. Authentication is handled by Passport.js with session-based management, storing sessions in PostgreSQL. It supports multi-tenancy with roles: admin, office, ops, viewer (company-specific), and super admin (system-wide). The API is RESTful, uses JSON, and includes comprehensive error handling.

### Data Storage
PostgreSQL (Neon serverless) with Drizzle ORM is used for data persistence. The multi-tenant schema includes tables for `Companies`, `Company_users`, `Users`, `Customers`, `Contacts`, `Contracts`, `Contract_documents`, `Contract_services`, `Settings`, `contract_templates`, `contract_builder_documents`, `contract_builder_sections`, `contract_builder_variables`, `ticket_types`, `ticket_type_statuses`, `ticket_type_fields`, `tickets`, `ticket_field_values`, `ticket_status_history`, and `ticket_comments`. UUIDs are used as primary keys, and Drizzle Kit manages migrations.

#### Contract Management
This module provides full contract lifecycle management, including stateful editing of monthly billing amounts, validation, and permission-based access. It supports ending or deleting contracts based on roles and enforces unique contract types per customer. A coverage indicator badge shows current service coverage based on active contracts.

#### Contract Services
The `Contract_services` table stores configurations for 8 pre-defined service types, including monthly distribution arrays for scheduled visits and auto-calculated annual counts. Service-specific parameters are stored as JSONB.

### Object Storage
Replit's object storage (Google Cloud Storage) is used for storing contract PDF documents. It features company-scoped ACL for access control and private visibility with direct client-side uploads via presigned URLs.

### Feature Specifications

#### Contract Builder
A document generation tool for landscape maintenance contracts using templates and variable substitution. It uses a dedicated database architecture for templates, documents, sections, and variables. The workflow allows users to select customers, include/exclude sections, fill variables (with auto-population), preview, auto-save, publish, and export to PDF. It integrates directly with the CRM's contract management by publishing documents and creating contract records, inferring service types and billing patterns.

#### Ticketing System
A mobile-first system for field crews to track and manage work at customer properties. It supports configurable ticket types with custom workflows, where tickets progress through multiple status steps with step-specific data capture. The system includes default ticket types ("Quick Task", "Project") and role-based access control. The UI is optimized for mobile with card-based layouts, a four-step creation wizard (type, customer, contract, details), and workflow progress indicators.

**Contract Integration:** Tickets can optionally be linked to active customer contracts. The creation wizard shows available active contracts after customer selection, allowing users to associate work with specific service agreements. Contract-linked tickets display a contract indicator in the list view and contract details in the detail view. Filters allow filtering by contract linkage status.

**Ticket Categories:** Ticket types are categorized as quick_task, project, or service for filtering and reporting purposes.

**Ticket Sources:** The `ticket_sources` table tracks ticket origin (manual creation vs. future auto-generated from service blueprints) to distinguish between user-created tickets and system-generated service tickets.

## External Dependencies

### UI Component Libraries
- **Radix UI:** For accessible components.
- **Shadcn/ui:** Design system.
- **Lucide React:** Icons.
- **CMDK:** Command palette.

### Form & Validation
- **React Hook Form:** Form state management.
- **Zod:** Runtime schema validation.
- **@hookform/resolvers:** Integration.
- **Drizzle-Zod:** Schema conversion.

### Date Handling
- **date-fns:** Date manipulation.

### Session & Security
- **Passport.js** with **passport-local strategy:** Authentication.
- **express-session:** Session management.
- **connect-pg-simple:** PostgreSQL session storage.
- **Node.js crypto module:** Password hashing.

### Design System
- **Google Fonts:** Inter, JetBrains Mono.

### Third-Party Services
- **QuickBooks Online Integration (Planned):** For customer data synchronization.