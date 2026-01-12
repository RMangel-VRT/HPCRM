# High Plains Property Maintenance CRM

## Overview
A CRM for High Plains Property Maintenance, managing customers, contacts, notes, contracts (service types, billing), and company settings. It features role-based access control and a vertical slice architecture for data isolation. Key capabilities include a Contract Builder for generating maintenance contracts and a mobile-first Ticketing System for field crew task management. The project aims to streamline operations and enhance service delivery for landscaping companies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend uses React 18+, TypeScript, Vite, Wouter, and TanStack Query. It's built with Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management storing sessions in PostgreSQL. It supports multi-tenancy with role-based access control (Admin, Office, Field Manager, Field, Irrigation Manager, Shop Manager roles). Shop Manager is a restricted role that only has access to view and update their assigned tickets via the "My Tickets" page. The API is RESTful, uses JSON, and includes comprehensive error handling. PostgreSQL (Neon serverless) with Drizzle ORM is used for data persistence, with UUIDs as primary keys and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) is used for contract PDF documents with company-scoped ACL and presigned URL uploads.

#### Contract Management
Provides full contract lifecycle management, including stateful editing, validation, permission-based access, and support for ending/deleting contracts. It enforces unique contract types per customer and includes a coverage indicator. Contract services store configurations for 8 pre-defined service types with monthly distribution arrays and auto-calculated annual counts.
- Contract editing: Edit button on each contract card opens a dialog to update service type, billing pattern, dates, PO, notes, and mobilization fee settings
- Mobilization fee tracking: Maintenance contracts can include a one-time mobilization fee (hasMobilizationFee boolean, mobilizationFeeAmount in cents) displayed in Monthly Billing Summary

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

#### Property Management System
Tracks Property Management Companies and Property Managers with full integration into the customer management system. Property Managers belong to Property Management Companies (many-to-one via `propertyManagementCompanyId`). Customers can optionally link to both a company and manager. The system includes:
- Settings tab for managing Companies and Managers with add/edit/delete dialogs
- Customer edit form with company/manager selection dropdowns (managers filtered by selected company)
- Customer detail page displays linked property management info
- Data integrity validation: Frontend clears manager selection when company changes; Backend auto-clears manager when company is cleared or changed to a different company, and validates manager/company relationships on all updates
- Multi-contact support: Property managers support multiple emails and phone numbers with type designations (personal/company)
- Auto-contact sync: When a property manager is assigned to a customer, their contact information automatically syncs to customer contacts

Tables: `property_management_companies`, `property_managers`, `property_manager_emails`, `property_manager_phones`

#### Equipment Tracking Module
A comprehensive equipment management system for tracking trucks, mowers, trailers, and other equipment. Features include:
- Equipment CRUD with types (truck, mower, trailer, skid_steer, atv_utv, specialty, other_vehicle) and statuses (active, in_repair, out_of_service, retired)
- Type-specific fields: VIN/serial number, license plate, odometer (currentMileage), engine hours (currentHours), deck size (mowers), axle count/load rating/tire size (trailers), customSpecs JSON (specialty equipment)
- Equipment list with search, type/status filters, and sortable table
- Equipment detail page with tabs: Details (edit form with type-specific sections), Files (attachments), Tickets (open tickets), Service History (completed tickets)
- Dynamic form sections: Mower shows deck size, Trailer shows axle count/load rating/tire size, Specialty shows custom key-value specifications
- Equipment ticketing system separate from customer tickets with categories (preventative_maintenance, repair, inspection, safety, breakdown)
- Ticket status workflow: new → diagnosing → waiting_on_parts → in_repair → completed → closed
- Completion notes capture: workPerformedNotes (required), laborTime, partsUsed, vendorUsed, totalCost
- File attachments stored in object storage with equipment-scoped paths
- Access control: Admin and Shop Manager have full access; Office has create/edit access but cannot retire or delete equipment; other roles have no access

Tables: `equipment`, `equipment_tickets`, `equipment_files`

#### Revenue Tracking System
Tracks contracted revenue with breakdowns by service type (Maintenance vs Chemical) for cost/income analysis. Features:
- Revenue Overview page (/dashboard/revenue): Shows selected month total, YTD total, and full year projection with separate Maintenance and Chemical revenue cards showing month/YTD/annual for each type
- Drill-down capability: Click any Maintenance or Chemical revenue value to see a customer breakdown dialog showing which customers contribute to that total, sorted by contribution amount with links to customer detail pages
- Customer revenue section: Shows annual projection, Maintenance vs Chemical summary cards, monthly breakdown with service type details, and contract breakdown table
- Revenue calculations respect contract start/end dates - only counts revenue for months where the contract was active
- Uses dropdown month/year selectors for easy navigation

Tables: `contracts`, `contract_monthly_amounts` - linked by contractId, with serviceType on contracts determining revenue category

#### Customer Billing Tab
The customer detail page consolidates all billing-related information under a single "Billing" parent tab with sub-navigation:
- **Contracts sub-tab**: Lists all customer contracts with full management (add, edit, end, delete), document uploads, monthly billing amounts, and mobilization fee settings
- **Rate Sheet sub-tab**: Customer-specific hourly rates for labor and equipment
- **Revenue sub-tab**: Annual revenue projection with monthly breakdown by service type
- **Monthly Summary sub-tab**: Consolidated view of monthly billing across all active contracts, broken down by Maintenance/Chemical/Other service types with totals and any mobilization fees

#### First-Time Setup Flow
When deployed to production with an empty database (no users), the app automatically shows a setup page instead of login. This allows the first admin to create their company and account. The setup page creates the company, admin user, company membership, and default settings, then auto-logs in. Once any user exists, the setup page becomes inaccessible for security.

## External Dependencies

- **UI Component Libraries:** Radix UI, Shadcn/ui, Lucide React, CMDK
- **Form & Validation:** React Hook Form, Zod, @hookform/resolvers, Drizzle-Zod
- **Date Handling:** date-fns
- **Session & Security:** Passport.js (with passport-local), express-session, connect-pg-simple, Node.js crypto module
- **Design System:** Google Fonts (Inter, JetBrains Mono)
- **Third-Party Services:** QuickBooks Online Integration (Planned)