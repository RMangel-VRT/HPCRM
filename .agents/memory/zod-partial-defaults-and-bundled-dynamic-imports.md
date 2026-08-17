---
name: zod .partial() defaults + esbuild dynamic imports
description: Two PATCH-route pitfalls — .partial() still injects .default() values, and relative dynamic import() breaks in the bundled prod build.
---

# zod `.partial()` still applies `.default()` values

`schema.partial().safeParse({})` returns keys with `.default()`s filled in
(e.g. `{ status: "active", tags: [] }`), so reusing an insert schema for PATCH
validation silently resets those columns on every update.

**Why:** partial wraps fields in optional, but defaulted fields still produce
their default when the key is absent.
**How to apply:** for PATCH routes, validate with an explicit
`z.object({ ...optional fields, no defaults })` and drop `undefined` keys
before `db.update().set()` (drizzle throws on `.set({})`).

# Relative dynamic `import("./x")` breaks in the esbuild-bundled api-server

The api-server prod build bundles to `dist/index.mjs`; a runtime
`await import("./auth")` resolves against `dist/` and throws
`ERR_MODULE_NOT_FOUND` → 500 only in production (dev/tsx works).

**How to apply:** use static top-level imports in api-server route code;
never lazy-import local modules by relative path.
