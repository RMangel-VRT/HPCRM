import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { estimateFixture } from "./fixtures";
import { renderEstimateDocument } from "../estimatePdf";
import { closeDocumentBrowser, DocumentRendererUnavailable } from "./browser";
import * as discovery from "./discovery";
afterEach(async () => { await closeDocumentBrowser(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("never substitutes a legacy estimate when the executable is missing", async () => {
  vi.spyOn(discovery, "discoverChromium").mockResolvedValue({ path: null, executableSource: null, attempts: [{ source: "NIX_STORE", outcome: "NOT_FOUND" }] });
  await expect(renderEstimateDocument(estimateFixture(12))).rejects.toBeInstanceOf(DocumentRendererUnavailable);
});
it("renders the shared estimate design", async () => {
  const bytes = await renderEstimateDocument(estimateFixture(12));
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString();
  expect(text).toContain("Acceptance");
  expect(text).toContain("BY CATEGORY");
  expect(text).not.toContain("SECRET");
}, 30_000);
