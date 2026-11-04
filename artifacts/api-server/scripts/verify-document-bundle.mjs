import { build } from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const artifact = new URL("../", import.meta.url);
// Run after the real API build; use the identical copied assets and a tiny export-only entry.
await build({ entryPoints: [fileURLToPath(new URL("src/services/documents/render.ts", artifact))],
  outfile: fileURLToPath(new URL("dist/verify-documents.mjs", artifact)),
  bundle: true, platform: "node", format: "esm", packages: "external" });
const entry = new URL("dist/verify-documents.mjs", artifact).href;
const code = `const {renderDocumentPdf,closeDocumentBrowser}=await import(${JSON.stringify(entry)});
const bytes=await renderDocumentPdf({html:'<html><body><p>Portable document kit</p></body></html>',footerLabel:'Portable fixture',shortHeaderNumber:'EST-2026-0001'});
const {writeFileSync}=await import('node:fs');writeFileSync(${JSON.stringify(fileURLToPath(new URL("../../generated-artifacts/ic4/portable-bundle.pdf", artifact)))},bytes);
await closeDocumentBrowser();console.log('Portable PDF bytes:',bytes.length);`;
// All runtime asset paths resolve from the bundle, never from this different cwd.
process.stdout.write(execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: "/tmp", timeout: 30_000 }));

// Representative concurrency check, also outside the source working directory.
// The sampled process-tree RSS double-counts shared mappings: evidence, not a
// claimed minimum production machine size.
await build({
  stdin: { contents: 'export {estimateFixture} from "./src/services/documents/fixtures"; export {estimateDocumentHtml} from "./src/services/documents/estimate"; export {renderDocumentPdf,closeDocumentBrowser} from "./src/services/documents/render";',
    resolveDir: fileURLToPath(artifact), sourcefile: "verify-concurrent.ts" },
  outfile: fileURLToPath(new URL("dist/verify-concurrent.mjs", artifact)),
  bundle: true, platform: "node", format: "esm", packages: "external",
  plugins: [{ name: "bundle-workspace-sources", setup(builder) {
    const require = createRequire(new URL("../package.json", import.meta.url));
    builder.onResolve({ filter: /^@workspace\// }, args => ({ path: require.resolve(args.path), external: false }));
  } }],
});
const runtime = JSON.parse(execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(fileURLToPath(new URL("dist/document-runtime.json", artifact)))},'utf8'))`]).toString());
const concurrentCode = `
  const {estimateFixture,estimateDocumentHtml,renderDocumentPdf,closeDocumentBrowser}=await import(${JSON.stringify(new URL("dist/verify-concurrent.mjs", artifact).href)});
  const {writeFileSync,mkdirSync}=await import('node:fs');
  const output=${JSON.stringify(fileURLToPath(new URL("../../generated-artifacts/ic4-2/", artifact)))};
  mkdirSync(output,{recursive:true});
  try {
    const results=await Promise.all([1,2].map(async n=>{
      const bytes=await renderDocumentPdf({html:estimateDocumentHtml(estimateFixture(60)),footerLabel:'Concurrent estimate',shortHeaderNumber:'EST-42'},{overallTimeoutMs:20000});
      writeFileSync(output+'concurrent-'+n+'.pdf',bytes);return bytes.length;
    }));
    console.log(JSON.stringify({concurrent60LineEstimates:results.length,pdfBytes:results}));
  } finally { await closeDocumentBrowser(); }
`;
const child = spawn(process.execPath, ["--input-type=module", "-e", concurrentCode], {
  cwd: "/tmp", env: { ...process.env, NODE_ENV: "production", PATH: "/usr/bin:/bin",
    PUPPETEER_EXECUTABLE_PATH: runtime.executablePath },
  stdio: ["ignore", "pipe", "pipe"],
});
let peakTreeRssKiB = 0;
const sample = () => {
  try {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss="], { encoding: "utf8" }).trim().split("\n").map(line => line.trim().split(/\s+/).map(Number));
    const ids = new Set([child.pid]);
    for (let pass = 0; pass < 8; pass++) for (const [pid, ppid] of rows) if (ids.has(ppid)) ids.add(pid);
    peakTreeRssKiB = Math.max(peakTreeRssKiB, rows.reduce((sum, [pid, , rss]) => sum + (ids.has(pid) ? rss : 0), 0));
  } catch { /* Optional observation; render success is still mandatory. */ }
};
const samples = setInterval(sample, 50);
const deadline = setTimeout(() => child.kill("SIGKILL"), 30_000);
child.stdout.on("data", data => process.stdout.write(data));
child.stderr.on("data", data => process.stderr.write(data));
try {
  const exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  if (exit !== 0) throw new Error("CONCURRENT_DOCUMENT_BUNDLE_CHECK_FAILED");
  console.log(JSON.stringify({ peakSampledProcessTreeRssMiB: Math.round(peakTreeRssKiB / 1024), minimumProductionMemory: "not established" }));
} finally { clearInterval(samples); clearTimeout(deadline); }
