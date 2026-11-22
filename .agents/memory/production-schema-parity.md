---
name: Production schema parity
description: Preserve the live catalog and distinguish operator-installed SQL-only objects from Publish-managed schema.
---

Production's live catalog is authoritative for parity work. Align declaration
names, definitions and nullability to it without rebuilding managed
Development from declarations or restoring obsolete bootstrap constraints.
Production intentionally omits the three campaign-item chemical status
actor foreign keys from the original bootstrap. Preserve nullable user
email for phone-only sign-in.

**Why:** A declaration-based rebuild made Publish propose hundreds of
constraint drops and removal of the proposal numbering sequence; a verified
schema-only restore removed that drift.

**How to apply:** Test declaration parity on a fresh disposable database and
compare with the verified Development/Production catalog. Report differences
that cannot be expressed without changing live behavior.

Only the owner runs reviewed, idempotent SQL in the Production database tool
for required objects Publish does not carry. The agent never writes to
Production. Required functions and triggers need a registry entry, an
operator-run SQL file, and read-only presence checks.

**Why:** Publish can leave a deployment healthy but omit a function or
trigger that a feature's readiness check requires.

**How to apply:** Rehearse the SQL against a disposable copy, including a
second run and behavior tests. Keep installation out of the application,
startup, deployment hooks and admin UI. Ordinary schema changes still
go through Publish.
