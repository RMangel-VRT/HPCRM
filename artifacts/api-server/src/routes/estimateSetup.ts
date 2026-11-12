import express, { Router, type Express, type RequestHandler, type ErrorRequestHandler } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { createQuickItemSchema, patchQuickItemSchema, QUICK_ITEM_KINDS, createServiceCategorySchema, patchServiceCategorySchema } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { estimateAccess } from "../lib/estimateAccess";
import { estimateQuickCatalog } from "../services/estimateQuickItems";
import { estimateCategoryCatalog } from "../services/estimateServiceCategories";
import { previewEstimateRates } from "../services/estimateRates";
import { logger } from "../lib/logger";
import { exportQuickItemCsv, importQuickItemCsv, QUICK_ITEM_CSV_SCOPES } from "../lib/quickItemCsv";
import { upsertQuickItemCsv } from "../services/quickItemCsv";
import { companyDateString } from "../lib/companyDay";

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 5 * 1024 * 1024 } });

const handle = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (err) {
    const error = err as { code?: string; cause?: { code?: string }; status?: number; message?: string };
    if (error.code === "23505" || error.cause?.code === "23505") {
      res.status(409).json({ message: req.baseUrl.includes("service-categories") ? "A category with this name already exists" : "An item with this name already exists" }); return;
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
  const csvScope: RequestHandler = (req, res, next) => {
    if (!req.get("X-Company-Id")) { res.status(400).json({ message: "X-Company-Id is required for CSV requests" }); return; }
    if (!z.enum(QUICK_ITEM_CSV_SCOPES).safeParse(req.query.scope).success) {
      res.status(400).json({ message: "Choose catalog scope: services or equipment-fees" }); return;
    }
    next();
  };
  quick.get("/export-csv", csvScope, handle(async (req, res) => {
    const scope = z.enum(QUICK_ITEM_CSV_SCOPES).parse(req.query.scope);
    const items = await estimateQuickCatalog.list((req.user as UserWithContext).activeCompanyId);
    const csv = exportQuickItemCsv(items, scope);
    res.setHeader("Content-Disposition", `attachment; filename="${scope}-catalog-${companyDateString(new Date())}.csv"`);
    res.type("text/csv").send(csv);
  }));
  quick.post("/import-csv", csvScope, csvUpload.single("file"),
    express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }), handle(async (req, res) => {
      const text = req.file?.buffer.toString("utf8") ?? (typeof req.body === "string" ? req.body : req.body?.csv);
      if (typeof text !== "string") { res.status(400).json({ message: "CSV file or text required" }); return; }
      if (Buffer.byteLength(text, "utf8") > 5 * 1024 * 1024) { res.status(400).json({ message: "CSV exceeds the 5 MB upload limit" }); return; }
      const companyId = (req.user as UserWithContext).activeCompanyId;
      try {
        res.json(await importQuickItemCsv(text, z.enum(QUICK_ITEM_CSV_SCOPES).parse(req.query.scope), data => upsertQuickItemCsv(companyId, data)));
      } catch (error) { res.status(400).json({ message: (error as Error).message }); }
    }));
  quick.get("/", handle(async (req, res) => {
    const parsed = z.enum(QUICK_ITEM_KINDS).optional().safeParse(req.query.kind);
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
  const uploadError: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof multer.MulterError || error.type === "entity.too.large") {
      res.status(400).json({ message: error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FIELD_VALUE" || error.type === "entity.too.large"
        ? "CSV exceeds the 5 MB upload limit" : "Invalid CSV upload" }); return;
    }
    next(error);
  };
  quick.use(uploadError);
  app.use("/api/quick-items", quick);
  const categories = Router();
  categories.use(estimateAccess);
  categories.get("/", handle(async (req, res) => {
    res.json(await estimateCategoryCatalog.list((req.user as UserWithContext).activeCompanyId));
  }));
  categories.post("/", handle(async (req, res) => {
    const parsed = createServiceCategorySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }); return; }
    res.status(201).json(await estimateCategoryCatalog.create((req.user as UserWithContext).activeCompanyId, parsed.data));
  }));
  categories.patch("/:id", handle(async (req, res) => {
    const parsed = patchServiceCategorySchema.safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length) { res.status(400).json({ message: "Provide valid fields to update" }); return; }
    const row = await estimateCategoryCatalog.update((req.user as UserWithContext).activeCompanyId, String(req.params.id), parsed.data);
    if (!row) { res.status(404).json({ message: "Category not found" }); return; }
    res.json(row);
  }));
  app.use("/api/estimates/service-categories", categories);
  app.get("/api/estimates/rates/preview", estimateAccess, handle(async (req, res) => {
    const customer = z.string().trim().min(1).safeParse(req.query.customerId);
    if (!customer.success) { res.status(400).json({ message: "customerId is required" }); return; }
    res.json(await previewEstimateRates((req.user as UserWithContext).activeCompanyId, customer.data));
  }));
}
