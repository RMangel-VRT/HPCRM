import { describe, it, expect } from "vitest";
import { classifyCustomerService, normalizeCampaignItem } from "@/hooks/useCustomerServices";
import { companyToday } from "./schedulingStatus";
describe("Colorado customer service activity", () => {
  it("classifies either side of Colorado midnight, not UTC midnight", () => {
    const before = companyToday(new Date("2026-11-06T06:59:59Z"));
    const after = companyToday(new Date("2026-11-06T07:00:00Z"));
    expect(before).toBe("2026-11-05"); expect(after).toBe("2026-11-06");
    expect(classifyCustomerService("pending", "2026-11-05", "2026-11-05", before)).toBe("in_window");
    expect(classifyCustomerService("pending", "2026-11-05", "2026-11-05", after)).toBe("overdue");
  });
  it("preserves completed/skipped and inclusive windows", () => {
    expect(classifyCustomerService("completed", "2020-01-01", "2020-02-01", "2026-11-05")).toBe("done");
    expect(classifyCustomerService("skipped", "2020-01-01", "2020-02-01", "2026-11-05")).toBe("skipped");
    expect(classifyCustomerService("pending", "2026-11-06", "2026-11-07", "2026-11-05")).toBe("upcoming");
    expect(classifyCustomerService("pending", "2026-11-01", "2026-11-05", "2026-11-05")).toBe("in_window");
  });
  it("normalizes real nested campaign responses without losing identity", () => {
    expect(normalizeCampaignItem({ id: "a", campaign: { title: "Fall", category: "Extra_billable", windowStart: "2026-10-01", windowEnd: "2026-10-31" } }))
      .toMatchObject({ id: "a", campaignTitle: "Fall", campaignCategory: "Extra_billable", campaignWindowEnd: "2026-10-31" });
  });
});
