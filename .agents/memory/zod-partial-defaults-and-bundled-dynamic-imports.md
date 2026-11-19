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
**How to apply:** when a PATCH route reuses an insert schema, select only
the parsed keys that were own properties of the body actually parsed, using
the shared key-preserving helper. This keeps coercion and explicit nulls while
removing injected defaults; retain server-added fields by adding them before
parsing. If the storage write doesn't add a timestamp, guard empty updates
because Drizzle throws on `.set({})`.

# Relative dynamic `import("./x")` breaks in the esbuild-bundled api-server

The api-server prod build bundles to `dist/index.mjs`; a runtime
`await import("./auth")` resolves against `dist/` and throws
`ERR_MODULE_NOT_FOUND` → 500 only in production (dev/tsx works).

**How to apply:** use static top-level imports in api-server route code;
never lazy-import local modules by relative path.

# Mixed Zod versions in route handlers

Generated OpenAPI validators can throw a Zod 3 error while a hand-written
router catches the Zod 4 class. Use `safeParse` and return the route's normal
validation response explicitly at this boundary.

**Why:** an invalid request otherwise falls through the wrong `instanceof`
check and returns 500 instead of 400.
