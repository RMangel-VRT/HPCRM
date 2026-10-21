import { describe, expect, it } from "vitest";
import { isSafeOriginUrl } from "./ticketListReturn";

const O = "https://crm.test";
const ok = (p: string) => isSafeOriginUrl(new URL(p, O), O);

describe("safe ticket return origins", () => {
  it("keeps existing Tickets list origins", () => {
    expect(ok("/dashboard/tickets")).toBe(true);
    expect(ok("/dashboard/tickets?view=kanban-type&q=x&completedPage=2")).toBe(true);
    expect(ok("/dashboard/tickets?view=billing")).toBe(false);
    expect(ok("/dashboard/tickets?evil=1")).toBe(false);
  });
  it("accepts Billing and My Tickets invoice/other tabs only", () => {
    expect(ok("/dashboard/billing")).toBe(true);
    expect(ok("/dashboard/invoicing")).toBe(true);
    expect(ok("/dashboard/tickets/my?tab=invoice")).toBe(true);
    expect(ok("/dashboard/tickets/my?tab=other")).toBe(true);
  });
  it("rejects unsafe or unknown variants", () => {
    expect(ok("/dashboard/billing?x=1")).toBe(false);
    expect(ok("/dashboard/invoicing?x=1")).toBe(false);
    expect(ok("/dashboard/tickets/my")).toBe(false);
    expect(ok("/dashboard/tickets/my?tab=evil")).toBe(false);
    expect(ok("/dashboard/tickets/my?tab=invoice&q=1")).toBe(false);
    expect(ok("/dashboard/tickets/my?tab=invoice&tab=other")).toBe(false);
    expect(ok("/dashboard/users")).toBe(false);
    expect(isSafeOriginUrl(new URL("https://evil.test/dashboard/billing"), O)).toBe(false);
  });
});
