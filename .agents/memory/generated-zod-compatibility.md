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

For strict numeric requests, verify the generated validators rather than
assuming OpenAPI restrictions are enforced verbatim.

**Why:** Orval can generate a plain `.number()` for an OpenAPI integer, and
Zod 3's `.multipleOf(0.01)` can accept tiny values in exponential notation
that PostgreSQL would silently round.

**How to apply:** Add `.int()` for cents and counts. For bounded percentages
with two decimal places, separately verify the input equals its rounding to
hundredths. Cover fractional integers and a small exponential value in tests.
