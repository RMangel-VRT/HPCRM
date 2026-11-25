import { expect, it } from "vitest";
import { DEFAULT_WORDING } from "./wording";
import { buildEstimateEmail } from "./estimateEmail";

const args: Parameters<typeof buildEstimateEmail>[0] = {
  estimate: { companyId: "company", estimateNumber: "EST-2026-0014", title: "Front entry conversion",
    customerName: "Cherry Hills", workLocation: "Front Entry <East>\nGate code: private" },
  version: { versionNumber: 1, frozenSubtotalCents: null, sentAt: null, totals: { subtotalCents: 307960, bySection: { bed: 307960 } },
    sections: [{ id: "bed", name: "Bed prep & turf", lines: [{}, {}] }], photos: [{}, {}, {}] },
  company: { name: "High Plains", addressLine: "123 Main St", email: "info@example.test", website: "", phone: "" },
  now: new Date("2026-11-21T04:30:00Z"), attachment: { filename: "EST-2026-0014.pdf", pageCount: 4, approximate: true },
  note: " Start Dec 1 ", wording: DEFAULT_WORDING.estimate,
};

it("renders first-version blocks in order using the Colorado day and selected section totals", async () => {
  const result = await buildEstimateEmail(args);
  expect(result.subject).toBe("Estimate EST-2026-0014 – Front entry conversion");
  expect(result.preview).toBe("$3,079.60 · good for 30 days · sign the last page to approve");
  const expected = ["A note from High Plains\nStart Dec 1", "Total: $3,079.60\nValid until: Dec 20, 2026\nPhotos: 3 attached",
    "Summary\nBed prep & turf (2 lines): $3,079.60", "Work location: Front Entry <East>\nEstimate date: Nov 20, 2026\nEstimate total: $3,079.60",
    "What happens next\n1. Review: ", "Attached: EST-2026-0014.pdf · Approx. 4 pages", "Questions or changes? Just reply"];
  let start = 0;
  for (const snippet of expected) {
    const found = result.text.indexOf(snippet, start);
    expect(found, snippet).toBeGreaterThanOrEqual(start);
    start = found + snippet.length;
  }
  expect(result.html).toContain("Front Entry &lt;East&gt;");
  expect(result.text).not.toMatch(/Gate code|call us at/);
  expect(result.text).toContain("Questions about this estimate?");
});

it("renders the revised estimate against a prior sent total, without first-version blocks", async () => {
  const result = await buildEstimateEmail({ ...args, wording: DEFAULT_WORDING.estimate_revised, version: { ...args.version, versionNumber: 2, frozenSubtotalCents: 282960 },
    previous: { versionNumber: 1, sentAt: new Date("2026-10-31T05:35:00Z"), frozenSubtotalCents: 307960 },
    attachment: { filename: "original-v2.pdf", pageCount: 5 } });
  expect(result.subject).toBe("Revised estimate EST-2026-0014 (Version 2) – Front entry conversion");
  expect(result.preview).toBe("Updated total $2,829.60 · replaces the earlier version");
  expect(result.html).toContain('bgcolor="#5B9BD5"');
  expect(result.html).toContain("Version 1 total");
  expect(result.html).toContain('text-decoration:line-through;color:#8b948e">$3,079.60</span>');
  expect(result.text).toContain("sent on Oct 30, 2026");
  expect(result.text).toContain("Change: − $250.00\nNew total: $2,829.60");
  expect(result.text).toContain("Attached: original-v2.pdf · 5 pages");
  expect(result.text).not.toMatch(/What happens next|Work location|Summary|Valid until|Questions or changes\?/);
});

it("uses the selected historical date and omits unavailable comparison and photo facts", async () => {
  const historicalVersion = { ...args.version, sentAt: "2026-03-08T06:45:00Z", photos: [] };
  const first = await buildEstimateEmail({ ...args, note: " ", subject: "Original custom subject", version: historicalVersion });
  expect(first.subject).toBe("Original custom subject");
  expect(first.text).toContain("Estimate date: Mar 7, 2026");
  expect(first.text).toContain("Valid until: Apr 6, 2026");
  expect(first.text).not.toMatch(/Photos:|A note from High Plains/);
  const revised = await buildEstimateEmail({ ...args, wording: DEFAULT_WORDING.estimate_revised, version: { ...args.version, versionNumber: 3 } });
  expect(revised.text).toContain("Here is Version 3 of your estimate.");
  expect(revised.text).not.toMatch(/version we sent on|Version 2 total|Change:/);
});

it("shows the discounted total with named discount rows under a gross subtotal", async () => {
  const result = await buildEstimateEmail({ ...args, version: { ...args.version, frozenSubtotalCents: 307960, frozenTotalCents: 246368,
    laborDiscountKind: "percent", laborDiscountValue: 1500, laborDiscountLabel: "Winter labor discount", totalDiscountKind: "amount", totalDiscountValue: 50000, totalDiscountLabel: null,
    totals: { subtotalCents: 307960, bySection: { bed: 307960 }, laborDiscountCents: 11592, totalDiscountCents: 50000, totalCents: 246368 } } });
  expect(result.preview).toContain("$2,463.68");
  expect(result.text).toContain("Total: $2,463.68");
  expect(result.text).toContain("Subtotal: $3,079.60");
  expect(result.text).toContain("Winter labor discount (15%): −$115.92");
  expect(result.text).toContain("Discount: −$500.00");
  expect(result.text).not.toContain("Discount (");
});

it("never shows discount rows when nothing is discounted", async () => {
  const result = await buildEstimateEmail(args);
  expect(result.text).not.toMatch(/Subtotal|discount/i);
});
