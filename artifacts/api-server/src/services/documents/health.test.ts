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
    await options.onBrowser({ version: async () => "Chrome/138.0" }); return Buffer.from("%PDF");
  });
  const status = await checkDocumentRenderer();
  expect(status).toEqual({ status: "ready", reason: null, executableSource: "PUPPETEER_EXECUTABLE_PATH", browserVersion: "Chrome/138.0", checkedAt: expect.any(String) });
  expect(new Date(status.checkedAt).toISOString()).toBe(status.checkedAt);
  expect(mocks.render.mock.calls[0][1].overallTimeoutMs).toBeLessThanOrEqual(20_000);
});
it("classifies invalid configured paths before attempting any render", async () => {
  vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/private/not-a-browser");
  const status = await checkDocumentRenderer();
  expect(status.reason).toBe("EXECUTABLE_NOT_FOUND");
  expect(status.executableSource).toBe("PUPPETEER_EXECUTABLE_PATH");
  expect(JSON.stringify(status)).not.toMatch(/private|stack|message/);
  expect(mocks.render).not.toHaveBeenCalled();
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
  expect(Object.keys(result).sort()).toEqual(["status", "reason", "executableSource", "browserVersion", "checkedAt"].sort());
  expect(mocks.warn).toHaveBeenCalledWith({ reason }, "DOCUMENT_RENDERER_UNAVAILABLE");
});
