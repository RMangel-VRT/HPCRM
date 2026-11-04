import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { estimateFixture } from "./fixtures";
import { renderEstimateDocument } from "../estimatePdf";
import { closeDocumentBrowser, DocumentRendererUnavailable } from "./browser";
afterEach(async () => { await closeDocumentBrowser(); vi.unstubAllEnvs(); });
it("never substitutes a legacy estimate when the executable is missing", async () => {
  vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/not-a-real-executable");
  await expect(renderEstimateDocument(estimateFixture(12))).rejects.toBeInstanceOf(DocumentRendererUnavailable);
});
it("renders the shared estimate design", async () => {
  const bytes = await renderEstimateDocument(estimateFixture(12));
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString();
  expect(text).toContain("Acceptance");
  expect(text).toContain("BY CATEGORY");
  expect(text).not.toContain("SECRET");
}, 30_000);
