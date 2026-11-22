import type { RequiredSqlObject } from "@workspace/db/required-sql-objects";

type MigrationInput = { filename: string; sql: string };

const ident = String.raw`(?:"(?:[^"]|"")+"|[a-z_][\w$]*)`;
const qualified = String.raw`${ident}(?:\s*\.\s*${ident})?`;
const ddl = new RegExp(
  String.raw`\b(create|drop)\s+(?:or\s+replace\s+)?(?:constraint\s+)?(function|trigger|rule|view)\s+(?:if\s+(?:not\s+)?exists\s+)?(${qualified})(?:\s*\(([^)]*)\))?(?:\s+(?:before|after|instead\s+of)\b[^;]*?\bon\s+(${qualified})|\s+on\s+(${qualified})|\s+as\s+on\b[^;]*?\bto\s+(${qualified}))?`,
  "gi",
);

function nameParts(raw: string) {
  return Array.from(raw.matchAll(new RegExp(ident, "gi")), ([part]) =>
    part.startsWith('"') ? part.slice(1, -1).replaceAll('""', '"') : part.toLowerCase(),
  );
}

function sqlForAudit(sql: string): string {
  // Keep procedural DO blocks (which contain the guarded trigger definition),
  // but ignore function bodies, quoted SQL strings and comments.
  const tokens = /--[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"]|"")*"|'(?:[^']|'')*'|(\$(?:[a-z_]\w*)?\$)([\s\S]*?)\1/gi;
  return sql.replace(tokens, (token, dollar: string | undefined, body: string | undefined, offset: number) => {
    if (token.startsWith('"')) return token;
    if (dollar && body && /\bdo\s*$/i.test(sql.slice(0, offset))) return ` ${sqlForAudit(body)} `;
    // Do not silently pass dynamic SQL that might add unsupervised objects.
    if (token.startsWith("'") && /\b(?:create|drop)\s+(?:or\s+replace\s+)?(?:function|trigger|rule|view)\b/i.test(token)
      && /\bexecute\s*$/i.test(sql.slice(0, offset))) {
      throw new Error("Dynamic SQL object DDL cannot be audited; use explicit CREATE/DROP statements");
    }
    return " ";
  });
}

function registryKey(object: RequiredSqlObject): string {
  if (object.kind === "function") return `function:${object.schema}.${object.name}(${object.arguments})`;
  if (object.kind === "trigger" || object.kind === "rule") {
    return `${object.kind}:${object.schema}.${object.relation}.${object.name}`;
  }
  return `${object.kind}:${object.schema}.${object.name}`;
}

export function auditSqlObjectMigrations(
  migrations: readonly MigrationInput[],
  registry: readonly RequiredSqlObject[],
): string[] {
  const live = new Map<string, string>();
  for (const { filename, sql } of [...migrations].sort((a, b) => a.filename.localeCompare(b.filename, "en"))) {
    for (const match of sqlForAudit(sql).matchAll(ddl)) {
      const [, operation, type, rawName, args, createOn, dropOn, ruleOn] = match;
      if (!operation || !type || !rawName) continue;
      const kind = type.toLowerCase();
      const objectName = nameParts(rawName);
      let key = `${kind}:${objectName.length === 1 ? "public." : ""}${objectName.join(".")}`;
      if (kind === "function") {
        key += `(${(args ?? "").trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ")})`;
      } else if (kind === "trigger" || kind === "rule") {
        const rawRelation = createOn ?? dropOn ?? ruleOn;
        if (!rawRelation) throw new Error(`${filename}: missing relation for ${rawName}`);
        const relation = nameParts(rawRelation);
        key = `${kind}:${relation.length === 1 ? "public." : ""}${relation.join(".")}.${objectName.at(-1)}`;
      }
      if (operation.toLowerCase() === "drop") live.delete(key);
      else live.set(key, filename);
    }
  }
  const known = new Set(registry.map(registryKey));
  return [...Array.from(live)
    .filter(([key]) => !known.has(key))
    .map(([key, file]) => `${file}: ${key} is not registered`),
    ...registry.flatMap(object => live.get(registryKey(object)) === object.migration
      ? [] : [`${registryKey(object)}: registry migration does not match the surviving CREATE statement`])];
}
