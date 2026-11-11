---
name: Publish foreign-key dependencies
description: Preserve company-scoped FKs while handling a proven Publish statement-order defect.
---

Verify the complete generated Publish diff, not only a selected table subset.
Development can have valid composite foreign keys while a production diff adds
them before their referenced UNIQUE constraints.

**Why:** An actual disposable-fork failure was reproduced by executing the full
diff: PostgreSQL rejected a same-company FK before the needed composite unique
key existed. Moving only prerequisite UNIQUE statements earlier made every
statement pass, and both company boundaries remained enforced in insert tests.

**How to apply:** Read the actual diagnostic and current catalogs first; do not
assume any future failure is this one. If reproduced, keep integrity constraints
and production untouched. Changing UNIQUE constraints to unique indexes does not
fix the observed generator ordering, which adds both after new FKs on existing
tables. A managed generator fix is preferable. A two-Publish rollout (uniqueness
first, composite FKs second) needs explicit approval before temporarily removing
development guards. Do not implement that workaround implicitly, weaken company
isolation, patch installed dependencies, or add deployment/startup DDL.

Evidence: `docs/scheduling/reports/publish-foreign-key-order-verification.md`.
