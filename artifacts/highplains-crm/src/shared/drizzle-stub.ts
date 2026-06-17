import { z } from "zod";

export const sql = (strings: TemplateStringsArray, ..._values: any[]) => strings.join("");

const colBuilder = (): any => {
  const b: any = {};
  const methods = ["notNull","unique","default","defaultNow","primaryKey","references","array","$type","using","index"];
  for (const m of methods) b[m] = (..._a: any[]) => b;
  return b;
};

export const text = (_n: string) => colBuilder();
export const varchar = (_n: string, _o?: any) => colBuilder();
export const timestamp = (_n: string, _o?: any) => colBuilder();
export const integer = (_n: string) => colBuilder();
export const real = (_n: string) => colBuilder();
export const boolean = (_n: string) => colBuilder();
export const jsonb = (_n: string) => colBuilder();
export const date = (_n: string) => colBuilder();
export const numeric = (_n: string, _o?: any) => colBuilder();
export const unique = (..._a: any[]) => ({ on: (..._b: any[]) => ({}) });
export const index = (_n: string) => ({ on: (..._a: any[]) => ({}), using: (..._a: any[]) => ({}) });
export const uniqueIndex = (_n: string) => ({ on: (..._a: any[]) => ({}) });
export type AnyPgColumn = any;

export const pgTable = (_name: string, columns: Record<string, any>, _extra?: any): any => ({
  ...columns,
  $inferSelect: {} as any,
  $inferInsert: {} as any,
});

// Capture zod's REAL `ZodObject.extend` once, before any stub instance below
// overwrites its own `.extend` property. Calling this prototype method (rather
// than `schema.extend`) merges into the existing schema while preserving
// `.passthrough()`, and avoids recursing back into the stub's own `.extend`
// (which caused a "Maximum call stack size exceeded" crash).
const REAL_EXTEND: any = (z.object({}) as any).extend;

const makeChainable = (schema: z.ZodTypeAny): any => {
  const c: any = schema;
  c.omit = (_keys: any) => makeChainable(schema);
  // Preserve `.passthrough()` across `.extend()` so columns that are NOT
  // explicitly re-declared in `.extend({...})` (e.g. name/street/city) are kept
  // on the parsed output instead of being stripped. The real server-side schema
  // (lib/db) does the authoritative validation; this frontend stub must not
  // silently drop fields, or the form's zodResolver sends an incomplete body
  // and the server rejects it with a 400.
  c.extend = (shape: Record<string, z.ZodTypeAny>) =>
    makeChainable(REAL_EXTEND.call(schema, shape));
  c.superRefine = (_fn: any) => makeChainable(schema);
  return c;
};

export const createInsertSchema = (_table: any, _opts?: any): any => {
  return makeChainable(z.object({}).passthrough());
};
