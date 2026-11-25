---
name: PostgreSQL CHECK NULL safety
description: CHECK constraints accept rows whose expression evaluates to NULL; pairing checks must guard NOT NULL explicitly.
---
A CHECK passes when its expression is NULL, so `(kind IS NULL AND value IS NULL) OR (kind = 'percent' AND value BETWEEN ...)` silently accepts `kind='percent', value=NULL` or an orphan value with NULL kind in some branches.

**Why:** A real-database test caught invalid discount pairs that the planned check let through.
**How to apply:** In kind/value pairing checks, add `kind IS NOT NULL AND value IS NOT NULL` to the non-null branch, and exercise the invalid NULL combinations in a real PostgreSQL test (unit tests cannot catch this).
