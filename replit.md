# Landscaping CRM

## Overview

A multi-tenant SaaS Customer Relationship Management system designed for landscaping businesses. The application supports multiple landscaping companies with complete data isolation, role-based access control, and super admin capabilities. Each company can manage their properties (combined customer/property entities), users, and will include contracts, work orders (tickets), revenue tracking, and labor forecasting.

The system follows a vertical slice architecture with multi-tenancy at its core, ensuring secure data isolation between companies while maintaining a unified codebase for efficient SaaS operations.

## Recent Changes

**2025-11-02 - Settings Management Implementation (COMPLETE)**
- **Settings persistence**: Company-scoped settings stored in database with full CRUD operations
- **Settings schema**: New settings table with company_id, seasons, benchmarks, feature flags
- **API endpoints**: GET /api/settings and PATCH /api/settings (admin-only access)
- **Settings page**: Fully functional with 4 tabs (Company, Seasons, Benchmarks, Feature Flags)
- **Company info**: Editable company name with form validation
- **Service seasons**: Interactive month selection for mowing and cleanup seasons
- **Hourly benchmarks**: Configurable rates for Small Pad, HOA Standard, HOA Complex properties
- **Feature flags**: Toggle system for experimental features (Tickets V2, Forecast V2, QBO Write)
- **Data persistence**: All settings changes save to database and persist across sessions
- **End-to-end tested**: All four tabs verified with edit, save, and reload persistence checks
- Production-ready with proper state management and admin-only access control

**2025-11-01 - Super Admin Portal Separation (COMPLETE)**
- **Complete UX separation**: Super admins route to /admin portal, company users route to /dashboard CRM
- **Dedicated super admin home**: SuperAdminHome page with placeholder cards for future platform admin features
- **Conditional sidebar navigation**: Super admins see "Platform Admin" section, company users see "CRM" sections
- **Protected routing**: /admin route restricted to super admins only via superAdminOnly prop
- **Smart redirects**: Root path "/" routes super admins to /admin, company users to /dashboard
- **Role-appropriate navigation**: Super admins see Admin Home only, company users see Dashboard/Properties/Team/Settings based on role
- **End-to-end tested**: Super admin and company admin login flows verified with correct routing and sidebar display
- **Data integrity fixed**: Corrected stale database entries from previous development iterations
- Production-ready with clear separation of platform management vs company operations

**2025-11-01 - Super Admin vs Company Admin Visual Delineation (COMPLETE)**
- **Visual distinction**: "Super Admin" badge (amber) vs "Admin" badge (purple) throughout UI
- **Role badge updates**: RoleBadge component shows "Super Admin" when isSuperAdmin flag is true
- **Users page indicators**: User cards display super admin badges, clear visual distinction
- **Role editing protection**: Super admin roles cannot be edited in Edit User dialog
- **Explanation messaging**: Shows "Super admins always have full admin access across all companies"
- **Backend safeguard**: API rejects role change attempts for super admin users (400 Bad Request)
- **API enhancement**: /api/companies/users includes isSuperAdmin flag for frontend display
- **Permission verification**: Role-based access control tested and working (viewer role restrictions verified)
- **End-to-end tested**: Super admin badge display, role editing restrictions, and viewer access control all verified
- Production-ready and architect-approved with defense-in-depth security

**2025-11-01 - Password Reset Feature with Security Hardening (COMPLETE)**
- **Password reset capability**: Company admins can reset passwords for team members through Edit User dialog
- **Security fix**: Company scoping enforced to prevent cross-company password resets (returns 403 Forbidden)
- **Super admin bypass**: Super admins can reset passwords across all companies as expected
- **Optional field**: Password field is optional - only updates when value provided
- **Validation**: 8 character minimum enforced, passwords hashed with scrypt before storage
- **New storage method**: getCompanyUserById added for company membership verification
- **Security verification**: Company ID checked BEFORE any password updates occur
- **API endpoint**: PATCH /api/company-users/:id enhanced with password update and company scoping
- **Production-ready**: Debug logging removed, end-to-end tested, architect-approved with comprehensive security review

**2025-11-01 - Navigation UX Improvements (COMPLETE)**
- **Smooth transitions**: Eliminated Page Not Found flash during login and navigation
- **Graceful routing**: Unknown routes redirect to dashboard for authenticated users
- **Clean redirects**: Root path "/" explicitly redirects to /dashboard
- **No error states**: Removed NotFound catch-all that caused timing-related flashes
- **Better UX**: All navigation transitions now smooth without intermediate error states
- Architect-approved with no security or routing issues

**2025-11-01 - Create New User Feature (COMPLETE)**
- **User creation**: Company admins can create new users with email, name, password, and role
- **Atomic operation**: User account and company membership created in single transaction
- **Password security**: Passwords hashed with scrypt before storage
- **Database cleanup**: Removed legacy role column from users table (roles now per-company only)
- **Immediate access**: New users can login immediately with their credentials
- **Data isolation**: New users automatically scoped to admin's company, see only company data
- **Validation**: Email format, name presence, password min 8 chars, role selection enforced
- **API endpoint**: POST /api/companies/users/create with security and company scoping
- End-to-end tested and architect-approved with no security issues

**2025-11-01 - Multi-Tenant SaaS Architecture (COMPLETE)**
- **Multi-tenancy**: Full multi-company support with strict data isolation
- **Companies table**: Subscription management (plan, status, billing)
- **Company-scoped data**: All properties, contacts scoped to companyId
- **Company users**: Junction table for user-company memberships with roles and status
- **Super admin role**: System-wide access to all companies with ability to switch between them
- **Authentication**: Enhanced session management with activeCompanyId, activeRole context
- **Authorization**: Role-based permissions (viewer read-only, office/ops/admin can mutate)
- **Security**: Active membership filtering, cross-company data protection, viewer role enforcement
- **User management**: Team page for admins to add/edit/remove company users
- **Seed script**: Demo data with 2 companies showing complete multi-tenancy
- Production-ready and architect-approved with comprehensive security review

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18+ with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching

**UI Framework:**
- Shadcn/ui component library with Radix UI primitives
- Tailwind CSS for styling with custom design system based on Linear + Tailwind UI principles
- Custom CSS variables for theming (light/dark mode support)
- Design emphasizes clarity, spatial efficiency, and consistent patterns

**State Management:**
- TanStack Query handles all server state with aggressive caching (`staleTime: Infinity`)
- React Hook Form with Zod resolvers for form state and validation
- React Context for authentication state
- Local component state for UI interactions

**Routing Strategy:**
- Protected routes that check authentication and role-based permissions
- Automatic redirects to login for unauthenticated users
- Super admin routing: `/admin` portal for platform management (super admin only)
- Company user routing: `/dashboard` (default), `/properties`, `/users` (admin-only), `/settings` (admin-only)
- Smart root redirects: Super admins → /admin, company users → /dashboard
- Unknown routes redirect appropriately based on user type (no 404 errors)
- Access denied page for insufficient permissions
- Super admins can access /admin but are separated from company CRM operations
- Smooth navigation transitions without intermediate error states
- Note: Properties serve as combined customers/properties per business model

### Backend Architecture

**Server Framework:**
- Express.js as the HTTP server
- TypeScript for type safety across the stack
- Session-based authentication using Passport.js with Local Strategy

**Authentication & Authorization:**
- Scrypt-based password hashing with salts
- Express sessions stored in PostgreSQL via connect-pg-simple
- Multi-tenant session context: activeCompanyId, activeRole, isSuperAdminBool
- Four user roles per company: admin, office, ops, viewer
- Super admin role with system-wide access across all companies
- Role-based route protection with mutation restrictions for viewer role
- Active membership filtering (invited/suspended users cannot authenticate)
- Company switching endpoint for super admins to access different companies

**API Design:**
- RESTful endpoints under `/api` prefix
- All routes require authentication (except login)
- JSON request/response format
- Comprehensive error handling with HTTP status codes

**Request Processing:**
- JSON body parsing with raw body preservation for potential webhooks
- Request logging with duration tracking for API endpoints
- CORS and security headers configured appropriately

### Data Storage

**Database:**
- PostgreSQL via Neon serverless
- Drizzle ORM for type-safe database queries
- WebSocket connection pooling for serverless environment

**Schema Design:**
- **Companies table**: Multi-tenant foundation (id, name, slug, subscriptionPlan, subscriptionStatus, billingEmail, timestamps)
- **Company_users junction table**: User-company memberships with role and status (userId, companyId, role, status)
- **Users table**: Global user records (id, email, passwordHash, name, isSuperAdmin, defaultCompanyId, createdAt)
- **Properties table**: Company-scoped customers/properties (id, companyId, name, address, property manager, notes, timestamps)
- **Contacts table**: Company-scoped HOA contacts (id, companyId, propertyId, name, role, contact info, timestamps)
- Schema validation using Drizzle-Zod integration
- UUID primary keys generated via `gen_random_uuid()`
- Foreign key constraints with cascade/set null for referential integrity
- Composite unique constraints on company-scoped data
- Timestamp columns for audit tracking (createdAt, updatedAt)

**Migration Strategy:**
- Drizzle Kit for schema migrations
- Schema defined in `shared/schema.ts` for type sharing between client and server
- Database push with `npm run db:push --force` for safe schema synchronization

**Implemented Schema:**
- ✅ Companies table - multi-tenant foundation
- ✅ Company_users table - user-company memberships
- ✅ Users table - enhanced with isSuperAdmin and defaultCompanyId
- ✅ Properties table - company-scoped with companyId foreign key
- ✅ Contacts table - company-scoped with companyId and propertyId foreign keys
- ✅ Settings table - company configuration, seasons (mowing/cleanup months), hourly rate benchmarks, feature flags

**Future Schema (Per Requirements):**
- Contracts with monthly billing amounts
- Tickets (work orders)
- Service Templates and Property Service Plans

### External Dependencies

**Third-Party Services:**

**QuickBooks Online Integration (Planned):**
- Read-only customer data synchronization
- Opt-in per customer (not all QBO customers tracked in CRM)
- Feature flag controlled: `qbo_write` for future write capabilities
- Customer linking maintained in CRM database

**UI Component Libraries:**
- Radix UI primitives (@radix-ui/*) for accessible, unstyled components
- Shadcn/ui as the design system layer on top of Radix
- Lucide React for icons
- CMDK for command palette functionality

**Form & Validation:**
- React Hook Form for form state management
- Zod for runtime schema validation
- @hookform/resolvers for React Hook Form + Zod integration
- Drizzle-Zod for database schema to Zod schema conversion

**Date Handling:**
- date-fns for date manipulation and formatting

**Development Tools:**
- Replit-specific plugins for development banner, error overlay, and cartographer
- Vite plugins for HMR and development experience

**Session & Security:**
- Passport.js with passport-local strategy for authentication
- express-session for session management
- connect-pg-simple for PostgreSQL session storage
- Built-in Node.js crypto module for password hashing (scrypt)

**Feature Flag System:**
- Stored in Settings table as JSON
- Controls experimental features: `tickets_v2`, `forecast_v2`, `qbo_write`
- Enables safe, gradual feature rollout

**Design System:**
- Google Fonts: Inter (primary), JetBrains Mono (monospace)
- Custom border radius values (9px, 6px, 3px)
- Semantic color system with CSS custom properties
- Sidebar-based layout (16rem width) with flexible content area
- Hover and active state elevation system using opacity overlays