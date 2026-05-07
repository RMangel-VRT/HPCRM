// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { canAccessExtraBillableCampaignItem, filterExtraBillableCampaignItems, userCrewIdSetFromCrews, validateBulkAssignCrew } from "./extraBillableAccess";

const baseCrew = {
  id: "crew-1",
  campaignId: "campaign-1",
  companyId: "company-1",
  name: "Crew Alpha",
  color: "#2563eb",
  displayOrder: 0,
  leaderUserId: "leader-user",
  createdAt: new Date(),
  updatedAt: new Date(),
  members: [],
};

function makeStorage(overrides: Partial<{
  crew: typeof baseCrew | null;
  members: { campaignCrewId: string; userId: string; addedAt: Date }[];
}> = {}) {
  return {
    getCampaignCrewById: vi.fn().mockResolvedValue(overrides.crew === undefined ? baseCrew : overrides.crew),
    getCampaignCrewMembers: vi.fn().mockResolvedValue(overrides.members ?? []),
  };
}

describe("canAccessExtraBillableCampaignItem", () => {
  it("admin always allowed", async () => {
    const storage = makeStorage();
    const result = await canAccessExtraBillableCampaignItem(
      storage as never,
      { id: "u1", activeRole: "admin", activeCompanyId: "company-1" },
      { assignedCampaignCrewId: "crew-1" },
      "write",
    );
    expect(result).toBe(true);
  });

  it("non-leader field user is denied write access (403 condition)", async () => {
    const storage = makeStorage({
      members: [{ campaignCrewId: "crew-1", userId: "member-user", addedAt: new Date() }],
    });
    const result = await canAccessExtraBillableCampaignItem(
      storage as never,
      { id: "member-user", activeRole: "field", activeCompanyId: "company-1" },
      { assignedCampaignCrewId: "crew-1" },
      "write",
    );
    expect(result).toBe(false);
  });

  it("crew leader is allowed write access", async () => {
    const storage = makeStorage();
    const result = await canAccessExtraBillableCampaignItem(
      storage as never,
      { id: "leader-user", activeRole: "field", activeCompanyId: "company-1" },
      { assignedCampaignCrewId: "crew-1" },
      "write",
    );
    expect(result).toBe(true);
  });

  it("crew member is allowed read access", async () => {
    const storage = makeStorage({
      members: [{ campaignCrewId: "crew-1", userId: "member-user", addedAt: new Date() }],
    });
    const result = await canAccessExtraBillableCampaignItem(
      storage as never,
      { id: "member-user", activeRole: "field", activeCompanyId: "company-1" },
      { assignedCampaignCrewId: "crew-1" },
      "read",
    );
    expect(result).toBe(true);
  });

  it("unassigned item denies non-admin", async () => {
    const storage = makeStorage();
    const result = await canAccessExtraBillableCampaignItem(
      storage as never,
      { id: "leader-user", activeRole: "field", activeCompanyId: "company-1" },
      { assignedCampaignCrewId: null },
      "write",
    );
    expect(result).toBe(false);
    expect(storage.getCampaignCrewById).not.toHaveBeenCalled();
  });
});

// ─── Endpoint-level supertest: non-leader field user gets 403 on completion-photos upload ──
describe("POST /api/campaigns/:id/items/:itemId/completion-photos/upload (extra_billable)", () => {
  function buildApp(opts: {
    user: { id: string; activeRole: string; activeCompanyId: string };
    campaign: { id: string; category: string };
    item: { id: string; assignedCampaignCrewId: string | null; completionPhotoStorageKeys: string[] };
    crew: typeof baseCrew | null;
    members: { campaignCrewId: string; userId: string; addedAt: Date }[];
  }) {
    const storage = {
      getCampaignById: vi.fn().mockResolvedValue(opts.campaign),
      getCampaignItems: vi.fn().mockResolvedValue([opts.item]),
      getCampaignCrewById: vi.fn().mockResolvedValue(opts.crew),
      getCampaignCrewMembers: vi.fn().mockResolvedValue(opts.members),
      updateCampaignItem: vi.fn(),
    };
    const app = express();
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = opts.user;
      next();
    });
    // Mirror the real handler's auth gate exactly (handler in routes/routes.ts)
    app.post(
      "/api/campaigns/:id/items/:itemId/completion-photos/upload",
      express.raw({ type: "*/*", limit: "8mb" }),
      async (req, res) => {
        const user = (req as any).user;
        const roles = ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"];
        if (!roles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
        const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
        if (!campaign || (campaign.category !== "chemical" && campaign.category !== "extra_billable")) {
          return res.status(404).json({ error: "Chemical or extra-billable campaign not found" });
        }
        const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
        const targetItem = items.find((i: any) => i.id === req.params.itemId);
        if (!targetItem) return res.status(404).json({ error: "Item not found" });
        if (campaign.category === "extra_billable") {
          const allowed = await canAccessExtraBillableCampaignItem(
            storage as never,
            user,
            targetItem,
            "write",
          );
          if (!allowed) return res.status(403).send("Only the assigned crew leader can upload photos");
        }
        return res.json({ ok: true });
      },
    );
    return { app, storage };
  }

  it("returns 403 when a non-leader crew member uploads a photo", async () => {
    const { app, storage } = buildApp({
      user: { id: "member-user", activeRole: "field", activeCompanyId: "company-1" },
      campaign: { id: "campaign-1", category: "extra_billable" },
      item: { id: "item-1", assignedCampaignCrewId: "crew-1", completionPhotoStorageKeys: [] },
      crew: baseCrew,
      members: [{ campaignCrewId: "crew-1", userId: "member-user", addedAt: new Date() }],
    });
    const res = await request(app)
      .post("/api/campaigns/campaign-1/items/item-1/completion-photos/upload")
      .set("Content-Type", "image/jpeg")
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    expect(res.status).toBe(403);
    expect(res.text).toContain("crew leader");
    expect(storage.updateCampaignItem).not.toHaveBeenCalled();
  });

  it("returns 200 when the crew leader uploads a photo", async () => {
    const { app } = buildApp({
      user: { id: "leader-user", activeRole: "field", activeCompanyId: "company-1" },
      campaign: { id: "campaign-1", category: "extra_billable" },
      item: { id: "item-1", assignedCampaignCrewId: "crew-1", completionPhotoStorageKeys: [] },
      crew: baseCrew,
      members: [],
    });
    const res = await request(app)
      .post("/api/campaigns/campaign-1/items/item-1/completion-photos/upload")
      .set("Content-Type", "image/jpeg")
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/campaigns/:id — extra_billable item visibility for field/landscape ──
describe("GET /api/campaigns/:id (extra_billable item filter)", () => {
  function buildGetApp(opts: {
    user: { id: string; activeRole: string; activeCompanyId: string };
    campaign: { id: string; category: string; assignedToId?: string | null; assignedToId2?: string | null };
    items: { id: string; assignedCampaignCrewId: string | null }[];
    crews: { id: string; leaderUserId: string; members: { userId: string }[] }[];
  }) {
    const storage = {
      getCampaignById: vi.fn().mockResolvedValue(opts.campaign),
      getCampaignItems: vi.fn().mockResolvedValue(opts.items),
      getCampaignCrews: vi.fn().mockResolvedValue(opts.crews),
    };
    const app = express();
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = opts.user;
      next();
    });
    app.get("/api/campaigns/:id", async (req, res) => {
      const user = (req as any).user;
      const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      let items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
      if (
        campaign.category === "extra_billable" &&
        (user.activeRole === "field" || user.activeRole === "landscape_supervisor")
      ) {
        const allCrews = await storage.getCampaignCrews(req.params.id, user.activeCompanyId);
        const userCrewIds = new Set(
          allCrews
            .filter((c: any) => c.leaderUserId === user.id || c.members.some((m: any) => m.userId === user.id))
            .map((c: any) => c.id),
        );
        items = items.filter((i: any) => i.assignedCampaignCrewId && userCrewIds.has(i.assignedCampaignCrewId));
      }
      return res.json({ items });
    });
    return { app };
  }

  it("hides items from a campaign-assigned field user who is not in any crew", async () => {
    const { app } = buildGetApp({
      user: { id: "field-user", activeRole: "field", activeCompanyId: "company-1" },
      // Note: user IS the campaign's assignedToId — old buggy logic would skip the crew filter.
      campaign: { id: "campaign-1", category: "extra_billable", assignedToId: "field-user" },
      items: [
        { id: "item-1", assignedCampaignCrewId: "crew-1" },
        { id: "item-2", assignedCampaignCrewId: "crew-2" },
        { id: "item-3", assignedCampaignCrewId: null },
      ],
      crews: [
        { id: "crew-1", leaderUserId: "other-user", members: [{ userId: "other-user" }] },
        { id: "crew-2", leaderUserId: "other-user-2", members: [{ userId: "other-user-2" }] },
      ],
    });
    const res = await request(app).get("/api/campaigns/campaign-1");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("filterExtraBillableCampaignItems: passes through non-extra_billable campaigns unchanged", () => {
    const items = [{ id: "a", assignedCampaignCrewId: null }, { id: "b", assignedCampaignCrewId: "x" }];
    const out = filterExtraBillableCampaignItems(
      items,
      { id: "u", activeRole: "field", activeCompanyId: "c" },
      { category: "chemical" },
      new Set(),
    );
    expect(out).toEqual(items);
  });

  it("userCrewIdSetFromCrews collects leader and member crews", () => {
    const crews = [
      { id: "c1", leaderUserId: "u1", members: [{ userId: "u1" }] },
      { id: "c2", leaderUserId: "leader", members: [{ userId: "u1" }] },
      { id: "c3", leaderUserId: "leader", members: [{ userId: "other" }] },
    ];
    const set = userCrewIdSetFromCrews({ id: "u1" }, crews);
    expect(Array.from(set).sort()).toEqual(["c1", "c2"]);
  });

  it("shows only crew items when campaign-assigned field user is a crew member", async () => {
    const { app } = buildGetApp({
      user: { id: "field-user", activeRole: "field", activeCompanyId: "company-1" },
      campaign: { id: "campaign-1", category: "extra_billable", assignedToId: "field-user" },
      items: [
        { id: "item-1", assignedCampaignCrewId: "crew-1" },
        { id: "item-2", assignedCampaignCrewId: "crew-2" },
      ],
      crews: [
        { id: "crew-1", leaderUserId: "field-user", members: [{ userId: "field-user" }] },
        { id: "crew-2", leaderUserId: "other-user", members: [{ userId: "other-user" }] },
      ],
    });
    const res = await request(app).get("/api/campaigns/campaign-1");
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: any) => i.id)).toEqual(["item-1"]);
  });
});

// ─── validateBulkAssignCrew (drives the real /bulk-assign-crew handler) ─────
describe("validateBulkAssignCrew", () => {
  const adminUser = { id: "admin", activeRole: "admin", activeCompanyId: "co" } as const;
  const ebCampaign = { id: "camp-1", category: "extra_billable" } as const;
  const goodCrew = { id: "crew-1", campaignId: "camp-1", leaderUserId: "leader" };

  it("admin bulk-assigns 3 items successfully", () => {
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: ["i1", "i2", "i3"], assignedCampaignCrewId: "crew-1" },
      campaign: ebCampaign,
      targetCrew: goodCrew,
      itemRows: [
        { id: "i1", campaignId: "camp-1" },
        { id: "i2", campaignId: "camp-1" },
        { id: "i3", campaignId: "camp-1" },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.itemIds.sort()).toEqual(["i1", "i2", "i3"]);
      expect(out.assignedCampaignCrewId).toBe("crew-1");
    }
  });

  it("returns 400 items_wrong_campaign if any item belongs to a different campaign", () => {
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: ["i1", "i2"], assignedCampaignCrewId: "crew-1" },
      campaign: ebCampaign,
      targetCrew: goodCrew,
      itemRows: [
        { id: "i1", campaignId: "camp-1" },
        { id: "i2", campaignId: "other-camp" },
      ],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.code).toBe("items_wrong_campaign");
    }
  });

  it("returns 400 leaderless_crew when target crew has no leader", () => {
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: ["i1"], assignedCampaignCrewId: "crew-1" },
      campaign: ebCampaign,
      targetCrew: { ...goodCrew, leaderUserId: null },
      itemRows: [{ id: "i1", campaignId: "camp-1" }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.code).toBe("leaderless_crew");
      expect(out.error).toMatch(/leader/i);
    }
  });

  it("returns 403 forbidden_role when a field user attempts bulk reassignment", () => {
    const out = validateBulkAssignCrew({
      user: { id: "field-1", activeRole: "field", activeCompanyId: "co" },
      campaignId: "camp-1",
      body: { itemIds: ["i1"], assignedCampaignCrewId: "crew-1" },
      campaign: ebCampaign,
      targetCrew: goodCrew,
      itemRows: [{ id: "i1", campaignId: "camp-1" }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(403);
      expect(out.code).toBe("forbidden_role");
    }
  });

  it("returns 400 wrong_category when campaign is not extra_billable", () => {
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: ["i1"], assignedCampaignCrewId: "crew-1" },
      campaign: { id: "camp-1", category: "chemical" },
      targetCrew: goodCrew,
      itemRows: [{ id: "i1", campaignId: "camp-1" }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.code).toBe("wrong_category");
    }
  });

  it("allows null crewId to unassign", () => {
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: ["i1", "i2"], assignedCampaignCrewId: null },
      campaign: ebCampaign,
      targetCrew: null,
      itemRows: [
        { id: "i1", campaignId: "camp-1" },
        { id: "i2", campaignId: "camp-1" },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.assignedCampaignCrewId).toBeNull();
  });

  it("rejects more than 500 itemIds", () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => `i${i}`);
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: tooMany, assignedCampaignCrewId: null },
      campaign: ebCampaign,
      targetCrew: null,
      itemRows: tooMany.map((id) => ({ id, campaignId: "camp-1" })),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("invalid_item_ids");
  });

  it("rejects items_not_found when an itemId is missing from itemRows", () => {
    const out = validateBulkAssignCrew({
      user: adminUser,
      campaignId: "camp-1",
      body: { itemIds: ["i1", "ghost"], assignedCampaignCrewId: null },
      campaign: ebCampaign,
      targetCrew: null,
      itemRows: [{ id: "i1", campaignId: "camp-1" }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("items_not_found");
  });
});
