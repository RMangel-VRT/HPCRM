// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createBody, defaultDates, initialScope, newDraft, prefillRfp, sessionKey, saveDraft, loadDraft } from "./newContractDraft";
import { insertAgreementTermSchema } from "@/shared/schema";

function rfp(service: string, start = "2027-04-01") {
  return { ticket: { id: "rfp", title: "Bid request", estimateNumber: "R-20", customerId: "customer" },
    customer: { id: "customer", name: "Prospect" },
    statuses: [{ fields: [{ id: "line", fieldKey: "service_request_type" }, { id: "start", fieldKey: "desired_start_date" },
      { id: "due", fieldKey: "proposal_due_date" }] }],
    fieldValues: [{ fieldId: "line", value: service }, { fieldId: "start", value: start }, { fieldId: "due", value: "2099-12-31" }] };
}
describe("RFP contract prefill and draft isolation", () => {
  it.each([["Maintenance only", "landscape"], ["Snow Removal Only", "snow"], ["Maintenance & Snow Removal", "both"], ["Custom", ""]])("maps %s by stable field key", (service, line) => {
    const d = prefillRfp(newDraft("2026-10-27"), rfp(service), "2026-10-27");
    expect(d.line).toBe(line); expect(d.customerId).toBe("customer");
    expect(d.startDate).toBe("2027-04-01");
    expect(d.endDate).toBe(defaultDates(line, "2026-10-27").endDate);
    expect(d.endDate).not.toBe("2099-12-31");
    expect(d.scope).toEqual(line ? initialScope(line as "landscape" | "snow" | "both") : null);
    expect(d.notes).toBe("Bid for RFP R-20: Bid request");
    expect(createBody(d).bidTicketId).toBe("rfp");
  });
  it.each(["", "2026-02-30", "not-a-date"])("keeps ordinary date defaults for invalid desired date %s", start => {
    const d = prefillRfp(newDraft("2026-10-27"), rfp("Maintenance only", start), "2026-10-27");
    expect(d.startDate).toBe(defaultDates("landscape", "2026-10-27").startDate);
  });
  it("separates company/user/RFP drafts, keeping the ordinary key/body unchanged", () => {
    const keys = [sessionKey("c1", "u1"), sessionKey("c1", "u1", "r1"), sessionKey("c1", "u1", "r2"),
      sessionKey("c2", "u1", "r1"), sessionKey("c1", "u2", "r1")];
    expect(new Set(keys).size).toBe(5); expect(keys[0]).toBe("contract-center:new-contract:c1:u1");
    keys.forEach((key, i) => saveDraft(key, { ...newDraft("2026-10-27"), notes: String(i) }));
    keys.forEach((key, i) => expect(loadDraft(key)?.notes).toBe(String(i)));
    expect(createBody(newDraft("2026-10-27"))).not.toHaveProperty("bidTicketId");
  });
  it("explicit client insert validation retains the relationship", () => {
    const parsed = insertAgreementTermSchema.parse({ companyId: "c", agreementId: "a", bidTicketId: "r",
      seasonLabel: "2027", startDate: "2027-01-01", endDate: "2027-12-31", line: "both", billingType: "equal_monthly" });
    expect(parsed.bidTicketId).toBe("r");
  });
});
