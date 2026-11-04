import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ render: vi.fn(), warn: vi.fn() }));
vi.mock("./render", () => ({ renderDocumentPdf: mocks.render }));
vi.mock("../../lib/logger", () => ({ logger: { warn: mocks.warn } }));
import { checkDocumentRenderer } from "./health";
import { DocumentRendererUnavailable } from "./browser";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", process.execPath);
});
afterEach(() => vi.unstubAllEnvs());
it("returns only fixed public fields and ISO timestamp after a real-kit check/version", async () => {
  mocks.render.mockImplementation(async (_input, options) => {
    options.onDiscovery({ executableSource: "PATH", attempts: [{ source: "PATH_CHROMIUM", outcome: "SELECTED" }] });
    await options.onBrowser({ version: async () => "Chrome/138.0" }); return Buffer.from("%PDF");
  });
  const status = await checkDocumentRenderer();
  expect(status).toEqual({ status: "ready", reason: null, executableSource: "PATH", attempts: [{ source: "PATH_CHROMIUM", outcome: "SELECTED" }], browserVersion: "Chrome/138.0", checkedAt: expect.any(String) });
  expect(new Date(status.checkedAt).toISOString()).toBe(status.checkedAt);
  expect(mocks.render.mock.calls[0][1].overallTimeoutMs).toBeLessThanOrEqual(20_000);
});
it("retains exhausted launch discovery without exposing private paths", async () => {
  mocks.render.mockRejectedValue(new DocumentRendererUnavailable("EXECUTABLE_NOT_FOUND", {
    executableSource: null, attempts: [{ source: "PUPPETEER_EXECUTABLE_PATH", outcome: "NOT_FOUND" }, { source: "NIX_STORE", outcome: "NOT_FOUND" }],
  }));
  const status = await checkDocumentRenderer();
  expect(status.reason).toBe("EXECUTABLE_NOT_FOUND");
  expect(status.executableSource).toBeNull();
  expect(status.attempts).toHaveLength(2);
  expect(JSON.stringify(status)).not.toMatch(/private|stack|message/);
  expect(mocks.render).toHaveBeenCalledOnce();
});
it("retains selected attempts on launch failure, without implying readiness", async () => {
  const discovery = { executableSource: "BUILD_MANIFEST" as const, attempts: [{ source: "BUILD_MANIFEST" as const, outcome: "SELECTED" as const }] };
  mocks.render.mockRejectedValue(new DocumentRendererUnavailable("LAUNCH_FAILED", discovery));
  expect(await checkDocumentRenderer()).toMatchObject({ status: "unavailable", reason: "LAUNCH_FAILED", browserVersion: null, ...discovery });
});
it("preserves actual launch diagnostics on content failure rather than resolving again", async () => {
  const discovery = { executableSource: "NIX_STORE", attempts: [{ source: "NIX_STORE", outcome: "SELECTED" }] };
  mocks.render.mockImplementation(async (_input, options) => {
    options.onDiscovery(discovery); throw new Error("private content");
  });
  expect(await checkDocumentRenderer()).toMatchObject({ status: "unavailable", reason: "RENDER_FAILED", ...discovery });
});
it.each([
  [new DocumentRendererUnavailable("LAUNCH_FAILED"), "LAUNCH_FAILED"],
  [new Error("private content\nstack"), "RENDER_FAILED"],
  [new Error("DOCUMENT_RENDER_TIMEOUT"), "RENDER_FAILED"],
] as const)("maps failures without exposing raw errors", async (error, reason) => {
  mocks.render.mockRejectedValue(error);
  const result = await checkDocumentRenderer();
  expect(result.status).toBe("unavailable"); expect(result.reason).toBe(reason);
  expect(result.browserVersion).toBeNull();
    expect(Object.keys(result).sort()).toEqual(["status", "reason", "executableSource", "attempts", "browserVersion", "checkedAt"].sort());
  expect(mocks.warn).toHaveBeenCalledWith({ reason }, "DOCUMENT_RENDERER_UNAVAILABLE");
});
