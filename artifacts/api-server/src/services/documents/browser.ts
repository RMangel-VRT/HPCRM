import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { logger } from "../../lib/logger";
import { paginatePricing } from "./pagination";
import { discoverChromium, type DiscoveryReport } from "./discovery";
export type { ExecutableSource, DiscoveryReport, DiscoveryAttempt } from "./discovery";

export type RendererFailure = "EXECUTABLE_NOT_FOUND" | "LAUNCH_FAILED" | "RENDER_FAILED";
export class DocumentRendererUnavailable extends Error {
  constructor(public readonly reason: RendererFailure = "EXECUTABLE_NOT_FOUND",
    public readonly discovery: DiscoveryReport = { executableSource: null, attempts: [] }) { super("DOCUMENT_RENDERER_UNAVAILABLE"); }
}
let loggedSelection = false;
export async function resolveChromiumExecutable() {
  const result = await discoverChromium();
  const { executableSource, attempts } = result;
  if (!result.path) {
    logger.warn({ reason: "EXECUTABLE_NOT_FOUND", attempts }, "DOCUMENT_RENDERER_UNAVAILABLE");
    throw new DocumentRendererUnavailable("EXECUTABLE_NOT_FOUND", { executableSource, attempts });
  }
  return { ...result, path: result.path, source: executableSource! };
}
export const chromiumExecutable = async () => (await resolveChromiumExecutable()).path;
let browser: Promise<Browser> | undefined;
let pendingDiscovery: Promise<DiscoveryReport> | undefined;
let active = 0;
const queue: (() => void)[] = [];
let idle: ReturnType<typeof setTimeout> | undefined;
const DEADLINE = 20_000;
export async function closeDocumentBrowser(): Promise<void> {
  clearTimeout(idle);
  const current = browser; browser = undefined;
  if (current) await (await current.catch(() => undefined))?.close().catch(() => undefined);
}
async function launch(onDiscovery: (report: DiscoveryReport) => void): Promise<Browser> {
  const { path: executablePath, executableSource, attempts } = await resolveChromiumExecutable();
  const discovery = { executableSource, attempts };
  if (!loggedSelection) {
    loggedSelection = true;
    logger.info({ executableSource, executablePath }, "DOCUMENT_CHROMIUM_SELECTED");
  }
  onDiscovery(discovery);
  try {
    const result = await puppeteer.launch({ executablePath, headless: true, timeout: DEADLINE, protocolTimeout: DEADLINE,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run"] });
    result.on("disconnected", () => {
      const current = browser;
      void current?.then(instance => { if (instance === result && browser === current) browser = undefined; }).catch(() => undefined);
    });
    return result;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    logger.warn({ reason: "LAUNCH_FAILED", errorName: error instanceof Error ? error.name.slice(0, 200) : "Error",
      errorCode: typeof code === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : "UNKNOWN",
      firstLine: error instanceof Error ? error.message.split(/[\r\n]/, 1)[0].replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) : "Unknown launch failure" }, "DOCUMENT_RENDERER_UNAVAILABLE");
    throw new DocumentRendererUnavailable("LAUNCH_FAILED", discovery);
  }
}
export interface RenderOptions {
  /** Includes queue wait, browser launch, Chromium and stamping. */
  overallTimeoutMs?: number;
  signal?: AbortSignal;
  onBrowser?: (instance: Browser) => Promise<void>;
  onDiscovery?: (report: DiscoveryReport) => void;
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
        let selected!: (report: DiscoveryReport) => void;
        pendingDiscovery = new Promise(resolve => { selected = resolve; });
        const pending = launch(selected);
        browser = pending;
        void pending.catch(() => { if (browser === pending) browser = undefined; });
      }
      // Capture selection even when a launch is still pending at the deadline.
      const report = pendingDiscovery!;
      const notify = report.then(value => { if (!signal.aborted) options.onDiscovery?.(value); });
      // Observe callback failures; await them below on the ordinary success path.
      void notify.catch(() => undefined);
      const instance = await browser;
      signal.throwIfAborted();
      await notify;
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
      const oversizedFinal = await step(page.evaluate("Array.from(document.querySelectorAll('.acceptance-group, .invoice-content .final.keep')).some(node => node.getBoundingClientRect().height > 884)"));
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
