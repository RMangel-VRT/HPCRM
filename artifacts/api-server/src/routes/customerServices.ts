import type { Express } from "express";
import { z } from "zod/v4";
import { GetCustomerServicesResponse } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { CUSTOMER_CONTRACT_READERS, CUSTOMER_CONTRACT_COMMERCIAL_READERS } from "./customerContractSummary";
import { customerServiceFulfillment, ServiceTermUnavailable } from "../lib/customerServiceFulfillment";
import { loadServiceFulfillmentInputs } from "../lib/customerServiceFulfillmentLoader";
import { eq, and } from "drizzle-orm";
import { termRates } from "@workspace/db";
import { buildContractedServicesModel, ScopeNeedsReview } from "../services/contractedServicesDocument";
import { contractedServicesHtml } from "../services/documents/contractedServices";
import { renderDocumentPdf } from "../services/documents/render";
import { DocumentRendererUnavailable } from "../services/documents/browser";
import { SCOPE_CATALOG } from "../shared/contractCatalog";

const query = z.object({ termId: z.string().trim().min(1).max(100).optional() }).strict();
export function registerCustomerServices(app: Express) {
  app.get("/api/customers/:id/contracted-services-targets", async (req, res): Promise<void> => {
    if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !CUSTOMER_CONTRACT_READERS.has(user.accessRole)) { res.status(403).json({ message: "Forbidden" }); return; }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    res.set("Cache-Control", "private, no-store");
    const parsed = z.object({ termId: z.string().trim().min(1).max(100) }).strict().safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ message: "Select a contract season" }); return; }
    const data = await loadServiceFulfillmentInputs(db, user.activeCompanyId);
    const owner = data.customers.find(c => c.id === String(req.params.id));
    if (!owner) { res.status(404).json({ message: "Customer not found" }); return; }
    try {
      customerServiceFulfillment(data, owner.id, parsed.data.termId);
      const children = data.customers.filter(c => c.parentCustomerId === owner.id && c.isParent !== "true");
      const candidates = children.length || owner.isParent === "true" ? children : [owner];
      const term = data.terms.find(t => t.id === parsed.data.termId)!;
      const snow = data.scope?.some(s => s.termId === term.id && s.included && SCOPE_CATALOG.find(c => c.key === s.serviceKey)?.scheduling === "event");
      const targets = candidates.flatMap(c => {
        const fulfillment = customerServiceFulfillment(data, c.id, term.id);
        const hasServices = fulfillment?.rows.some(r => r.owed !== 0) || fulfillment?.alsoInContract.some(r => r.scheduling === "none");
        if (term.line === "snow" && !snow || !hasServices && !snow) return [];
        return [{ customerId: c.id, customerName: c.name, agreementId: term.agreementId }];
      });
      res.json({ parent: candidates !== undefined && (children.length > 0 || owner.isParent === "true"), targets });
    } catch (error) {
      if (!(error instanceof ServiceTermUnavailable)) throw error;
      res.status(404).json({ message: "Season unavailable" });
    }
  });
  app.get("/api/customers/:id/contracted-services.pdf", async (req, res): Promise<void> => {
    if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !CUSTOMER_CONTRACT_READERS.has(user.accessRole)) {
      res.status(403).json({ message: "Forbidden" }); return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    res.set("Cache-Control", "private, no-store");
    const parsed = z.object({ termId: z.string().trim().min(1).max(100), download: z.enum(["1", "0"]).optional() }).strict().safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ message: "Select a contract season" }); return; }
    try {
      const data = await loadServiceFulfillmentInputs(db, user.activeCompanyId);
      const selected = customerServiceFulfillment(data, String(req.params.id), parsed.data.termId);
      if (!selected || data.customers.find(c => c.id === String(req.params.id))?.isParent === "true" ||
        data.customers.some(c => c.parentCustomerId === String(req.params.id))) {
        res.status(404).json({ message: "Property or season unavailable" }); return;
      }
      const commercial = CUSTOMER_CONTRACT_COMMERCIAL_READERS.has(user.accessRole);
      // Service readers may print schedules, not contract prices. Do not even
      // load the rate owner for readers excluded from commercial projections.
      data.rates = commercial ? await db.select().from(termRates).where(and(eq(termRates.companyId, user.activeCompanyId), eq(termRates.termId, parsed.data.termId))) : [];
      const model = buildContractedServicesModel(data, String(req.params.id), parsed.data.termId, { commercial });
      const pdf = await renderDocumentPdf({ html: contractedServicesHtml(model), footerLabel: `Contracted Services · ${model.season}`, shortHeaderNumber: model.season });
      const filename = `Contracted Services - ${model.customerName} - ${model.season}`.replace(/[^\p{L}\p{N} ._–-]/gu, "_").slice(0, 180) + ".pdf";
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `${parsed.data.download === "1" ? "attachment" : "inline"}; filename="${filename.replace(/[^\x20-\x7e]/g, "-")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(pdf);
    } catch (error) {
      if (error instanceof ServiceTermUnavailable) { res.status(404).json({ message: "Season not available for this customer" }); return; }
      if (error instanceof ScopeNeedsReview) { res.status(409).json({ error: "SCOPE_NEEDS_REVIEW", services: error.services }); return; }
      if (error instanceof DocumentRendererUnavailable) { res.status(503).json({ error: "DOCUMENT_RENDERER_UNAVAILABLE" }); return; }
      throw error;
    }
  });
  app.get("/api/customers/:id/services", async (req, res): Promise<void> => {
    if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !CUSTOMER_CONTRACT_READERS.has(user.accessRole)) {
      res.status(403).json({ message: "Forbidden" }); return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    res.set("Cache-Control", "private, no-store");
    const parsed = query.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ message: "Invalid season query" }); return; }
    const data = await loadServiceFulfillmentInputs(db, user.activeCompanyId);
    try {
      const result = customerServiceFulfillment(data, String(req.params.id), parsed.data.termId);
      if (!result) { res.status(404).json({ message: "Customer not found" }); return; }
      res.json(GetCustomerServicesResponse.parse(result));
    } catch (error) {
      if (!(error instanceof ServiceTermUnavailable)) throw error;
      res.status(404).json({ message: "Season not available for this customer" });
    }
  });
}
