import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, describe, expect, it } from "vitest";
import { fiveParksFixture, completedFiveParksFixture } from "../contractedServicesFixture";
import { buildContractedServicesModel } from "../contractedServicesDocument";
import { contractedServicesHtml } from "./contractedServices";
import { closeDocumentBrowser, renderDocumentPdf } from "./render";
const output = resolve("../../generated-artifacts/SC3");
afterAll(closeDocumentBrowser);
describe("SC3 real Chromium documents", () => {
  it("renders the approved fixture on one Letter page and repeats headings in a long contract", async () => {
    mkdirSync(output, { recursive: true });
    const model = buildContractedServicesModel(fiveParksFixture(), "p", "t");
    const render = async (name: string, m = model) => {
      const bytes = await renderDocumentPdf({ html: contractedServicesHtml(m), footerLabel: `Contracted Services · ${m.season}`, shortHeaderNumber: m.season });
      writeFileSync(`${output}/${name}.pdf`, bytes);
      return { pdf: await PDFDocument.load(bytes), text: execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString() };
    };
    const fixture = await render("five-parks-fixture");
    expect(fixture.pdf.getPageCount()).toBe(1);
    expect(fixture.pdf.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
    expect(fixture.text).toContain("COMPLETED");
    expect(fixture.text).not.toMatch(/\brounds?\b|\bcampaign\b|\bCRM\b|BED AND HARD/i);
    expect(fixture.text).toContain("13 contracted services");
    const completed = await render("completed-fixture", buildContractedServicesModel(completedFiveParksFixture(), "p", "t"));
    expect(completed.text).toContain("Jun 12, 2026");
    expect(completed.text).toContain("Skipped");
    const coordinates = execFileSync("pdftotext", ["-bbox", `${output}/completed-fixture.pdf`, "-"]).toString();
    const second = /<word[^>]*yMin="([^"]+)"[^>]*>Second<\/word>/.exec(coordinates)!;
    const completion = /<word[^>]*yMin="([^"]+)"[^>]*>12,<\/word>/.exec(coordinates)!;
    expect(Math.abs(Number(second[1]) - Number(completion[1]))).toBeLessThan(1);
    const long = await render("long-contract", { ...model, rows: Array.from({ length: 65 }, (_, i) => ({ ...model.rows[i % model.rows.length], key: `long-${i}` })) });
    expect(long.pdf.getPageCount()).toBeGreaterThan(1);
    for (const page of long.text.split("\f").filter(s => s.trim())) {
      expect(page).toContain("SERVICE");
      expect(page).toContain("COMPLETED");
      expect(page).toContain("2025–26");
    }
    execFileSync("pdftoppm", ["-scale-to", "1400", "-png", "-singlefile", `${output}/five-parks-fixture.pdf`, `${output}/five-parks-fixture`]);
  }, 90000);
});
