---
name: Vite JSX verification
description: Development instrumentation can reject JSX syntax that passes TypeScript and rendered tests.
---

For new typed JSX patterns, verify the actual Vite-transformed module as well as
the rendered test suite.

**Why:** Explicit generic JSX type arguments passed TypeScript and Vitest's
esbuild transformation, but the development React/Babel instrumentation rejected
them and prevented the route from loading. Type inference worked in both paths.

**How to apply:** Prefer inferred component type arguments where sufficient.
If preview compilation differs from tests, inspect the proxied transformed module
and development overlay before changing application behavior or dependencies.
