import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
