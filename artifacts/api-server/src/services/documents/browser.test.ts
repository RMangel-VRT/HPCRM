import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ launch: vi.fn(), discover: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch: mocks.launch } }));
vi.mock("./discovery", () => ({ discoverChromium: mocks.discover }));
vi.mock("../../lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { chromiumPdf, closeDocumentBrowser, DocumentRendererUnavailable } from "./browser";
import { logger } from "../../lib/logger";
import type { DiscoveryReport } from "./browser";
const report = { executableSource: "PATH" as const, attempts: [{ source: "PATH_CHROMIUM" as const, outcome: "SELECTED" as const }] };
beforeEach(() => { mocks.discover.mockResolvedValue({ path: process.execPath, ...report }); });

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
    expect(logger.info).toHaveBeenCalledExactlyOnceWith({ executableSource: "PATH", executablePath: process.execPath }, "DOCUMENT_CHROMIUM_SELECTED");
    await closeDocumentBrowser(); fakeBrowser(); await chromiumPdf("relaunch");
    expect(logger.info).toHaveBeenCalledOnce();
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
  it("exhausted discovery retains safe attempts and never launches", async () => {
    const discovery: DiscoveryReport = { executableSource: null, attempts: [{ source: "NIX_STORE", outcome: "NOT_FOUND" }] };
    mocks.discover.mockResolvedValue({ path: null, ...discovery });
    await expect(chromiumPdf("html")).rejects.toEqual(new DocumentRendererUnavailable("EXECUTABLE_NOT_FOUND", discovery));
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({ reason: "EXECUTABLE_NOT_FOUND", attempts: discovery.attempts }, "DOCUMENT_RENDERER_UNAVAILABLE");
  });
  it("classifies a launch error without exposing it to the caller", async () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", process.execPath);
    mocks.launch.mockRejectedValue(Object.assign(new TypeError(`${"x".repeat(220)}\nNEVER LOG SECOND LINE`), { code: "ENOENT" }));
    await expect(chromiumPdf("html")).rejects.toEqual(new DocumentRendererUnavailable("LAUNCH_FAILED", report));
    expect(logger.warn).toHaveBeenCalledWith({ reason: "LAUNCH_FAILED", errorName: "TypeError", errorCode: "ENOENT", firstLine: "x".repeat(200) }, "DOCUMENT_RENDERER_UNAVAILABLE");
    expect(mocks.discover).toHaveBeenCalledOnce();
  });
  it("reports the actual shared browser selection even if hints change between jobs", async () => {
    fakeBrowser();
    const first = vi.fn(), second = vi.fn();
    await chromiumPdf("one", undefined, { onDiscovery: first });
    mocks.discover.mockResolvedValue({ path: "/new", executableSource: "CHROMIUM_PATH", attempts: [] });
    await chromiumPdf("two", undefined, { onDiscovery: second });
    expect(first).toHaveBeenCalledWith(report); expect(second).toHaveBeenCalledWith(report);
    expect(mocks.discover).toHaveBeenCalledOnce();
  });
  it("re-resolves only after the shared browser is closed", async () => {
    fakeBrowser(); await chromiumPdf("one"); await closeDocumentBrowser();
    fakeBrowser(); await chromiumPdf("two");
    expect(mocks.discover).toHaveBeenCalledTimes(2);
  });
  it("notifies both concurrent checks of the selected executable before a slow launch times out", async () => {
    vi.useFakeTimers();
    const { browser } = fakeBrowser();
    mocks.launch.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(browser), 200)));
    const first = vi.fn(), second = vi.fn();
    const jobs = [chromiumPdf("one", undefined, { overallTimeoutMs: 100, onDiscovery: first }),
      chromiumPdf("two", undefined, { overallTimeoutMs: 100, onDiscovery: second })];
    const rejected = jobs.map(job => expect(job).rejects.toThrow("DOCUMENT_RENDER_TIMEOUT"));
    await vi.advanceTimersByTimeAsync(101); await Promise.all(rejected);
    expect(first).toHaveBeenCalledWith(report); expect(second).toHaveBeenCalledWith(report);
    await vi.advanceTimersByTimeAsync(100);
    expect(browser.newPage).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected launch codes and logs no second line or raw error object", async () => {
    mocks.launch.mockRejectedValue(Object.assign(new Error("first\nPRIVATE"), { code: "secret value\nPRIVATE" }));
    await expect(chromiumPdf("html")).rejects.toBeInstanceOf(DocumentRendererUnavailable);
    expect(logger.warn).toHaveBeenCalledWith({ reason: "LAUNCH_FAILED", errorName: "Error", errorCode: "UNKNOWN", firstLine: "first" }, "DOCUMENT_RENDERER_UNAVAILABLE");
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("PRIVATE");
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
