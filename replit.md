# High Plains Property Maintenance CRM

A full-featured property maintenance CRM for High Plains Property Maintenance — manages customers, tickets, contracts, campaigns, communications, scheduling, and visual scope mapping.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/highplains-crm run dev` — run the frontend (port from PORT env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run migrate` — apply any unapplied SQL files in `.migration-backup/migrations/` against `DATABASE_URL` (idempotent; tracks applied files in `_applied_sql_migrations`)
- `pnpm --filter @workspace/scripts run migrate -- --baseline-existing` — first-run mode: marks already-present migrations as applied without re-running them, then applies anything truly new
- `pnpm --filter @workspace/scripts run check-schema-drift` — reports tables/columns the Drizzle schema declares that are missing from the live DB (exits non-zero on drift); the API server also runs this on boot and logs a warning
- `pnpm --filter @workspace/scripts run check-required-extensions` — fails if `lib/db/src/schema/` references any Postgres extension (e.g. `gin_trgm_ops` → `pg_trgm`) that is not installed in the live `DATABASE_URL`'s `pg_extension`. Wired into the `schema-drift` validation workflow so an extension-dependent schema change can't merge without the extension being present.
- Required env: `DATABASE_URL`, `SESSION_SECRET`
- Test login: `mike@highplainsprop.com` / `Soccer03` (admin)

### Production schema & extensions (read this before changing the schema)

Per the `database` skill, **only Replit's Publish flow may change the production schema**. Publish auto-diffs the dev schema against prod and applies the SQL. Do NOT add deploy-build hooks, custom prod-targeted migration scripts, or startup-time DDL to "self-heal" prod — all three are explicit anti-patterns. The application's job is just to read/write data.

**The one thing Publish does NOT generate: `CREATE EXTENSION`.** Drizzle Kit will never emit `CREATE EXTENSION pg_trgm`, so any schema object that depends on a non-default extension (e.g. the trigram index `customers_name_trgm_idx` → `gin_trgm_ops` → `pg_trgm`) will cause Publish to fail with `operator class "..." does not exist` on a target DB that lacks the extension.

**Adding a new Postgres extension — required order:**
1. Install it on the **production** DB first via Replit's Production DB UI (Workspace → Database → switch to Production → run `CREATE EXTENSION IF NOT EXISTS <name>`). Extensions persist forever; this is a one-time per-DB step.
2. Install it on the **development** DB (run `CREATE EXTENSION IF NOT EXISTS <name>` against `DATABASE_URL`) and add a dev-only safety-net migration in `.migration-backup/migrations/` (see `0014_ensure_pg_trgm.sql`) so freshly-bootstrapped dev DBs pick it up.
3. Add the extension to the cross-DB allowlist in `lib/db/src/required-extensions.ts` (`REQUIRED_EXTENSIONS`, plus an `OPERATOR_CLASS_TO_EXTENSION` entry if you're adding a new opclass). This file is the single source of truth read by `scripts/src/check-required-extensions.ts`.
4. **Only then** add the schema object that depends on it (the operator class / index / type) to `lib/db/src/schema/`.

If you reverse this order, the schema-drift / required-extensions validation will block the merge in dev, and even if it slips through, Publish will fail in prod.

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

## Mobile app & crews

- Mobile app (`artifacts/highplains-mobile/`) authenticates via bearer tokens against `/api/m/auth/login` (separate from the web's express-session cookie auth). Tokens are stored on-device with `expo-secure-store` (AsyncStorage fallback on web), are SHA-256 hashed at rest in `mobile_auth_tokens`, and use a 90-day sliding-window expiry refreshed on every authenticated request.
- Mobile access is gated to a small set of roles in `MOBILE_ALLOWED_ROLES` (see `artifacts/api-server/src/mobileAuth.ts`): `crew_supervisor`, `field_manager`, `landscape_supervisor`. A user without one of these roles gets a 403 with a friendly "Mobile access is for crew supervisors" message.
- **Decision: added a new `crew_supervisor` role enum value** (rather than reusing `field_manager` or `landscape_supervisor`) so the supervisor-of-a-crew concept is explicit and unambiguous in the UI / RBAC. When adding the role to a new spot, search for `crew_supervisor` (or the long role tuple) and add it everywhere `landscape_supervisor` already appears.
- `crews` table = a supervisor-owned field crew; distinct from the older `maintenance_crews` table which represents schedule-board crews. Admins manage crews under `/dashboard/settings/crews`.
- **Mobile demo seed:** `pnpm --filter @workspace/scripts run seed-mobile-test-user` provisions a fully populated `crew_supervisor` test user against `DATABASE_URL` (dev only). Idempotent — re-running refreshes today's tickets so the demo always has a clean day. Test credentials it provisions: `mobile-test@highplainsprop.com` / `Soccer03` (role `crew_supervisor`, "Test Crew", 6 seeded customers, ~6 stops on the Today tab).
- **Randy demo seed (preferred for live demos):** `pnpm --filter @workspace/scripts run seed-randy` does the same thing for Randy (`randy@highplainsprop.com`, existing password unchanged) — provisions "Randy's Crew", 6 customers tagged `randy-demo-seed`, and ~6 stops on the Today tab. Same idempotency + prod-safety guard as above. Fails loudly if Randy's user row doesn't exist (his account is provisioned separately and shouldn't be re-created by a seed). Randy is the preferred demo account when showing the mobile app to Mike.

## QuickBooks Online (QBO) integration

The QBO integration requires five secrets. Add them in Replit (Tools → Secrets) and then **republish** — secrets are read at boot, so a running deployment won't see additions until it restarts.

| Secret name | Where to get it |
|---|---|
| `QBO_CLIENT_ID` | Your app's Client ID on [developer.intuit.com](https://developer.intuit.com) → My Apps → Keys & OAuth |
| `QBO_CLIENT_SECRET` | Same page as above |
| `QBO_REDIRECT_URI` | Your deployed app URL + `/api/qbo/callback` — e.g. `https://your-app.replit.app/api/qbo/callback` |
| `QBO_ENVIRONMENT` | `sandbox` (for testing against a QBO sandbox company) or `production` (live QBO) |
| `QBO_TOKEN_ENC_KEY` | A random 64-character hex string — generate with `openssl rand -hex 32` in any terminal |

If the Connect button shows a 503 toast in production, the deployment is missing one or more of these. The server logs the exact missing names: look in the deployment logs for a line like `QBO env vars missing: QBO_TOKEN_ENC_KEY`. Add the missing ones in Secrets and republish.

**Replit Secrets sync to deployments automatically** — you do not need to re-enter them in a separate "deployment secrets" pane. Adding a secret to the workspace + republishing is sufficient.

## User preferences

- Keep the existing `apiRequest` fetch layer — do not introduce OpenAPI/Orval codegen for the CRM frontend
- Green brand color: `#1a4d1a`

## Gotchas

- `canvas` native module won't build in this environment — visual scope image export will fail at call time (server still starts)
- Apply DB schema via `pnpm --filter @workspace/scripts run migrate` (preferred) — runs unapplied SQL files in `.migration-backup/migrations/` against `DATABASE_URL` and tracks them in `_applied_sql_migrations`. `pnpm db push` is interactive and may hang. On a database that was migrated by hand previously, run once with `-- --baseline-existing` to seed the tracker without re-running existing files
- `--baseline-existing` is a **one-time manual recovery flag only** — use it to seed the tracker on a database that was migrated by hand previously. Never bake it into automation: it suppresses duplicate-object errors and can silently mark migrations applied against a partial schema, which is exactly how drift hides. Routine runs must use plain `migrate` (strict mode).
- `--baseline-existing` only suppresses errors for objects that already exist; it does NOT add missing columns to a partially-created table. If the drift checker still reports missing columns after a baseline run, write a small targeted `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration (see `0013_mailbox_backfill_runs_created_at.sql` for the pattern)
- `scripts/post-merge.sh` runs `pnpm install` and then `pnpm --filter @workspace/scripts run migrate` (strict, no baseline) so freshly-merged task branches auto-apply any new SQL migrations and surface real failures
- A `schema-drift` validation step is registered and runs before `mark_task_complete`. It executes `pnpm --filter @workspace/scripts run check-schema-drift` and **fails the task** if the Drizzle schema declares any table/column that's missing from the live DB. When it fails, add a SQL file in `.migration-backup/migrations/` (use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`; see `0013_mailbox_backfill_runs_created_at.sql` for the pattern) and re-run `pnpm --filter @workspace/scripts run migrate`. Do not bypass this check — silent drift is exactly what caused the 5-table / 7-column production cleanup
- Keep `lib/db/drizzle.config.ts` as the only active Drizzle config in the repository. `.migration-backup/` may contain checked-in `.sql` files under `migrations/`, but no Drizzle config, schema source, package manifest/lockfile, or `migrations/meta` snapshot; Replit Publish can auto-discover those stale project files and generate destructive drops from the obsolete schema.
- Password hashing uses Node.js `crypto.scrypt` in `hash.salt` format (hex)
- Express 5 path-to-regexp changed wildcard syntax — use `/*param` not `/:param(*)`
- Frontend schema at `src/shared/schema.ts` uses a drizzle stub — `$inferSelect` types resolve to `any` in the frontend (TypeScript-only impact, runtime is fine)
- The mobile `dev` script (in `artifacts/highplains-mobile/package.json`) prefixes `expo start` with `fuser -k -n tcp $PORT` and sets `EXPO_NO_PROMPT=1`. **Do not remove either.** Without them, when the workflow restarts and the previous Expo process is still holding port 19245, `expo start` drops into an interactive `"Use port 19246 instead? (Y/n)"` prompt and silently hangs — the workflow shows RUNNING but Metro never serves a new bundle, so devices keep talking to the old/stale Metro and crash on any newly-added native module (this is exactly how the Slice 7 `@react-native-community/netinfo` "module not found" crash happened even though the package was installed). `fuser -k` frees the port; `EXPO_NO_PROMPT=1` makes any future interactive question fail loudly instead of hanging. Do NOT use `CI=1` for the same purpose — it disables Metro watch mode / hot-reload

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
