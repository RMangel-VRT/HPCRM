---
name: Artifact test runner context
description: Archived baseline tests must use the artifact-local launcher, not the root Vitest launcher.
---

Run archived baseline tests through the artifact's own `node_modules/.bin/vitest`
with the archive artifact as the working directory.

**Why:** The root and artifact launchers can report identical Vitest versions but
resolve different Vite peer contexts. The root launcher selected an OXC-based
transform that ignored the CRM's esbuild JSX setting and rejected valid TSX.
The unchanged archive passed with the artifact-local launcher.

**How to apply:** Preserve each artifact's dependency links and runner context
when making before/after comparisons. Treat a new transform failure in an
archive as a possible runner mismatch before attributing it to application code.

## TypeScript baseline comparisons

An isolated unchanged-source archive can emit equivalent inferred object types
with their properties listed in a different order from the working tree.

**Why:** A renderer verification comparison produced apparent raw-text additions
and removals despite identical diagnostic locations and codes; the differences
were ordering within inferred type descriptions, not new diagnostics.

**How to apply:** Compare normalized file/line/column/error-code sets first,
then inspect changed message meanings before claiming a regression or a clean
baseline. Do not treat raw diagnostic-text set differences alone as new errors,
and do not ignore semantic message changes just because locations match.
