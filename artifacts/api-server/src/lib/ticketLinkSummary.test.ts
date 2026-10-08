import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), where: vi.fn(), getTicketsByIds: vi.fn(),
  getAllTicketTypeStatuses: vi.fn(), getTicketTypes: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("../storage", () => ({ storage: mocks }));
import { getInvoiceLinkSummaries, withInvoiceLinkSummaries } from "./ticketLinkSummary";

const companyId = "company";
const link = (sourceTicketId: string, targetTicketId: string) => ({
  sourceTicketId, targetTicketId, linkType: "invoice_for",
});
const ticket = (id: string, ticketTypeId = "invoice", currentStatusId = "pending", company = companyId) => ({
  id, title: `Title ${id}`, ticketTypeId, currentStatusId, companyId: company,
});
const dialect = new PgDialect();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.where.mockResolvedValue([]);
  mocks.getTicketsByIds.mockResolvedValue([]);
  mocks.getTicketTypes.mockResolvedValue([
    { id: "invoice", name: "Renamed billing type", typeKey: "invoice" },
    { id: "task", name: "Renamed work type", typeKey: "task" },
  ]);
  mocks.getAllTicketTypeStatuses.mockResolvedValue([
    { id: "pending", name: "Renamed pending", statusKey: "pending_invoice", isFinal: "false" },
    { id: "invoiced", name: "Renamed finished", statusKey: "invoiced", isFinal: "true" },
  ]);
});

describe("bulk invoice link summaries", () => {
  it("summarizes one invoice and its parent in both directions with stable keys", async () => {
    mocks.where.mockResolvedValue([link("job", "bill")]);
    mocks.getTicketsByIds.mockResolvedValue([ticket("job", "task"), ticket("bill")]);
    const summaries = await getInvoiceLinkSummaries(companyId, ["job", "bill", "unlinked"]);
    expect(summaries.get("job")).toEqual({
      invoices: [{ id: "bill", title: "Title bill", statusKey: "pending_invoice", statusName: "Renamed pending", isFinal: false }],
      parent: null,
    });
    expect(summaries.get("bill")).toEqual({
      invoices: [], parent: { id: "job", title: "Title job", typeKey: "task", typeName: "Renamed work type" },
    });
    expect(summaries.get("unlinked")).toEqual({ invoices: [], parent: null });
    expect(mocks.getTicketsByIds).toHaveBeenCalledWith(["bill", "job"], companyId);
    const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain('"ticket_links"."link_type" =');
    expect(query.sql).toContain('"ticket_links"."source_ticket_id" in');
    expect(query.sql).toContain('"ticket_links"."target_ticket_id" in');
    expect(query.sql).toContain(" or ");
    expect(query.params).toContain("invoice_for");
  });

  it("keeps two invoices including final status and deduplicates counterpart fetches", async () => {
    mocks.where.mockResolvedValue([link("job", "bill1"), link("job", "bill2"), link("job", "bill1")]);
    mocks.getTicketsByIds.mockResolvedValue([ticket("bill1"), ticket("bill2", "invoice", "invoiced")]);
    const summaries = await getInvoiceLinkSummaries(companyId, ["job"]);
    expect(summaries.get("job")!.invoices).toHaveLength(2);
    expect(summaries.get("job")!.invoices.map(i => [i.statusKey, i.isFinal])).toEqual([
      ["pending_invoice", false], ["invoiced", true],
    ]);
    expect(mocks.getTicketsByIds).toHaveBeenCalledWith(["bill1", "bill2"], companyId);
  });

  it("leaves standalone invoices unchanged with an empty summary", async () => {
    const rows = await withInvoiceLinkSummaries(companyId, [{ id: "standalone", title: "Original", assignedToId: "user" }]);
    expect(rows).toEqual([{ id: "standalone", title: "Original", assignedToId: "user", linkSummary: { invoices: [], parent: null } }]);
  });

  it("skips a parent outside the active company even if a storage adapter returns it", async () => {
    mocks.where.mockResolvedValue([link("foreign", "bill")]);
    mocks.getTicketsByIds.mockResolvedValue([ticket("foreign", "task", "pending", "other-company")]);
    expect((await getInvoiceLinkSummaries(companyId, ["bill"])).get("bill")!.parent).toBeNull();
    expect(mocks.getTicketsByIds).toHaveBeenCalledWith(["foreign"], companyId);
  });

  it("skips foreign invoices and deleted counterparts in either direction", async () => {
    mocks.where.mockResolvedValue([link("job", "deleted"), link("deleted-parent", "bill"), link("job", "foreign")]);
    mocks.getTicketsByIds.mockResolvedValue([ticket("foreign", "invoice", "pending", "other-company")]);
    const summaries = await getInvoiceLinkSummaries(companyId, ["job", "bill"]);
    expect(summaries.get("job")).toEqual({ invoices: [], parent: null });
    expect(summaries.get("bill")).toEqual({ invoices: [], parent: null });
  });

  it("does not mistake a custom keyed type named Invoice for a seeded invoice", async () => {
    mocks.where.mockResolvedValue([link("job", "custom")]);
    mocks.getTicketsByIds.mockResolvedValue([ticket("custom", "custom-type")]);
    mocks.getTicketTypes.mockResolvedValue([{ id: "custom-type", name: "Invoice", typeKey: "todo" }]);
    expect((await getInvoiceLinkSummaries(companyId, ["job"])).get("job")!.invoices).toEqual([]);
  });

  it("handles missing status/type metadata without dropping safe links", async () => {
    mocks.where.mockResolvedValue([link("job", "bill")]);
    mocks.getTicketsByIds.mockResolvedValue([ticket("job", "missing-type"), ticket("bill", "invoice", "missing-status")]);
    const summaries = await getInvoiceLinkSummaries(companyId, ["job", "bill"]);
    expect(summaries.get("job")!.invoices[0]).toMatchObject({ statusKey: null, statusName: "Unknown", isFinal: false });
    expect(summaries.get("bill")!.parent).toMatchObject({ typeKey: null, typeName: "Unknown" });
  });

  it("returns an empty map without any reads for empty input", async () => {
    expect(await getInvoiceLinkSummaries(companyId, [])).toEqual(new Map());
    for (const fn of Object.values(mocks)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([1, 2, 500])("uses the same four bulk-operation budget for %i linked rows", async count => {
    const ids = Array.from({ length: count }, (_, i) => `job${i}`);
    mocks.where.mockResolvedValue(ids.map(id => link(id, `bill-${id}`)));
    mocks.getTicketsByIds.mockResolvedValue(ids.map(id => ticket(`bill-${id}`)));
    expect((await getInvoiceLinkSummaries(companyId, ids)).size).toBe(count);
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.getTicketsByIds).toHaveBeenCalledOnce();
    expect(mocks.getAllTicketTypeStatuses).toHaveBeenCalledExactlyOnceWith(companyId);
    expect(mocks.getTicketTypes).toHaveBeenCalledExactlyOnceWith(companyId);
  });
});
