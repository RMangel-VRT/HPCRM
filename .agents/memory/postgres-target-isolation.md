---
name: PostgreSQL target isolation
description: Prevent scratch database operations from connecting to managed PostgreSQL, and bootstrap test schemas safely.
---

Run scratch PostgreSQL commands with a clean environment and explicit host, port, username and database flags. Verify the connection's database, server address and port before issuing any write. Prefer a fresh scratch database to a destructive reset. Never use a bare `psql` or `createdb` in a shell with workspace PostgreSQL credentials.

**Why:** libpq commands can use inherited `PG*` settings instead of a `DATABASE_URL` shell override. A command intended for a scratch server previously reached the managed development database. Active sync workers can also pick up synthetic connected mailboxes in shared development and make email tests unreliable.

**How to apply:** Set an explicit local target for application test processes as well, without inherited credentials. Build the disposable schema from current declarations, supplementing only verified SQL-only dependencies. The historical migration ledger predates some current schema objects, so replaying the chain alone does not bootstrap an empty database.
