import { afterEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
const mocks = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { warn: mocks.warn } }));
import { estimateFixture } from "./fixtures";
import { renderEstimateDocument } from "../estimatePdf";
import { closeDocumentBrowser } from "./browser";
afterEach(async () => { await closeDocumentBrowser(); vi.unstubAllEnvs(); });
it("a genuinely missing executable uses the preserved legacy estimate, logging only its fixed code", async () => {
  vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/not-a-real-executable");
  const buffer = await renderEstimateDocument(estimateFixture(12));
  expect((await PDFDocument.load(buffer)).getPageCount()).toBeGreaterThan(0);
  expect(mocks.warn).toHaveBeenCalledExactlyOnceWith("DOCUMENT_RENDERER_UNAVAILABLE");
}, 30_000);
