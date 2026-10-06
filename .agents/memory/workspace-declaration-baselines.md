---
name: Workspace declaration baselines
description: Avoid mistaking stale emitted library types for regressions in leaf-package checks.
---

Leaf-package typechecks can read stale emitted workspace declarations while Vitest reads current source. Refresh library declarations before treating missing current schema fields as newly introduced errors.

**Why:** A scheduling change initially appeared to add missing-column/type errors because the baseline declarations predated already-merged schema changes. Refreshing them removed those apparent regressions, but also changed the text of unrelated existing diagnostics.

**How to apply:** Keep the pre-edit diagnostics, refresh workspace library declarations, and compare diagnostic categories rather than line numbers or generated target-type text. A library build can refresh some declarations even when another unchanged generated package fails; report that library failure separately rather than claiming a clean typecheck.
