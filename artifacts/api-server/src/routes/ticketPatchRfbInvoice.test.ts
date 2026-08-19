// @vitest-environment node
/**
 * Unit tests for maybeAutoCreateInvoiceOnRfb — the direction-independent
 * "Ready for Billing" invoice auto-creation helper used in PATCH /api/tickets/:id.
 *
 * Covers:
 *  - Step-back (Done → RFB) creates an Invoice ticket for an EB ticket
 *  - Forward move to RFB also creates an Invoice ticket for an EB ticket
 *  - EB ticket without invoice_required billingBehavior still gets an invoice
 *  - Idempotency: existing invoice_for link prevents duplicate creation
 *  - Regression guard: stepping back PAST RFB (to Work Completed) does NOT
 *    trigger invoice creation (newStatusName is not "Ready for Billing")
 *  - Invoice-type tickets are never eligible (isInvoiceType guard)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  maybeAutoCreateInvoiceOnRfb,
  isInvoiceEligibleType,
  type RfbStorageDeps,
  type MaybeAutoCreateInvoiceParams,
} from "../lib/rfbInvoiceAutoCreate";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const EB_TYPE     = { id: "tt-eb",      name: "Extra Billable" };
const PROJECT_TYPE = { id: "tt-proj",   name: "Project" };
const ER_TYPE     = { id: "tt-er",      name: "Estimate Request" };
const INVOICE_TYPE = { id: "tt-inv",    name: "Invoice" };
const TODO_TYPE   = { id: "tt-todo",    name: "To-Do" };

const INVOICE_TYPE_INFO = { typeId: "tt-inv", pendingStatusId: "st-pending" };

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    companyId: "co-1",
    title: "EB Job #42",
    description: "Some work",
    ticketTypeId: "tt-eb",
    billingBehavior: null as string | null,
    customerId: null,
    contractId: null,
    ...overrides,
  };
}

function makeStorage(overrides: Partial<RfbStorageDeps> = {}): RfbStorageDeps & {
  createTicket: ReturnType<typeof vi.fn>;
  createTicketLink: ReturnType<typeof vi.fn>;
  createTicketComment: ReturnType<typeof vi.fn>;
} {
  return {
    getTicketTypeById: vi.fn().mockResolvedValue(EB_TYPE),
    getTicketLinks: vi.fn().mockResolvedValue([]),
    getCompanyUsersByCompanyId: vi.fn().mockResolvedValue([
      { userId: "billing-user", tags: ["billing"], status: "active" },
    ]),
    createTicket: vi.fn().mockResolvedValue({ id: "inv-ticket-1", title: "Invoice: EB Job #42" }),
    createTicketLink: vi.fn().mockResolvedValue({ id: "link-1" }),
    getTicketComments: vi.fn().mockResolvedValue([]),
    createTicketComment: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as any;
}

function makeParams(
  overrides: Partial<MaybeAutoCreateInvoiceParams> = {},
  storageOverrides: Partial<RfbStorageDeps> = {}
): MaybeAutoCreateInvoiceParams & { storage: ReturnType<typeof makeStorage> } {
  const storage = makeStorage(storageOverrides);
  const base: MaybeAutoCreateInvoiceParams = {
    ticket: makeTicket(),
    newStatusName: "Ready for Billing",
    pendingBillingBehavior: null,
    actingUserId: "user-1",
    storage,
    ensureInvoiceTicketType: vi.fn().mockResolvedValue(INVOICE_TYPE_INFO),
  };
  return {
    ...base,
    ...overrides,
    storage: overrides.storage ?? storage,
  } as any;
}

// ── Unit tests: isInvoiceEligibleType ─────────────────────────────────────────

describe("isInvoiceEligibleType", () => {
  it("returns true for Project", () => {
    expect(isInvoiceEligibleType("Project")).toBe(true);
  });
  it("returns true for Estimate Request", () => {
    expect(isInvoiceEligibleType("Estimate Request")).toBe(true);
  });
  it("returns true for Extra Billable", () => {
    expect(isInvoiceEligibleType("Extra Billable")).toBe(true);
  });
  it("returns false for Invoice", () => {
    expect(isInvoiceEligibleType("Invoice")).toBe(false);
  });
  it("returns false for To-Do", () => {
    expect(isInvoiceEligibleType("To-Do")).toBe(false);
  });
  it("returns false for undefined", () => {
    expect(isInvoiceEligibleType(undefined)).toBe(false);
  });
});

// ── Integration tests: maybeAutoCreateInvoiceOnRfb ────────────────────────────

describe("maybeAutoCreateInvoiceOnRfb", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Core EB creation ────────────────────────────────────────────────────────

  it("step-back (Done → RFB): creates Invoice ticket for EB ticket with no existing invoice", async () => {
    const params = makeParams();
    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("inv-ticket-1");

    expect(params.storage.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketTypeId: "tt-inv",
        billingBehavior: "internal",
        title: "Invoice: EB Job #42",
        assignedToId: "billing-user",
        createdById: "user-1",
      })
    );
    expect(params.storage.createTicketLink).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTicketId: "ticket-1",
        targetTicketId: "inv-ticket-1",
        linkType: "invoice_for",
      })
    );
  });

  it("forward move to RFB: creates Invoice ticket for EB ticket even without billingBehavior set", async () => {
    // Ticket currently at Work Completed → forward to RFB (no billingBehavior)
    const params = makeParams({
      ticket: makeTicket({ billingBehavior: null }),
    });
    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });

  it("creates Invoice ticket when billingBehavior is already invoice_required (explicit flag gate)", async () => {
    const params = makeParams({
      ticket: makeTicket({ ticketTypeId: "tt-todo", billingBehavior: "invoice_required" }),
    });
    (params.storage.getTicketTypeById as any).mockResolvedValue(TODO_TYPE);

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });

  it("creates Invoice ticket when pendingBillingBehavior (req.body) is invoice_required", async () => {
    const params = makeParams({
      ticket: makeTicket({ ticketTypeId: "tt-todo", billingBehavior: null }),
      pendingBillingBehavior: "invoice_required",
    });
    (params.storage.getTicketTypeById as any).mockResolvedValue(TODO_TYPE);

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it("idempotency: returns null and skips creation when invoice_for link already exists", async () => {
    const params = makeParams({}, {
      getTicketLinks: vi.fn().mockResolvedValue([
        { id: "link-old", linkType: "invoice_for", sourceTicketId: "ticket-1", targetTicketId: "inv-old" },
      ]),
    });

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).toBeNull();
    expect(params.storage.createTicket).not.toHaveBeenCalled();
    expect(params.storage.createTicketLink).not.toHaveBeenCalled();
  });

  it("idempotency: a different-direction link (targetTicketId is ticket) does NOT block creation", async () => {
    // An invoice_for link where ticket-1 is the TARGET (not source) should not block
    const params = makeParams({}, {
      getTicketLinks: vi.fn().mockResolvedValue([
        { id: "link-other", linkType: "invoice_for", sourceTicketId: "other-ticket", targetTicketId: "ticket-1" },
      ]),
    });

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });

  // ── Regression: stepping back PAST RFB ─────────────────────────────────────

  it("regression: stepping back to Work Completed (not RFB) does NOT create an invoice", async () => {
    const params = makeParams({ newStatusName: "Work Completed" });

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).toBeNull();
    expect(params.storage.createTicket).not.toHaveBeenCalled();
  });

  it("regression: stepping back to Pending (not RFB) does NOT create an invoice", async () => {
    const params = makeParams({ newStatusName: "Pending" });

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).toBeNull();
    expect(params.storage.createTicket).not.toHaveBeenCalled();
  });

  // ── Invoice-type guard ──────────────────────────────────────────────────────

  it("never creates a second Invoice ticket for an Invoice ticket itself", async () => {
    const params = makeParams({
      ticket: makeTicket({ ticketTypeId: "tt-inv" }),
    });
    (params.storage.getTicketTypeById as any).mockResolvedValue(INVOICE_TYPE);

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).toBeNull();
    expect(params.storage.createTicket).not.toHaveBeenCalled();
  });

  // ── Eligible ticket types ───────────────────────────────────────────────────

  it("creates invoice for Project type (regression: existing behavior preserved)", async () => {
    const params = makeParams({
      ticket: makeTicket({ ticketTypeId: "tt-proj" }),
    });
    (params.storage.getTicketTypeById as any).mockResolvedValue(PROJECT_TYPE);

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });

  it("creates invoice for Estimate Request type (regression: existing behavior preserved)", async () => {
    const params = makeParams({
      ticket: makeTicket({ ticketTypeId: "tt-er" }),
    });
    (params.storage.getTicketTypeById as any).mockResolvedValue(ER_TYPE);

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });

  // ── ensureInvoiceTicketType failure ─────────────────────────────────────────

  it("returns null gracefully when ensureInvoiceTicketType returns null", async () => {
    const params = makeParams({
      ensureInvoiceTicketType: vi.fn().mockResolvedValue(null),
    });

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).toBeNull();
    expect(params.storage.createTicket).not.toHaveBeenCalled();
  });

  it("returns null gracefully when ensureInvoiceTicketType throws", async () => {
    const params = makeParams({
      ensureInvoiceTicketType: vi.fn().mockRejectedValue(new Error("DB down")),
    });

    // Should not propagate the error
    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).toBeNull();
    expect(params.storage.createTicket).not.toHaveBeenCalled();
  });

  // ── Comment copying ─────────────────────────────────────────────────────────

  it("copies source ticket comments to the new Invoice ticket", async () => {
    const params = makeParams({}, {
      getTicketComments: vi.fn().mockResolvedValue([
        { authorId: "user-a", body: "First comment" },
        { authorId: "user-b", body: "Second comment" },
      ]),
    });

    await maybeAutoCreateInvoiceOnRfb(params);

    expect(params.storage.createTicketComment).toHaveBeenCalledTimes(2);
    expect(params.storage.createTicketComment).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "inv-ticket-1", authorId: "user-a", body: "First comment" })
    );
    expect(params.storage.createTicketComment).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "inv-ticket-1", authorId: "user-b", body: "Second comment" })
    );
  });

  it("assigns to unassigned when no billing-tagged user exists", async () => {
    const params = makeParams({}, {
      getCompanyUsersByCompanyId: vi.fn().mockResolvedValue([
        { userId: "admin-user", tags: ["admin"], status: "active" },
      ]),
    });

    await maybeAutoCreateInvoiceOnRfb(params);

    expect(params.storage.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ assignedToId: null })
    );
  });

  // ── newStatusKey: stable key routing ───────────────────────────────────────

  it("creates invoice when newStatusKey is 'ready_for_billing' even if newStatusName was renamed", async () => {
    // This is the core bug this slice fixes: a renamed status no longer matches
    // the hard-coded display name, but the stable key still routes correctly.
    const params = makeParams({
      newStatusKey: "ready_for_billing",
      newStatusName: "Renamed By User",
    });

    const result = await maybeAutoCreateInvoiceOnRfb(params);

    expect(result).not.toBeNull();
    expect(params.storage.createTicket).toHaveBeenCalledOnce();
  });
});

// ── Unit tests: isInvoiceEligibleType (object overload) ───────────────────────

describe("isInvoiceEligibleType (object overload)", () => {
  it("returns true when requiresInvoicing='true', regardless of name", () => {
    expect(isInvoiceEligibleType({ id: "tt-x", name: "Anything Renamed", requiresInvoicing: "true" })).toBe(true);
  });

  it("returns false when requiresInvoicing='false', even if name matches eligible type", () => {
    expect(isInvoiceEligibleType({ id: "tt-eb", name: "Extra Billable", requiresInvoicing: "false" })).toBe(false);
  });

  it("falls back to name check when requiresInvoicing is absent on the object", () => {
    expect(isInvoiceEligibleType({ id: "tt-proj", name: "Project" })).toBe(true);
    expect(isInvoiceEligibleType({ id: "tt-todo", name: "To-Do" })).toBe(false);
  });
});
