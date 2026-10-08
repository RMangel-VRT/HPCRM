import type { Ticket } from "@workspace/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { propagateInvoiceCompletion } from "./invoiceCompletion";

const makeInvoice = (id: string, currentStatusId = "pending", companyId = "company") =>
  ({ id, currentStatusId, companyId, ticketTypeId: "invoice-type" }) as Ticket;
let parent: Ticket;
let siblings: Ticket[];
let deps: Parameters<typeof propagateInvoiceCompletion>[3];
const invoice = makeInvoice("first");
const link = (id: string) => ({ linkType: "invoice_for", sourceTicketId: "parent", targetTicketId: id });

describe("Invoice final-status parent propagation", () => {
  beforeEach(() => {
    parent = { id: "parent", ticketTypeId: "task", currentStatusId: "rfb", companyId: "company", billingBehavior: "invoice_required" } as Ticket;
    siblings = [invoice];
    deps = {
      getTicketLinks: vi.fn().mockImplementation(async (id: string) => id === "parent" ? siblings.map(ticket => link(ticket.id)) : [link(id)]),
      getTicketById: vi.fn().mockResolvedValue(parent),
      getTicketTypeById: vi.fn().mockResolvedValue({ typeKey: "task", name: "Renamed work" }),
      getTicketTypeStatuses: vi.fn().mockImplementation(async () => [
        { id: "rfb", displayOrder: 1, name: "Renamed ready", statusKey: "ready_for_billing", isFinal: "false" },
        { id: parent.ticketTypeId === "task" ? "done" : "invoicing", displayOrder: 2, name: "Renamed final", isFinal: "true" },
      ]),
      getTicketFieldValues: vi.fn().mockResolvedValue([{ fieldId: "number", value: "INV-42" }]),
      getTicketTypeFields: vi.fn().mockResolvedValue([{ id: "number", fieldLabel: "Invoice Number" }]),
      createTicketComment: vi.fn().mockResolvedValue({}),
      getTicketsByIds: vi.fn().mockImplementation(async (ids: string[], companyId: string) =>
        siblings.filter(ticket => ids.includes(ticket.id) && ticket.companyId === companyId)),
      getTicketTypeStatusesByTypeIds: vi.fn().mockResolvedValue([
        { id: "pending", isFinal: "false", name: "Invoiced", statusKey: "pending_invoice" },
        { id: "final", isFinal: "true", name: "Editable paid", statusKey: "invoiced" },
      ]),
      updateTicket: vi.fn().mockResolvedValue({}),
      createTicketStatusHistory: vi.fn().mockResolvedValue({}),
      dismissDueDateNotificationsForTicket: vi.fn().mockResolvedValue(undefined),
    } as any;
  });
  it.each([["task", "done"], ["estimate_request", "invoicing"]])(
    "preserves the single-invoice %s → %s path after display-name changes", async (type, final) => {
      parent.ticketTypeId = type;
      await propagateInvoiceCompletion(invoice, "company", "actor", deps);
      expect(deps.createTicketComment).toHaveBeenCalledWith({
        ticketId: "parent", authorId: "actor", body: "[Invoice Completed] Invoice Number: INV-42",
      });
      expect(deps.updateTicket).toHaveBeenCalledWith("parent", "company", { currentStatusId: final, completedAt: expect.any(Date) });
      expect(deps.createTicketStatusHistory).toHaveBeenCalledWith({
        ticketId: "parent", toStatusId: final, changedById: "actor",
        notes: "Auto-advanced: linked Invoice ticket completed",
      });
      expect(deps.dismissDueDateNotificationsForTicket).toHaveBeenCalledWith("parent");
    },
  );
  it("keeps the comment but waits after the first invoice; advances after the last", async () => {
    siblings = [invoice, makeInvoice("second")];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await propagateInvoiceCompletion(invoice, "company", "actor", deps);
    expect(deps.createTicketComment).toHaveBeenCalledTimes(1);
    expect(deps.updateTicket).not.toHaveBeenCalled();
    expect(deps.createTicketStatusHistory).not.toHaveBeenCalled();
    expect(deps.dismissDueDateNotificationsForTicket).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("still open"));
    siblings[0] = makeInvoice("first", "final");
    await propagateInvoiceCompletion(siblings[1], "company", "actor", deps);
    expect(deps.createTicketComment).toHaveBeenCalledTimes(2);
    expect(deps.updateTicket).toHaveBeenCalledExactlyOnceWith("parent", "company", { currentStatusId: "done", completedAt: expect.any(Date) });
    expect(deps.getTicketsByIds).toHaveBeenCalledWith(["first", "second"], "company");
    expect(deps.getTicketTypeStatusesByTypeIds).toHaveBeenCalledWith(["invoice-type"]);
    log.mockRestore();
  });
  it("does not trust a foreign-company sibling or an unrelated link", async () => {
    siblings = [invoice, makeInvoice("foreign", "pending", "other")];
    await propagateInvoiceCompletion(invoice, "company", "actor", deps);
    expect(deps.updateTicket).toHaveBeenCalledOnce();
  });
  it("skips a foreign-company or absent parent", async () => {
    vi.mocked(deps.getTicketById).mockResolvedValue(undefined);
    await propagateInvoiceCompletion(invoice, "company", "actor", deps);
    expect(deps.getTicketById).toHaveBeenCalledWith("parent", "company");
    expect(deps.createTicketComment).not.toHaveBeenCalled();
    expect(deps.updateTicket).not.toHaveBeenCalled();
  });
  it("preserves standalone Invoice completion without touching a parent", async () => {
    vi.mocked(deps.getTicketLinks).mockResolvedValue([]);
    await propagateInvoiceCompletion(invoice, "company", "actor", deps);
    expect(deps.getTicketById).not.toHaveBeenCalled();
    expect(deps.updateTicket).not.toHaveBeenCalled();
  });
});
