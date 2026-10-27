---
name: Drizzle correlated single-table selects
description: Correlated SQL in a Drizzle single-table SELECT can lose qualifications on interpolated column objects.
---

Use explicit static table-qualified identifiers inside correlated subqueries in a single-table Drizzle select projection, rather than interpolating the outer table's column objects.

**Why:** Drizzle's single-table projection formatting can remove the table qualifier from interpolated columns. An outer `id` then resolves to the inner history table's `id`, returning no creation note even though the history row exists. This silently breaks evidence-based renewal membership.

**How to apply:** Keep fixed outer identifiers fully qualified in correlated SQL; never concatenate user-supplied identifiers. A real PostgreSQL test must assert that the selected correlated value is non-null, not merely exercise behavior that could pass when it is absent.
