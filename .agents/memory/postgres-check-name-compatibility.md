---
name: PostgreSQL check-name compatibility
description: Widening checks must account for historical SQL and ORM constraint names.
---

When widening an existing PostgreSQL CHECK, inspect the actual installed constraints,
not only the ORM's current declared name; both inline-SQL automatic names and
explicit ORM names may coexist.

**Why:** A catalog unit expansion passed schema-column drift validation but still
failed inserts because an older automatically named unit check remained alongside
the new expanded check. PostgreSQL applies both, so the narrower old check still won.

**How to apply:** Inspect `pg_constraint` before modifying checks, deliberately handle
each historical name, and test an insertion using a newly allowed value on a
migration-created database. A column-only drift check cannot prove check compatibility.

The user supplied `attached_assets/Pasted--Publish-fix-check-constraints-the-Publish-diff-mangles_1794432951957.txt` describing a cancelled Publish preview: a doubled inline CHECK for the former service-program table and omitted same-name widened estimate kind/type checks. Treat these as reported preview findings until reproduced, not verified current deployment behavior.

**Why:** The brief requests diff-level evidence, not merely valid migration SQL, and separately prohibits publishing, feature changes and production data changes.

**How to apply:** When this work is authorized, inspect actual production constraint definitions read-only, audit later migrations for unchanged-name expression changes, use new names for widened checks with guarded old-name retirement, and prove generated SQL plus newly allowed inserts against an isolated production-schema copy. Coordinate with SC1's explicit service-program retirement: do not recreate a retired table to satisfy this older preview example. Report the current applicability and preserve SC1's zero-row guard. This reference upload alone does not authorize a task, schema changes or publishing.
