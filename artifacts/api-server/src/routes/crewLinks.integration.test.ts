import { beforeEach, afterEach, describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { companies, crews, campaignCrews, campaigns, insertCampaignCrewSchema } from "@workspace/db";
import { db } from "../db";
import { storage } from "../storage";
import { createRouteFixture, removeRouteFixture } from "../lib/routeTestFixture";
import { registerCrewsAndMobileRoutes } from "./crewsAndMobile";
import { linkCrewsByName } from "../lib/linkCrews";
import { CrewLinkError, lockCrewCompany, recordCrewLinkChoice } from "../lib/crewLinks";
import { pickProvided } from "../lib/patchBody";

describe("campaign links against real PostgreSQL", () => {
  let f: Awaited<ReturnType<typeof createRouteFixture>>, campaignId: string;
  beforeEach(async () => {
    f = await createRouteFixture();
    const [c] = await db.insert(campaigns).values({ companyId: f.companyId, title: "Fixture campaign", category: "extra_billable", status: "active", windowStart: "2027-01-01", windowEnd: "2027-12-31", createdById: f.userId }).returning();
    campaignId = c.id;
  }, 30_000);
  afterEach(async () => { if (f) await removeRouteFixture(f.companyId, f.userId); }, 30_000);
  function app(role = "admin", companyId: string = f.companyId) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId, activeRole: role, activeCompanyId: companyId } }); next();
    });
    registerCrewsAndMobileRoutes(app);
    const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    const start = source.indexOf('  app.post("/api/campaigns/:id/crews",');
    const end = source.indexOf('  app.delete("/api/campaigns/:id/crews/:crewId",', start);
    if (start < 0 || end < 0) throw new Error("Campaign handler block moved");
    new Function("deps", `const { app,storage,db,and,eq,z,standingCrews,isCrewUniqueViolation,insertCampaignCrewSchema,pickProvided,CrewLinkError,lockCrewCompany,recordCrewLinkChoice }=deps;
      ${transformSync(source.slice(start,end), { loader: "ts", target: "es2022" }).code}`)({
      app,storage,db,and,eq,z,standingCrews: crews,insertCampaignCrewSchema,pickProvided,CrewLinkError,lockCrewCompany,recordCrewLinkChoice,
      isCrewUniqueViolation: (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "23505",
    });
    return app;
  }
  it("projects standing identity and keeps campaign counts without extra fields", async () => {
    await db.insert(campaignCrews).values({ companyId: f.companyId, campaignId, name: "Frozen team", leaderUserId: f.userId, crewId: f.standing[0].id });
    const r = await request(app()).get("/api/crews");
    expect(r.status).toBe(200);
    expect(r.body.find((c: { id: string }) => c.id === f.standing[0].id)).toMatchObject({ name: "Route Crew 1", campaignTeamCount: 1 });
    expect((await request(app("field")).get("/api/crews")).status).toBe(403);
    expect((await request(app()).get("/api/crews/eligible-supervisors")).status).toBe(200);
  });
  it("campaign POST/PATCH retains ownership, frozen identity, null and duplicate behavior", async () => {
    const path = `/api/campaigns/${campaignId}/crews`;
    const created = await request(app()).post(path).send({ crewId: f.standing[0].id });
    expect(created.status).toBe(200);
    expect((await request(app()).post(path).send({ crewId: f.standing[0].id })).status).toBe(409);
    const edit = `${path}/${created.body.id}`;
    expect((await request(app()).patch(edit).send({ name: "Renamed" })).status).toBe(409);
    expect((await request(app()).patch(edit).send({ crewId: "foreign" })).status).toBe(400);
    expect((await request(app()).patch(edit).send({ crewId: null })).body.crewId).toBeNull();
    await linkCrewsByName(f.companyId);
    await linkCrewsByName(f.companyId);
    expect((await db.select().from(campaignCrews).where(eq(campaignCrews.id, created.body.id)))[0].crewId).toBeNull();
    expect((await request(app()).patch(edit).send({ crewId: f.standing[1].id })).body.crewId).toBe(f.standing[1].id);
    await db.update(crews).set({ name: "Updated", color: "#aabbcc" }).where(eq(crews.id, f.standing[1].id));
    expect((await storage.getCampaignCrews(campaignId, f.companyId))[0]).toMatchObject({ name: "Updated", color: "#aabbcc" });
  });
  it("one-time campaign matching preserves deliberate None across repeated startup", async () => {
    const [team] = await db.insert(campaignCrews).values({ companyId: f.companyId, campaignId, name: "Team", leaderUserId: f.userId }).returning();
    await linkCrewsByName(f.companyId);
    expect((await db.select().from(campaignCrews).where(eq(campaignCrews.id, team.id)))[0].crewId).toBe(f.standing[0].id);
    await db.update(campaignCrews).set({ crewId: null }).where(eq(campaignCrews.id, team.id));
    await linkCrewsByName(f.companyId);
    expect((await db.select().from(campaignCrews).where(eq(campaignCrews.id, team.id)))[0].crewId).toBeNull();
    expect((await db.select().from(companies).where(eq(companies.id, f.companyId)))[0].crewLinksInitializedAt).not.toBeNull();
  });
  it("crew deletion remains blocked by an active campaign team", async () => {
    await db.insert(campaignCrews).values({ companyId: f.companyId, campaignId, name: "Team", leaderUserId: f.userId, crewId: f.standing[0].id });
    const r = await request(app()).delete(`/api/crews/${f.standing[0].id}`);
    expect(r.status).toBe(409);
    expect(r.body.campaignTeams).toHaveLength(1);
    expect((await request(app("admin", "foreign")).delete(`/api/crews/${f.standing[0].id}`)).status).toBe(404);
  });
});
