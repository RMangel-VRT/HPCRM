import { Router, type Express, type RequestHandler } from "express";
import { z } from "zod/v4";
import { createQuickItemSchema, patchQuickItemSchema } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { estimateAccess } from "../lib/estimateAccess";
import { estimateQuickCatalog } from "../services/estimateQuickItems";
import { previewEstimateRates } from "../services/estimateRates";
import { logger } from "../lib/logger";

const handle = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (err) {
    const error = err as { code?: string; cause?: { code?: string }; status?: number; message?: string };
    if (error.code === "23505" || error.cause?.code === "23505") {
      res.status(409).json({ message: "An equipment or fee item with this label already exists" }); return;
    }
    if (error.status && error.status >= 400 && error.status < 500) {
      res.status(error.status).json({ message: error.message }); return;
    }
    logger.error({ err }, "Estimate setup request failed");
    res.status(500).json({ message: "Estimate setup request failed" });
  }
};
export function registerEstimateSetupRoutes(app: Express) {
  const quick = Router();
  quick.use(estimateAccess);
  quick.get("/", handle(async (req, res) => {
    const parsed = z.enum(["equipment", "fee"]).optional().safeParse(req.query.kind);
    if (!parsed.success) { res.status(400).json({ message: "Invalid kind" }); return; }
    res.json(await estimateQuickCatalog.list((req.user as UserWithContext).activeCompanyId, parsed.data));
  }));
  quick.post("/", handle(async (req, res) => {
    const parsed = createQuickItemSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }); return; }
    res.status(201).json(await estimateQuickCatalog.create((req.user as UserWithContext).activeCompanyId, parsed.data));
  }));
  quick.patch("/:id", handle(async (req, res) => {
    const parsed = patchQuickItemSchema.safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length) { res.status(400).json({ message: "Provide valid fields to update" }); return; }
    const row = await estimateQuickCatalog.update((req.user as UserWithContext).activeCompanyId, String(req.params.id), parsed.data);
    if (!row) { res.status(404).json({ message: "Item not found" }); return; }
    res.json(row);
  }));
  quick.delete("/:id", handle(async (req, res) => {
    const row = await estimateQuickCatalog.update((req.user as UserWithContext).activeCompanyId, String(req.params.id), { isActive: false });
    if (!row) { res.status(404).json({ message: "Item not found" }); return; }
    res.json(row);
  }));
  app.use("/api/quick-items", quick);
  app.get("/api/estimates/rates/preview", estimateAccess, handle(async (req, res) => {
    const customer = z.string().trim().min(1).safeParse(req.query.customerId);
    if (!customer.success) { res.status(400).json({ message: "customerId is required" }); return; }
    res.json(await previewEstimateRates((req.user as UserWithContext).activeCompanyId, customer.data));
  }));
}
