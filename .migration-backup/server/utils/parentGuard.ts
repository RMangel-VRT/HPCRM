import type { Response } from "express";
import { storage } from "../storage";

export interface ParentGuardError {
  error: "PARENT_CUSTOMER_NOT_ALLOWED";
  message: string;
  parentCustomerId: string;
}

/**
 * Checks whether the given customerId belongs to a parent customer.
 * If it does, sends a 400 JSON response and returns true (meaning the caller should return early).
 * If the customer is not a parent (or not found), returns false.
 */
export async function assertNotParentCustomer(
  customerId: string,
  companyId: string,
  res: Response
): Promise<boolean> {
  if (!customerId) return false;
  const customer = await storage.getCustomerById(customerId, companyId);
  if (customer && customer.isParent === "true") {
    const body: ParentGuardError = {
      error: "PARENT_CUSTOMER_NOT_ALLOWED",
      message: `Parent customer "${customer.name}" cannot have operational records attached directly. Please use a child customer instead.`,
      parentCustomerId: customer.id,
    };
    res.status(400).json(body);
    return true;
  }
  return false;
}
