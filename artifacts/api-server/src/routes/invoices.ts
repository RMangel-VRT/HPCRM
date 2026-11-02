import { Router, type Express, type RequestHandler } from "express";
import { z } from "zod/v4";
import { createInvoiceSchema, patchInvoiceSchema, createInvoiceLineSchema, patchInvoiceLineSchema,
  reorderInvoiceLinesSchema, cancelInvoiceSchema, invoiceListQuerySchema, invoiceIdSchema } from "@workspace/db/invoice-contracts";
import type { UserWithContext } from "../auth";
import { invoiceAccess } from "../lib/invoiceAccess";
import { logger } from "../lib/logger";
import { InvoiceError } from "../services/invoiceErrors";
import { postgresCode } from "../services/estimateErrors";
import { isInvoiceCenterEnabled } from "../services/invoiceFeature";
import { listInvoices, readInvoice, readInvoiceEvents } from "../services/invoiceReads";
import { renderInvoicePdf } from "../services/invoicePdf";
import { createDraftInvoice, patchDraftInvoice, createInvoiceLine, patchInvoiceLine,
  deleteInvoiceLine, reorderInvoiceLines, cancelDraftInvoice } from "../services/invoices";

const handle = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
    if (error instanceof InvoiceError) { res.status(error.status).json({ error: error.error }); return; }
    if (error instanceof RangeError) { res.status(422).json({ error: "AMOUNT_OUT_OF_RANGE" }); return; }
    const code = postgresCode(error);
    if (code === "23505") { res.status(409).json({ error: "CONFLICT" }); return; }
    if (code === "22003") { res.status(422).json({ error: "AMOUNT_OUT_OF_RANGE" }); return; }
    // Never log PostgreSQL detail, message, raw errors or request bodies.
    (req.log ?? logger).error({ code: code && /^[0-9A-Z]{5}$/.test(code) ? code : "INVOICE_ERROR" }, "Invoice request failed");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
};
const path = z.object({ id: invoiceIdSchema, lineId: invoiceIdSchema.optional() });
export function registerInvoiceRoutes(app: Express) {
  const router = Router();
  router.use(invoiceAccess);
  router.use(handle(async (req, res, next) => {
    if (!await isInvoiceCenterEnabled((req.user as UserWithContext).activeCompanyId)) {
      res.status(404).json({ error: "INVOICE_CENTER_DISABLED" }); return;
    }
    next();
  }));
  router.get("/", handle(async (req, res) => {
    res.json(await listInvoices((req.user as UserWithContext).activeCompanyId, invoiceListQuerySchema.parse(req.query)));
  }));
  router.post("/", handle(async (req, res) => {
    const u = req.user as UserWithContext;
    res.status(201).json(await createDraftInvoice(u.activeCompanyId, u.id, createInvoiceSchema.parse(req.body)));
  }));
  router.get("/:id", handle(async (req, res) => {
    res.json(await readInvoice((req.user as UserWithContext).activeCompanyId, path.parse(req.params).id));
  }));
  router.get("/:id/pdf", handle(async (req, res) => {
    const result = await renderInvoicePdf((req.user as UserWithContext).activeCompanyId, path.parse(req.params).id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${result.filename.replace(/[^A-Za-z0-9_.-]/g, "_")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(result.buffer);
  }));
  router.patch("/:id", handle(async (req, res) => {
    const u = req.user as UserWithContext;
    res.json(await patchDraftInvoice(u.activeCompanyId, u.id, path.parse(req.params).id, patchInvoiceSchema.parse(req.body)));
  }));
  router.post("/:id/lines", handle(async (req, res) => {
    const u = req.user as UserWithContext;
    res.status(201).json(await createInvoiceLine(u.activeCompanyId, u.id, path.parse(req.params).id, createInvoiceLineSchema.parse(req.body)));
  }));
  router.patch("/:id/lines/:lineId", handle(async (req, res) => {
    const u = req.user as UserWithContext, p = path.parse(req.params);
    res.json(await patchInvoiceLine(u.activeCompanyId, u.id, p.id, p.lineId!, patchInvoiceLineSchema.parse(req.body)));
  }));
  router.delete("/:id/lines/:lineId", handle(async (req, res) => {
    const u = req.user as UserWithContext, p = path.parse(req.params);
    res.json(await deleteInvoiceLine(u.activeCompanyId, u.id, p.id, p.lineId!));
  }));
  router.post("/:id/lines/reorder", handle(async (req, res) => {
    const u = req.user as UserWithContext;
    res.json(await reorderInvoiceLines(u.activeCompanyId, u.id, path.parse(req.params).id, reorderInvoiceLinesSchema.parse(req.body).lineIds));
  }));
  router.post("/:id/cancel", handle(async (req, res) => {
    const u = req.user as UserWithContext;
    res.json(await cancelDraftInvoice(u.activeCompanyId, u.id, path.parse(req.params).id, cancelInvoiceSchema.parse(req.body).reason));
  }));
  router.get("/:id/events", handle(async (req, res) => {
    res.json(await readInvoiceEvents((req.user as UserWithContext).activeCompanyId, path.parse(req.params).id));
  }));
  app.use("/api/invoices", router);
}
