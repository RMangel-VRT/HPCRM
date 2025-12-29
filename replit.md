# High Plains Property Maintenance CRM

## Overview
A CRM for High Plains Property Maintenance, managing customers, contacts, notes, contracts (service types, billing), and company settings. It features role-based access control and a vertical slice architecture for data isolation. Key capabilities include a Contract Builder for generating maintenance contracts and a mobile-first Ticketing System for field crew task management. The project aims to streamline operations and enhance service delivery for landscaping companies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend uses React 18+, TypeScript, Vite, Wouter, and TanStack Query. It's built with Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management storing sessions in PostgreSQL. It supports multi-tenancy with role-based access control (Admin, Office, Field Manager, Field, Irrigation Manager roles). The API is RESTful, uses JSON, and includes comprehensive error handling. PostgreSQL (Neon serverless) with Drizzle ORM is used for data persistence, with UUIDs as primary keys and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) is used for contract PDF documents with company-scoped ACL and presigned URL uploads.

#### Contract Management
Provides full contract lifecycle management, including stateful editing, validation, permission-based access, and support for ending/deleting contracts. It enforces unique contract types per customer and includes a coverage indicator. Contract services store configurations for 8 pre-defined service types with monthly distribution arrays and auto-calculated annual counts.

#### Contract Builder
A document generation tool for landscape maintenance contracts using templates and variable substitution. It supports customer selection, section inclusion/exclusion, variable filling (with auto-population), preview, auto-save, publish, and PDF export. It integrates with CRM contract management by publishing documents and creating contract records, inferring service types and billing patterns.

#### Ticketing System
A mobile-first system for field crews, supporting configurable ticket types with custom workflows and step-specific data capture. It includes default ticket types and role-based access. Projects follow a 3-phase workflow (Sales/Estimating, Field Execution, Billing) with specific ticket types and linking (`execution_for`, `invoice_for`). Tickets are classified by work type (Contract Work, Extra Billable, Project, Admin, Estimate Request) driving billing behavior. A 3-step wizard guides ticket creation (Work Type, Customer, Details). The system supports auto-creation of Invoice tickets for billable work and includes an RFP Request pipeline for sales management.

#### Weekly Schedule System
A comprehensive scheduling system for assigning properties to crews. It uses a template-based approach with drag-and-drop functionality, crew capacity indicators, and a read-only viewer. Data is stored in `weekly_schedule_templates`, `maintenance_crews`, `maintenance_visit_configs`, and `schedule_blocks` tables.

#### Property Maps System
A KML-based layer mapping system for field crews to view property zones and service areas. It stores customer-specific map layers with categories (e.g., Mowing Zones, ATV Routes) and uses `customer_map_layers` and `customer_map_documents` tables. KML files are stored in Replit object storage.

#### Ticket Notifications System
An in-app notification system for ticket assignments, completions, and due date reminders. Notifications are stored in `ticket_notifications` and triggered by assignment, completion, and a background service for due dates. Users can view, mark as read, and navigate to related tickets from a header dropdown.

#### First-Time Setup Flow
When deployed to production with an empty database (no users), the app automatically shows a setup page instead of login. This allows the first admin to create their company and account. The setup page creates the company, admin user, company membership, and default settings, then auto-logs in. Once any user exists, the setup page becomes inaccessible for security.

## External Dependencies

- **UI Component Libraries:** Radix UI, Shadcn/ui, Lucide React, CMDK
- **Form & Validation:** React Hook Form, Zod, @hookform/resolvers, Drizzle-Zod
- **Date Handling:** date-fns
- **Session & Security:** Passport.js (with passport-local), express-session, connect-pg-simple, Node.js crypto module
- **Design System:** Google Fonts (Inter, JetBrains Mono)
- **Third-Party Services:** QuickBooks Online Integration (Planned)