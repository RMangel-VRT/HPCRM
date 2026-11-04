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
