import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, campaigns, campaignItems, campaignCrews, campaignChecklistTasks, crews, users, visits, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { updateCampaignRoundItem, toggleRoundChecklist } from "./campaignRoundWork";
import { storage } from "../storage";
import { CrewLinkError } from "./crewLinks";
import { campaignRoundActor } from "./campaignRoundContext";
import { moveRoundItems, inheritedRoundTeam } from "./campaignRoundLists";
import { canAccessGeneratedRound, roundField, roundAssigned, roundTeamIds } from "./campaignRoundAccess";
import { withCampaignContractStates } from "./campaignContractState";
import { registerCampaignRoundLists } from "../routes/campaignRoundLists";
import { companyNoon } from "./companyDay";
import type { UserWithContext } from "../auth";

let company: string, other: string, actor: string, supervisor: string, round: string, teamA: string, teamB: string;
let ids: string[], crewIds: string[], actorContext: UserWithContext;
const rows = () => db.select().from(campaignItems).where(eq(campaignItems.campaignId, round)).orderBy(asc(campaignItems.crewPosition), asc(campaignItems.id));
const history = (id = ids[0]) => db.select().from(visits).where(eq(visits.campaignItemId, id));
function appFor(role = "admin", userId = actor) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: userId, activeCompanyId: company, accessRole: role, activeRole: role } as UserWithContext;
    next();
  });
  registerCampaignRoundLists(app);
  app.patch("/api/campaigns/:id/items/:itemId", (_req, res) => res.json({ reached: true }));
  return app;
}
function legacyApp(action: "patch" | "work" | "work-v2" | "checklist" | "post" | "detail", deliveryStatus = "sent", identity?: UserWithContext) {
  // Mount the actual legacy handler source, not a test reimplementation. Its
  // external-email branches are never invoked by these work/reset tests.
  const source = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
  const marker = action === "patch" ? '  app.patch("/api/campaigns/:id/items/:itemId",'
    : action === "detail" ? '  app.get("/api/campaigns/:id",'
    : action === "checklist" ? '  app.post("/api/campaigns/:id/items/:itemId/checklist/:taskId/toggle",'
    : `  app.post("/api/campaigns/:id/items/:itemId/${action === "post" ? "send-post-comm" : action === "work" ? "complete-work" : "complete-work-v2"}",`;
  const start = source.indexOf(marker), end = source.indexOf("\n  });", start + marker.length) + "\n  });".length;
  // appFor's lightweight PATCH sentinel must not intercept the real handler.
  const real = express(); real.use(express.json());
  real.use((req, _res, next) => { req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = identity ?? { id: actor, name: "Fixture", activeRole: "admin", accessRole: "admin", activeCompanyId: company } as UserWithContext; next(); });
  registerCampaignRoundLists(real);
  new Function("deps", `const {app,storage,canAccessGeneratedRound,toggleRoundChecklist,CrewLinkError,filterUserChemTemplateVars,
    resolveChemRecipientEmail,resolveChemLabelAttachment,BLOCK_PRODUCT_LABEL_FALLBACK,resolveChemCompletionPhotosHtml,
    resolveChemApplicator,renderChemicalNotificationTemplate,sendEmail,resolveChemCompletionDate,MissingChemicalNotificationTemplateError,getEmailFallbacks,
    roundField,roundAssigned,roundTeamIds,withCampaignContractStates,campaignAllowedRoles}=deps;\n${
    transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code}`)({
    app: real, storage, canAccessGeneratedRound, toggleRoundChecklist,
    CrewLinkError,
    filterUserChemTemplateVars: () => ({}),
    resolveChemRecipientEmail: async () => ({ email: "fixture@example.invalid" }),
    resolveChemLabelAttachment: async () => ({ url: "https://example.invalid/label", name: "Fixture label", source: "visit" }),
    BLOCK_PRODUCT_LABEL_FALLBACK: false,
    resolveChemCompletionPhotosHtml: async () => "",
    resolveChemApplicator: async () => ({ name: "Fixture", license: "Fixture" }),
    renderChemicalNotificationTemplate: async () => ({ subject: "Fixture", html: "Fixture", textBody: "Fixture" }),
    sendEmail: async () => ({ id: null, status: deliveryStatus }),
    resolveChemCompletionDate: () => "June 10, 2027",
    MissingChemicalNotificationTemplateError: class extends Error {},
    getEmailFallbacks: () => ({ seeCompanyContact: "Fixture", licensedApplicator: "Fixture" }),
    roundField, roundAssigned, roundTeamIds, withCampaignContractStates,
    campaignAllowedRoles: ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"],
  });
  return real;
}
describe("CG4 development-only disposable round lists and work history", () => {
  beforeEach(async () => {
    company = `cg4-${randomUUID()}`; other = `cg4-${randomUUID()}`; actor = randomUUID(); supervisor = randomUUID();
    await db.insert(companies).values([{ id: company, name: "Disposable CG4", slug: company }, { id: other, name: "Other CG4", slug: other }]);
    await db.insert(users).values([{ id: actor, name: "CG4 Office", passwordHash: "unusable-fixture" },
      { id: supervisor, name: "CG4 Crew", passwordHash: "unusable-fixture" }]);
    actorContext = { id: supervisor, activeCompanyId: company, activeRole: "field", accessRole: "field" } as UserWithContext;
    const roster = await db.insert(crews).values([{ companyId: company, name: "Crew A", supervisorUserId: supervisor },
      { companyId: company, name: "Crew B", supervisorUserId: actor }]).returning();
    crewIds = roster.map(c => c.id);
    const [campaign] = await db.insert(campaigns).values({ companyId: company, source: "contract", serviceKey: "aeration",
      roundMonth: "2027-06-01", roundSeq: 1, title: "Fixture aeration", windowStart: "2027-06-01", windowEnd: "2027-06-30", category: "general" }).returning();
    round = campaign.id;
    const teams = await db.insert(campaignCrews).values(roster.map(c => ({ companyId: company, campaignId: round,
      crewId: c.id, name: c.name, color: "#2563eb", leaderUserId: c.supervisorUserId }))).returning();
    [teamA, teamB] = teams.map(c => c.id);
    const properties = await db.insert(customers).values([0, 1, 2, 3].map(n => ({ companyId: company, name: `Property ${n}`,
      street: "Test", city: "Test", state: "CO", zip: "00000" }))).returning();
    ids = (await db.insert(campaignItems).values(properties.map((p, index) => ({ companyId: company, campaignId: round,
      customerId: p.id, customerName: p.name, assignedCampaignCrewId: index < 2 ? teamA : null, crewPosition: index % 2 }))).returning()).map(i => i.id);
  });
  afterEach(async () => {
    await db.delete(visits).where(inArray(visits.companyId, [company, other]));
    await db.delete(companies).where(inArray(companies.id, [company, other]));
    await db.delete(users).where(inArray(users.id, [actor, supervisor]));
  });
  afterAll(async () => { await Promise.all([pool.end(), schemaPool.end()]); });

  it("has the actual done-only uniqueness index, not a predecessor open index", async () => {
    const result = await db.execute(sql`SELECT indexdef FROM pg_indexes WHERE indexname='visits_campaign_item_done_unique'`);
    expect(result.rows[0].indexdef).toContain("status = 'done'");
  });
  it("atomically completes once under parallel writes; reopen cancels; recompletion adds history; skip creates none", async () => {
    await Promise.all(Array.from({ length: 5 }, () => updateCampaignRoundItem(ids[0], company, {
      status: "completed", completedById: actor, completedAt: companyNoon("2027-06-03") })));
    expect(await history()).toHaveLength(1);
    expect((await history())[0]).toMatchObject({ sourceType: "campaign_item", status: "done", crewId: crewIds[0], visitDate: "2027-06-03", serviceKey: "aeration" });
    expect((await rows()).find(i => i.id === ids[0])?.crewPosition).toBeNull();
    await updateCampaignRoundItem(ids[0], company, { status: "pending", completedAt: null, completedById: null });
    expect((await history())[0].status).toBe("cancelled");
    await updateCampaignRoundItem(ids[0], company, { status: "completed", completedById: actor, completedAt: companyNoon("2027-06-04") });
    expect((await history()).map(v => v.status).sort()).toEqual(["cancelled", "done"]);
    await updateCampaignRoundItem(ids[1], company, { status: "skipped", completedById: actor });
    expect(await history(ids[1])).toEqual([]);
  });
  it("rolls back item completion when the visit insert fails", async () => {
    await db.insert(visits).values({ companyId: company, campaignItemId: ids[0], sourceType: "campaign_item", visitDate: "2027-06-03", status: "done" });
    await expect(updateCampaignRoundItem(ids[0], company, { status: "completed" })).rejects.toThrow();
    expect((await rows()).find(i => i.id === ids[0])?.status).toBe("pending");
  });
  it("keeps Colorado evening/DST completion days independent of UTC host", async () => {
    await updateCampaignRoundItem(ids[0], company, { status: "completed", completedAt: new Date("2027-03-15T02:30:00Z") });
    expect((await history())[0].visitDate).toBe("2027-03-14");
  });
  it("preserves manual and extra-billable completion behavior without new visits", async () => {
    const [manual] = await db.insert(campaigns).values({ companyId: company, title: "Manual extra billable", category: "extra_billable",
      windowStart: "2027-06-01", windowEnd: "2027-06-30" }).returning();
    await db.update(campaignItems).set({ campaignId: manual.id }).where(eq(campaignItems.id, ids[0]));
    await updateCampaignRoundItem(ids[0], company, { status: "completed", completedById: actor });
    expect(await history()).toEqual([]);
  });
  it("moves and reorders densely under concurrency and keeps finished assignment/history unchanged", async () => {
    await updateCampaignRoundItem(ids[0], company, { status: "completed", completedById: actor });
    await Promise.all([moveRoundItems(company, round, { itemIds: [ids[2]], assignedCampaignCrewId: teamB }),
      moveRoundItems(company, round, { itemIds: [ids[3]], assignedCampaignCrewId: teamB })]);
    await moveRoundItems(company, round, { itemIds: [ids[3]], assignedCampaignCrewId: teamB, beforeItemId: ids[2] });
    expect((await rows()).filter(i => i.assignedCampaignCrewId === teamB).map(i => [i.id, i.crewPosition])).toEqual([[ids[3], 0], [ids[2], 1]]);
    await expect(moveRoundItems(company, round, { itemIds: [ids[0]], assignedCampaignCrewId: teamB })).rejects.toThrow("unfinished");
    expect((await history())[0].crewId).toBe(crewIds[0]);
  });
  it("rejects foreign companies, wrong-round crews, invalid dates and non-office ordering", async () => {
    await expect(moveRoundItems(other, round, { itemIds: [ids[0]], assignedCampaignCrewId: teamA })).rejects.toThrow("not found");
    const app = appFor();
    expect((await request(app).put(`/api/campaigns/${round}/round-order`).send({ itemIds: [ids[0], ids[0]], assignedCampaignCrewId: teamA })).status).toBe(400);
    expect((await request(app).patch(`/api/campaigns/${round}/items/${ids[0]}`).send({ completedAt: "2027-02-30" })).status).toBe(400);
    expect((await request(app).put(`/api/campaigns/${round}/round-order`).set("X-Company-Id", other).send({ itemIds: [ids[0]], assignedCampaignCrewId: teamA })).status).toBe(409);
    expect((await request(appFor("field", supervisor)).put(`/api/campaigns/${round}/round-order`).send({ itemIds: [ids[0]], assignedCampaignCrewId: teamA })).status).toBe(403);
  });
  it("start gates only crew access and exposes only the authorized team with complete item history", async () => {
    let [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, round));
    expect(await canAccessGeneratedRound(actorContext, campaign, ids[0])).toBe(false);
    const started = await request(appFor()).post(`/api/campaigns/${round}/start-round`).send({ confirm: true });
    expect(started.status).toBe(200);
    [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, round));
    expect(await canAccessGeneratedRound(actorContext, campaign, ids[0])).toBe(true);
    expect(await canAccessGeneratedRound(actorContext, campaign, ids[2])).toBe(false);
    const response = await request(appFor("field", supervisor)).get(`/api/campaigns/${round}/round-lists`);
    expect(response.status).toBe(200); expect(response.body.teams.map((t: { id: string }) => t.id)).toEqual([teamA]);
    expect(response.body.items.map((i: { id: string }) => i.id).sort()).toEqual(ids.slice(0, 2).sort());
    expect(response.body.items[0]).toHaveProperty("completedAt");
    expect(response.body.items[0]).toHaveProperty("contractState");
    expect((await request(appFor("field", supervisor)).patch(`/api/campaigns/${round}/items/${ids[2]}`).send({ status: "completed" })).status).toBe(403);
  });
  it("preserves assigned-user access before start; start is idempotent and rejects unconfirmed or closed rounds", async () => {
    await db.update(campaigns).set({ assignedToId: supervisor }).where(eq(campaigns.id, round));
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, round));
    expect(await canAccessGeneratedRound(actorContext, campaign, ids[2])).toBe(true);
    const app = appFor();
    expect((await request(app).post(`/api/campaigns/${round}/start-round`).send({})).status).toBe(400);
    const first = await request(app).post(`/api/campaigns/${round}/start-round`).send({ confirm: true });
    const second = await request(app).post(`/api/campaigns/${round}/start-round`).send({ confirm: true });
    expect(first.body.startedAt).toBe(second.body.startedAt);
    expect(await history()).toEqual([]);
  });
  it("copies the previous same-service split, preserves finished rows, and inherits new arrivals without copying dates", async () => {
    const [next] = await db.insert(campaigns).values({ companyId: company, source: "contract", serviceKey: "aeration", roundMonth: "2027-09-01",
      roundSeq: 1, title: "Fixture next", windowStart: "2027-09-01", windowEnd: "2027-09-30", category: "general" }).returning();
    const original = (await rows()).find(i => i.id === ids[0])!;
    const inherited = await db.transaction(tx => inheritedRoundTeam(tx, next, original.customerId));
    const [team] = await db.select().from(campaignCrews).where(eq(campaignCrews.id, inherited!));
    expect(team.crewId).toBe(crewIds[0]);
    const [newItem] = await db.insert(campaignItems).values({ companyId: company, campaignId: next.id,
      customerId: original.customerId, customerName: "New round item" }).returning();
    expect((await request(appFor()).post(`/api/campaigns/${next.id}/copy-previous-split`).send({})).status).toBe(200);
    const [copied] = await db.select().from(campaignItems).where(eq(campaignItems.id, newItem.id));
    expect(copied.assignedCampaignCrewId).toBe(team.id);
    expect(copied.targetDate).toBeNull();
  });
  it("calendar projections do not create planned visits or include manual rounds", async () => {
    const response = await request(appFor()).get("/api/campaign-rounds/calendar?from=2027-06-01&through=2027-06-07");
    expect(response.status).toBe(200);
    expect(response.body.rounds[0]).toMatchObject({ id: round, remaining: 4, unassigned: 2 });
    expect(await history()).toEqual([]);
  });
  it("actual general PATCH completion/reopen/skip writers share atomic visit history", async () => {
    const app = legacyApp("patch"), path = `/api/campaigns/${round}/items/${ids[0]}`;
    const done = await request(app).patch(path).send({ status: "completed", completedAt: "2027-06-10" });
    expect(done.status).toBe(200); expect((await history())[0].visitDate).toBe("2027-06-10");
    expect((await request(app).patch(path).send({ status: "pending" })).status).toBe(200);
    expect((await history())[0].status).toBe("cancelled");
    expect((await request(app).patch(path).send({ status: "skipped", skipReason: "Fixture" })).status).toBe(200);
    expect(await history()).toHaveLength(1);
  });
  it.each(["work", "work-v2"] as const)("actual chemical %s writer retains workflow and final completion/reset history", async action => {
    await db.update(campaigns).set({ serviceKey: "chemical", category: "chemical" }).where(eq(campaigns.id, round));
    await db.update(campaignItems).set({ workflowStep: "work_in_progress" }).where(eq(campaignItems.id, ids[0]));
    const worked = await request(legacyApp(action)).post(`/api/campaigns/${round}/items/${ids[0]}/${action === "work" ? "complete-work" : "complete-work-v2"}`)
      .send({ workCompletedAt: "2027-06-10" });
    expect(worked.status).toBe(200); expect(worked.body.workflowStep).toBe("work_completed");
    expect(await history()).toEqual([]); // status, not email/work phase, owns done.
    const path = `/api/campaigns/${round}/items/${ids[0]}`, app = legacyApp("patch");
    const done = await request(app).patch(path).send({ chemAction: "finish_without_comms", completionDate: "2027-06-10",
      weatherTemp: 70, weatherWindSpeed: 3, weatherConditions: "Clear" });
    expect(done.status).toBe(200); expect(await history()).toHaveLength(1);
    expect((await request(app).patch(path).send({ chemAction: "reset" })).status).toBe(200);
    expect((await history())[0].status).toBe("cancelled");
  });
  it("actual irrigation checklist completion/uncheck and visit cancellation are one transaction", async () => {
    await db.update(campaigns).set({ serviceKey: "irrigation_open", category: "irrigation", subtype: "spring_turn_on" }).where(eq(campaigns.id, round));
    const [task] = await db.insert(campaignChecklistTasks).values({ campaignId: round, label: "Check controller", order: 0 }).returning();
    const app = legacyApp("checklist"), path = `/api/campaigns/${round}/items/${ids[0]}/checklist/${task.id}/toggle`;
    expect((await request(app).post(path).send({ completedAt: "2027-06-10" })).status).toBe(200);
    expect((await history())[0].status).toBe("done");
    expect((await request(app).post(path).send({})).status).toBe(200);
    expect((await history())[0].status).toBe("cancelled");
  });
  it.each(["post", "patch"] as const)("actual chemical %s finalization records work only after successful delivery", async action => {
    await db.update(campaigns).set({ serviceKey: "chemical", category: "chemical" }).where(eq(campaigns.id, round));
    await db.update(campaignItems).set({ workflowStep: "work_completed" }).where(eq(campaignItems.id, ids[0]));
    const path = `/api/campaigns/${round}/items/${ids[0]}${action === "post" ? "/send-post-comm" : ""}`;
    const body = { chemAction: "send_post_communication", completedAt: "2027-06-10" };
    const failedApp = legacyApp(action, "failed");
    const failed = action === "post" ? await request(failedApp).post(path).send(body) : await request(failedApp).patch(path).send(body);
    expect(failed.status).toBe(502); expect(await history()).toEqual([]);
    expect((await rows()).find(i => i.id === ids[0])!.status).toBe("pending");
    const sentApp = legacyApp(action);
    const sent = action === "post" ? await request(sentApp).post(path).send(body) : await request(sentApp).patch(path).send(body);
    expect(sent.status).toBe(200); expect((await history()).map(v => v.status)).toEqual(["done"]);
  });
  it("rechecks field authorization after a concurrent crew reassignment", async () => {
    await db.update(campaigns).set({ startedAt: new Date() }).where(eq(campaigns.id, round));
    const field = actorContext;
    expect(await canAccessGeneratedRound(field, (await db.select().from(campaigns).where(eq(campaigns.id, round)))[0], ids[0])).toBe(true);
    await moveRoundItems(company, round, { itemIds: [ids[0]], assignedCampaignCrewId: teamB });
    await expect(campaignRoundActor.run(field, () => updateCampaignRoundItem(ids[0], company, { status: "completed" }))).rejects.toThrow("Crew assignment changed");
    expect(await history()).toEqual([]);
  });
  it.each(["irrigation_manager", "crew_supervisor", "field"])("scopes both round read endpoints to the %s's started team", async role => {
    const identity = { ...actorContext, activeRole: role, accessRole: role } as UserWithContext;
    const detailApp = legacyApp("detail", "sent", identity), listApp = appFor(role, supervisor);
    const detailPath = `/api/campaigns/${round}`;
    expect((await request(detailApp).get(detailPath)).status).toBe(403);
    expect((await request(listApp).get(`${detailPath}/round-lists`)).status).toBe(403);
    await moveRoundItems(company, round, { itemIds: [ids[2]], assignedCampaignCrewId: teamB });
    await db.update(campaigns).set({ startedAt: new Date() }).where(eq(campaigns.id, round));
    const lists = await request(listApp).get(`${detailPath}/round-lists`);
    expect(lists.status).toBe(200);
    expect(lists.body.teams.map((t: { id: string }) => t.id)).toEqual([teamA]);
    expect(lists.body.items.map((i: { id: string }) => i.id).sort()).toEqual(ids.slice(0, 2).sort());
    const detail = await request(detailApp).get(detailPath);
    expect(detail.status).toBe(200);
    expect(detail.body.items.map((i: { id: string }) => i.id).sort()).toEqual(ids.slice(0, 2).sort());
    expect((await request(listApp).patch(`${detailPath}/items/${ids[2]}`).send({ notes: "Denied" })).status).toBe(403);
    // Explicit legacy campaign assignment retains its broader, pre-start read.
    await db.update(campaigns).set({ assignedToId: supervisor, startedAt: null }).where(eq(campaigns.id, round));
    expect((await request(detailApp).get(detailPath)).body.items).toHaveLength(4);
    expect((await request(listApp).get(`${detailPath}/round-lists`)).body.items).toHaveLength(4);
  });
  it("rejects a cross-company property before committing item completion", async () => {
    const [foreign] = await db.insert(customers).values({ companyId: other, name: "Foreign", street: "Test", city: "Test", state: "CO", zip: "80000" }).returning();
    await db.update(campaignItems).set({ customerId: foreign.id }).where(eq(campaignItems.id, ids[0]));
    await expect(updateCampaignRoundItem(ids[0], company, { status: "completed" })).rejects.toThrow("Property does not belong");
    expect((await rows()).find(i => i.id === ids[0])!.status).toBe("pending");
    expect(await history()).toEqual([]);
  });
  it("projects chemical target dates outside their round window without inventing visits", async () => {
    await db.update(campaigns).set({ serviceKey: "chemical", category: "chemical", windowStart: "2027-06-01", windowEnd: "2027-06-30" }).where(eq(campaigns.id, round));
    await db.update(campaignItems).set({ targetDate: "2027-07-03", backupDate: "2027-07-05" }).where(eq(campaignItems.id, ids[0]));
    const res = await request(appFor()).get("/api/campaign-rounds/calendar?from=2027-07-01&through=2027-07-07");
    expect(res.status).toBe(200); expect(res.body.rounds).toEqual([]);
    expect(res.body.chemicalItems.map((i: { id: string }) => i.id)).toContain(ids[0]);
    expect(await history()).toEqual([]);
  });
  it("scopes irrigation-manager calendar bars and chemical dates by start, team and explicit assignment", async () => {
    await db.update(campaigns).set({ serviceKey: "chemical", category: "chemical" }).where(eq(campaigns.id, round));
    await db.update(campaignItems).set({ targetDate: "2027-06-10", backupDate: "2027-06-11" }).where(eq(campaignItems.campaignId, round));
    await moveRoundItems(company, round, { itemIds: [ids[2]], assignedCampaignCrewId: teamB });
    const [hidden] = await db.insert(campaigns).values({ companyId: company, source: "contract", serviceKey: "chemical", category: "chemical",
      roundMonth: "2027-06-01", roundSeq: 2, title: "Other crew's round", windowStart: "2027-06-01", windowEnd: "2027-06-30", startedAt: new Date() }).returning();
    await db.insert(campaignItems).values({ campaignId: hidden.id, companyId: company, customerId: (await rows())[0].customerId,
      customerName: "Hidden property", targetDate: "2027-06-10" });
    const app = appFor("irrigation_manager", supervisor), path = "/api/campaign-rounds/calendar?from=2027-06-01&through=2027-06-30";
    let result = await request(app).get(path);
    expect(result.status).toBe(200); expect(result.body).toEqual({ rounds: [], chemicalItems: [] });
    await db.update(campaigns).set({ startedAt: new Date() }).where(eq(campaigns.id, round));
    result = await request(app).get(path);
    expect(result.body.rounds.map((r: { id: string }) => r.id)).toEqual([round]);
    expect(result.body.rounds[0].teams.map((t: { id: string }) => t.id)).toEqual([teamA]);
    expect(result.body.rounds[0]).toMatchObject({ remaining: 2, unassigned: 0 });
    expect(result.body.chemicalItems.map((i: { id: string }) => i.id).sort()).toEqual(ids.slice(0, 2).sort());
    await db.update(campaigns).set({ startedAt: null, assignedToId: supervisor }).where(eq(campaigns.id, round));
    result = await request(app).get(path);
    expect(result.body.rounds).toHaveLength(1);
    expect(result.body.rounds[0].teams).toHaveLength(2);
    expect(result.body.rounds[0]).toMatchObject({ remaining: 4, unassigned: 1 });
    expect(result.body.chemicalItems.map((i: { id: string }) => i.id).sort()).toEqual([...ids].sort());
    expect(await history()).toEqual([]);
  });
  it("every existing completion/reopen route retains the central storage writer and no parallel item status writer exists", () => {
    const source = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
    for (const action of ['checklist/:taskId/toggle', '/complete-work"', '/complete-work-v2"', '/send-post-comm"']) {
      const at = source.indexOf(action); expect(at).toBeGreaterThan(0);
      const end = source.indexOf("\n  app.", at);
      expect(source.slice(at, end)).toContain("storage.updateCampaignItem");
    }
    expect(readFileSync(new URL("../storage.ts", import.meta.url), "utf8")).toContain("return updateCampaignRoundItem(id, companyId");
  });
});
