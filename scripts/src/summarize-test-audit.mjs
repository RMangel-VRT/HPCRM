/**
 * Compact, durable Vitest audit evidence (no generated contract changes).
 * node scripts/src/summarize-test-audit.mjs <evidence-dir> <output.json>
 * Inputs: before-{api,crm}, final-{api,crm}, p3-3-corrected-api,
 * p3-3-focused-crm and focused-final-crm JSON reporter files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) throw new Error("Usage: summarize-test-audit.mjs <evidence-dir> <output.json>");
const read = name => JSON.parse(readFileSync(resolve(dir, `${name}.json`), "utf8"));
const fileName = name => name.slice(name.indexOf("artifacts/"));
const firstLine = text => String(text ?? "").split("\n")[0];
// Vitest JSON labels an entirely skipped file "passed"; match the CLI file counts.
const skippedFile = file => file.assertionResults.length > 0 &&
  file.assertionResults.every(test => test.status === "pending" || test.status === "skipped");
const historical = { api: read("p3-3-corrected-api"), crm: read("p3-3-focused-crm") };
const failures = (result, suite) => result.testResults.flatMap(file =>
  file.assertionResults.filter(test => test.status === "failed").map(test => ({
    file: fileName(file.name), test: test.fullName,
    reason: firstLine(test.failureMessages[0]),
    classification: historical[suite].testResults.some(old =>
      fileName(old.name) === fileName(file.name) && old.assertionResults.some(t =>
        t.fullName === test.fullName && t.status === "failed")) ? "P3-3 baseline" : "new",
  })));
const summary = (result, suite) => ({
  passed: result.numPassedTests, failed: result.numFailedTests, skipped: result.numPendingTests,
  fileCounts: {
    total: result.testResults.length,
    passed: result.testResults.filter(file => file.status === "passed" && !skippedFile(file)).length,
    failed: result.testResults.filter(file => file.status === "failed").length,
    skipped: result.testResults.filter(skippedFile).length,
  },
  failures: failures(result, suite),
  loadErrors: result.testResults.filter(file =>
    file.status === "failed" && file.assertionResults.length === 0).map(file => ({
      file: fileName(file.name), test: "<file failed during module loading; no tests collected>",
      reason: firstLine(file.message), classification: "new",
    })),
  skippedFiles: result.testResults.filter(file =>
    file.assertionResults.some(test => test.status === "pending" || test.status === "skipped")).map(file => ({
      file: fileName(file.name),
      count: file.assertionResults.filter(test => test.status === "pending" || test.status === "skipped").length,
    })),
});
const result = {
  testedRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  baselineRevision: "a77f0607",
  environment: { timezone: "UTC", node: process.version, vitest: "4.1.5" },
  before: Object.fromEntries(["api", "crm"].map(suite => [suite, summary(read(`before-${suite}`), suite)])),
  final: Object.fromEntries(["api", "crm"].map(suite => [suite, summary(read(`final-${suite}`), suite)])),
  historicalFocused: Object.fromEntries(["api", "crm"].map(suite => [suite, summary(historical[suite], suite)])),
  focusedRendered: summary(read("focused-final-crm"), "crm"),
};
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  revision: result.testedRevision,
  before: Object.fromEntries(Object.entries(result.before).map(([k, v]) =>
    [k, { passed: v.passed, failed: v.failed, skipped: v.skipped, files: v.fileCounts }])),
  final: Object.fromEntries(Object.entries(result.final).map(([k, v]) =>
    [k, { passed: v.passed, failed: v.failed, skipped: v.skipped, files: v.fileCounts }])),
}, null, 2));
