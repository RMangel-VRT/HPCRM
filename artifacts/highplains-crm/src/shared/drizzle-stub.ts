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

const makeChainable = (schema: z.ZodTypeAny): any => {
  const c: any = schema;
  c.omit = (_keys: any) => makeChainable(schema);
  c.extend = (shape: Record<string, z.ZodTypeAny>) => makeChainable(z.object(shape));
  c.superRefine = (_fn: any) => makeChainable(schema);
  return c;
};

export const createInsertSchema = (_table: any, _opts?: any): any => {
  return makeChainable(z.object({}));
};
