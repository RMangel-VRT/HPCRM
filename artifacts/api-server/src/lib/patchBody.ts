/**
 * Zod v4 `.partial()` still injects `.default()` values for absent keys.
 * Keep only keys supplied in the body, but write their validated, parsed values.
 */
export function pickProvided<T extends Record<string, unknown>>(
  parsed: T,
  body: unknown,
): Partial<T> {
  if (!body || typeof body !== "object") return {};
  const out: Partial<T> = {};
  for (const key of Object.keys(parsed) as (keyof T)[]) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = parsed[key];
    }
  }
  return out;
}