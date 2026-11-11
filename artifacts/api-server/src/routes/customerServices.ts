import type { Express } from "express";
import { z } from "zod/v4";
import { GetCustomerServicesResponse } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { CUSTOMER_CONTRACT_READERS } from "./customerContractSummary";
import { customerServiceFulfillment, ServiceTermUnavailable } from "../lib/customerServiceFulfillment";
import { loadServiceFulfillmentInputs } from "../lib/customerServiceFulfillmentLoader";

const query = z.object({ termId: z.string().trim().min(1).max(100).optional() }).strict();
export function registerCustomerServices(app: Express) {
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
