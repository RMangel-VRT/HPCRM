---
name: Frontend drizzle stub silently strips form fields
description: Why CRM create/edit forms 400 with "missing required field" even though the input is filled, and the passthrough fix.
---

# Frontend drizzle stub strips any column not re-declared in `.extend()`

The CRM frontend can't import pg drivers, so `@shared/schema`
(`artifacts/highplains-crm/src/shared/schema.ts`) builds its zod insert schemas on
a hand-written **drizzle stub** (`src/shared/drizzle-stub.ts`). The stub's
`createInsertSchema()` returns an **empty** `z.object({})` — it cannot introspect
table columns. So `createInsertSchema(table).omit(...).extend({...})` ends up as a
zod object containing ONLY the keys explicitly listed in `.extend({...})`.

Zod objects **strip unknown keys by default**. A react-hook-form `zodResolver`
returns the PARSED output, so every column NOT re-declared in `.extend()`
(e.g. name/street/city/state/zip/acres/customerType for customers) is silently
**dropped from the payload before the request is sent**. The server's real
drizzle-zod schema then rejects the incomplete body with **HTTP 400**.

**Symptom signature:** a filled-in create/edit form 400s as if required fields are
missing, but the SAME payload via `curl` succeeds — because curl bypasses the
frontend resolver and hits the server's real schema. Don't chase the server; the
data loss happens client-side in the resolver.

**Fix (one place, fixes every form):** make the stub permissive, not lossy.
- `createInsertSchema` returns `z.object({}).passthrough()`.
- The chainable `.extend()` must call zod's REAL `ZodObject.extend` — capture
  `(z.object({}) as any).extend` ONCE as `REAL_EXTEND` and use
  `REAL_EXTEND.call(schema, shape)`. Calling the instance's own `.extend` recurses
  into the stub's overwritten method → "Maximum call stack size exceeded".
  zod's `.extend` preserves the `passthrough` unknown-keys policy.

**Why:** the stub exists only so the frontend compiles without pg; its zod schema is
loosely modeled and must NEVER be authoritative. The server is the validation gate,
so the stub's job is to pass data through untouched, never to strip it.
