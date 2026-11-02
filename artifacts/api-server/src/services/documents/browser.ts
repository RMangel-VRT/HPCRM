import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { execFileSync } from "node:child_process";

export class DocumentRendererUnavailable extends Error {
  constructor() { super("DOCUMENT_RENDERER_UNAVAILABLE"); }
}
export function chromiumExecutable(): string {
  for (const value of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE]) if (value) return value;
  for (const name of ["chromium", "chromium-browser"]) {
    try { return execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* next supported name */ }
  }
  throw new DocumentRendererUnavailable();
}
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
  try {
    const result = await puppeteer.launch({ executablePath: chromiumExecutable(), headless: true, timeout: DEADLINE,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run"] });
    result.on("disconnected", () => {
      // An idle close may overlap a new launch; never invalidate the replacement.
      const current = browser;
      void current?.then(instance => { if (instance === result && browser === current) browser = undefined; }).catch(() => undefined);
    });
    return result;
  } catch { throw new DocumentRendererUnavailable(); }
}
/** Queue wait does not consume a render slot or deadline. Only launch failures permit legacy fallback. */
export async function chromiumPdf(html: string, finish: (bytes: Buffer) => Promise<Buffer> = async bytes => bytes): Promise<Buffer> {
  await new Promise<void>(resolve => {
    if (active < 2) { active++; resolve(); } else queue.push(resolve);
  });
  clearTimeout(idle);
  let page: Page | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  try {
    const work = (async () => {
      browser ??= launch().catch(error => { browser = undefined; throw error; });
      const instance = await browser;
      if (expired) return Buffer.alloc(0);
      page = await instance.newPage();
      if (expired) { await page.close(); return Buffer.alloc(0); }
      await page.setViewport({ width: 816, height: 1056 });
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", request => { void (request.url().startsWith("data:") ? request.continue() : request.abort()); });
      await page.setContent(html, { waitUntil: "load", timeout: DEADLINE });
      await page.evaluate("document.fonts.ready");
      const oversizedFinal = await page.evaluate("Array.from(document.querySelectorAll('.final.keep')).some(node => node.getBoundingClientRect().height > 884)");
      if (oversizedFinal === true) throw new Error("DOCUMENT_FINAL_BLOCK_TOO_LARGE");
      const bytes = Buffer.from(await page.pdf({ format: "letter", printBackground: true, preferCSSPageSize: true, timeout: DEADLINE }));
      return finish(bytes);
    })();
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { expired = true; reject(new Error("DOCUMENT_RENDER_TIMEOUT")); }, DEADLINE);
    })]);
  } finally {
    clearTimeout(timeout);
    await page?.close().catch(() => undefined);
    const next = queue.shift();
    if (next) next(); else active--;
    if (active === 0) { idle = setTimeout(() => { void closeDocumentBrowser(); }, 5 * 60_000); idle.unref(); }
  }
}
