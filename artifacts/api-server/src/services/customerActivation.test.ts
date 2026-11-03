import { beforeEach, describe, expect, it, vi } from "vitest";
const fx = vi.hoisted(() => ({ customer: vi.fn(), pm: vi.fn(), missing: vi.fn() }));
vi.mock("../storage", () => ({ storage: { getCustomerById: fx.customer, getPropertyManagementCompanyById: fx.pm } }));
vi.mock("./customerSetupValidation", () => ({ setupMissingFields: fx.missing }));
import { customerActivation } from "./customerActivation";
beforeEach(() => vi.clearAllMocks());
describe("post-commit customer activation advisory", () => {
  it("reads the prospect in the initiating company and uses authoritative completeness", async () => {
    fx.customer.mockResolvedValue({ id: "cu1", status: "prospect" });
    fx.missing.mockImplementation(async (_customer, ctx) => {
      await ctx.getCustomerById("parent"); await ctx.getPropertyManagementCompanyById("manager");
      return ["billingEmails"];
    });
    expect(await customerActivation("co1", async () => "cu1")).toEqual({ customerId: "cu1", status: "prospect", missingFields: ["billingEmails"] });
    expect(fx.customer).toHaveBeenCalledWith("cu1", "co1");
    expect(fx.customer).toHaveBeenCalledWith("parent", "co1");
    expect(fx.pm).toHaveBeenCalledWith("manager", "co1");
  });
  it.each(["active", "inactive", null])("omits metadata for %s", async status => {
    fx.customer.mockResolvedValue(status ? { id: "cu1", status } : undefined);
    expect(await customerActivation("co1", async () => "cu1")).toBeUndefined();
    expect(fx.missing).not.toHaveBeenCalled();
  });
  it("cannot fail a committed win when owner or completeness loading fails", async () => {
    expect(await customerActivation("co1", async () => { throw new Error("read failed"); })).toBeUndefined();
    fx.customer.mockResolvedValue({ id: "cu1", status: "prospect" });
    fx.missing.mockRejectedValue(new Error("read failed"));
    expect(await customerActivation("co1", async () => "cu1")).toBeUndefined();
  });
});
