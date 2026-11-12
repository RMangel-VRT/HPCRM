import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { estimateFixture } from "./fixtures";
import { estimateDocumentHtml } from "./estimate";
import { renderDocumentPdf } from "./render";
import { closeDocumentBrowser } from "./browser";

afterAll(closeDocumentBrowser);
it("renders frozen legacy units canonically in the actual PDF while preserving the source and totals", async () => {
  const model = estimateFixture(12);
  const units = ["visit", "yd3", "week", "1,000 sq ft", "pallet", "IN. DBH"];
  model.sections[0].lines.slice(0, units.length).forEach((line, i) => { line.unit = units[i]; });
  const before = structuredClone(model);
  const html = estimateDocumentHtml(model);
  for (const unit of ["FLAT", "CU. YD", "WEEK", "1,000 SF", "pallet", "IN. DBH"]) expect(html).toContain(`>${unit}<`);
  const bytes = await renderDocumentPdf({ html, footerLabel: "Estimate", shortHeaderNumber: model.estimateNumber });
  const dir = mkdtempSync(join(tmpdir(), "estimate-unit-pdf-"));
  try {
    const path = join(dir, "units.pdf"); writeFileSync(path, bytes);
    const text = execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
    for (const unit of ["FLAT", "CU. YD", "WEEK", "1,000 SF", "pallet", "IN. DBH"]) expect(text).toContain(unit);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  expect(model).toEqual(before);
}, 30_000);
