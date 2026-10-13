import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { rateCardItems, insertRateCardItemSchema } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { pickProvided } from "../lib/patchBody";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";

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
