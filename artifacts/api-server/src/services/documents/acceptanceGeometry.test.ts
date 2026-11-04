import { afterAll, expect, it } from "vitest";
import puppeteer from "puppeteer-core";
import { chromiumExecutable } from "./browser";
import { estimateFixture } from "./fixtures";
import { estimateDocumentHtml } from "./estimate";
import { proposalDocumentHtml, buildProposalDocumentModel } from "./proposal";
import type { Browser } from "puppeteer-core";
let browser: Browser | undefined;
afterAll(async () => { await browser?.close(); });
it.each(["estimate", "proposal"])("%s border hugs signatures with its unchanged reserve immediately outside", async kind => {
  browser ??= await puppeteer.launch({ executablePath: await chromiumExecutable(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  try {
    const estimate = estimateFixture(12);
    const html = kind === "estimate" ? estimateDocumentHtml(estimate) : proposalDocumentHtml(buildProposalDocumentModel({
      estimate, title: "Geometry fixture", number: "PROP-42", documentDate: "2026-11-03",
      customerName: "Example", customerAddress: "", workLocation: "", scopeOfWork: "",
      coverSource: "none", hero: null, visualScope: [], palette: { introText: "", groups: [] }, schedule: [], photos: [], photoLayout: "grid",
    }));
    await page.setViewport({ width: 816, height: 1056 }); await page.emulateMediaType("print");
    await page.setContent(html); await page.evaluate("document.fonts.ready");
    const result = await page.evaluate(`(() => {
      const box = document.querySelector(".acceptance");
      const reserve = document.querySelector(".acceptance-group > .mountain-space");
      const signatures = box.querySelector(".signatures");
      const group = box.parentElement;
      return {
        inside: !!box.querySelector(".mountain-space"), adjacent: box.nextElementSibling === reserve,
        padding: box.getBoundingClientRect().bottom - signatures.getBoundingClientRect().bottom,
        gap: reserve.getBoundingClientRect().top - box.getBoundingClientRect().bottom,
        reserve: reserve.getBoundingClientRect().height, keep: getComputedStyle(group).breakInside,
        legalKeep: document.querySelector(".legal") ? getComputedStyle(document.querySelector(".legal")).breakInside : null,
      };
    })()`) as { inside: boolean; adjacent: boolean; padding: number; gap: number; reserve: number; keep: string; legalKeep: string | null };
    expect(result.inside).toBe(false); expect(result.adjacent).toBe(true);
    expect(result.padding).toBeGreaterThanOrEqual(15); expect(result.padding).toBeLessThan(16);
    expect(result.gap).toBe(0); expect(result.reserve).toBe(kind === "estimate" ? 71 : 116);
    expect(result.keep).toBe("avoid");
    if (kind === "proposal") expect(result.legalKeep).not.toBe("avoid");
  } finally { await page.close(); }
}, 30_000);
