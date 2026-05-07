# High Plains Property Maintenance CRM

A full-featured property maintenance CRM for High Plains Property Maintenance — manages customers, tickets, contracts, campaigns, communications, scheduling, and visual scope mapping.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/highplains-crm run dev` — run the frontend (port from PORT env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`
- Test login: `mike@highplainsprop.com` / `Soccer03` (admin)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server/`)
- Frontend: React + Vite + Tailwind v3 (`artifacts/highplains-crm/`)
- DB: PostgreSQL + Drizzle ORM (`lib/db/`)
- Sessions: `express-session` + `connect-pg-simple` + `passport` (local strategy)
- Build: esbuild (CJS bundle for API)

## Where things live

- `artifacts/api-server/src/routes/routes.ts` — main 16k-line CRM route file (registerRoutes)
- `artifacts/api-server/src/auth.ts` — passport setup, session, login/logout endpoints
- `artifacts/api-server/src/storage.ts` — database query layer
- `artifacts/api-server/src/index.ts` — server entry point
- `lib/db/src/schema/` — Drizzle schema (source of truth for DB types)
- `artifacts/highplains-crm/src/shared/schema.ts` — frontend-compatible schema (drizzle stub, no pg imports)
- `artifacts/highplains-crm/src/shared/drizzle-stub.ts` — minimal drizzle stub for frontend use
- `artifacts/highplains-crm/src/App.tsx` — Wouter router with base path
- `artifacts/highplains-crm/src/index.css` — brand theme (green #1a4d1a)

## Architecture decisions

- OpenAPI spec skipped — frontend uses the original `apiRequest` fetch layer directly (no generated hooks)
- `registerRoutes(app)` in `routes.ts` returns an HTTP server; `index.ts` calls it and invokes `server.listen()`
- Frontend `@shared/*` alias points to `src/shared/` — drizzle stub replaces pg-core at build time so types work without bundling pg drivers
- `canvas` package (used in `visualScopeRenderer.ts`) is dynamically imported — server starts even if native `.node` build is missing
- Express 5 wildcard routes changed syntax: `/:param(*)` → `/*param`

## Product

- Customer management (44+ properties), contracts, contact/notes tracking
- Ticket/work order system with custom ticket types and statuses
- Campaign management with checklists and progress tracking
- Communication center (email/SMS templates, mailbox sync)
- Visual scope mapping with markup overlays
- Scheduling, maintenance crews, snow event tracking
- Equipment tracking, service plans, chemical notifications

## User preferences

- Keep the existing `apiRequest` fetch layer — do not introduce OpenAPI/Orval codegen for the CRM frontend
- Green brand color: `#1a4d1a`

## Gotchas

- `canvas` native module won't build in this environment — visual scope image export will fail at call time (server still starts)
- Apply DB schema via migrations SQL files in `.migration-backup/migrations/` — `pnpm db push` is interactive and may hang
- Password hashing uses Node.js `crypto.scrypt` in `hash.salt` format (hex)
- Express 5 path-to-regexp changed wildcard syntax — use `/*param` not `/:param(*)`
- Frontend schema at `src/shared/schema.ts` uses a drizzle stub — `$inferSelect` types resolve to `any` in the frontend (TypeScript-only impact, runtime is fine)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
