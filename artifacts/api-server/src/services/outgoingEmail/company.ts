import { eq } from "drizzle-orm";
import { companies } from "@workspace/db";
import { db } from "../../db";
import { readDocumentSettings } from "../documentSettings";
import { requireEstimate } from "../estimateErrors";
import type { EstimateConnection } from "../estimateReads";
import type { EmailCompany } from "./layout";

export async function loadEmailCompany(companyId: string, connection: EstimateConnection = db): Promise<EmailCompany & { paymentInstructions: string }> {
  const [company] = await connection.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
  const details = await readDocumentSettings(companyId, connection);
  const { addressLine1, addressLine2, city, state, postalCode, phone, email, website } = details;
  const region = [state.trim(), postalCode.trim()].filter(Boolean).join(" ");
  return {
    name: requireEstimate(company).name,
    addressLine: [addressLine1.trim(), addressLine2.trim(), city.trim(), region].filter(Boolean).join(", "),
    phone: phone.trim(), email: email.trim(), website: website.trim(),
    paymentInstructions: details.paymentInstructions.trim(),
  };
}
