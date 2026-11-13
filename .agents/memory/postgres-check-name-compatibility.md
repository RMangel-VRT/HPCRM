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

Publish's database-to-database introspection was independently reproduced mangling a leading `CHECK (COALESCE(..., false))` into doubled `CHECK` syntax. A boolean `IS TRUE` wrapper round-trips correctly in the actual preview. Replacing `COALESCE(predicate, false)` with `predicate IS TRUE`, or wrapping the existing non-null COALESCE expression in `IS TRUE`, preserves its rejection semantics.

**Why:** Valid Drizzle declarations and valid migration SQL alone did not establish that Publish's introspection would emit executable SQL. The same defect affected the replacement calendar as well as its predecessor.

**How to apply:** Preserve the round-trip-safe shape in future calendar schema declarations and pushes. Verify with the actual Publish diff, not only source-to-source schema generation, and test emitted SQL in isolated PostgreSQL. Widened CHECK expressions also need fresh constraint names because the observed diff omitted same-name changes. See `docs/scheduling/reports/publish-check-constraints-verification.md` for evidence and limits.

Local Drizzle Kit database introspection can generate unrelated, unstable index
operator-class changes even when PostgreSQL's actual index definitions match.
Do not silently filter those statements and call the full diff clean.

**Why:** A full-schema before/after constraint-only proof generated incompatible
operator classes on unchanged mixed-type indexes. Source-only generation and
column drift checks did not expose that problem. The assigned-task environment
also lacked the read-only live Publish-preview callback.

**How to apply:** Preserve the complete generated diff, attempt it only in
disposable PostgreSQL, compare actual catalogs independently, and report unrelated
failures separately. Distinguish local Kit evidence from a live Publish preview;
never infer that a local generator failure is a verified production failure.
See `docs/estimates/reports/canonical-estimate-unit-checks.md` for limitations.
