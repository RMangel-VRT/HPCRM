import { describe, expect, it } from "vitest";
import { assertEditable, isTermEditable } from "./contractCenterService";
import { companyToday } from "./companyDay";

describe("Colorado inclusive season editing", () => {
  it("uses Colorado midnight, not UTC midnight, for the inclusive final day", () => {
    const term = { status: "renewed", endDate: "2026-10-29" };
    const lastEvening = companyToday(new Date("2026-10-30T05:59:59Z"));
    const nextDay = companyToday(new Date("2026-10-30T06:00:00Z"));
    expect(lastEvening).toBe("2026-10-29");
    expect(isTermEditable(term, lastEvening)).toBe(true);
    expect(() => assertEditable(term, lastEvening)).not.toThrow();
    expect(isTermEditable(term, nextDay)).toBe(false);
    expect(() => assertEditable(term, nextDay)).toThrow("Past season, read only");
  });
  it.each(["signed", "active", "renewed"])("allows future %s fields", status => {
    expect(isTermEditable({ status, endDate: "2035-10-29" }, "2026-10-29")).toBe(true);
  });
  it.each(["lost", "cancelled"])("keeps %s closed even in the future", status => {
    expect(() => assertEditable({ status, endDate: "2035-01-01" }, "2026-10-29")).toThrow("Closed season, read only");
  });
});
