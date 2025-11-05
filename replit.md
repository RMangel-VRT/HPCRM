# Landscaping CRM

## Overview
A multi-tenant SaaS Customer Relationship Management system designed for landscaping businesses. It is customer-centric, focusing on customers as the primary entity to manage contacts, notes, contracts with service types and billing patterns, and company settings. The system includes role-based access control (admin, office, ops, viewer, super admin) and features a vertical slice architecture to ensure data isolation and efficient SaaS operations. The business vision is to provide a comprehensive, adaptable CRM solution that simplifies operations for landscaping companies, offering significant market potential by streamlining customer management and service delivery.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend uses React 18+ with TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. The UI is built with Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, emphasizing clarity and consistency with custom theming for light/dark modes. State management leverages TanStack Query for server state, React Hook Form with Zod for forms, and React Context for authentication. Routing is protected, role-based, and includes dedicated portals for super admins (`/admin`) and company users (`/dashboard`), with smart redirects and smooth navigation transitions.

### Backend Architecture
The backend is built with Express.js and TypeScript. Authentication uses Passport.js with session-based management, storing sessions in PostgreSQL. It supports multi-tenancy with `activeCompanyId`, `activeRole`, and `isSuperAdminBool` in the session context. There are four company-specific roles (admin, office, ops, viewer) and a system-wide super admin role. The API is RESTful, uses JSON, requires authentication for most routes, and includes comprehensive error handling.

### Data Storage
The system uses PostgreSQL (Neon serverless) with Drizzle ORM for type-safe queries. The schema is designed for multi-tenancy, including `Companies`, `Company_users` (junction table for user-company memberships with roles), `Users`, `Customers` (formerly properties), `Contacts`, `Contracts`, `Contract_documents`, `Contract_services`, and `Settings` tables. UUIDs are used for primary keys, and foreign key constraints ensure referential integrity. Drizzle Kit is used for schema migrations, with the schema defined in `shared/schema.ts` for type sharing.

#### Contract Management
The system provides comprehensive contract lifecycle management with the following features:

**Monthly Billing:**
- **Edit/Save/Cancel Workflow:** Monthly billing amounts use a stateful edit mode with explicit save/cancel actions to prevent accidental data loss
- **12-Month Entry:** Each contract stores individual monthly amounts (in cents) for each month (1-12)
- **Validation:** Non-negative decimal validation prevents invalid amounts; empty fields default to $0.00
- **Permission-based Editing:** Admin and office roles can edit monthly amounts; ops and viewer have read-only access

**Contract Lifecycle:**
- **End Contract:** Admin and office roles can end active contracts with confirmation dialog; updates status to "ended" and creates status history
- **Delete Contract:** Admin-only action with confirmation dialog; permanently removes contract and associated data
- **Uniqueness Enforcement:** Only ONE active Maintenance contract and ONE active Snow contract allowed per customer at a time
- **Uniqueness Validation:** Enforced on both POST (create) and PATCH (reactivate) operations with clear JSON error messages

**Coverage Indicator:**
- **Smart Calculation:** Badge displays customer's current service coverage based on active contracts within their term dates
- **Four States:** "Maintenance & Snow", "Maintenance Only", "Snow Only", "No Coverage"
- **Date-aware:** Considers both contract status AND whether current date falls within start/end dates
- **Real-time Updates:** Coverage badge updates immediately when contracts are created, ended, or deleted

**Visibility Controls:**
- **Default View:** Ended contracts hidden by default to reduce clutter
- **Show All Toggle:** Users can toggle to view all contracts including ended ones
- **Status Badges:** Visual indicators for "Active" and "Ended" status

#### Contract Services
The `Contract_services` table stores service configurations for each contract with the following features:
- **Service Catalog:** 8 pre-defined service types (mowing, pet_station, chemicals, trimming, ornamental_grass, aeration, cleanups, tree_pruning) with intelligent defaults
- **Monthly Distribution:** 12-element integer array representing scheduled visits per month (Jan-Dec)
- **Auto-calculated Annual Count:** Derived from monthly distribution sum; automatically recomputed on both client and server to prevent data inconsistency
- **Service-specific Parameters:** Stored as JSONB (e.g., organic flag for chemicals, station count for pet stations)
- **Company Isolation:** All services scoped to company with proper authorization checks
- **Version 1 (Blueprint):** Services define the schedule but do not yet generate work orders/tickets (planned for Version 2)

### Object Storage
The system uses Replit's built-in object storage (Google Cloud Storage backend) for storing contract PDF documents. Key features:
- **Company-scoped ACL:** Documents are protected with access control lists that verify company membership via the `Company_users` junction table
- **Private visibility:** All documents use "private" visibility with company-specific access rules
- **Direct uploads:** Client-side direct uploads using presigned URLs (15-minute TTL)
- **Normalized paths:** Object paths stored as `/objects/uploads/{uuid}` in database
- **ACL enforcement:** `CompanyMemberAccessGroup` class verifies user membership before granting access

## External Dependencies

### Third-Party Services
- **QuickBooks Online Integration (Planned):** For read-only customer data synchronization, feature-flag controlled.

### UI Component Libraries
- **Radix UI:** Primitives for accessible components.
- **Shadcn/ui:** Design system layer on top of Radix.
- **Lucide React:** Icons.
- **CMDK:** Command palette functionality.

### Form & Validation
- **React Hook Form:** Form state management.
- **Zod:** Runtime schema validation.
- **@hookform/resolvers:** Integration for React Hook Form + Zod.
- **Drizzle-Zod:** Database schema to Zod schema conversion.

### Date Handling
- **date-fns:** Date manipulation and formatting.

### Development Tools
- **Replit-specific plugins:** For development banner, error overlay, and cartographer.
- **Vite plugins:** For HMR and development experience.

### Session & Security
- **Passport.js** with **passport-local strategy:** Authentication.
- **express-session:** Session management.
- **connect-pg-simple:** PostgreSQL session storage.
- **Node.js crypto module:** For scrypt-based password hashing.

### Feature Flag System
- Stored in the `Settings` table, controlling features like `tickets_v2`, `forecast_v2`, `qbo_write`.

### Design System
- **Google Fonts:** Inter (primary), JetBrains Mono (monospace).
- Custom border radius values and a semantic color system using CSS custom properties.
- Sidebar-based layout with a flexible content area, and a hover/active state elevation system.