import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { classifyExtraBillableEligibility } from "../lib/extraBillableAccess";

type ParamsCampaign = { campaignId: string };
type ParamsCampaignItem = { campaignId: string; itemId: string };

export interface BillingDeps {
  storage: {
    getCampaignById: (id: string, companyId: string) => Promise<any>;
    getCampaignItems: (campaignId: string, companyId: string) => Promise<any[]>;
    getCampaignItemById: (itemId: string, companyId: string) => Promise<any>;
    getCampaignCrews: (campaignId: string, companyId: string) => Promise<any[]>;
    getCampaignCrewById: (crewId: string, companyId: string) => Promise<any>;
    getCampaignCrewMembers: (crewId: string) => Promise<{ userId: string }[]>;
    getCustomerById: (id: string, companyId: string) => Promise<any>;
    getUserById: (id: string) => Promise<{ name: string } | undefined>;
    createTicket: (insert: any) => Promise<{ id: string; currentStatusId?: string }>;
    updateTicket: (id: string, companyId: string, updates: any) => Promise<any>;
    updateCampaignItem: (id: string, companyId: string, updates: any) => Promise<any>;
    getTicketsByIds: (ids: string[], companyId: string) => Promise<any[]>;
    getTicketTypeStatuses: (ticketTypeId: string) => Promise<{ id: string; name: string }[]>;
  };
  ensureExtraBillableTicketType: (companyId: string) => Promise<{ typeId: string; statuses: Map<string, string> } | null>;
  copyPhoto: (
    srcKey: string,
    companyId: string,
    ticketId: string,
  ) => Promise<{ destKey: string | null; error: Error | null }>;
  logger?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void };
}

export function defaultLogger() {
  return {
    info: (msg: string) => console.log(msg),
    error: (msg: string, err?: unknown) => console.error(msg, err),
  };
}

function isAdminOffice(role: string | undefined): boolean {
  return role === "admin" || role === "office";
}

async function copyExtraBillablePhotosToTicket(
  deps: BillingDeps,
  sourceKeys: string[],
  companyId: string,
  ticketId: string,
): Promise<{ destKeys: string[]; failures: number }> {
  const destKeys: string[] = [];
  let failures = 0;
  for (const srcKey of sourceKeys) {
    const out = await deps.copyPhoto(srcKey, companyId, ticketId);
    if (out.destKey) destKeys.push(out.destKey);
    else failures += 1;
  }
  return { destKeys, failures };
}

async function generateExtraBillableTicketForItem(
  deps: BillingDeps,
  item: any,
  campaign: any,
  user: { id: string; activeCompanyId: string },
  ticketTypeInfo: { typeId: string; readyForBillingStatusId: string },
): Promise<{ ticketId: string; photoCopyFailures: number }> {
  if (!campaign) throw new Error("Campaign missing");
  if (!item.assignedCampaignCrewId) throw new Error("Item not assigned to a crew");

  const crew = await deps.storage.getCampaignCrewById(item.assignedCampaignCrewId, user.activeCompanyId);
  if (!crew) throw new Error("Crew not found");
  if (!crew.leaderUserId) throw new Error("Crew has no leader");
  const crewMembers = await deps.storage.getCampaignCrewMembers(crew.id);
  const memberUserIds = Array.from(new Set([crew.leaderUserId, ...crewMembers.map((m) => m.userId)]));

  const customer = await deps.storage.getCustomerById(item.customerId, user.activeCompanyId);
  const customerName = customer?.name || item.customerName;
  const city = (customer?.city || item.customerCity || "").trim();
  const rawTitle = `${campaign.title} — ${customerName}${city ? ` (${city})` : ""}`;
  const title = rawTitle.length > 200 ? rawTitle.slice(0, 200) : rawTitle;

  const leaderUser = await deps.storage.getUserById(crew.leaderUserId);
  const memberNames: string[] = [];
  for (const uid of memberUserIds) {
    const u = await deps.storage.getUserById(uid);
    if (u) memberNames.push(u.name);
  }
  const photoCount = (item.completionPhotoStorageKeys || []).length;
  const completedAtStr = item.completedAt ? new Date(item.completedAt).toISOString().split("T")[0] : "n/a";
  const description = [
    `Campaign: ${campaign.title}`,
    `Window: ${campaign.windowStart} → ${campaign.windowEnd}`,
    `Crew: ${crew.name}`,
    `Leader: ${leaderUser?.name || crew.leaderUserId}`,
    memberNames.length > 0 ? `Members: ${memberNames.join(", ")}` : null,
    `Completed: ${completedAtStr}`,
    `Photos copied: ${photoCount}`,
    item.notes ? `Field notes: ${item.notes}` : null,
    item.estimatedAmount ? `Estimated $: ${item.estimatedAmount}` : null,
  ].filter(Boolean).join("\n");

  const ticket = await deps.storage.createTicket({
    companyId: user.activeCompanyId,
    ticketTypeId: ticketTypeInfo.typeId,
    currentStatusId: ticketTypeInfo.readyForBillingStatusId,
    title,
    description,
    customerId: item.customerId,
    assignedToId: user.id,
    createdById: user.id,
    priority: "normal",
    workType: "extra_work",
    billingBehavior: "invoice_required",
    leadTechUserId: crew.leaderUserId,
    crewMemberUserIds: memberUserIds,
    workCompletedDate: item.completedAt ? new Date(item.completedAt) : new Date(),
  });

  const sourceKeys = item.completionPhotoStorageKeys || [];
  const { destKeys, failures } = await copyExtraBillablePhotosToTicket(deps, sourceKeys, user.activeCompanyId, ticket.id);
  if (destKeys.length > 0) {
    await deps.storage.updateTicket(ticket.id, user.activeCompanyId, { completionPhotoStorageKeys: destKeys });
  }
  await deps.storage.updateCampaignItem(item.id, user.activeCompanyId, {
    billingStatus: "ticket_created",
    ticketId: ticket.id,
    updatedAt: new Date(),
  });
  (deps.logger ?? defaultLogger()).info(
    `Generated Extra Billable ticket ${ticket.id} for campaign item ${item.id} (campaign ${campaign.id}) by user ${user.id}`,
  );
  return { ticketId: ticket.id, photoCopyFailures: failures };
}

async function resolveTicketTypeInfo(deps: BillingDeps, companyId: string) {
  const info = await deps.ensureExtraBillableTicketType(companyId);
  if (!info) return null;
  const readyForBillingStatusId = info.statuses.get("Ready for Billing");
  if (!readyForBillingStatusId) return null;
  return { typeId: info.typeId, readyForBillingStatusId };
}

export function registerExtraBillableBillingRoutes(app: Express, deps: BillingDeps) {
  app.get("/api/campaigns/:campaignId/billing-summary", async (req: Request<ParamsCampaign>, res: Response) => {
    if (!req.isAuthenticated?.()) return res.status(401).send("Not authenticated");
    const user = req.user as any;
    if (!isAdminOffice(user?.activeRole)) return res.status(403).send("Insufficient permissions");
    const campaign = await deps.storage.getCampaignById(req.params.campaignId, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.category !== "extra_billable") {
      return res.status(400).json({ error: "Billing queue only available on extra-billable campaigns" });
    }
    const items = await deps.storage.getCampaignItems(req.params.campaignId, user.activeCompanyId);
    const crews = await deps.storage.getCampaignCrews(req.params.campaignId, user.activeCompanyId);
    const leaderById = new Map<string, string | null>();
    crews.forEach(c => leaderById.set(c.id, c.leaderUserId || null));

    let totalCompleted = 0;
    let totalSkipped = 0;
    let totalPending = 0;
    let ticketsCreated = 0;
    let notYetCreated = 0;
    let estimatedSum = 0;
    let estimatedHasAny = false;
    const ineligibleItems: Array<{ itemId: string; customerName: string; reason: "no_crew_assigned" | "crew_has_no_leader" }> = [];
    const billedItemTicketPairs: Array<{ itemId: string; customerName: string; ticketId: string }> = [];

    for (const item of items) {
      if (item.status === "completed") totalCompleted += 1;
      else if (item.status === "skipped") totalSkipped += 1;
      else totalPending += 1;
      if (item.ticketId) {
        ticketsCreated += 1;
        billedItemTicketPairs.push({ itemId: item.id, customerName: item.customerName, ticketId: item.ticketId });
      }
      if (item.estimatedAmount) {
        estimatedHasAny = true;
        estimatedSum += Number(item.estimatedAmount);
      }
      const cls = classifyExtraBillableEligibility(item, leaderById);
      if (cls.eligible) {
        notYetCreated += 1;
      } else if (item.status === "completed" && cls.reason !== "already_billed") {
        ineligibleItems.push({ itemId: item.id, customerName: item.customerName, reason: cls.reason });
      }
    }

    const ticketIds = billedItemTicketPairs.map(p => p.ticketId);
    let billedTickets: Array<{ itemId: string; customerName: string; ticketId: string; currentStatusId: string | null; currentStatusName: string | null }> = [];
    if (ticketIds.length > 0) {
      const tickets = await deps.storage.getTicketsByIds(ticketIds, user.activeCompanyId);
      const ticketById = new Map(tickets.map(t => [t.id, t]));
      const ttypeInfo = await deps.ensureExtraBillableTicketType(user.activeCompanyId);
      const statuses = ttypeInfo ? await deps.storage.getTicketTypeStatuses(ttypeInfo.typeId) : [];
      const statusNameById = new Map(statuses.map(s => [s.id, s.name]));
      billedTickets = billedItemTicketPairs.map(p => {
        const t = ticketById.get(p.ticketId);
        const csid: string | null = t?.currentStatusId ?? null;
        return {
          itemId: p.itemId,
          customerName: p.customerName,
          ticketId: p.ticketId,
          currentStatusId: csid,
          currentStatusName: csid ? (statusNameById.get(csid) ?? null) : null,
        };
      });
    }

    return res.json({
      totalCompleted,
      totalSkipped,
      totalPending,
      ticketsCreated,
      notYetCreated,
      ineligibleItems,
      billedTickets,
      estimatedAmountTotal: estimatedHasAny ? estimatedSum : null,
    });
  });

  app.post("/api/campaigns/:campaignId/generate-tickets", async (req: Request<ParamsCampaign>, res: Response) => {
    if (!req.isAuthenticated?.()) return res.status(401).send("Not authenticated");
    const user = req.user as any;
    if (!isAdminOffice(user?.activeRole)) return res.status(403).send("Insufficient permissions");
    const campaign = await deps.storage.getCampaignById(req.params.campaignId, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.category !== "extra_billable") {
      return res.status(400).json({ error: "Generate tickets only available on extra-billable campaigns" });
    }

    const requestedIds: string[] | undefined = Array.isArray(req.body?.itemIds) ? req.body.itemIds : undefined;
    const allItems = await deps.storage.getCampaignItems(req.params.campaignId, user.activeCompanyId);
    const crews = await deps.storage.getCampaignCrews(req.params.campaignId, user.activeCompanyId);
    const leaderById = new Map<string, string | null>();
    crews.forEach(c => leaderById.set(c.id, c.leaderUserId || null));

    let candidateItems = allItems;
    if (requestedIds) {
      const itemById = new Map(allItems.map(i => [i.id, i]));
      const missingItemIds = requestedIds.filter(id => !itemById.has(id));
      if (missingItemIds.length > 0) {
        return res.status(400).json({
          error: "Some requested items are not on this campaign",
          missingItemIds,
        });
      }
      const subset = requestedIds.map(id => itemById.get(id)!);
      const ineligibleRequested: string[] = [];
      for (const it of subset) {
        const cls = classifyExtraBillableEligibility(it, leaderById);
        if (!cls.eligible && cls.reason !== "already_billed") ineligibleRequested.push(it.id);
      }
      if (ineligibleRequested.length > 0) {
        return res.status(400).json({
          error: "Some requested items are not eligible",
          ineligibleItemIds: ineligibleRequested,
        });
      }
      candidateItems = subset;
    }

    const ticketTypeInfo = await resolveTicketTypeInfo(deps, user.activeCompanyId);
    if (!ticketTypeInfo) {
      return res.status(500).json({ error: "Extra Billable ticket type or 'Ready for Billing' status not configured" });
    }

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{ itemId: string; customerName: string; success: boolean; ticketId?: string; error?: string; photoCopyFailures?: number }> = [];

    for (const item of candidateItems) {
      const cls = classifyExtraBillableEligibility(item, leaderById);
      if (!cls.eligible) {
        skipped += 1;
        results.push({ itemId: item.id, customerName: item.customerName, success: false, error: cls.reason });
        continue;
      }
      try {
        const out = await generateExtraBillableTicketForItem(deps, item, campaign, user, ticketTypeInfo);
        generated += 1;
        results.push({
          itemId: item.id,
          customerName: item.customerName,
          success: true,
          ticketId: out.ticketId,
          photoCopyFailures: out.photoCopyFailures,
        });
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        (deps.logger ?? defaultLogger()).error(`Extra Billable bulk generation failed for item ${item.id}:`, err);
        results.push({ itemId: item.id, customerName: item.customerName, success: false, error: msg });
      }
    }

    return res.json({ generated, skipped, failed, results });
  });

  app.post("/api/campaigns/:campaignId/items/:itemId/generate-ticket", async (req: Request<ParamsCampaignItem>, res: Response) => {
    if (!req.isAuthenticated?.()) return res.status(401).send("Not authenticated");
    const user = req.user as any;
    if (!isAdminOffice(user?.activeRole)) return res.status(403).send("Insufficient permissions");
    const campaign = await deps.storage.getCampaignById(req.params.campaignId, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.category !== "extra_billable") {
      return res.status(400).json({ error: "Generate ticket only available on extra-billable campaigns" });
    }
    const item = await deps.storage.getCampaignItemById(req.params.itemId, user.activeCompanyId);
    if (!item || item.campaignId !== req.params.campaignId) {
      return res.status(404).json({ error: "Item not found on this campaign" });
    }
    const crews = await deps.storage.getCampaignCrews(req.params.campaignId, user.activeCompanyId);
    const leaderById = new Map<string, string | null>();
    crews.forEach(c => leaderById.set(c.id, c.leaderUserId || null));
    const cls = classifyExtraBillableEligibility(item, leaderById);
    if (!cls.eligible) {
      return res.status(400).json({ error: "Item not eligible", reason: cls.reason });
    }
    const ticketTypeInfo = await resolveTicketTypeInfo(deps, user.activeCompanyId);
    if (!ticketTypeInfo) {
      return res.status(500).json({ error: "Extra Billable ticket type or 'Ready for Billing' status not configured" });
    }
    try {
      const out = await generateExtraBillableTicketForItem(deps, item, campaign, user, ticketTypeInfo);
      return res.json({ success: true, ticketId: out.ticketId, photoCopyFailures: out.photoCopyFailures });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      (deps.logger ?? defaultLogger()).error(`Extra Billable single generation failed for item ${item.id}:`, err);
      return res.status(500).json({ error: msg });
    }
  });
}

export function makeBucketCopyPhotoFn(objectStorageClient: any, bucketId: string | undefined) {
  return async function copyPhoto(srcKey: string, companyId: string, ticketId: string) {
    if (!bucketId) return { destKey: null, error: new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set") };
    try {
      const trimmed = srcKey.replace(/^\//, "");
      const parts = trimmed.split("/");
      let srcBucketName = bucketId;
      let srcObjectName = trimmed;
      if (parts.length > 1 && parts[0] === bucketId) {
        srcBucketName = parts[0];
        srcObjectName = parts.slice(1).join("/");
      }
      const destObject = `ticket-photos/${companyId}/${ticketId}/${randomUUID()}.jpg`;
      const srcFile = objectStorageClient.bucket(srcBucketName).file(srcObjectName);
      const dstFile = objectStorageClient.bucket(bucketId).file(destObject);
      await srcFile.copy(dstFile);
      return { destKey: destObject, error: null };
    } catch (err) {
      return { destKey: null, error: err as Error };
    }
  };
}
