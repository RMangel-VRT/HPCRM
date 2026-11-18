import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, describe, expect, it } from "vitest";
import type { ActiveCustomerRow, ActiveCustomersResponse, LineState } from "../../../../../lib/db/src/activeCustomers";
import { activeCustomersReport } from "./activeCustomers";
import { closeDocumentBrowser, renderDocumentPdf } from "./render";

const output = resolve("../../generated-artifacts/active-customers");
const none: LineState = { state: "none", seasonId: null, agreementId: null, seasonLabel: null, startDate: null, endDate: null, note: null };
const current: LineState = { ...none, state: "in_effect", seasonLabel: "2026–27", startDate: "2026-01-01", endDate: "2026-11-20", note: "renewal_sent" };
const customer = (i: number): ActiveCustomerRow => ({
  customerId: `c${i}`, customerName: `Customer ${String(i).padStart(3, "0")} ${"Long community and property name ".repeat(i % 4 === 0 ? 5 : 1)}`,
  customerStatus: i % 3 === 0 ? "inactive" : "active", managingAgentName: `Management-${i} company with a long descriptive name & partners`,
  responsible: true, landscape: { ...current, seasonLabel: `Term-${i}` }, snow: { ...current, seasonLabel: `Term-${i}`, note: "not_renewing" },
  flags: i % 3 === 0 ? ["ending_soon", "mismatch"] : [],
  ...(i % 2 === 1 ? { viaParent: true, parentCustomerId: `c${i - 1}`, parentName: `Customer ${i - 1}` } : {}),
});
const fixture = (rows: ActiveCustomerRow[]): ActiveCustomersResponse => ({
  asOf: "2026-11-13", rows, counts: { responsible: rows.length, landscape: rows.length, snow: rows.length, ending_soon: 0, lapsed: 0, should_fall_off: 0, starting_soon: 0, mismatch: 0, noContract: 0 },
});
afterAll(closeDocumentBrowser);
describe("Active Customers actual Chromium output", () => {
  it.each(["en", "es"])("renders landscape, embedded branding, repeated headers and intact rows in %s", async lang => {
    mkdirSync(output, { recursive: true });
    const data = fixture(Array.from({ length: 70 }, (_, i) => customer(i)));
    data.rows.push({ ...customer(99), customerName: "Stopped property", responsible: false, customerStatus: "inactive",
      landscape: { ...current, state: "ended", endDate: "2027-01-01" }, snow: none, flags: [] });
    const report = activeCustomersReport(data, lang);
    const bytes = await renderDocumentPdf(report);
    const path = `${output}/${lang}.pdf`; writeFileSync(path, bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getPageCount()).toBeLessThan(30);
    for (const page of pdf.getPages()) expect(page.getSize()).toEqual({ width: 792, height: 612 });
    const text = execFileSync("pdftotext", ["-layout", path, "-"]).toString();
    const pages = text.split("\f").filter(s => s.trim());
    expect(pages).toHaveLength(pdf.getPageCount());
    pages.forEach((page, i) => {
      expect(page).toContain("High Plains Property Maintenance");
      expect(page).toContain(lang === "en" ? `Page ${i + 1} of ${pages.length}` : `Página ${i + 1} de ${pages.length}`);
      expect(page).toContain(lang === "en" ? "Nov 13, 2026" : "13 nov 2026");
      if (/Customer \d/.test(page)) expect(page).toContain(lang === "en" ? "CUSTOMER" : "CLIENTE");
    });
    // Every row's unique management marker and both line labels must occur on
    // the same page as its name, even at a natural page break.
    for (let i = 0; i < 70; i++) {
      const name = `Customer ${String(i).padStart(3, "0")}`;
      const markers = pages.filter(page => new RegExp(`\\bManagement-${i}\\b`).test(page));
      expect(markers).toHaveLength(1);
      expect(markers[0]).toContain(name);
      expect(markers[0].match(new RegExp(`\\bTerm-${i}\\b`, "g"))).toHaveLength(2);
      expect(markers[0]).toContain(lang === "en" ? "MANAGEMENT" : "ADMINISTRACIÓN");
    }
    expect(text).toContain(lang === "en" ? "Stopped early" : "Terminó anticipadamente");
    const bbox = execFileSync("pdftotext", ["-bbox", path, "-"]).toString();
    // Body text stays above the footer rule (576.75 points from top).
    for (const match of bbox.matchAll(/<word xMin="[^"]+" yMin="([^"]+)" xMax="[^"]+" yMax="([^"]+)">([^<]+)<\/word>/g)) {
      const top = Number(match[1]), bottom = Number(match[2]);
      expect(bottom).toBeLessThan(612);
      if (top < 570) expect(bottom).toBeLessThan(577);
      else expect(top).toBeGreaterThan(580); // Footer-only band: no body/footer collision.
    }
    const fonts = execFileSync("pdffonts", [path]).toString();
    expect(fonts).toContain("Inter");
    expect(execFileSync("pdfimages", ["-list", path]).toString()).toMatch(/image/);
    execFileSync("pdftoppm", ["-f", "1", "-scale-to", "1500", "-png", "-singlefile", path, `${output}/${lang}-first`]);
    execFileSync("pdftoppm", ["-f", String(pages.length), "-scale-to", "1500", "-png", "-singlefile", path, `${output}/${lang}-last`]);
    const empty = await renderDocumentPdf(activeCustomersReport(fixture([]), lang));
    writeFileSync(`${output}/${lang}-empty.pdf`, empty);
    expect((await PDFDocument.load(empty)).getPageCount()).toBe(1);
  }, 120000);
});
