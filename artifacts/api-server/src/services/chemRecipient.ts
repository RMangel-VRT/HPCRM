import type { Contact } from "@workspace/db";
import { storage } from "../storage";

export type ChemRecipient = { email: string | null; contactName: string | null };

type ManagerRecipient = {
  name: string;
  email: string | null;
  emails?: Array<{ email: string; isPrimary: string }> | null;
};

const validEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function selectChemRecipient(
  manager: ManagerRecipient | null,
  contacts: Contact[],
): ChemRecipient {
  const managerEmail = manager && (
    manager.emails?.find(e => e.isPrimary === "true" && validEmail(e.email))?.email
    || manager.emails?.find(e => validEmail(e.email))?.email
    || manager.email
  );
  if (validEmail(managerEmail)) {
    return { email: managerEmail.trim(), contactName: manager!.name };
  }

  const withEmail = (contact: Contact) => contact.emails?.find(validEmail)?.trim();
  const pmContact = contacts.find(c =>
    (c.propertyManagerId || c.role?.toLowerCase().includes("property manager")) && withEmail(c)
  );
  const contact = pmContact
    || contacts.find(c => c.isPrimary === "true" && withEmail(c))
    || contacts.find(c => withEmail(c));
  return { email: contact ? withEmail(contact) || null : null, contactName: contact?.name || null };
}

export async function resolveChemRecipientEmail(customerId: string, companyId: string): Promise<ChemRecipient> {
  const customer = await storage.getCustomerById(customerId, companyId);
  if (!customer) return { email: null, contactName: null };
  const manager = customer.propertyManagerId
    ? await storage.getPropertyManagerWithContacts(customer.propertyManagerId, companyId)
    : null;
  const contacts = await storage.getContactsByCustomerId(customerId, companyId);
  return selectChemRecipient(manager ?? null, contacts);
}