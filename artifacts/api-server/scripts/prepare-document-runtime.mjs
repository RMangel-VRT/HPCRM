import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Resolve the Nix executable at build time, then actually exercise the bundled
 * renderer/assets. The start wrapper explicitly supplies that executable in
 * runtimes whose PATH differs from the build shell. No workspace path is pinned.
 */
export async function prepareDocumentRuntime(artifactDir) {
  const entry = `${artifactDir}/dist/document-runtime-check.mjs`;
  await build({
    stdin: {
      contents: 'export {renderDocumentPdf,closeDocumentBrowser} from "./src/services/documents/render"; export {resolveChromiumExecutable} from "./src/services/documents/browser";',
      resolveDir: artifactDir, sourcefile: "document-runtime-check.ts",
    },
    outfile: entry, bundle: true, platform: "node", format: "esm", packages: "external",
  });
  const script = `
    import {writeFileSync} from 'node:fs';
    const {renderDocumentPdf,closeDocumentBrowser,resolveChromiumExecutable}=await import(${JSON.stringify(pathToFileURL(entry).href)});
    const {path:executablePath}=resolveChromiumExecutable();
    // Simulate a runtime shell that does not have the Nix browser on PATH.
    process.env.PUPPETEER_EXECUTABLE_PATH=executablePath;
    process.env.PATH='/usr/bin:/bin';
    let browserVersion;
    try {
      const input={html:'<!doctype html><html><body><p>Concurrent portable PDF check</p></body></html>',footerLabel:'Portable check',shortHeaderNumber:'PDF check'};
      const results=await Promise.all([1,2].map(()=>renderDocumentPdf(input,{overallTimeoutMs:20000,onBrowser:async b=>{browserVersion=await b.version()}})));
      if(results.some(b=>b.subarray(0,4).toString()!=='%PDF')) throw new Error('DOCUMENT_RUNTIME_CHECK_FAILED');
      writeFileSync(${JSON.stringify(`${artifactDir}/dist/document-runtime.json`)},JSON.stringify({executablePath,browserVersion}));
      console.log(JSON.stringify({documentRuntime:'ready',browserVersion,concurrentRenders:results.length,pdfBytes:results.map(b=>b.length)}));
    } finally { await closeDocumentBrowser(); }
  `;
  process.stdout.write(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: "/tmp", timeout: 30_000, env: { ...process.env, NODE_ENV: "production" },
  }));
}
