# Landscaping CRM

## Overview

A comprehensive Customer Relationship Management system designed for landscaping businesses. The application manages customers, properties, contracts, work orders (tickets), and provides revenue tracking and labor forecasting capabilities. Built as a manual-first data entry system with role-based access control (admin, office, ops, viewer) and optional QuickBooks Online integration for read-only customer data.

The system follows a vertical slice architecture where features are implemented end-to-end with server-side validation, role-based access controls, and audit fields. Feature flags enable gradual rollout of experimental features.

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
- Access denied page for insufficient permissions
- Route structure: `/dashboard`, `/properties`, `/settings` (admin-only)
- Note: Properties serve as combined customers/properties per business model

### Backend Architecture

**Server Framework:**
- Express.js as the HTTP server
- TypeScript for type safety across the stack
- Session-based authentication using Passport.js with Local Strategy

**Authentication & Authorization:**
- Scrypt-based password hashing with salts
- Express sessions stored in PostgreSQL via connect-pg-simple
- Four user roles: admin, office, ops, viewer
- Role-based route protection (ops/viewer blocked from admin routes)

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
- Users table with role-based access (id, email, passwordHash, name, role, createdAt)
- Properties table (combined customers/properties): id, name, address (street, city, state, zip), property manager (name, phone, email), notes, createdAt, updatedAt
- Contacts table (future): linked to properties for HOA contacts with roles
- Schema validation using Drizzle-Zod integration
- UUID primary keys generated via `gen_random_uuid()`
- Timestamp columns for audit tracking (createdAt, updatedAt)

**Migration Strategy:**
- Drizzle Kit for schema migrations
- Schema defined in `shared/schema.ts` for type sharing between client and server
- Direct SQL execution via execute_sql_tool for table creation

**Implemented Schema:**
- ✅ Users table (Phase 0)
- ✅ Properties table (Phase 1) - combines customers and properties per business requirement
- ✅ Contacts table structure defined (Phase 1) - for HOA contacts with roles

**Future Schema (Per Requirements):**
- Contracts with monthly billing amounts
- Tickets (work orders)
- Service Templates and Property Service Plans
- Settings table for company configuration, seasons, benchmarks, and feature flags

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