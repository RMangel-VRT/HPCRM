---
name: PostgreSQL target isolation
description: Prevent scratch database operations from connecting to managed PostgreSQL, and bootstrap test schemas safely.
---

Run scratch PostgreSQL commands with a clean environment and explicit host, port, username and database flags. Verify the connection's database, server address and port before issuing any write. Prefer a fresh scratch database to a destructive reset. Never use a bare `psql` or `createdb` in a shell with workspace PostgreSQL credentials.

**Why:** libpq commands can use inherited `PG*` settings instead of a `DATABASE_URL` shell override. A command intended for a scratch server previously reached the managed development database. Active sync workers can also pick up synthetic connected mailboxes in shared development and make email tests unreliable.

**How to apply:** Set an explicit local target for application test processes as well, without inherited credentials. Build the disposable schema from current declarations, supplementing only verified SQL-only dependencies. The historical migration ledger predates some current schema objects, so replaying the chain alone does not bootstrap an empty database.

For a production-to-development schema resync, Replit's read-only production
query tool connects to a replica with its own Neon endpoint ID. It is suitable
for catalog comparison but does not prove a direct `pg_dump` source. Verify the
TLS host family, region and server-reported endpoint on both direct connections
in the same guarded shell run as export and restore; keep production read-only
and stop on any mismatch. A schema-only restore does not restore company rows
or accounts. Check prerequisites for the existing-account demo seed separately;
do not copy production credentials or assume a schema restore provisions login.

**Why:** The replica reported a different endpoint than the explicitly
authorized production source, and the development demo seeds require data that
is not present in a schema-only dump.

Rehearse a schema-only resync in a disposable local cluster before resetting
managed development. Keep managed `_system` objects out of a `public` restore.
Neon may emit physical `pg_attver` column metadata that standard PostgreSQL
cannot restore; compare logical definitions rather than transplanting those
parameters into a local cluster. Keep the original export unchanged.

**Why:** `--baseline-existing` still runs migrations against an empty ledger;
it suppresses duplicate-object errors only. Historical files can reference
tables removed by later migrations even when the restored schema is correct.

**How to apply:** Keep the actual reset and restore atomic and stop before
changing development if the rehearsal fails. An audited baseline that records
already represented or superseded migrations requires separate approval; do
not ignore missing-object errors or blindly mark pending migrations applied.
