import { describe, expect, it } from "vitest";
import { getTicketTypeForWorkType, WORK_TYPE_CATALOG } from "./workTypeCatalog";

describe("Task work type catalog", () => {
  it("maps contract and billable work to Task while keeping separate billing behaviors and labels", () => {
    expect(getTicketTypeForWorkType("contract")).toBe("Task");
    expect(getTicketTypeForWorkType("extra_work")).toBe("Task");
    expect(WORK_TYPE_CATALOG.contract).toMatchObject({
      name: "Contract", billingBehavior: "no_invoice", billingLabel: "Included in Contract",
    });
    expect(WORK_TYPE_CATALOG.extra_work).toMatchObject({
      name: "Billable", billingBehavior: "invoice_required", billingLabel: "Extra Billable",
    });
  });
});