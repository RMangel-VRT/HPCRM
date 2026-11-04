import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { logger } from "../../lib/logger";
import { paginatePricing } from "./pagination";

export type ExecutableSource = "PUPPETEER_EXECUTABLE_PATH" | "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE" | "PATH";
export type RendererFailure = "EXECUTABLE_NOT_FOUND" | "LAUNCH_FAILED" | "RENDER_FAILED";
export class DocumentRendererUnavailable extends Error {
  constructor(public readonly reason: RendererFailure = "EXECUTABLE_NOT_FOUND") { super("DOCUMENT_RENDERER_UNAVAILABLE"); }
}
export function resolveChromiumExecutable(): { path: string; source: ExecutableSource } {
  function checked(path: string, source: ExecutableSource) {
    try {
      accessSync(path, constants.X_OK);
      if (!statSync(path).isFile()) throw new Error();
      return { path, source };
    } catch { throw new DocumentRendererUnavailable("EXECUTABLE_NOT_FOUND"); }
  }
  for (const source of ["PUPPETEER_EXECUTABLE_PATH", "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"] as const) {
    if (process.env[source]) return checked(process.env[source]!, source);
  }
  for (const name of ["chromium", "chromium-browser"]) {
    try {
      const path = execFileSync("which", [name], { encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"] }).trim();
      return checked(path, "PATH");
    } catch { /* next supported name */ }
  }
  throw new DocumentRendererUnavailable("EXECUTABLE_NOT_FOUND");
}
export const chromiumExecutable = () => resolveChromiumExecutable().path;
let browser: Promise<Browser> | undefined;
let active = 0;
const queue: (() => void)[] = [];
let idle: ReturnType<typeof setTimeout> | undefined;
const DEADLINE = 20_000;
export async function closeDocumentBrowser(): Promise<void> {
  clearTimeout(idle);
  const current = browser; browser = undefined;
  if (current) await (await current.catch(() => undefined))?.close().catch(() => undefined);
}
async function launch(): Promise<Browser> {
  const executablePath = chromiumExecutable();
  try {
    const result = await puppeteer.launch({ executablePath, headless: true, timeout: DEADLINE, protocolTimeout: DEADLINE,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run"] });
    result.on("disconnected", () => {
      const current = browser;
      void current?.then(instance => { if (instance === result && browser === current) browser = undefined; }).catch(() => undefined);
    });
    return result;
  } catch (error) {
    logger.warn({ reason: "LAUNCH_FAILED", errorName: error instanceof Error ? error.name.slice(0, 200) : "Error",
      firstLine: error instanceof Error ? error.message.split(/[\r\n]/, 1)[0].trim().slice(0, 200) : "Unknown launch failure" }, "DOCUMENT_RENDERER_UNAVAILABLE");
    throw new DocumentRendererUnavailable("LAUNCH_FAILED");
  }
}
export interface RenderOptions {
  /** Includes queue wait, browser launch, Chromium and stamping. */
  overallTimeoutMs?: number;
  signal?: AbortSignal;
  onBrowser?: (instance: Browser) => Promise<void>;
}
function admit(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const grant = () => { signal.removeEventListener("abort", cancel); active++; resolve(); };
    const cancel = () => {
      const index = queue.indexOf(grant);
      if (index >= 0) queue.splice(index, 1);
      reject(signal.reason);
    };
    if (active < 2) grant();
    else { queue.push(grant); signal.addEventListener("abort", cancel, { once: true }); }
  });
}
/**
 * Aborted page operations are raced individually; late newPage results are closed.
 * Non-cancellable launch/stamping keep their slot until settled. An overall
 * caller deadline can return earlier, but cannot admit a third background job.
 */
export async function chromiumPdf(html: string, finish: (bytes: Buffer) => Promise<Buffer> = async bytes => bytes, options: RenderOptions = {}): Promise<Buffer> {
  const ctrl = new AbortController();
  const expire = () => ctrl.abort(new Error("DOCUMENT_RENDER_TIMEOUT"));
  let timer = options.overallTimeoutMs === undefined ? undefined : setTimeout(expire, options.overallTimeoutMs);
  const { signal } = ctrl;
  let rejectAbort!: (error: unknown) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  const externalAbort = () => ctrl.abort(new Error("DOCUMENT_RENDER_CANCELLED"));
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  const work = (async () => {
    await admit(signal);
    clearTimeout(idle);
    if (options.overallTimeoutMs === undefined) timer = setTimeout(expire, DEADLINE);
    let page: Page | undefined;
    let closing: Promise<void> | undefined;
    const close = () => { if (page) closing ??= page.close().catch(() => undefined); return closing; };
    const cancelPage = () => { void close(); };
    const step = async <T>(pending: Promise<T>): Promise<T> => {
      const value = await Promise.race([pending, aborted]);
      signal.throwIfAborted();
      return value;
    };
    signal.addEventListener("abort", cancelPage, { once: true });
    try {
      signal.throwIfAborted();
      if (!browser) {
        const pending = launch();
        browser = pending;
        void pending.catch(() => { if (browser === pending) browser = undefined; });
      }
      const instance = await browser;
      signal.throwIfAborted();
      if (options.onBrowser) await step(options.onBrowser(instance));
      // newPage cannot be cancelled. Wait for it and close even if the caller expired.
      page = await instance.newPage();
      signal.throwIfAborted();
      await step(page.setViewport({ width: 816, height: 1056 }));
      await step(page.setJavaScriptEnabled(false));
      await step(page.setRequestInterception(true));
      page.on("request", request => { void (request.url().startsWith("data:") ? request.continue() : request.abort()).catch(() => undefined); });
      await step(page.setContent(html, { waitUntil: "load", timeout: DEADLINE }));
      await step(page.evaluate("document.fonts.ready"));
      await step(page.evaluate(paginatePricing));
      const oversizedFinal = await step(page.evaluate("Array.from(document.querySelectorAll('.final.keep')).some(node => node.getBoundingClientRect().height > 884)"));
      if (oversizedFinal === true) throw new Error("DOCUMENT_FINAL_BLOCK_TOO_LARGE");
      const bytes = Buffer.from(await step(page.pdf({ format: "letter", printBackground: true, preferCSSPageSize: true, timeout: DEADLINE })));
      const result = await finish(bytes);
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener("abort", cancelPage);
      await close();
      active--;
      queue.shift()?.();
      if (active === 0) { idle = setTimeout(() => { void closeDocumentBrowser(); }, 5 * 60_000); idle.unref(); }
    }
  })();
  try { return await Promise.race([work, aborted]); }
  finally {
    // Keep abort active until background cleanup completes, but never keep timers alive.
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", externalAbort);
    void work.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => undefined);
  }
}
