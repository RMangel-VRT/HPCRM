// Read-only source inventory helper for docs/data-ownership-audit.md.
// Does not import application code or connect to a database.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const schemaPath = "lib/db/src/schema/schema.ts";
const schema = fs.readFileSync(schemaPath, "utf8");
const definitions = [...schema.matchAll(/export const (\w+)\s*=\s*pgTable\(\s*["']([^"']+)["']/g)]
  .map(m => ({ symbol: m[1], table: m[2] }));
const symbols = new Map(definitions.map(d => [d.symbol, d.table]));
const names = new Set(definitions.map(d => d.table));
const roots = ["artifacts/api-server/src", "artifacts/highplains-crm/src", "artifacts/highplains-mobile"];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!/^(node_modules|dist|build|assets|\.expo|\.replit-artifact|__tests__|testHelpers)$/.test(ent.name)) walk(p);
    } else if (/\.(tsx?|jsx?|mjs)$/.test(p) && !/\.(test|spec)\.|\.d\.ts$|\/generated\//.test(p)) files.push(p);
  }
}
roots.forEach(walk);
const functions = new Map(), operations = [], consumers = [], vocab = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aliases = new Map(symbols);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  function tableFor(n) {
    if (!n) return null;
    if (ts.isIdentifier(n)) return aliases.get(n.text) || null;
    if (ts.isPropertyAccessExpression(n)) return aliases.get(n.name.text) || null;
    return null;
  }
  function gatherAliases(stmt) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
      for (const e of stmt.importClause.namedBindings.elements) {
        const orig = e.propertyName?.text || e.name.text;
        if (symbols.has(orig)) aliases.set(e.name.text, symbols.get(orig));
      }
    }
    if (ts.isVariableDeclaration(stmt) && ts.isObjectBindingPattern(stmt.name)) {
      for (const e of stmt.name.elements) {
        const orig = e.propertyName?.getText(sf) || e.name.getText(sf);
        if (symbols.has(orig)) aliases.set(e.name.getText(sf), symbols.get(orig));
      }
    }
    ts.forEachChild(stmt, gatherAliases);
  }
  gatherAliases(sf);
  function visit(node, stack = []) {
    let current = stack;
    if (ts.isFunctionLike(node) && node.body) {
      const p = node.parent;
      let label = node.name?.getText(sf) || (ts.isVariableDeclaration(p) ? p.name.getText(sf) : "");
      let route = null;
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
        const verb = p.expression.name.text;
        const arg = p.arguments[0];
        if (/^(get|post|patch|put|delete|use)$/.test(verb) && arg && ts.isStringLiteral(arg)) route = `${verb.toUpperCase()} ${arg.text}`;
      }
      label = route || label || `callback@${line(node)}`;
      const id = `${file}:${node.pos}`;
      functions.set(id, { id, file, line: line(node), label, route, calls: [], reads: [], writes: [] });
      current = [...stack, id];
    }
    const owner = [...current].reverse().find(id => functions.get(id).route)
      || [...current].reverse().find(id => !functions.get(id).label.startsWith("callback@"))
      || current.at(-1);
    const add = (table, kind, node, source) => {
      if (!table || !names.has(table)) return;
      const op = { table, kind, file, line: line(node), owner: owner || null, source };
      operations.push(op);
      if (owner) functions.get(owner)[kind === "write" ? "writes" : "reads"].push(table);
    };
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const method = expr.name.text;
        if (/^(from|innerJoin|leftJoin|rightJoin|fullJoin|insert|update|delete)$/.test(method)) {
          add(tableFor(node.arguments[0]), /^(insert|update|delete)$/.test(method) ? "write" : "read", node, method);
        }
        if (owner && expr.expression.getText(sf) === "storage") functions.get(owner).calls.push({ name: method, storage: true, line: line(node) });
      } else if (ts.isIdentifier(expr) && owner) {
        functions.get(owner).calls.push({ name: expr.text, storage: false, line: line(node) });
        if (expr.text === "replaceRows") add(tableFor(node.arguments[3]), "write", node, "generic replaceRows");
      }
    }
    if (ts.isTaggedTemplateExpression(node) && /(^|\.)sql$/.test(node.tag.getText(sf))) {
      const raw = node.template.getText(sf);
      for (const m of raw.matchAll(/\b(FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+["`]?([a-z_][a-z0-9_]*)/gi)) {
        add(m[2], /^(UPDATE|INTO|DELETE)/i.test(m[1]) ? "write" : "read", node, "raw SQL");
      }
      for (const m of raw.matchAll(/\$\{(\w+)\}/g)) {
        const before = raw.slice(0, m.index);
        add(aliases.get(m[1]), /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s*$/i.test(before) ? "write" : "read", node, "SQL interpolation");
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && /\/api\//.test(node.getText(sf))) {
      const raw = node.getText(sf).slice(1, -1);
      consumers.push({ file, line: line(node), url: raw.replace(/\$\{[^}]+\}/g, ":param").split("?")[0] });
    }
    ts.forEachChild(node, child => visit(child, current));
  }
  visit(sf);
}
const byName = new Map();
for (const fn of functions.values()) {
  if (!byName.has(fn.label)) byName.set(fn.label, []);
  byName.get(fn.label).push(fn);
}
for (let round = 0; round < 12; round++) {
  let changed = false;
  for (const fn of functions.values()) {
    for (const call of fn.calls) {
      const targets = (byName.get(call.name) || []).filter(f => call.storage ? f.file.endsWith("/storage.ts") : !f.file.endsWith("/storage.ts"));
      for (const target of targets) for (const key of ["reads", "writes"]) for (const table of target[key]) {
        if (!fn[key].includes(table)) { fn[key].push(table); changed = true; }
      }
    }
  }
  if (!changed) break;
}
const result = definitions.map(d => {
  const readers = [], writers = [];
  for (const fn of functions.values()) {
    if (fn.reads.includes(d.table)) readers.push({ file: fn.file, line: fn.line, label: fn.label, route: fn.route });
    if (fn.writes.includes(d.table)) writers.push({ file: fn.file, line: fn.line, label: fn.label, route: fn.route });
  }
  const direct = operations.filter(o => o.table === d.table);
  const routes = [...readers, ...writers].filter(s => s.route);
  const matches = consumers.filter(c => routes.some(r => {
    const url = r.route.slice(r.route.indexOf(" ") + 1);
    if (url === "/") return false;
    const pattern = "^" + url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "[^/]+") + "$";
    return new RegExp(pattern).test(c.url);
  }));
  return { ...d, direct, readers, writers, consumers: matches };
});
const fileIds = new Map(files.map((f, i) => [f, i]));
const compactSite = s => [fileIds.get(s.file), s.line, s.label || s.source || "", s.kind || ""];
for (const file of [...new Set([...files, schemaPath])]) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const unwrap = n => ts.isAsExpression(n) || ts.isSatisfiesExpression(n) ? unwrap(n.expression) : n;
  function keys(n) {
    n = unwrap(n);
    if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(e => {
      e = unwrap(e);
      if (ts.isStringLiteral(e)) return [e.text];
      if (ts.isObjectLiteralExpression(e)) return e.properties.flatMap(p =>
        ts.isPropertyAssignment(p) && /^(key|type|value)$/.test(p.name.getText(sf).replace(/["']/g, ""))
          && ts.isStringLiteral(p.initializer) ? [p.initializer.text] : []);
      return [];
    });
    if (ts.isObjectLiteralExpression(n)) return n.properties.flatMap(p => p.name ? [p.name.getText(sf).replace(/["']/g, "")] : []);
    return [];
  }
  function scan(n) {
    if (ts.isVariableDeclaration(n) && n.initializer && /service|scope_catalog|scope_lines|layer.*(type|config)|categor|subtype/i.test(n.name.getText(sf))) {
      const values = keys(n.initializer);
      if (values.some(v => /mow|aerat|pet.station|chemical|clean.?up|snow|fert|irrigation|ornamental|shrub/i.test(v)) || /SNOW_SERVICE_TYPES/.test(n.name.getText(sf))) {
        vocab.push({ file, line: line(n), name: n.name.getText(sf), values });
      }
    }
    if (ts.isTypeAliasDeclaration(n) && /ServiceType|MapLayerType|CampaignCategory|CampaignSubtype/.test(n.name.text)) {
      const values = [];
      function strings(x) { if (ts.isStringLiteral(x)) values.push(x.text); ts.forEachChild(x, strings); }
      strings(n.type);
      if (values.length) vocab.push({ file, line: line(n), name: n.name.text, values });
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "enum"
      && n.arguments[0] && ts.isPropertyAssignment(n.parent)) {
      const name = n.parent.name.getText(sf);
      const values = keys(n.arguments[0]);
      if (/serviceType|serviceCategory|category|subtype|layerType/i.test(name)
        && values.some(v => /mow|aerat|pet.station|chemical|clean.?up|snow|fert|irrigation|ornamental|shrub/i.test(v))) {
        vocab.push({ file, line: line(n), name: `enum(${name})`, values });
      }
    }
    ts.forEachChild(n, scan);
  }
  scan(sf);
}
console.log(JSON.stringify({
  scannedFiles: files.length,
  files,
  vocabulary: vocab,
  tables: result.map(t => ({
    table: t.table,
    symbol: t.symbol,
    direct: t.direct.map(compactSite),
    readers: t.readers.map(compactSite),
    writers: t.writers.map(compactSite),
    consumers: [...new Set(t.consumers.map(c => fileIds.get(c.file)))],
  })),
  unresolved: "Static call resolution does not prove runtime reachability; generic repositories, indirect callbacks, router mounts and dynamic SQL need manual review.",
}));
