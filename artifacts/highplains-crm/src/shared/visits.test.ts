import { describe, expect, it } from "vitest";
import { insertVisitSchema, visits } from "./schema";

describe("hand-synced visits client contract", () => {
  const base = { companyId: "company", visitDate: "2024-02-29" };
  it("contains every SQL column and preserves nullable form fields", () => {
    expect(Object.keys(visits).filter(key => !key.startsWith("$")).sort()).toEqual([
      "id", "companyId", "crewId", "visitDate", "sourceType", "ticketId", "customerId", "title", "routeOrder",
      "startTime", "estimatedHours", "status", "actualStartAt", "actualEndAt", "notes", "createdById", "createdAt", "updatedAt",
    ].sort());
    expect(insertVisitSchema.parse({ ...base, ticketId: "ticket", crewId: "crew", customerId: "customer", routeOrder: null, notes: null, estimatedHours: null })).toMatchObject({
      crewId: "crew", customerId: "customer", routeOrder: null, notes: null, estimatedHours: null, sourceType: "ticket", status: "planned",
    });
  });
  it("enforces ticket/internal identity with a real refinement, not the drizzle stub", () => {
    expect(insertVisitSchema.safeParse(base).success).toBe(false);
    expect(insertVisitSchema.safeParse({ ...base, sourceType: "internal", title: "  " }).success).toBe(false);
    expect(insertVisitSchema.parse({ ...base, sourceType: "internal", title: " Trip " }).title).toBe("Trip");
  });
  it.each(["2025-02-29", "2026-02-30", "0000-01-01", "2026-13-01"])("rejects impossible date %s", visitDate => {
    expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", visitDate }).success).toBe(false);
  });
  it("validates clock, hours and enums consistently with server", () => {
    for (const field of [{ startTime: "24:00" }, { startTime: "09:60" }, { estimatedHours: -1 }, { estimatedHours: 25 }, { status: "invalid" }, { sourceType: "invalid" }])
      expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", ...field }).success).toBe(false);
    expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", startTime: "23:59", estimatedHours: 24 }).success).toBe(true);
  });
});
