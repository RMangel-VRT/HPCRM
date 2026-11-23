---
name: Generated Zod compatibility
description: Generated and handwritten validators can load different major versions of Zod.
---

Use the Zod entry point used by Orval for any schema composed with a
generated validator, even beside handwritten routes using another entry point.

**Why:** This workspace exposes both the default Zod entry point and
`zod/v4`. Wrapping a generated schema from one with an array or enum from
the other can let an empty-array test pass while a nonempty request fails
inside validation.

**How to apply:** Check the generator's import before using `.extend()`,
`.pipe()` or nested schema builders. Verify at least one nonempty,
valid request at the HTTP boundary.
