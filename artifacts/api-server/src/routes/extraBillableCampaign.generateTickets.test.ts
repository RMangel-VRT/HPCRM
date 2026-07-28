// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerExtraBillableBillingRoutes, type BillingDeps } from "./extraBillableBilling";

type Item = {
  id: string;
  campaignId: string;
  customerId: string;
  customerName: string;
  status: string;
  billingStatus: string;
  ticketId: string | null;
  assignedCampaignCrewId: string | null;
  completionPhotoStorageKeys: string[];
  completedAt: Date | null;
  notes?: string;
  estimatedAmount?: string | null;
  customerCity?: string | null;
};

type Crew = { id: string; leaderUserId: string | null };

interface World {
  campaign: any;
  items: Item[];
  crews: Crew[];
  crewMembersByCrew: Map<string, { userId: string }[]>;
  customer: { id: string; name: string; city: string };
  user: { name: string };
  tickets: any[];
  ticketTypeStatuses: { id: string; name: string }[];
  ticketLinks: any[];
  companyUsers: any[];
  copyPhotoCalls: Array<{ srcKey: string; ticketId: string }>;
  copyPhotoBehavior: "ok" | "fail-all" | "fail-first";
  ensureReturns: { typeId: string; statuses: Map<string, string> } | null;
  ensureInvoiceReturns: { typeId: string; pendingStatusId: string } | null;
}

function makeWorld(over: Partial<World> = {}): World {
  return {
    campaign: { id: "camp-1", title: "Spring Cleanup", category: "extra_billable", windowStart: "2025-03-01", windowEnd: "2025-03-31" },
    items: [],
    crews: [{ id: "crew-1", leaderUserId: "user-leader" }],
    crewMembersByCrew: new Map([["crew-1", [{ userId: "user-member-2" }]]]),
    customer: { id: "cust-1", name: "Acme Co", city: "Denver" },
    user: { name: "Leader User" },
    tickets: [],
    ticketTypeStatuses: [
      { id: "st-ready", name: "Ready for Billing" },
      { id: "st-done", name: "Done" },
    ],
    ticketLinks: [],
    companyUsers: [{ userId: "billing-user-1", tags: ["billing"], status: "active" }],
    copyPhotoCalls: [],
    copyPhotoBehavior: "ok",
    ensureReturns: { typeId: "tt-1", statuses: new Map([["Ready for Billing", "st-ready"], ["Done", "st-done"]]) },
    ensureInvoiceReturns: { typeId: "tt-invoice", pendingStatusId: "st-pending-invoice" },
    ...over,
  };
}

function buildApp(world: World, role: "admin" | "office" | "field" = "admin", authed = true) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authed;
    (req as any).user = { id: "user-1", activeRole: role, activeCompanyId: "co-1" };
    next();
  });
  const deps: BillingDeps = {
    storage: {
      getCampaignById: vi.fn(async (id: string) => (id === world.campaign.id ? world.campaign : undefined)),
      getCampaignItems: vi.fn(async () => world.items),
      getCampaignItemById: vi.fn(async (id: string) => world.items.find(i => i.id === id)),
      getCampaignCrews: vi.fn(async () => world.crews),
      getCampaignCrewById: vi.fn(async (id: string) => world.crews.find(c => c.id === id) ? { id, leaderUserId: world.crews.find(c => c.id === id)!.leaderUserId, name: "Crew Alpha" } : undefined),
      getCampaignCrewMembers: vi.fn(async (crewId: string) => world.crewMembersByCrew.get(crewId) || []),
      getCustomerById: vi.fn(async () => world.customer),
      getUserById: vi.fn(async () => world.user),
      createTicket: vi.fn(async (insert: any) => {
        const t = { id: `tk-${world.tickets.length + 1}`, ...insert };
        world.tickets.push(t);
        return t;
      }),
      updateTicket: vi.fn(async (id: string, _co: string, updates: any) => {
        const t = world.tickets.find(x => x.id === id);
        if (t) Object.assign(t, updates);
        return t;
      }),
      updateCampaignItem: vi.fn(async (id: string, _co: string, updates: any) => {
        const it = world.items.find(x => x.id === id);
        if (it) Object.assign(it, updates);
        return it;
      }),
      getTicketsByIds: vi.fn(async (ids: string[]) => world.tickets.filter(t => ids.includes(t.id))),
      getTicketTypeStatuses: vi.fn(async () => world.ticketTypeStatuses),
      getCompanyUsersByCompanyId: vi.fn(async () => world.companyUsers),
      createTicketLink: vi.fn(async (link: any) => {
        const l = { id: `lnk-${world.ticketLinks.length + 1}`, ...link };
        world.ticketLinks.push(l);
        return l;
      }),
    },
    ensureExtraBillableTicketType: vi.fn(async () => world.ensureReturns),
    ensureInvoiceTicketType: vi.fn(async () => world.ensureInvoiceReturns),
    copyPhoto: vi.fn(async (srcKey: string, _co: string, ticketId: string) => {
      world.copyPhotoCalls.push({ srcKey, ticketId });
      if (world.copyPhotoBehavior === "fail-all") return { destKey: null, error: new Error("storage down") };
      if (world.copyPhotoBehavior === "fail-first" && world.copyPhotoCalls.length === 1) return { destKey: null, error: new Error("first fails") };
      return { destKey: `ticket-photos/co-1/${ticketId}/abc.jpg`, error: null };
    }),
    logger: { info: vi.fn(), error: vi.fn() },
  };
  registerExtraBillableBillingRoutes(app, deps);
  return { app, deps };
}

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: "i1",
    campaignId: "camp-1",
    customerId: "cust-1",
    customerName: "Acme Co",
    status: "completed",
    billingStatus: "not_created",
    ticketId: null,
    assignedCampaignCrewId: "crew-1",
    completionPhotoStorageKeys: ["/bucket/visit-photos/x/y.jpg", "/bucket/visit-photos/x/z.jpg"],
    completedAt: new Date("2025-03-15T12:00:00Z"),
    notes: "Cleared brush",
    estimatedAmount: "150.00",
    customerCity: "Denver",
    ...over,
  };
}

describe("POST /api/campaigns/:campaignId/items/:itemId/generate-ticket", () => {
  it("creates a ticket with required Extra Billable fields and updates the item", async () => {
    const world = makeWorld({ items: [makeItem()] });
    const { app, deps } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketId).toBe("tk-1");
    const created = (deps.storage.createTicket as any).mock.calls[0][0];
    expect(created.workType).toBe("extra_work");
    expect(created.billingBehavior).toBe("invoice_required");
    expect(created.currentStatusId).toBe("st-ready");
    expect(created.ticketTypeId).toBe("tt-1");
    expect(created.leadTechUserId).toBe("user-leader");
    expect(created.crewMemberUserIds).toEqual(expect.arrayContaining(["user-leader", "user-member-2"]));
    expect(world.items[0].billingStatus).toBe("ticket_created");
    expect(world.items[0].ticketId).toBe("tk-1");
    expect(world.copyPhotoCalls.length).toBe(2);
  });

  it("is idempotent: rejects already-billed item with 400", async () => {
    const world = makeWorld({ items: [makeItem({ billingStatus: "ticket_created", ticketId: "tk-old" })] });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("already_billed");
  });

  it("returns 403 for field role", async () => {
    const world = makeWorld({ items: [makeItem()] });
    const { app } = buildApp(world, "field" as any);
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const world = makeWorld({ items: [makeItem()] });
    const { app } = buildApp(world, "admin", false);
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(401);
  });

  it("returns 404 when campaign missing", async () => {
    const world = makeWorld({ items: [makeItem()] });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/missing/items/i1/generate-ticket").send({});
    expect(res.status).toBe(404);
  });

  it("returns 404 when item not on this campaign", async () => {
    const world = makeWorld({ items: [makeItem({ campaignId: "different-camp" })] });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(404);
  });

  it("returns 400 when campaign is not extra_billable", async () => {
    const world = makeWorld({ items: [makeItem()], campaign: { id: "camp-1", title: "x", category: "chemical", windowStart: "", windowEnd: "" } });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 ineligible reason crew_has_no_leader", async () => {
    const world = makeWorld({ items: [makeItem()], crews: [{ id: "crew-1", leaderUserId: null }] });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("crew_has_no_leader");
  });

  it("returns 500 when 'Ready for Billing' status is missing", async () => {
    const world = makeWorld({ items: [makeItem()], ensureReturns: { typeId: "tt-1", statuses: new Map() } });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(500);
  });

  it("counts photo copy failures but still creates ticket", async () => {
    const world = makeWorld({ items: [makeItem()], copyPhotoBehavior: "fail-all" });
    const { app, deps } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(200);
    expect(res.body.photoCopyFailures).toBe(2);
    expect((deps.storage.updateTicket as any).mock.calls.length).toBe(0);
  });

  it("auto-creates an Invoice ticket linked to the Extra Billable ticket", async () => {
    const world = makeWorld({ items: [makeItem()] });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(200);
    expect(world.tickets.length).toBe(2);
    const ebTicket = world.tickets[0];
    const invoiceTicket = world.tickets[1];
    expect(invoiceTicket.ticketTypeId).toBe("tt-invoice");
    expect(invoiceTicket.currentStatusId).toBe("st-pending-invoice");
    expect(invoiceTicket.workType).toBe("admin");
    expect(invoiceTicket.billingBehavior).toBe("internal");
    expect(invoiceTicket.title).toMatch(/^Invoice:/);
    expect(invoiceTicket.assignedToId).toBe("billing-user-1");
    expect(world.ticketLinks.length).toBe(1);
    expect(world.ticketLinks[0].sourceTicketId).toBe(ebTicket.id);
    expect(world.ticketLinks[0].targetTicketId).toBe(invoiceTicket.id);
    expect(world.ticketLinks[0].linkType).toBe("invoice_for");
  });

  it("still creates the Extra Billable ticket if invoice creation fails", async () => {
    const world = makeWorld({ items: [makeItem()], ensureInvoiceReturns: null });
    const { app } = buildApp(world, "admin");
    const res = await request(app).post("/api/campaigns/camp-1/items/i1/generate-ticket").send({});
    expect(res.status).toBe(200);
    expect(world.tickets.length).toBe(1);
    expect(world.ticketLinks.length).toBe(0);
  });
});

describe("POST /api/campaigns/:campaignId/generate-tickets (bulk)", () => {
  it("processes all eligible items, skipping ineligibles, without aborting on per-item failure", async () => {
    const world = makeWorld({
      items: [
        makeItem({ id: "i1" }),
        makeItem({ id: "i2", assignedCampaignCrewId: null }),
        makeItem({ id: "i3", billingStatus: "ticket_created", ticketId: "tk-old" }),
        makeItem({ id: "i4" }),
      ],
    });
    const { app } = buildApp(world, "office");
    const res = await request(app).post("/api/campaigns/camp-1/generate-tickets").send({});
    expect(res.status).toBe(200);
    expect(res.body.generated).toBe(2);
    expect(res.body.skipped).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(world.items[0].billingStatus).toBe("ticket_created");
    expect(world.items[3].billingStatus).toBe("ticket_created");
  });

  it("rejects subset request where item IDs are not on this campaign with 400 + missingItemIds", async () => {
    const world = makeWorld({ items: [makeItem({ id: "i1" })] });
    const { app } = buildApp(world, "admin");
    const res = await request(app)
      .post("/api/campaigns/camp-1/generate-tickets")
      .send({ itemIds: ["i1", "ghost-1", "ghost-2"] });
    expect(res.status).toBe(400);
    expect(res.body.missingItemIds).toEqual(["ghost-1", "ghost-2"]);
    expect(world.tickets.length).toBe(0);
  });

  it("rejects subset request when any requested item is ineligible with 400 + ineligibleItemIds", async () => {
    const world = makeWorld({
      items: [makeItem({ id: "i1" }), makeItem({ id: "i2", assignedCampaignCrewId: null })],
    });
    const { app } = buildApp(world, "admin");
    const res = await request(app)
      .post("/api/campaigns/camp-1/generate-tickets")
      .send({ itemIds: ["i1", "i2"] });
    expect(res.status).toBe(400);
    expect(res.body.ineligibleItemIds).toEqual(["i2"]);
    expect(world.tickets.length).toBe(0);
  });

  it("returns 403 for field role", async () => {
    const world = makeWorld({ items: [makeItem()] });
    const { app } = buildApp(world, "field" as any);
    const res = await request(app).post("/api/campaigns/camp-1/generate-tickets").send({});
    expect(res.status).toBe(403);
  });
});

describe("GET /api/campaigns/:campaignId/billing-summary", () => {
  it("returns counts, ineligibleItems, and billed tickets with current status name", async () => {
    const world = makeWorld({
      items: [
        makeItem({ id: "i1" }),
        makeItem({ id: "i2", status: "completed", assignedCampaignCrewId: null }),
        makeItem({ id: "i3", status: "skipped" }),
        makeItem({ id: "i4", billingStatus: "ticket_created", ticketId: "tk-existing" }),
      ],
      tickets: [{ id: "tk-existing", currentStatusId: "st-done" }],
    });
    const { app } = buildApp(world, "admin");
    const res = await request(app).get("/api/campaigns/camp-1/billing-summary");
    expect(res.status).toBe(200);
    expect(res.body.totalCompleted).toBe(3);
    expect(res.body.totalSkipped).toBe(1);
    expect(res.body.notYetCreated).toBe(1);
    expect(res.body.ticketsCreated).toBe(1);
    expect(res.body.ineligibleItems).toEqual([
      { itemId: "i2", customerName: "Acme Co", reason: "no_crew_assigned" },
    ]);
    expect(res.body.billedTickets).toEqual([
      { itemId: "i4", customerName: "Acme Co", ticketId: "tk-existing", currentStatusId: "st-done", currentStatusName: "Done" },
    ]);
  });

  it("returns 403 for field role", async () => {
    const world = makeWorld();
    const { app } = buildApp(world, "field" as any);
    const res = await request(app).get("/api/campaigns/camp-1/billing-summary");
    expect(res.status).toBe(403);
  });
});
