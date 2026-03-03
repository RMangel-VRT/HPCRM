# High Plains Property Maintenance CRM

## Overview
A CRM for High Plains Property Maintenance designed to streamline operations for landscaping companies. It manages customers, contacts, notes, contracts, and company settings. Key features include role-based access control, a Contract Builder for generating maintenance contracts, and a mobile-first Ticketing System for field crew task management. The project aims to enhance service delivery and operational efficiency within the property maintenance sector.

## User Preferences
Preferred communication style: Simple, everyday language.
Test login credentials: randy@highplainsprop.com / Soccer03

## System Architecture

### UI/UX
The frontend is built with React 18+, TypeScript, Vite, Wouter, and TanStack Query. It uses Shadcn/ui and Radix UI primitives, styled with Tailwind CSS, supporting custom theming and light/dark modes.

### Technical Implementation
The backend uses Express.js and TypeScript. Authentication is handled by Passport.js with session-based management stored in PostgreSQL. It supports multi-tenancy with granular role-based access (Admin, Office, Field Manager, Field, Irrigation Manager, Shop Manager). Data is persisted in PostgreSQL (Neon serverless) using Drizzle ORM and Drizzle Kit for migrations. Replit's object storage (Google Cloud Storage) stores contract PDF documents and visual scope images with company-scoped ACL and presigned URL uploads.

#### Contract Management
Comprehensive contract lifecycle management with stateful editing, validation, permission-based access, and support for 8 pre-defined service types. It tracks mobilization fees and auto-calculates annual counts. The Contract Builder generates landscape maintenance contracts using templates, variable substitution, and auto-population, with preview, auto-save, publish, and PDF export functionalities.

#### Ticketing System
A mobile-first system for field crews with configurable ticket types, custom workflows, and step-specific data capture. Projects follow a 3-phase workflow (Sales/Estimating, Field Execution, Billing) with linked tickets. Tickets are categorized by work type (Contract Work, Extra Billable, Project, Admin, Estimate Request, Shop To-Do) which drives billing behavior. It includes a 3-step ticket creation wizard, auto-creation of Invoice tickets for billable work, an RFP Request pipeline, and a delegation system.

#### Unified Invoicing Workflow
Invoice data is entered only on Invoice tickets. Billable tickets reaching "Ready for Billing" status auto-create and link an Invoice ticket. Invoice tickets are auto-assigned to the designated billing user. Upon reaching "Invoiced" status, invoice data propagates to the parent ticket, advancing its status. A migration tool assists with creating Invoice tickets for existing billing-ready tickets.

#### Weekly Schedule System
A comprehensive scheduling system assigning properties to crews using template-based drag-and-drop functionality, including crew capacity indicators, a crew-oriented viewer, and PDF export.

#### Property Maps System
A KML-based layer mapping system for field crews to view customer-specific property zones and service areas.

#### Ticket Notifications System
In-app notifications for ticket assignments, completions, mentions, and due date reminders, categorized into "Needs Attention" (urgent) and "Updates" (standard) with distinct visual cues.

#### Property Management System
Tracks Property Management Companies and Property Managers, integrated into customer management, allowing customers to link to both a company and a manager with multi-contact support.

#### Equipment Tracking Module
Manages various equipment types with CRUD operations, type-specific fields, status tracking, search/filter, and detailed pages including dedicated equipment ticketing with defined workflows.

#### Revenue Tracking System
Tracks contracted revenue by service type, providing monthly and YTD totals, annual projections, and drill-down capabilities.

#### Contracts Overview
A cross-customer contracts overview page for Admin and Office roles with summary cards, search/filter, and a sortable table.

#### Customer Billing Tab
Consolidates all billing information on customer detail pages with sub-tabs for Contracts, Rate Sheet, Revenue, and Monthly Summary.

#### Snow Storm Billing/Tracking System
Manages winter weather events, property impacts, service assignments, and automated invoice ticket generation, integrating with the existing ticketing system.

#### First-Time Setup Flow
An initial setup page for creating the first company and admin user upon deployment with an empty database, accessible only once.

#### Reports
A reporting tool for Admin and Office roles generating exportable lists (Customer/Property List, Contacts by Customer, Equipment List, Contracts List, Tickets Summary) with sortable, searchable data tables and CSV export.

#### Email Notification System
Transactional email notifications powered by SendGrid for events like "Work Completed" tickets. Uses a template/rule engine with email logs and resend capability.

#### Proposal Maker
A tool for Admin and Office roles to create customer proposals, capturing customer references, QB estimate numbers, scope of work, one QB estimate PDF, and multiple supporting images. Files are stored in object storage. Includes integration with Project and Estimate Request tickets, allowing proposals to be linked or newly created within ticket context. Generates a branded PDF output by merging branded cover/scope pages, the original QB estimate PDF, and an optional photo appendix.

#### Visual Scope Sheet Tool (VS1 + VS2)
A satellite map-based tool for Admin and Office roles to create property scope imagery for proposals. Each sheet captures customer reference, title, scope date, and a base satellite image from Mapbox or uploaded, stored in GCS. The draft page renders a high-resolution Mapbox satellite-streets map.

VS2 adds a markup layer editor (VisualScopeEditor.tsx). When a base image exists, the draft shows an interactive SVG overlay editor instead of a static image. Tools: Select, Polygon, Polyline, Tree/Plant/Boulder symbol stamps, Text labels. SVG viewBox="0 0 1 1" stores all coordinates as normalized 0–1 fractions (clamped), so markup stays aligned when the browser resizes. Full markup array saved via debounced PATCH (1.5 s) to markupData JSONB column. Auto-save does NOT fire on initial load. Live legend panel shows symbol counts and updates on add/delete. Guardrails: max 200 objects or 5,000 total points. Text editing uses an HTML overlay input. Drag-to-move works for symbols and text. Keyboard Delete key removes selected objects. Database column: markup_data jsonb on visual_scope_sheets.

VS3 adds server-side PNG export (server/visualScopeRenderer.ts using node-canvas). Three export types: base (satellite image only), overlay (transparent markup layer), combined (base + markup + optional legend). Endpoints: GET /api/visual-scope-sheets/:id/export/{base|overlay|combined} — require auth + admin/office, return image/png, support ?w= (1200–4000 px, default 2000) and ?inline=1 for browser preview. On-demand rendering (no storage). Coordinates are the same normalized 0–1 system as VS2. Legend appears in combined export only when symbols exist, uses "Trees × N / Plants × N / Boulders × N" labels. Size guards: 30 MB file limit, 20000 px dimension limit (both return clear 400). Draft page shows an Exports card with Preview + Download buttons for all three types when baseImagePath exists.

VS4 integrates Visual Scope Sheets into the Proposal Maker. One VS sheet can be attached to a proposal draft via a new "Visual Scope" card on the ProposalDraft page (between QB Estimate and Supporting Images). Selecting a sheet saves visualScopeSheetId via PATCH. Two optional checkboxes (vsIncludeBase, vsIncludeOverlay) control whether additional base-only and overlay-only pages appear in the PDF. Proposal PDF generation calls renderVisualScope() directly (no HTTP round-trips) and inserts VS pages after the branded cover/scope pages and before the QB estimate pages. VS sheets without a base image cannot be selected. Failure to render the VS export aborts PDF generation with a clear error. Schema: three new columns on proposals — visual_scope_sheet_id, vs_include_base, vs_include_overlay. ProposalWithDetails type now includes visualScopeSheet?.

VS3.5 adds High-Resolution Base Image Capture via the Mapbox Static Images API. Endpoint: POST /api/visual-scope-sheets/:id/capture-highres — accepts { centerLat, centerLng, zoom, bearing, pitch, width (1200–4000, default 2000) }, fetches a @2x satellite-streets tile, resizes via node-canvas if target exceeds 2560px, saves the PNG buffer to GCS private storage, and updates baseImagePath + captureParams (JSONB column). The draft page CaptureUI offers three modes: High-Res (primary, calls the API endpoint), Standard (WebGL canvas screenshot), and Upload (file). Width selector: 2000/3000/4000px. When WebGL is unavailable, a manual lat/lng/zoom input form allows High-Res capture. Re-capture High-Res button appears in the editor header when captureParams exists, using stored coordinates to regenerate. Database column: capture_params jsonb on visual_scope_sheets.

## External Dependencies

-   **UI Component Libraries:** Radix UI, Shadcn/ui, Lucide React, CMDK
-   **Form & Validation:** React Hook Form, Zod, @hookform/resolvers, Drizzle-Zod
-   **Date Handling:** date-fns
-   **Session & Security:** Passport.js (with passport-local), express-session, connect-pg-simple, Node.js crypto module
-   **Email:** SendGrid (@sendgrid/mail) via Replit connector
-   **PDF Generation:** PDFKit (branded cover/scope generation), pdf-lib (PDF merging for Proposal Maker)
-   **Design System:** Google Fonts (Inter, JetBrains Mono)
-   **Mapping:** Mapbox (for Visual Scope Sheet Tool)