import { storage } from "../storage";
import { setupMissingFields } from "./customerSetupValidation";
import { logger } from "../lib/logger";

export interface CustomerActivation {
  customerId: string;
  status: "prospect";
  missingFields: string[];
}

/** Advisory only: a committed win must never become a failed request. */
export async function customerActivation(companyId: string, loadCustomerId: () => Promise<string | null>): Promise<CustomerActivation | undefined> {
  try {
    const id = await loadCustomerId();
    const customer = id ? await storage.getCustomerById(id, companyId) : undefined;
    if (customer?.status !== "prospect") return;
    const missingFields = await setupMissingFields(customer, {
      companyId,
      getCustomerById: id => storage.getCustomerById(id, companyId),
      getPropertyManagementCompanyById: id => storage.getPropertyManagementCompanyById(id, companyId),
    });
    return { customerId: customer.id, status: "prospect", missingFields };
  } catch {
    logger.warn({ companyId }, "Customer activation advisory unavailable after successful action");
    return undefined;
  }
}
