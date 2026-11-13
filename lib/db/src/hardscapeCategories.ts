/** Display identity only: never rewrite an item's stored category. */
export const HARDSCAPE_DEFAULT_CATEGORY = "General";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function mergeHardscapeCategories(stored: readonly string[]): string[] {
  const categories = new Map<string, string>();
  // Code-point order makes the chosen stored spelling independent of DB row
  // order and browser/server locale, including when multiple spellings exist.
  for (const category of [...stored].sort(compare)) {
    const identity = category.toLowerCase();
    if (!categories.has(identity)) categories.set(identity, category);
  }
  if (!categories.has("general")) categories.set("general", HARDSCAPE_DEFAULT_CATEGORY);
  return [...categories.entries()]
    .sort(([a], [b]) => a === b ? 0 : a === "general" ? -1 : b === "general" ? 1 : compare(a, b))
    .map(([, spelling]) => spelling);
}
