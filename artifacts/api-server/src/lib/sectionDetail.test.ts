import { describe, expect, it } from "vitest";
import { ageDetail, calendarDetail } from "./sectionDetail";

describe("section calendar detail", () => {
  it.each([
    ["2026-10-25", "2026-10-27T05:59:59Z", "1d"],
    ["2026-10-25", "2026-10-27T06:00:00Z", "2d"],
    ["2026-03-08T07:00:00Z", "2026-03-09T06:00:00Z", "1d"],
    ["2026-11-01T06:00:00Z", "2026-11-02T07:00:00Z", "1d"],
    ["2026-10-28", "2026-10-27T18:00:00Z", "in 1d"],
  ])("projects %s at %s using calendar days", (source, now, age) => {
    expect(calendarDetail("Drain", source, new Date(now))).toBe(`Drain · ${age}`);
  });
  it.each([null, undefined, "", "not-a-date", "2026-02-30", new Date(NaN)])("does not invent age for %s", source => {
    expect(calendarDetail("Drain", source, new Date())).toBe("Drain · Date unavailable");
  });
  it("localizes unavailable and future dates without hiding context", () => {
    expect(ageDetail("Borrador", null, "es")).toBe("Borrador · Fecha no disponible");
    expect(ageDetail("Seguimiento", -3, "es")).toBe("Seguimiento · en 3d");
  });
});
