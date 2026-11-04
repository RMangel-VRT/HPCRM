import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch: mocks.launch } }));
vi.mock("../../lib/logger", () => ({ logger: { warn: vi.fn() } }));
import { chromiumPdf, closeDocumentBrowser, DocumentRendererUnavailable } from "./browser";
import { logger } from "../../lib/logger";

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
  it("invalid executable override is absence, not launch failure, and never falls through", async () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/private/missing/browser");
    vi.stubEnv("REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/other/browser");
    mocks.launch.mockRejectedValue(new Error("secret launch detail"));
    await expect(chromiumPdf("html")).rejects.toEqual(new DocumentRendererUnavailable());
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("classifies a launch error without exposing it to the caller", async () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", process.execPath);
    mocks.launch.mockRejectedValue(new TypeError(`${"x".repeat(220)}\nNEVER LOG SECOND LINE`));
    await expect(chromiumPdf("html")).rejects.toEqual(new DocumentRendererUnavailable("LAUNCH_FAILED"));
    expect(logger.warn).toHaveBeenCalledWith({ reason: "LAUNCH_FAILED", errorName: "TypeError", firstLine: "x".repeat(200) }, "DOCUMENT_RENDERER_UNAVAILABLE");
  });
  it("removes an expired queued check and never creates its page", async () => {
    const { browser } = fakeBrowser();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const finish = async (bytes: Buffer) => { await hold; return bytes; };
    const jobs = [chromiumPdf("one", finish), chromiumPdf("two", finish)];
    await vi.waitFor(() => expect(browser.newPage).toHaveBeenCalledTimes(2));
    vi.useFakeTimers();
    const check = expect(chromiumPdf("expired", undefined, { overallTimeoutMs: 100 })).rejects.toThrow("DOCUMENT_RENDER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(101); await check;
    release(); await Promise.all(jobs);
    await chromiumPdf("next");
    expect(browser.newPage).toHaveBeenCalledTimes(3);
  });
  it("closes a late-created page after the overall launch deadline", async () => {
    const { browser } = fakeBrowser();
    const page = fakePage();
    let release!: () => void;
    browser.newPage.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve; }); return page; });
    const job = chromiumPdf("late", undefined, { overallTimeoutMs: 100 });
    const result = expect(job).rejects.toThrow("DOCUMENT_RENDER_TIMEOUT");
    await vi.waitFor(() => expect(browser.newPage).toHaveBeenCalledOnce());
    await result;
    release();
    await vi.waitFor(() => expect(page.close).toHaveBeenCalledOnce());
    expect(page.setContent).not.toHaveBeenCalled();
  });
  it("uses one overall deadline across launch and render rather than restarting it", async () => {
    vi.useFakeTimers();
    const { browser } = fakeBrowser();
    const page = fakePage(); page.setContent.mockImplementation(() => new Promise(() => {}));
    browser.newPage.mockResolvedValue(page);
    mocks.launch.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(browser), 70)));
    const check = chromiumPdf("check", undefined, { overallTimeoutMs: 100 });
    const rejected = expect(check).rejects.toThrow("DOCUMENT_RENDER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(71);
    expect(page.setContent).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30); await rejected;
    expect(page.close).toHaveBeenCalledOnce();
  });
  it("cancels queued requests and preserves FIFO admission for the remaining jobs", async () => {
    const { browser } = fakeBrowser();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const finish = async (bytes: Buffer) => { await hold; return bytes; };
    const first = chromiumPdf("first", finish), second = chromiumPdf("second", finish);
    await vi.waitFor(() => expect(browser.newPage).toHaveBeenCalledTimes(2));
    const ctrl = new AbortController();
    const cancelled = chromiumPdf("cancelled", undefined, { signal: ctrl.signal });
    const rejected = expect(cancelled).rejects.toThrow("DOCUMENT_RENDER_CANCELLED");
    const last = chromiumPdf("last");
    ctrl.abort(); await rejected;
    release(); await Promise.all([first, second, last]);
    expect(browser.newPage).toHaveBeenCalledTimes(3);
  });
  it("holds an expired stamping job's slot until its non-cancellable work settles", async () => {
    const { browser } = fakeBrowser();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const finish = async (bytes: Buffer) => { await hold; return bytes; };
    const expired = chromiumPdf("stamp", finish, { overallTimeoutMs: 100 });
    const rejected = expect(expired).rejects.toThrow("DOCUMENT_RENDER_TIMEOUT");
    const second = chromiumPdf("second", finish);
    await vi.waitFor(() => expect(browser.newPage).toHaveBeenCalledTimes(2));
    const third = chromiumPdf("third");
    await rejected; expect(browser.newPage).toHaveBeenCalledTimes(2);
    release(); await Promise.all([second, third]);
    expect(browser.newPage).toHaveBeenCalledTimes(3);
  });
  it("does not classify a render/content failure as launch unavailable", async () => {
    const { browser } = fakeBrowser(); const page = fakePage();
    page.setContent.mockRejectedValue(new Error("render failure")); browser.newPage.mockResolvedValue(page);
    await expect(chromiumPdf("html")).rejects.toThrow("render failure"); expect(page.close).toHaveBeenCalledOnce();
  });
});
