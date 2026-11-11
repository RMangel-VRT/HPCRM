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

For an explicitly approved staged rollout, never place restoration SQL into the
active migration directory in the same stage as removal. Restore only after
read-only production inspection confirms the prerequisite unique keys landed.

**Why:** The normal migration runner applies all pending files; pre-creating both
stages would immediately undo the approved first-stage schema and reproduce the
same failing Publish diff. The user approved temporary removal, not permanent
loss of company guards.

**How to apply:** Keep the restoration procedure in the rollout report, use a
fresh guarded development migration only after the first successful Publish,
and preserve old single-column FKs throughout. See
`docs/scheduling/reports/publish-foreign-key-stage-one.md` for the approved scope.
