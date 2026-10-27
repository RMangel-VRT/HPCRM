/** Compare diagnostics with HEAD without touching working files. Existing CRM
 * diagnostics are recorded by message/file/code, ignoring shifted line numbers. */
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" }).trim().split("\n");
const untracked = new Set(execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split("\n").map(f => resolve(root, f)));
const old = new Map<string, string>();
for (const path of changed.filter(p => /\.[cm]?tsx?$/.test(p))) {
  try { old.set(resolve(root, path), execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { /* added file */ }
}
function check(configPath: string, baseline: boolean) {
  const path = resolve(root, configPath);
  const config = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(path, ".."));
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  if (baseline) host.readFile = path => old.get(resolve(path)) ?? read(path);
  const program = ts.createProgram({ rootNames: parsed.fileNames.filter(f => !baseline || !untracked.has(resolve(f))),
    options, projectReferences: parsed.projectReferences, host });
  return ts.getPreEmitDiagnostics(program).map(d => `${d.file ? relative(root, d.file.fileName) : ""}|TS${d.code}|${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`).sort();
}
const report: Record<string, unknown> = process.argv.includes("--api-only")
  ? JSON.parse(readFileSync(resolve(root, "generated-artifacts/typecheck-comparison.json"), "utf8")) : {};
const configs = process.argv.includes("--api-only") ? ["artifacts/api-server/tsconfig.json"]
  : ["artifacts/api-server/tsconfig.json", "artifacts/highplains-crm/tsconfig.json"];
for (const config of configs) {
  const baseline = process.argv.includes("--recorded") ? JSON.parse(readFileSync(resolve(root,
    `generated-artifacts/${config.includes("api-server") ? "api" : "web"}-diagnostics-baseline.json`), "utf8")) as string[] : check(config, true);
  const current = check(config, false);
  const counts = new Map<string, number>();
  baseline.forEach(d => counts.set(d, (counts.get(d) ?? 0) + 1));
  const added = current.filter(d => { const n = counts.get(d) ?? 0; if (n) { counts.set(d, n - 1); return false; } return true; });
  report[config] = { baselineCount: baseline.length, currentCount: current.length, added };
  writeFileSync(resolve(root, `generated-artifacts/${config.includes("api-server") ? "api" : "web"}-diagnostics-baseline.json`), JSON.stringify(baseline, null, 2));
}
writeFileSync(resolve(root, "generated-artifacts/typecheck-comparison.json"), JSON.stringify(report, null, 2));
console.info(JSON.stringify(report, null, 2));
if (Object.values(report).some((r: any) => r.added.length)) process.exitCode = 1;
