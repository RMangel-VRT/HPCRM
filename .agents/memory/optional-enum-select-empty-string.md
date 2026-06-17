---
name: Optional enum Select submits "" not undefined
description: Why optional <Select>-backed zod enum fields 400 on the server, and how to make the shared insert schema tolerate it.
---

# Optional enum Select fields submit `""`, breaking server `z.enum(...).optional()`

A create/edit form whose optional field is a Radix `<Select>` wired through
react-hook-form's `Controller` (shadcn `FormField`) submits an **empty string
`""`** for an untouched field, even when `defaultValues` sets it to `undefined` —
the Controller coerces `undefined → ""` to keep the input controlled.

On this project the frontend `@shared/schema` is a **lenient drizzle-stub**, so the
client `zodResolver` does NOT catch the bad value. It reaches the server, where the
real `insertCustomerSchema` validates the field as `z.enum([...]).optional()`. `""`
is neither a valid option nor `undefined`, so it fails with `invalid_value`
("Invalid option: expected one of ...") and the route returns **HTTP 400**. This
presented as a production "unable to add customers" outage (`complexityScore` field).

**Why:** an untouched optional Select that omits the key validates fine, so dev with
a clean/minimal payload does NOT reproduce it — only the real browser form (which
submits `""`) fails. This makes it look environment-specific when it is not.

**How to apply:** for any optional enum/Select field gated by a zod enum, wrap it so
empty/null normalize before the enum check, in the shared insert schema (defined in
`lib/db/src/schema/` and mirrored in `artifacts/highplains-crm/src/shared/schema.ts`):

```ts
field: z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.enum([...]).optional(),
),
```

The server schema is the authoritative gate — fix it there first; mirror in the
frontend stub for consistency. Note the PATCH (`.partial()`) update path: mapping
`""`/`null → undefined` means an explicit "clear this field" edit may no-op; if
clearing must persist, normalize to `null` for updates instead.
