import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  rateCardItems, insertRateCardItemSchema, contracts, contractServices, contractMonthlyAmounts,
  contractDocuments, contractStatusHistory, customerServicePlans, customerRateSheets,
  customers, propertyManagementCompanies, termLegacySources,
} from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { pickProvided } from "../lib/patchBody";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";
import { planLegacyCopy } from "../lib/contractCenterCopy";
import { executeLegacyCopy } from "../lib/contractCenterCopyExecution";
import { registerContractCenterLifecycle } from "./contractCenterLifecycle";

function authorize(req: Request, res: Response, allowOffice: boolean): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const user = req.user as UserWithContext;
  if (!user.isSuperAdminBool && user.activeRole !== "admin" && !(allowOffice && user.activeRole === "office")) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  if (!user.activeCompanyId) {
    res.status(403).json({ message: "No active company" });
    return null;
  }
  return user;
}

function adminOrOffice(req: Request, res: Response) {
  return authorize(req, res, true);
}

function adminOnly(req: Request, res: Response) {
  return authorize(req, res, false);
}

// Reuse the foundation schema, restricting the API's writable surface.
const createRateSchema = insertRateCardItemSchema.omit({
  companyId: true, sortOrder: true, active: true,
}).extend({
  rateKey: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/, "Use 2–63 lowercase letters, numbers or underscores, starting with a letter"),
  label: z.string().trim().min(1),
  category: z.string().trim().min(1),
  priceCents: z.number().int().min(0).max(2147483647).nullable().optional(),
  priceText: z.string().max(60).nullable().optional(),
  unit: z.string().min(1).max(80),
  minimum: z.string().max(40).nullable().optional(),
});
const updateRateSchema = createRateSchema.omit({ rateKey: true, line: true }).extend({
  sortOrder: z.number().int().min(-2147483648).max(2147483647),
  active: z.boolean(),
}).partial();

export function registerContractCenterRoutes(app: Express): void {
  registerContractCenterLifecycle(app, adminOrOffice);
  app.get("/api/contract-center/copy-status", async (req, res) => {
    const user = adminOrOffice(req, res);
    if (!user) return;
    const [status] = await db.select({
      firstCopiedAt: sql<string | null>`min(${termLegacySources.createdAt})`,
      copiedContracts: sql<number>`count(distinct ${termLegacySources.legacyContractId})::integer`,
    }).from(termLegacySources).where(eq(termLegacySources.companyId, user.activeCompanyId));
    res.json({ firstCopiedAt: status?.firstCopiedAt ?? null, copiedContracts: status?.copiedContracts ?? 0 });
  });
  app.post("/api/admin/contract-center/copy-legacy", async (req, res) => {
    const user = adminOnly(req, res);
    if (!user) return;
    const parsed = z.object({ dryRun: z.boolean().default(true) }).strict().safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Expected { dryRun?: boolean }" });
      return;
    }
    const companyId = user.activeCompanyId;
    const rateCard = await db.select().from(rateCardItems).where(eq(rateCardItems.companyId, companyId));
    if (!rateCard.length) {
      res.status(409).json({ message: "Load the standard rates first (Settings › Contracts)" });
      return;
    }
    const [oldContracts, services, monthlyAmounts, documents, history, servicePlans, rateSheets, customerRows, managementCompanies, legacySources] = await Promise.all([
      db.select().from(contracts).where(eq(contracts.companyId, companyId)),
      db.select().from(contractServices).where(eq(contractServices.companyId, companyId)),
      db.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
      db.select().from(contractDocuments).where(eq(contractDocuments.companyId, companyId)),
      db.select({ history: contractStatusHistory }).from(contractStatusHistory)
        .innerJoin(contracts, eq(contractStatusHistory.contractId, contracts.id))
        .where(eq(contracts.companyId, companyId)),
      db.select().from(customerServicePlans).where(eq(customerServicePlans.companyId, companyId)),
      db.select().from(customerRateSheets).where(eq(customerRateSheets.companyId, companyId)),
      db.select().from(customers).where(eq(customers.companyId, companyId)),
      db.select().from(propertyManagementCompanies).where(eq(propertyManagementCompanies.companyId, companyId)),
      db.select().from(termLegacySources).where(eq(termLegacySources.companyId, companyId)),
    ]);
    const plan = planLegacyCopy({ companyId, contracts: oldContracts, services, monthlyAmounts, documents,
      history: history.map(row => row.history), servicePlans, rateSheets, customers: customerRows,
      managementCompanies, legacySources, rateCard }, parsed.data.dryRun);
    res.json(parsed.data.dryRun ? plan.report : await executeLegacyCopy(plan, companyId, user.id));
  });

  app.get("/api/contract-center/rate-card", async (req, res) => {
    const user = adminOrOffice(req, res);
    if (!user) return;
    const rows = await db.select().from(rateCardItems)
      .where(eq(rateCardItems.companyId, user.activeCompanyId))
      .orderBy(rateCardItems.line, rateCardItems.sortOrder, rateCardItems.label);
    res.json(rows);
  });

  app.post("/api/contract-center/rate-card/seed-defaults", async (req, res) => {
    const user = adminOnly(req, res);
    if (!user) return;
    const inserted = await db.insert(rateCardItems)
      .values(RATE_CARD_DEFAULTS.map(({ key, ...rate }, sortOrder) => ({
        ...rate, rateKey: key, companyId: user.activeCompanyId, sortOrder,
      })))
      .onConflictDoNothing({ target: [rateCardItems.companyId, rateCardItems.rateKey] })
      .returning({ id: rateCardItems.id });
    res.json({ inserted: inserted.length, skipped: RATE_CARD_DEFAULTS.length - inserted.length });
  });

  app.post("/api/contract-center/rate-card", async (req, res) => {
    const user = adminOnly(req, res);
    if (!user) return;
    const parsed = createRateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    // Conflict-ignore is race-safe, unlike a separate duplicate lookup.
    const [row] = await db.insert(rateCardItems)
      .values({ ...parsed.data, companyId: user.activeCompanyId })
      .onConflictDoNothing({ target: [rateCardItems.companyId, rateCardItems.rateKey] })
      .returning();
    if (!row) {
      res.status(409).json({ message: "A rate with this key already exists" });
      return;
    }
    res.status(201).json(row);
  });

  app.patch("/api/contract-center/rate-card/:id", async (req, res) => {
    const user = adminOnly(req, res);
    if (!user) return;
    // Ignore immutable identifiers even when their supplied values are invalid.
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== "rateKey" && key !== "line"))
      : req.body;
    const parsed = updateRateSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    const updates = pickProvided(parsed.data, body);
    if (!Object.keys(updates).length) {
      res.status(400).json({ message: "Nothing to update" });
      return;
    }
    const [row] = await db.update(rateCardItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(rateCardItems.id, req.params.id as string), eq(rateCardItems.companyId, user.activeCompanyId)))
      .returning();
    if (!row) {
      res.status(404).json({ message: "Rate not found" });
      return;
    }
    res.json(row);
  });
}
