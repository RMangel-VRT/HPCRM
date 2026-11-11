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

An API typecheck baseline archive must include source imported by its tests from
other artifacts, not just the API and composite libraries.

**Why:** Some existing API tests import frontend shared modules. Omitting those
sources changes missing-module and root-directory diagnostics, making an
unchanged baseline appear to have fewer errors than the working tree.

**How to apply:** Build the archived composite library declarations, mirror the
cross-artifact source imports and artifact-local dependency links, then compare
normalized diagnostic locations/codes with archive prefixes stripped.

Exclude active Drizzle configuration files from unchanged-source archives.

**Why:** Schema-discovery validation scans ignored generated folders too; a
copied configuration can fail the single-config check even when no schema
change or database drift exists.

**How to apply:** Preserve source and TypeScript build inputs needed for the
baseline, but omit the archive's Drizzle config before completion validation.

Serialize real-Chromium document suites rather than trusting Vitest's default
worker count in this container.

**Why:** The advertised CPU count can exceed the available process/thread budget.
Parallel Chromium launches and test workers produced `EAGAIN` and unrelated
timeouts, obscuring otherwise valid regression results.

**How to apply:** Use `--maxWorkers=1 --no-file-parallelism` for document baselines
and final checks; keep render timeouts proportional to the actual fixture.
