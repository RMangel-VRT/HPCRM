import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch: mocks.launch } }));
import { chromiumPdf, closeDocumentBrowser, DocumentRendererUnavailable } from "./browser";

afterEach(async () => { await closeDocumentBrowser(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
function fakeBrowser() {
  const pages: ReturnType<typeof fakePage>[] = [];
  const browser = { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined), newPage: vi.fn(async () => { const page = fakePage(); pages.push(page); return page; }) };
  mocks.launch.mockResolvedValue(browser);
  return { browser, pages };
}
function fakePage() {
  return { setViewport: vi.fn().mockResolvedValue(undefined), setJavaScriptEnabled: vi.fn().mockResolvedValue(undefined), setRequestInterception: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(), setContent: vi.fn().mockResolvedValue(undefined), evaluate: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF fixture")), close: vi.fn().mockResolvedValue(undefined) };
}
describe("bounded shared document browser lifecycle", () => {
  it("reuses one lazy launch and holds at most two jobs through the stamp pass", async () => {
    const { browser, pages } = fakeBrowser();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const finish = async (bytes: Buffer) => { await hold; return bytes; };
    const jobs = [chromiumPdf("one", finish), chromiumPdf("two", finish), chromiumPdf("three", finish)];
    await vi.waitFor(() => expect(browser.newPage).toHaveBeenCalledTimes(2));
    expect(mocks.launch).toHaveBeenCalledTimes(1); expect(pages).toHaveLength(2);
    release(); await Promise.all(jobs);
    expect(browser.newPage).toHaveBeenCalledTimes(3); expect(pages.every(p => p.close.mock.calls.length === 1)).toBe(true);
  });
  it("times out a stuck page and cleans it before serving queued work", async () => {
    vi.useFakeTimers();
    const { browser } = fakeBrowser();
    const page = fakePage(); page.setContent.mockImplementation(() => new Promise(() => {}));
    browser.newPage.mockResolvedValue(page);
    const job = chromiumPdf("stuck");
    const rejected = expect(job).rejects.toThrow("DOCUMENT_RENDER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(20_001); await rejected;
    expect(page.close).toHaveBeenCalledOnce();
  });
  it("closes after five idle minutes, not while in use", async () => {
    vi.useFakeTimers();
    const { browser } = fakeBrowser();
    await chromiumPdf("ready");
    await vi.advanceTimersByTimeAsync(299_999); expect(browser.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(browser.close).toHaveBeenCalledOnce();
  });
  it("executable override takes precedence and launch diagnostics contain no path/error detail", async () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/private/missing/browser");
    vi.stubEnv("REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/other/browser");
    mocks.launch.mockRejectedValue(new Error("secret launch detail"));
    await expect(chromiumPdf("html")).rejects.toEqual(new DocumentRendererUnavailable());
    expect(mocks.launch.mock.calls[0][0].executablePath).toBe("/private/missing/browser");
  });
  it("does not classify a render/content failure as launch unavailable", async () => {
    const { browser } = fakeBrowser(); const page = fakePage();
    page.setContent.mockRejectedValue(new Error("render failure")); browser.newPage.mockResolvedValue(page);
    await expect(chromiumPdf("html")).rejects.toThrow("render failure"); expect(page.close).toHaveBeenCalledOnce();
  });
});
