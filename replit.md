# Landscaping CRM

## Overview
A multi-tenant SaaS Customer Relationship Management system for landscaping businesses. Its core purpose is to manage customers, contacts, notes, contracts (including service types and billing), and company settings. The system incorporates role-based access control (admin, office, ops, viewer, super admin) and a vertical slice architecture for data isolation. The vision is to offer a comprehensive, adaptable CRM to streamline operations and enhance service delivery for landscaping companies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter for routing, and TanStack Query for state management. It uses Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management, storing sessions in PostgreSQL. It supports multi-tenancy with roles: admin, office, ops, viewer (company-specific), and super admin (system-wide). The API is RESTful, uses JSON, and includes comprehensive error handling.

### Data Storage
PostgreSQL (Neon serverless) with Drizzle ORM is used for data persistence. The multi-tenant schema includes `Companies`, `Company_users`, `Users`, `Customers`, `Contacts`, `Contracts`, `Contract_documents`, `Contract_services`, and `Settings` tables. UUIDs are primary keys, and Drizzle Kit manages migrations.

#### Contract Management
Provides full contract lifecycle management, including:
- **Monthly Billing:** Stateful editing of monthly amounts, 12-month entry, validation, and permission-based access.
- **Contract Lifecycle:** Ability to end or delete contracts (admin/office roles), and unique contract type enforcement (e.g., one active Maintenance contract per customer).
- **Coverage Indicator:** A smart badge showing current service coverage ("Maintenance & Snow," "Maintenance Only," "Snow Only," "No Coverage") based on active contracts and dates.
- **Visibility:** Default hiding of ended contracts with a toggle to show all.

#### Contract Services
The `Contract_services` table stores service configurations with:
- **Service Catalog:** 8 pre-defined service types with intelligent defaults.
- **Monthly Distribution:** A 12-element array for scheduled visits per month.
- **Auto-calculated Annual Count:** Derived from monthly distribution.
- **Service-specific Parameters:** Stored as JSONB.

### Object Storage
Replit's object storage (Google Cloud Storage) is used for contract PDF documents, featuring:
- Company-scoped ACL for access control.
- Private visibility with direct client-side uploads via presigned URLs.

### Feature Specifications

#### Tools Section
A workspace for creating standardized documents using customer data, with guided workflows and PDF export.

##### Contract Builder
A document generation tool for landscape maintenance contracts using templates and variable substitution.
- **Database Architecture:** `contract_templates`, `contract_builder_documents`, `contract_builder_sections`, `contract_builder_variables` tables for comprehensive contract management.
- **Contract Variables:** 34 variables covering customer info, contract terms, pricing, and labor rates.
- **Workflow:** Select customer, select/deselect sections, fill variables (auto-populated where possible), preview, auto-save, publish, and export to PDF.
- **Template Sections:** 17 pre-defined sections, some required, some optional, covering all aspects of a landscape maintenance contract.

## External Dependencies

### Third-Party Services
- **QuickBooks Online Integration (Planned):** For customer data synchronization.

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
- Custom CSS properties for theming.

## Contract Builder (Tools Section)

### Overview
A document generation tool for landscape maintenance contracts using templates and variable substitution.

### Features Implemented
- ✅ Customer selection modal with two modes:
  - Search mode: Search existing customers by name or address
  - New Customer mode: Quick-create form with name, street, city, state, zip fields
  - Seamless flow: Creating a customer automatically selects them and proceeds to contract building
- ✅ **Sections Tab**: Intuitive outline structure with all section titles visible
  - Sections I-IV (auto-included): Header, Terms, Definitions, General Provisions, Communication
  - Section V - Maintenance & Site Care: Parent section header with checkable subsections B-I (V. prefix removed for cleaner display)
  - Sections VI-VIII (checkable): Irrigation Services, Winter Services, Snow & Ice Management
  - Sections IX-XIII (auto-included): Insurance, Termination, Payments, Labor Rates, Acceptance
  - Auto-included sections show filled checkbox indicator (non-interactive)
  - Optional sections have working checkboxes for inclusion control
- ✅ **Variables Tab**: Variables grouped by section in contract order, showing where each variable appears with category and section context
  - **Conditional Variable Filtering**: Service-specific variables only appear when their parent sections are included
    - Irrigation variables (e.g., `irrigation_labor_rate`) hide when Irrigation Services sections are excluded
    - Snow/ice variables (e.g., `handshovel_rate`, `plowtruck_rate`, `icemelt_application_rate`) hide when Snow & Ice sections are excluded
    - Core variables (customer info, contract terms, payments) always visible regardless of section selection
    - Optimized with memoized section category checks for performance
- ✅ Variable extraction logic: Parse {{variable_name}} syntax from template sections
- ✅ Auto-fill logic: Populate customer data (name, address, contact info), contract dates, pricing from existing maintenance contracts, default labor rates
- ✅ Auto-calculated fields:
  - `petstations_total_price` = `num_petstations` × `petstation_price` (auto-updates when either input changes)
  - `monthly_payment` = `contract_amount` ÷ `num_months` (auto-updates when either input changes)
  - Calculated fields are read-only and marked with "(Auto-calculated)" label
- ✅ Auto-save: Every 30 seconds with proper guards for documentId and loaded sections
- ✅ **Preview Tab** with visual enhancements:
  - Variable substitution shows filled values in contract
  - Variables highlighted with yellow background for easy identification
  - Hover tooltip shows variable key name
  - Section headers formatted with clear visual hierarchy
  - Proper spacing and separators between sections
- ✅ PDF generation: Professional PDF with High Plains logo, green brand color (#2E7D32), customer-specific storage paths, company-scoped ACL
- ✅ Type consistency: Drizzle ORM schema uses camelCase (sectionKey, sectionTitle, defaultContent, displayOrder) and returns camelCase properties at runtime
- ✅ **Draft Management**: Complete workflow for saving and loading drafts
  - When selecting a customer, system shows existing drafts (if any) in a modal
  - User can choose to load an existing draft or create a new one
  - Loading a draft restores all sections (included/excluded states and custom content) and variable values
  - Draft list shows document title, status (draft/published), and last updated timestamp
  - Seamless workflow: Load → Edit → Auto-save → Export PDF
- ✅ **Publish & Create Contract Integration**: Direct connection to CRM contract management
  - Single-click workflow to publish document and create CRM contract record
  - Automatic service type inference from included sections (Maintenance, Irrigation, Snow)
  - Billing pattern determination from `num_months` variable (monthly, seasonal, 12-of-12)
  - PDF generation and upload to object storage with company-scoped access
  - Contract document linking: PDF attached as "Signed Agreement"
  - Duplicate contract prevention: Validates against existing active Maintenance/Snow contracts
  - Variable validation: Requires `contract_start_date` and `contract_amount`
  - User-friendly error handling with toast notifications
  - Automatic navigation to customer detail page upon success
  - Document status update to "published" with contractId linkage

### Recent Bug Fixes (November 22, 2025)

#### Bug #1: PDF Export JSON Parsing Error
**Problem**: Backend returned `204 No Content` for PUT/POST save endpoints, but frontend attempted to parse JSON from empty responses, causing "SyntaxError: Unexpected end of JSON input".

**Fix**: 
- Added response status checks before calling `.json()` in save sections mutation
- Added response status checks before calling `.json()` in save variables mutation  
- Updated auto-save functionality to handle 204 responses properly
- Renamed local `path` variable to `normalizedPath` to avoid shadowing Node.js path module

**Impact**: Save Draft, Auto-save, and Export PDF operations now work without JSON parsing errors.

#### Bug #2: Draft Selection Dialog Not Appearing
**Problem**: Radix UI Dialog component conflict when closing customer selection dialog and opening draft selection dialog in the same render cycle. Dialog state was set to open but component never rendered.

**Fix**: Implemented React `useEffect` hook to watch for customer selection changes and open draft dialog when:
1. A customer is selected
2. Customer dialog is closed
3. No document is currently loaded

**Impact**: Draft selection dialog now appears reliably after customer selection, allowing users to create new drafts or load existing ones.

#### Bug #3: Variable Naming Mismatch in Publish & Create Contract
**Problem**: Template sections used `{{start_date}}` and `{{end_date}}`, but the Publish & Create Contract backend endpoint expected `contract_start_date` and `contract_end_date`, causing validation failures with "Missing required variables: contract_start_date" error.

**Fix**:
1. Updated database templates via SQL to use canonical `{{contract_start_date}}` and `{{contract_end_date}}` variable names
2. Updated frontend auto-fill logic to use `contract_start_date` and `contract_end_date`
3. Added backend normalization layer to map legacy variable names (`start_date` → `contract_start_date`) for backwards compatibility with existing drafts
4. Improved frontend error handling to extract and display user-friendly error messages from API responses

**Impact**: Publish & Create Contract feature now works end-to-end, successfully creating CRM contracts from Contract Builder documents with proper variable validation and user-friendly error messages.