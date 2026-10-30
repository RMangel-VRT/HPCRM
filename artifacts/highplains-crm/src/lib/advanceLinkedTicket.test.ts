import { describe, expect, it, vi } from "vitest";
import { advanceLinkedTicket, linkedTicketEvent, planLinkedTicket, lossChip, type LinkedTicketState } from "./advanceLinkedTicket";
import type { EstimateDetailDto } from "@shared/schema";

const statuses = ["new", "proposal_sent", "decision_received", "ready_to_schedule", "scheduled", "closed_lost"]
  .map((statusKey, displayOrder) => ({ id: statusKey, statusKey, displayOrder, name: `Renamed ${statusKey}`, isFinal: statusKey === "closed_lost" ? "true" : "false" }));
function estimate(kind = "accept"): EstimateDetailDto {
  return { id: "estimate", ticketId: "ticket", voidedAt: null, versions: [{
    id: "v1", versionNumber: 1, status: kind === "accept" ? "accepted" : kind === "decline" ? "declined" : "sent",
    sentAt: "2026-10-31T01:00:00Z", sentMethod: "portal",
    acceptedAt: kind === "accept" ? "2026-10-31T02:00:00Z" : null, acceptedOn: "2026-10-28", poNumber: "PO-42",
    declinedAt: kind === "decline" ? "2026-10-31T03:00:00Z" : null, declineReason: "Precio",
  }] } as EstimateDetailDto;
}
function state(status = "proposal_sent"): LinkedTicketState {
  return { ticket: { id: "ticket", companyId: "company", ticketTypeId: "type", currentStatusId: status },
    statuses, fields: ["decision_outcome", "decision_date", "po_number", "proposal_sent_date", "proposal_delivery_method", "denial_reason", "loss_reason", "loss_notes"]
      .map(fieldKey => ({ id: fieldKey, fieldKey, fieldType: fieldKey === "decision_outcome" || fieldKey === "loss_reason" || fieldKey === "proposal_delivery_method" ? "select" : "text",
        options: ["Approved", "Denied", "Price", "Email", "Hard Copy", "Other"] })), values: [] };
}
function transport(e: EstimateDetailDto, s: LinkedTicketState, failPut = false) {
  let fail = failPut;
  return vi.fn(async (method: string, url: string, body?: unknown) => {
    if (method === "PATCH") { s.ticket.currentStatusId = (body as any).currentStatusId; return s.ticket; }
    if (method === "PUT") {
      if (fail) { fail = false; throw new Error("field failed"); }
      s.values.push({ fieldId: url.split("/").at(-1)!, value: (body as any).value }); return {};
    }
    if (url.startsWith("/api/estimates/")) return e;
    if (url.endsWith("/statuses")) return s.statuses;
    if (url.endsWith("/fields")) return s.fields;
    if (url.endsWith("/field-values")) return s.values;
    return { ...s.ticket };
  });
}
describe("estimate ticket orchestration", () => {
  it("uses real key identity, PATCH before all field PUTs and only { currentStatusId }", async () => {
    const e = estimate(), s = state(), request = transport(e, s);
    expect(await advanceLinkedTicket(e, request)).toEqual({ moved: true, reason: null, ticketNumber: "ticket", statusName: "Renamed ready_to_schedule" });
    const writes = request.mock.calls.filter(([method]) => method !== "GET");
    expect(writes[0]).toEqual(["PATCH", "/api/tickets/ticket", { currentStatusId: "ready_to_schedule" }]);
    expect(writes.slice(1).map(([m]) => m)).toEqual(["PUT", "PUT", "PUT"]);
    expect(s.values).toContainEqual({ fieldId: "decision_date", value: "2026-10-28" });
    expect(s.values).toContainEqual({ fieldId: "po_number", value: "PO-42" });
  });
  it.each(["scheduled", "closed_lost"])("silently skips at/past or final %s without writes", async status => {
    const e = estimate(), request = transport(e, state(status));
    expect((await advanceLinkedTicket(e, request)).reason).toBeNull();
    expect(request.mock.calls.every(([m]) => m === "GET")).toBe(true);
  });
  it("missing target in a custom workflow produces a notice, missing current never guesses", () => {
    const s = state(); s.statuses = s.statuses.filter(s => s.statusKey !== "ready_to_schedule");
    expect(planLinkedTicket(estimate(), s).reason).toBe("missingTarget");
    s.ticket.currentStatusId = "unknown";
    expect(planLinkedTicket(estimate(), s).reason).toBe("missingCurrent");
  });
  it.each([["email", "Email"], ["hard_copy", "Hard Copy"], ["portal", "Other"], ["other", "Other"]])("maps %s and Colorado send day", (method, label) => {
    const e = estimate("send"); e.versions[0].sentMethod = method as any;
    const plan = planLinkedTicket(e, state("new"));
    expect(plan.writes).toContainEqual({ fieldId: "proposal_delivery_method", value: label });
    expect(plan.writes).toContainEqual({ fieldId: "proposal_sent_date", value: "2026-10-30" });
  });
  it("skips absent fields/options instead of inventing values", () => {
    const s = state(); s.fields = s.fields.filter(f => f.fieldKey !== "po_number");
    s.fields.find(f => f.fieldKey === "decision_outcome")!.options = ["Custom"];
    expect(planLinkedTicket(estimate(), s).writes).toEqual([{ fieldId: "decision_date", value: "2026-10-28" }]);
  });
  it("maps persisted English/Spanish loss chips and preserves free text", () => {
    expect(lossChip("Ya no lo necesita")).toBe("No longer needed");
    expect(lossChip("unstructured reason")).toBeUndefined();
    const plan = planLinkedTicket(estimate("decline"), state());
    expect(plan.writes).toContainEqual({ fieldId: "loss_reason", value: "Price" });
    expect(plan.writes).toContainEqual({ fieldId: "loss_notes", value: "Precio" });
    expect(plan.writes).toContainEqual({ fieldId: "denial_reason", value: "Precio" });
  });
  it("retains partial recovery across reload and repairs only fields, never repeats PATCH", async () => {
    const e = estimate(), saved = JSON.stringify(e), s = state(), request = transport(e, s, true);
    expect((await advanceLinkedTicket(e, request)).reason).toBe("loadFailed");
    expect(s.ticket.currentStatusId).toBe("ready_to_schedule");
    const reloadedEstimate = JSON.parse(JSON.stringify(e));
    const reloadedTicket = JSON.parse(JSON.stringify(s));
    expect(planLinkedTicket(reloadedEstimate, reloadedTicket).reason).toBe("fieldsIncomplete");
    const retry = transport(reloadedEstimate, reloadedTicket);
    expect((await advanceLinkedTicket(reloadedEstimate, retry)).reason).toBeNull();
    expect(retry.mock.calls.some(([m]) => m === "PATCH")).toBe(false);
    expect(planLinkedTicket(reloadedEstimate, reloadedTicket).reason).toBeNull();
    expect(JSON.stringify(e)).toBe(saved);
  });
  it("repairs decline fields at its final target, without a status write", async () => {
    const e = estimate("decline"), s = state("closed_lost"), request = transport(e, s);
    expect(planLinkedTicket(e, s).reason).toBe("fieldsIncomplete");
    await advanceLinkedTicket(e, request);
    expect(request.mock.calls.some(([m]) => m === "PATCH")).toBe(false);
    expect(s.values).toContainEqual({ fieldId: "decision_outcome", value: "Denied" });
  });
  it("keeps the estimate committed on PATCH failure, and refreshes before retry", async () => {
    const e = estimate(), s = state(), request = transport(e, s), saved = JSON.stringify(e);
    request.mockImplementationOnce(async () => e).mockImplementationOnce(async () => { throw new Error("down"); });
    expect((await advanceLinkedTicket(e, request)).reason).toBe("loadFailed");
    expect(planLinkedTicket(e, s).reason).toBe("behind");
    expect((await advanceLinkedTicket(e, request)).moved).toBe(true);
    expect(JSON.stringify(e)).toBe(saved);
  });
  it("uses authoritative events, older acceptance beside a draft, latest send/decision and void/unlinked gates", async () => {
    const e = estimate();
    e.versions.unshift({ id: "v2", versionNumber: 2, status: "draft", createdAt: "", updatedAt: "" });
    expect(linkedTicketEvent(e)?.kind).toBe("accept");
    e.versions[0].sentAt = "2026-11-01T00:00:00Z"; e.versions[0].status = "sent";
    expect(linkedTicketEvent(e)?.kind).toBe("send");
    const request = transport({ ...e, voidedAt: "now" }, state());
    expect((await advanceLinkedTicket(e, request)).moved).toBe(false);
    for (const changed of [{ ...e, voidedAt: "now" }, { ...e, ticketId: null }]) {
      request.mockClear(); await advanceLinkedTicket(changed, request); expect(request).not.toHaveBeenCalled();
    }
  });
  it("does not write decision fields after a concurrent manual step-back", async () => {
    const e = estimate(), s = state(), request = transport(e, s);
    const impl = request.getMockImplementation()!;
    request.mockImplementation(async (method, url, body) => {
      const result = await impl(method, url, body);
      if (method === "PATCH") s.ticket.currentStatusId = "decision_received";
      return result;
    });
    expect((await advanceLinkedTicket(e, request)).reason).toBe("changed");
    expect(request.mock.calls.some(([m]) => m === "PUT")).toBe(false);
  });
});
