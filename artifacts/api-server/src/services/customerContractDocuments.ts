import { and, eq } from "drizzle-orm";
import { termDocuments, type TermDocument } from "@workspace/db";
import { customerContractProjector, loadCustomerContractInputs, type CustomerContractInputs } from "../lib/customerContractSummary";
import type { Reader } from "../lib/contractCenterPersistence";
import type { CustomerContractDocumentDto } from "../../../../lib/db/src/customerDocumentContracts";

/** CP1 selects each period own-before-parent, per agreement. Additional seasonal
 * coverage uses exactly Contract Center's explicit same-agreement start-date rule.
 * No ownership/lifecycle changes and no copied rows.
 */
export function projectCustomerContractDocuments(data: CustomerContractInputs, documents: TermDocument[], customerId: string, today?: string) {
  const summary = customerContractProjector(data, today)(customerId);
  if (!summary) return [];
  const selected = [...summary.current, ...summary.upcoming, ...summary.previous];
  const terms = new Map(data.terms.map(t => [t.id, t]));
  const result: CustomerContractDocumentDto[] = [];
  for (const doc of documents) {
    const owner = terms.get(doc.termId), through = doc.coversThroughTermId && terms.get(doc.coversThroughTermId);
    if (!owner) continue;
    const eligible = selected.filter(t => t.agreementId === owner.agreementId && (t.termId === owner.id ||
      (through && through.agreementId === owner.agreementId && through.startDate > owner.startDate &&
       t.startDate > owner.startDate && t.startDate <= through.startDate)));
    if (!eligible.length) continue;
    result.push({ id: doc.id, filename: doc.filename, kind: doc.kind,
      seasonLabel: [...new Set(eligible.map(t => t.label))].join(" · "),
      createdAt: doc.createdAt.toISOString(), agreementId: owner.agreementId, termId: owner.id,
      openUrl: `/api/customers/${encodeURIComponent(customerId)}/documents/from-contracts/${encodeURIComponent(doc.id)}/open?companyId=${encodeURIComponent(doc.companyId)}` });
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export async function loadCustomerContractDocuments(reader: Reader, companyId: string, customerId: string) {
  const data = await loadCustomerContractInputs(reader, companyId, false);
  // Bulk reads, no term-by-term or actor-by-actor queries.
  const documents = await reader.select().from(termDocuments).where(and(eq(termDocuments.companyId, companyId)));
  return { projected: projectCustomerContractDocuments(data, documents, customerId), documents };
}
