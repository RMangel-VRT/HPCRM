/**
 * PostgreSQL coalesces identical inline UNIQUE declarations in CREATE TABLE.
 * Some deployed tables have both named copies, created by separate statements.
 * For the disposable replay, move only subsequent copies to ALTER TABLE.
 * Every name and definition still comes directly from Drizzle's export.
 * This handles Drizzle's formatted SQL, not arbitrary SQL or migrations.
 */
export function preserveRepeatedUniqueConstraints(exported: string): string {
  const identifier = `"(?:[^"]|"")+"`;
  const tableBlock = new RegExp(
    `^(CREATE TABLE ((?:${identifier}\\.)?${identifier}) \\(\\n)([\\s\\S]*?)^\\);`, "gm",
  );
  const namedUnique = new RegExp(`^\\s+CONSTRAINT ${identifier} (UNIQUE(?: NULLS NOT DISTINCT)?\\(.+\\)),?$`);
  const updates: string[] = [];
  const tables = exported.replace(tableBlock, (_block, opening: string, table: string, body: string) => {
    const seen = new Set<string>();
    const kept = body.trimEnd().split("\n").filter(line => {
      const signature = namedUnique.exec(line)?.[1];
      if (!signature) return true;
      if (!seen.has(signature)) {
        seen.add(signature);
        return true;
      }
      updates.push(`ALTER TABLE ${table} ADD ${line.trim().replace(/,$/, "")};`);
      return false;
    });
    // Do not disturb commas when unchanged; otherwise the last column or
    // constraint may have preceded a removed duplicate and still have a comma.
    if (kept.length === body.trimEnd().split("\n").length) return `${opening}${body});`;
    return `${opening}${kept.join("\n").replace(/,$/, "")}\n);`;
  });
  if (!updates.length) return exported;
  const firstAlter = tables.search(/^ALTER TABLE /m);
  const insertion = firstAlter === -1 ? tables.length : firstAlter;
  return `${tables.slice(0, insertion)}\n${updates.join("\n")}\n${tables.slice(insertion)}`;
}
