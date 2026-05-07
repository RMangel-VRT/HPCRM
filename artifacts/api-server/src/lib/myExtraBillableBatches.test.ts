// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const ALLOWED_ROLES = ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"];

function buildApp(opts: {
  user: { id: string; activeRole: string; activeCompanyId: string } | null;
  batches: unknown[];
  shouldThrow?: boolean;
}) {
  const storage = {
    getMyExtraBillableBatches: vi.fn(async () => {
      if (opts.shouldThrow) throw new Error("boom");
      return opts.batches;
    }),
  };
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => !!opts.user;
    (req as any).user = opts.user;
    next();
  });
  app.get("/api/me/extra-billable-batches", async (req, res) => {
    if (!(req as any).isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = (req as any).user;
    if (!ALLOWED_ROLES.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    const batches = await storage.getMyExtraBillableBatches(user.id, user.activeRole, user.activeCompanyId);
    res.json(batches);
  });
  return { app, storage };
}

describe("GET /api/me/extra-billable-batches", () => {
  it("returns 401 when not authenticated", async () => {
    const { app } = buildApp({ user: null, batches: [] });
    const res = await request(app).get("/api/me/extra-billable-batches");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an unauthorized role", async () => {
    const { app } = buildApp({
      user: { id: "u1", activeRole: "shop_manager", activeCompanyId: "c1" },
      batches: [],
    });
    const res = await request(app).get("/api/me/extra-billable-batches");
    expect(res.status).toBe(403);
  });

  it("returns user-scoped batches and forwards role/companyId/userId", async () => {
    const sample = [
      {
        campaignId: "c-1",
        campaignTitle: "Spring cleanup",
        campaignStatus: "active",
        windowStart: "2026-04-01",
        windowEnd: "2026-04-30",
        crewId: "crew-1",
        crewName: "Alpha",
        crewColor: "#2563eb",
        leaderUserId: "leader-1",
        leaderName: "Leader Lou",
        isLeader: true,
        assignedItemCount: 5,
        completedItemCount: 2,
        pendingItemCount: 3,
        photoCount: 7,
        nextDueDate: "2026-04-12",
      },
    ];
    const { app, storage } = buildApp({
      user: { id: "leader-1", activeRole: "field", activeCompanyId: "company-1" },
      batches: sample,
    });
    const res = await request(app).get("/api/me/extra-billable-batches");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sample);
    expect(storage.getMyExtraBillableBatches).toHaveBeenCalledWith("leader-1", "field", "company-1");
  });

  it("admin role is treated as company-wide (passes role through)", async () => {
    const { app, storage } = buildApp({
      user: { id: "admin-1", activeRole: "admin", activeCompanyId: "company-1" },
      batches: [],
    });
    const res = await request(app).get("/api/me/extra-billable-batches");
    expect(res.status).toBe(200);
    expect(storage.getMyExtraBillableBatches).toHaveBeenCalledWith("admin-1", "admin", "company-1");
  });
});
