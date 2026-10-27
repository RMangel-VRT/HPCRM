import express, { type Express, type RequestHandler, type ErrorRequestHandler } from "express";
import multer from "multer";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { createHardscapeBody, patchHardscapeBody, importHardscapeCsv, exportHardscapeCsv } from "../lib/hardscapeCsv";
import { logger } from "../lib/logger";
import { companyDateString } from "../lib/companyDay";
import { irrigationCatalog } from "../lib/irrigationCatalog";
import { registerEstimateSetupRoutes } from "./estimateSetup";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const gate: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!user.activeCompanyId || !["admin", "office"].includes(user.activeRole)) {
    res.status(403).json({ message: "Access denied" }); return;
  }
  // A request queued by the old company must not read/write the new company's
  // catalog when a session switch wins the race to the server.
  const expectedCompany = req.get("X-Company-Id");
  if (expectedCompany && expectedCompany !== user.activeCompanyId) {
    res.status(409).json({ message: "Active company changed. Reload the catalog and try again." }); return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  next();
};
const company = (req: express.Request) => (req.user as UserWithContext).activeCompanyId;
const wrap = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if ((pg.code ?? pg.cause?.code) === "23505") { res.status(409).json({ message: "Duplicate SKU" }); return; }
    logger.error({ err: error }, "Hardscape catalog request failed");
    res.status(500).json({ message: "Unable to save or load catalog" });
  }
};
export function registerCatalogRoutes(app: Express): void {
  registerEstimateSetupRoutes(app);
  const router = express.Router();
  router.use(gate);
  router.get("/", wrap(async (req, res) => {
    res.json(await storage.getHardscapeCatalog(company(req), {
      search: typeof req.query.search === "string" ? req.query.search.trim() : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      includeInactive: req.query.includeInactive === "true" || req.query.includeInactive === "1",
    }));
  }));
  router.get("/export-csv", wrap(async (req, res) => {
    const { items } = await storage.getHardscapeCatalog(company(req), { includeInactive: true });
    res.setHeader("Content-Disposition", `attachment; filename="hardscape-catalog-${companyDateString(new Date())}.csv"`);
    res.type("text/csv").send(exportHardscapeCsv(items));
  }));
  router.post("/import-csv", upload.single("file"), express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }), wrap(async (req, res) => {
    const text = req.file?.buffer.toString("utf8") ?? (typeof req.body === "string" ? req.body : req.body?.csv);
    if (typeof text !== "string") { res.status(400).json({ message: "CSV file or text required" }); return; }
    // Validate the whole header before writing any row.
    let result;
    try {
      result = await importHardscapeCsv(text, data => storage.upsertHardscapeCatalogItem(company(req), data));
    } catch (error) { res.status(400).json({ message: (error as Error).message }); return; }
    res.json(result);
  }));
  router.post("/", wrap(async (req, res) => {
    const parsed = createHardscapeBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Invalid material", errors: parsed.error.issues }); return; }
    res.status(201).json(await storage.createHardscapeCatalogItem(company(req), parsed.data));
  }));
  router.patch("/:id", wrap(async (req, res) => {
    const parsed = patchHardscapeBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Invalid material", errors: parsed.error.issues }); return; }
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    const item = await storage.updateHardscapeCatalogItem(company(req), String(req.params.id), data);
    if (!item) { res.status(404).json({ message: "Material not found" }); return; }
    res.json(item);
  }));
  router.delete("/:id", wrap(async (req, res) => {
    const item = await storage.updateHardscapeCatalogItem(company(req), String(req.params.id), { isActive: false });
    if (!item) { res.status(404).json({ message: "Material not found" }); return; }
    res.json(item);
  }));
  const uploadError: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof multer.MulterError || error.type === "entity.too.large") {
      res.status(400).json({ message: error.code === "LIMIT_FILE_SIZE" || error.type === "entity.too.large"
        ? "CSV exceeds the 5 MB upload limit" : "Invalid CSV upload" }); return;
    }
    next(error);
  };
  router.use(uploadError);
  app.use("/api/hardscape-catalog", router);

  const irrigation = express.Router();
  irrigation.use(gate);
  irrigation.get("/", wrap(async (req, res) => {
    const allowed = ["search", "category", "brand", "includeInactive"];
    if (Object.entries(req.query).some(([key, value]) => !allowed.includes(key) || typeof value !== "string" || value.length > 500) ||
      (req.query.includeInactive !== undefined && !["true", "false", "1", "0"].includes(String(req.query.includeInactive)))) {
      res.status(400).json({ message: "Invalid irrigation catalog filters" }); return;
    }
    res.json(await irrigationCatalog.list(company(req), {
      search: (req.query.search as string | undefined)?.trim(),
      category: req.query.category as string | undefined,
      brand: req.query.brand as string | undefined,
      includeInactive: req.query.includeInactive === "true" || req.query.includeInactive === "1",
    }));
  }));
  irrigation.get("/sync-runs", wrap(async (req, res) => {
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (typeof req.query.limit !== "undefined" && (typeof req.query.limit !== "string" || !/^\d+$/.test(req.query.limit)) ||
      !Number.isInteger(limit) || limit < 1 || limit > 50) {
      res.status(400).json({ message: "History limit must be an integer from 1 to 50" }); return;
    }
    res.json(await irrigationCatalog.history(company(req), limit));
  }));
  irrigation.post("/import", upload.single("file"), wrap(async (req, res) => {
    if (!req.file) { res.status(400).json({ message: "CSV file required" }); return; }
    // Retain only the upload's basename, never a client path or control characters.
    const filename = req.file.originalname.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255);
    const { run, httpStatus } = await irrigationCatalog.import(company(req), (req.user as UserWithContext).id, filename, req.file.buffer.toString("utf8"));
    if (httpStatus !== 200) { res.status(httpStatus).json({ message: run.errorMessage, run }); return; }
    res.json(run);
  }));
  irrigation.use(uploadError);
  app.use("/api/irrigation-catalog", irrigation);
}
