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
