// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { canAccessExtraBillableCampaignItem } from "./extraBillableAccess";

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
    // Mirror the real handler's auth gate exactly (handler in server/routes.ts)
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
        res.json({ ok: true });
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
