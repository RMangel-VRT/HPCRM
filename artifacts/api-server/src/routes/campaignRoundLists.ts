import type { Express } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { campaigns, campaignItems, campaignCrews, crews } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { CrewLinkError } from "../lib/crewLinks";
import { companyToday } from "../lib/companyDay";
import { isCalendarDate } from "../../../../lib/db/src/schema/calendarDate";
import { lockedRound, moveRoundItems, inheritedRoundTeam, previousRound } from "../lib/campaignRoundLists";
import { denseRoundOrder } from "../lib/campaignRoundWork";
import { roundOffice, roundField, roundAssigned, roundTeamIds, canAccessGeneratedRound } from "../lib/campaignRoundAccess";
import { campaignProjection, campaignJoin } from "../lib/crewProjection";
import { withCampaignContractStates, campaignRoundNonmembers } from "../lib/campaignContractState";
import { campaignRoundActor } from "../lib/campaignRoundContext";
import { MoveCampaignRoundItemsBody, StartCampaignRoundBody, GetCampaignRoundListsResponse,
  GetCampaignRoundCalendarResponse, StartCampaignRoundResponse } from "@workspace/api-zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate);
export const roundOrderInput = z.object({ itemIds: z.array(z.string().min(1)).min(1).max(500).refine(ids => new Set(ids).size === ids.length),
  assignedCampaignCrewId: z.string().min(1).nullable(), beforeItemId: z.string().min(1).nullable().optional() }).strict();

export function registerCampaignRoundLists(app: Express) {
  // Runs before legacy handlers; does not replace any chemical action-role checks.
  app.use("/api/campaigns", async (req, res, next) => {
    if (!req.isAuthenticated?.()) { next(); return; }
    const user = req.user as UserWithContext;
    const match = /^\/([^/]+)(?:\/(items)\/([^/]+))?/.exec(req.path);
    if (!match) { next(); return; }
    const [round] = await db.select().from(campaigns).where(and(eq(campaigns.id, match[1]), eq(campaigns.companyId, user.activeCompanyId)));
    if (round?.source !== "contract") { next(); return; }
    if (["crew_supervisor", "irrigation_manager"].includes(user.accessRole) && !await canAccessGeneratedRound(user, round, match[3])) {
      res.sendStatus(403); return;
    }
    res.locals.generatedRound = true;
    if (round.status === "archived" && req.method !== "GET") {
      res.status(409).json({ error: "Archived round is read-only" }); return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ error: "Active company changed. Reload and try again." }); return;
    }
    if (roundField(user) && !roundAssigned(user, round) && !await canAccessGeneratedRound(user, round, match[3])) {
      res.status(403).json({ error: "Round is not started or this property is not on your crew list" }); return;
    }
    const forbidden = ["crewPosition", "crew_position", "assignedCampaignCrewId", "assigned_campaign_crew_id", "startedAt", "startedById", "started_at", "started_by_id"];
    if (req.method === "PATCH" && !req.path.endsWith("/crew") && forbidden.some(k => Object.hasOwn(req.body ?? {}, k))) {
      res.status(409).json({ error: "Use the round crew-list actions to change assignment or priority" }); return;
    }
    if (roundField(user) && !roundAssigned(user, round) && req.path.includes("/crews/") && req.method !== "GET") {
      res.sendStatus(403); return;
    }
    if (match[3] && req.body && ["targetDate", "backupDate", "completedAt", "completionDate", "workCompletedAt"].some(k =>
      req.body[k] != null && req.body[k] !== "" && !date.safeParse(req.body[k]).success)) {
      res.status(400).json({ error: "Use a valid YYYY-MM-DD calendar date" }); return;
    }
    campaignRoundActor.run(user, next);
  });
  app.get("/api/campaigns/:id/round-lists", async (req, res) => {
    if (!req.isAuthenticated()) { res.sendStatus(401); return; }
    const user = req.user as UserWithContext;
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, String(req.params.id)), eq(campaigns.companyId, user.activeCompanyId)));
    if (!campaign || campaign.source !== "contract") { res.sendStatus(404); return; }
    if (!["admin", "office", "field_manager", "chemical_manager", "irrigation_manager", "field", "landscape_supervisor", "crew_supervisor"].includes(user.accessRole)) {
      res.sendStatus(403); return;
    }
    let teams = await db.select(campaignProjection).from(campaignCrews).leftJoin(crews, campaignJoin)
      .where(and(eq(campaignCrews.companyId, user.activeCompanyId), eq(campaignCrews.campaignId, campaign.id))).orderBy(asc(campaignCrews.displayOrder));
    let items = await db.select().from(campaignItems).where(and(eq(campaignItems.companyId, user.activeCompanyId),
      eq(campaignItems.campaignId, campaign.id))).orderBy(asc(campaignItems.crewPosition), asc(campaignItems.id));
    if (roundField(user) && !roundAssigned(user, campaign)) {
      const ids = await roundTeamIds(user, campaign);
      teams = teams.filter(t => ids.includes(t.id)); items = items.filter(i => !!i.assignedCampaignCrewId && ids.includes(i.assignedCampaignCrewId));
    }
    const response = JSON.parse(JSON.stringify({ campaign, teams, items: await withCampaignContractStates(campaign, items),
      nonmembers: roundOffice(user) ? await campaignRoundNonmembers(campaign) : [],
      canManage: roundOffice(user), today: companyToday() }));
    GetCampaignRoundListsResponse.parse(response);
    res.set("Cache-Control", "no-store").json(response);
  });
  app.put("/api/campaigns/:id/round-order", async (req, res) => {
    if (!req.isAuthenticated()) { res.sendStatus(401); return; }
    const user = req.user as UserWithContext;
    if (!roundOffice(user)) { res.sendStatus(403); return; }
    const input = roundOrderInput.safeParse(MoveCampaignRoundItemsBody.safeParse(req.body).success ? req.body : null);
    if (!input.success) { res.status(400).json({ error: "Invalid priority move" }); return; }
    try { res.json(await moveRoundItems(user.activeCompanyId, String(req.params.id), input.data)); }
    catch (err) { if (err instanceof CrewLinkError) { res.status(err.status).json({ error: err.message }); return; } throw err; }
  });
  app.post("/api/campaigns/:id/copy-previous-split", async (req, res) => {
    if (!req.isAuthenticated()) { res.sendStatus(401); return; }
    const user = req.user as UserWithContext;
    if (!roundOffice(user)) { res.sendStatus(403); return; }
    try {
      const result = await db.transaction(async tx => {
        const round = await lockedRound(tx, user.activeCompanyId, String(req.params.id));
        if (!await previousRound(tx, round)) throw new CrewLinkError(409, "No previous round exists for this service");
        const previous = await previousRound(tx, round);
        const oldItems = await tx.select().from(campaignItems).where(and(eq(campaignItems.companyId, user.activeCompanyId),
          eq(campaignItems.campaignId, previous!.id)));
        const items = await tx.select().from(campaignItems).where(and(eq(campaignItems.companyId, user.activeCompanyId),
          eq(campaignItems.campaignId, round.id))).orderBy(asc(campaignItems.id)).for("update");
        for (const item of items.filter(i => i.status === "pending")) {
        const teamId = await inheritedRoundTeam(tx, round, item.customerId, previous.id);
          const old = oldItems.find(i => i.customerId === item.customerId);
          await tx.update(campaignItems).set({ assignedCampaignCrewId: teamId, crewPosition: old?.crewPosition ?? null, updatedAt: new Date() }).where(eq(campaignItems.id, item.id));
        }
        await denseRoundOrder(tx, user.activeCompanyId, round.id);
        return { updated: items.filter(i => i.status === "pending").length };
      });
      res.json(result);
    } catch (err) { if (err instanceof CrewLinkError) { res.status(err.status).json({ error: err.message }); return; } throw err; }
  });
  app.post("/api/campaigns/:id/start-round", async (req, res) => {
    if (!req.isAuthenticated()) { res.sendStatus(401); return; }
    const user = req.user as UserWithContext;
    if (!roundOffice(user)) { res.sendStatus(403); return; }
    if (!StartCampaignRoundBody.strict().safeParse(req.body).success) { res.status(400).json({ error: "Confirm the start-round warnings first" }); return; }
    try {
      const round = await db.transaction(async tx => {
        const round = await lockedRound(tx, user.activeCompanyId, String(req.params.id));
        if (round.status !== "active") throw new CrewLinkError(409, "Only an active round can be started");
        if (round.serviceKey === "backflow") throw new CrewLinkError(409, "Checklists are completed from their round page, not started on crew days");
        if (round.startedAt) return round;
        const [started] = await tx.update(campaigns).set({ startedAt: new Date(), startedById: user.id, updatedAt: new Date() })
          .where(eq(campaigns.id, round.id)).returning();
        return started;
      });
      StartCampaignRoundResponse.parse(JSON.parse(JSON.stringify(round)));
      res.json(round);
    } catch (err) { if (err instanceof CrewLinkError) { res.status(err.status).json({ error: err.message }); return; } throw err; }
  });
  app.get("/api/campaign-rounds/calendar", async (req, res) => {
    if (!req.isAuthenticated()) { res.sendStatus(401); return; }
    const user = req.user as UserWithContext;
    if (!["admin", "office", "field_manager", "chemical_manager", "irrigation_manager"].includes(user.accessRole)) { res.sendStatus(403); return; }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) { res.sendStatus(409); return; }
    const input = z.object({ from: date, through: date }).refine(v => v.from <= v.through).safeParse(req.query);
    if (!input.success) { res.status(400).json({ error: "Invalid date range" }); return; }
    // Chemical promised dates may fall outside their round window. Read that
    // owner's target date independently rather than clipping it to the bar.
    const rounds = await db.select().from(campaigns).where(and(eq(campaigns.companyId, user.activeCompanyId),
      eq(campaigns.source, "contract")));
    const output = [], chemicalItems = [];
    for (const round of rounds) {
      if (round.serviceKey === "backflow") continue;
      const scoped = roundField(user) && !roundAssigned(user, round);
      const authorizedTeams = scoped ? await roundTeamIds(user, round) : null;
      // Use the same start-gated projection for bars, counts, queue entries and
      // chemical dates. Never let the calendar become an alternate broad read.
      if (authorizedTeams && !authorizedTeams.length) continue;
      let teams = await db.select(campaignProjection).from(campaignCrews).leftJoin(crews, campaignJoin)
        .where(and(eq(campaignCrews.companyId, user.activeCompanyId), eq(campaignCrews.campaignId, round.id)));
      let items = await db.select().from(campaignItems).where(and(eq(campaignItems.companyId, user.activeCompanyId), eq(campaignItems.campaignId, round.id)));
      if (authorizedTeams) {
        teams = teams.filter(t => authorizedTeams.includes(t.id));
        items = items.filter(i => !!i.assignedCampaignCrewId && authorizedTeams.includes(i.assignedCampaignCrewId));
      }
      if (round.windowStart <= input.data.through && round.windowEnd >= input.data.from)
        output.push({ ...round, teams, remaining: items.filter(i => i.status === "pending").length,
          unassigned: items.filter(i => i.status === "pending" && !teams.some(t => t.id === i.assignedCampaignCrewId && t.crewId)).length });
      if (round.category === "chemical") for (const item of items) if (item.targetDate && item.targetDate >= input.data.from && item.targetDate <= input.data.through)
        chemicalItems.push({ ...item, crewId: teams.find(t => t.id === item.assignedCampaignCrewId)?.crewId ?? null });
    }
    const response = JSON.parse(JSON.stringify({ rounds: output, chemicalItems }));
    GetCampaignRoundCalendarResponse.parse(response);
    res.set("Cache-Control", "no-store").json(response);
  });
}
