import { access, stat, readFile, opendir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";

export type ExecutableSource = "PUPPETEER_EXECUTABLE_PATH" | "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE" | "CHROMIUM_PATH" | "BUILD_MANIFEST" | "PATH" | "NIX_STORE";
export type DiscoverySource = Exclude<ExecutableSource, "PATH"> | "PATH_CHROMIUM" | "PATH_CHROMIUM_BROWSER" | "PATH_GOOGLE_CHROME" | "PATH_GOOGLE_CHROME_STABLE";
export type DiscoveryOutcome = "NOT_CONFIGURED" | "NOT_FOUND" | "NOT_EXECUTABLE" | "NOT_FILE" | "INVALID_HINT" | "SELECTED" | "LIMIT_REACHED" | "TIMED_OUT";
export interface DiscoveryAttempt { source: DiscoverySource; outcome: DiscoveryOutcome }
export interface DiscoveryReport { executableSource: ExecutableSource | null; attempts: DiscoveryAttempt[] }
export interface ExecutableResolution extends DiscoveryReport { path: string | null }

/** Injectable I/O keeps discovery tests independent of the host browser and store. */
export interface DiscoveryIO {
  env: NodeJS.ProcessEnv;
  manifest: () => Promise<string>;
  validate: (path: string) => Promise<"SELECTED" | "NOT_FOUND" | "NOT_EXECUTABLE" | "NOT_FILE">;
  nixEntries: () => AsyncIterable<string>;
}
const runtimeManifest = new URL(import.meta.url.endsWith(".ts") ? "../../../dist/document-runtime.json" : "./document-runtime.json", import.meta.url);
export const discoveryIO: DiscoveryIO = {
  env: process.env,
  manifest: () => readFile(runtimeManifest, "utf8"),
  validate: async path => {
    try {
      if (!(await stat(path)).isFile()) return "NOT_FILE";
      try { await access(path, constants.X_OK); return "SELECTED"; }
      catch { return "NOT_EXECUTABLE"; }
    } catch { return "NOT_FOUND"; }
  },
  nixEntries: async function* () {
    const dir = await opendir("/nix/store");
    for await (const entry of dir) yield entry.name;
  },
};

/**
 * At most 26 public attempts, 64 PATH directories, 8192 store entries and 16
 * sorted Nix candidates; one 1500ms wall-clock budget. No shell/browser download.
 * A truncated store listing is never used (filesystem order is not deterministic).
 */
export async function discoverChromium(io: DiscoveryIO = discoveryIO): Promise<ExecutableResolution> {
  const attempts: DiscoveryAttempt[] = [];
  let current: DiscoverySource = "PUPPETEER_EXECUTABLE_PATH";
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const record = (source: DiscoverySource, outcome: DiscoveryOutcome) => { if (!stopped) attempts.push({ source, outcome }); };
  const checked = async (path: string, source: DiscoverySource, executableSource: ExecutableSource = source as ExecutableSource) => {
    if (stopped) return null;
    current = source;
    const outcome = await io.validate(path);
    record(source, outcome);
    return outcome === "SELECTED" ? { path, executableSource, attempts } : null;
  };
  const work = async (): Promise<ExecutableResolution> => {
    for (const source of ["PUPPETEER_EXECUTABLE_PATH", "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", "CHROMIUM_PATH"] as const) {
      if (stopped) break;
      if (!io.env[source]) { record(source, "NOT_CONFIGURED"); continue; }
      const selected = await checked(io.env[source]!, source);
      if (selected) return selected;
    }
    if (stopped) return { path: null, executableSource: null, attempts };
    current = "BUILD_MANIFEST";
    let hint: unknown;
    try { hint = JSON.parse(await io.manifest()).executablePath; }
    catch { record(current, "INVALID_HINT"); }
    if (typeof hint === "string" && hint.length > 0 && !hint.includes("\0")) {
      const selected = await checked(hint, "BUILD_MANIFEST");
      if (selected) return selected;
    } else if (!attempts.some(a => a.source === "BUILD_MANIFEST")) record(current, "INVALID_HINT");
    const commands = [
      ["chromium", "PATH_CHROMIUM"], ["chromium-browser", "PATH_CHROMIUM_BROWSER"],
      ["google-chrome", "PATH_GOOGLE_CHROME"], ["google-chrome-stable", "PATH_GOOGLE_CHROME_STABLE"],
    ] as const;
    const pathDirs = (io.env.PATH ?? "").split(":");
    const dirs = pathDirs.slice(0, 64);
    for (const [command, source] of commands) {
      if (stopped) break;
      current = source;
      let outcome: DiscoveryOutcome = pathDirs.length > 64 ? "LIMIT_REACHED" : "NOT_FOUND";
      for (const dir of dirs) {
        if (stopped) break;
        const path = resolve(dir, command);
        const result = await io.validate(path);
        if (result === "SELECTED") { record(source, result); return { path, executableSource: "PATH", attempts }; }
        if (result !== "NOT_FOUND") outcome = result;
      }
      record(source, outcome);
    }
    if (stopped) return { path: null, executableSource: null, attempts };
    current = "NIX_STORE";
    const entries: string[] = [];
    let count = 0;
    try {
      for await (const name of io.nixEntries()) {
        if (stopped) break;
        if (++count > 8192) { record("NIX_STORE", "LIMIT_REACHED"); return { path: null, executableSource: null, attempts }; }
        if (/^[^/]+-chromium-[^/]+$/.test(name)) entries.push(name);
      }
    } catch { /* Missing/unreadable store is ordinary exhausted discovery. */ }
    const sorted = entries.sort();
    for (const name of sorted.slice(0, 16)) {
      if (stopped) break;
      const selected = await checked(join("/nix/store", name, "bin/chromium"), "NIX_STORE");
      if (selected) return selected;
    }
    if (sorted.length > 16) record("NIX_STORE", "LIMIT_REACHED");
    else if (!sorted.length) record("NIX_STORE", "NOT_FOUND");
    return { path: null, executableSource: null, attempts };
  };
  try {
    return await Promise.race([work(), new Promise<ExecutableResolution>(resolve => {
      timer = setTimeout(() => {
        record(current, "TIMED_OUT"); stopped = true;
        resolve({ path: null, executableSource: null, attempts: [...attempts] });
      }, 1500);
    })]);
  } finally { stopped = true; clearTimeout(timer!); }
}
