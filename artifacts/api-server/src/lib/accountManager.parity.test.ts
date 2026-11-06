import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { accessRole, ROLE_VALUES } from "../../../../lib/db/src/accessRole";
const root = resolve(import.meta.dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name))
    : /\.tsx?$/.test(e.name) && !e.name.includes(".test.") && !e.name.includes("Fixture") ? [resolve(dir, e.name)] : []);
}
describe("server permission definitions", () => {
  it("requires projected roles for all production admin-capable request allow-lists and admin comparisons", () => {
    let guards = 0;
    for (const file of files(root)) {
      const text = readFileSync(file, "utf8");
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function walk(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["includes", "has"].includes(node.expression.name.text)) {
          const arg = node.arguments[0]?.getText(source) ?? "";
          const receiver = node.expression.expression.getText(source);
          if (/["']admin["']/.test(receiver) && /(?:user|u|campaignUser)\??\.activeRole/.test(arg) && !arg.includes("accessRole(")) {
            throw new Error(`Unprojected admin allow-list: ${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
          }
          if (/\.accessRole/.test(arg)) {
            guards++;
            // Exercise every actual literal allow-list, not a sampled route list.
            if (ts.isArrayLiteralExpression(node.expression.expression)) {
              const roles = node.expression.expression.elements.filter(ts.isStringLiteral).map(e => e.text);
              for (const real of ROLE_VALUES) {
                const projected = roles.includes(accessRole(real));
                expect(projected, file).toBe(roles.includes(real === "account_manager" ? "admin" : real));
              }
            }
          }
        }
        if (ts.isBinaryExpression(node) && /(?:user|u|campaignUser)\??\.activeRole/.test(node.getText(source))
          && !node.getText(source).includes("accessRole(") && /^["']admin["']$/.test(node.right.getText(source))) {
          throw new Error(`Unprojected admin comparison: ${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
        }
        ts.forEachChild(node, walk);
      }
      walk(source);
    }
    expect(guards).toBeGreaterThan(70);
  });
  it("keeps the real-role mobile admission policy separate from projected permissions", () => {
    const mobile = readFileSync(resolve(root, "mobileAuth.ts"), "utf8");
    expect(mobile).toContain('"crew_supervisor"');
    const admission = mobile.match(/(?:const|export const) (?:MOBILE_ALLOWED_ROLES|MOBILE_ROLES)[\s\S]*?;/)?.[0] ?? "";
    expect(admission).not.toContain('"admin"');
    expect(admission).not.toContain('"account_manager"');
    expect(mobile).toContain("accessRole:");
  });
});
