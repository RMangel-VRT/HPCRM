---
name: Startup migrations runner is not called at boot
description: How schema/data migrations actually reach a database in this repo, and the DDL-vs-DML boot rule.
---

The exported startup-migration runner in the API server's routes file is NOT invoked on boot — only the ticket-type rename runs at the top of route registration. The real once-per-database mechanism is SQL files in `.migration-backup/migrations/` applied by `pnpm --filter @workspace/scripts run migrate` (auto-run by `scripts/post-merge.sh`); prod schema changes go through Publish's auto-diff.

**Why:** repo policy (replit.md "Production schema & extensions") forbids startup-time DDL / prod self-healing; a past slice was rejected in review because its backfill lived only in the never-called runner.

**How to apply:** ship DDL as a numbered SQL migration file (IF NOT EXISTS guards). If data backfill must run after boot-time logic (e.g. name-based backfills that depend on the ticket-type rename), add a DML-only, idempotent backfill call in route registration after the rename, guarded by an information_schema column-existence check so it skips cleanly when the SQL migration hasn't run yet.
