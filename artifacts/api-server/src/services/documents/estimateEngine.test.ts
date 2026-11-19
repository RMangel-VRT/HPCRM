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
  expect(text).not.toContain("BY CATEGORY");
  expect(text).not.toContain("SECRET");
}, 30_000);
it.each([false, true])("prints a clean draft on every page with version labels enabled: %s", async showVersion => {
  const model = { ...estimateFixture(60), draft: true, versionNumber: 1, status: "draft", statusLine: "", showVersion };
  const bytes = await renderEstimateDocument(model);
  const pages = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString().split("\f").filter(page => page.trim());
  expect(pages.length).toBeGreaterThan(1);
  for (const page of pages) {
    expect(page.replace(/\s/g, "")).not.toContain("DRAFT");
    expect(page).toContain(`Estimate ${model.estimateNumber}${showVersion ? ", version 1" : ""} ·`);
    expect(page.includes(`${model.estimateNumber} · Version 1`)).toBe(showVersion);
    if (!showVersion) expect(page).not.toMatch(/version 1/i);
  }
}, 30_000);
