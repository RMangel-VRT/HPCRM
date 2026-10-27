import { randomUUID } from "node:crypto";
import {
  agreements, agreementTerms, termScopeLines, termRates, termBillingMonths,
  termDocuments, termStatusHistory, termLegacySources,
} from "@workspace/db";
import { db } from "../db";
import { summarizePlans, type CopyPlan, type CustomerPlan } from "./contractCenterCopy";

/** No source updates, conflict-ignore, or file operations: a duplicate link must roll back its customer. */
export async function executeLegacyCopy(plan: CopyPlan, companyId: string, adminId: string) {
  const committed: CustomerPlan[] = [];
  for (const customer of plan.customers) {
    try {
      await db.transaction(async tx => {
        for (const agreement of customer.agreements) {
          const agreementId = randomUUID();
          const { line: _legacyGroupingLine, ...relationship } = agreement.agreement;
          await tx.insert(agreements).values({ ...relationship, id: agreementId, companyId });
          const termIds = agreement.terms.map(() => randomUUID());
          for (const [index, term] of agreement.terms.entries()) {
            const termId = termIds[index];
            const context = { termId, companyId };
            await tx.insert(agreementTerms).values({ ...term.term, id: termId, companyId, agreementId,
              createdBy: adminId, renewedFromTermId: term.renewedFromIndex === null ? null : termIds[term.renewedFromIndex] });
            if (term.scope.length) await tx.insert(termScopeLines).values(term.scope.map(row => ({ ...row, ...context })));
            if (term.rates.length) await tx.insert(termRates).values(term.rates.map(row => ({ ...row, ...context })));
            if (term.billingMonths.length) await tx.insert(termBillingMonths).values(term.billingMonths.map(row => ({ ...row, ...context })));
            if (term.documents.length) await tx.insert(termDocuments).values(term.documents.map(row => ({ ...row, ...context })));
            if (term.history.length) await tx.insert(termStatusHistory).values(term.history.map(row => ({ ...row, ...context })));
            await tx.insert(termLegacySources).values(term.report.legacyContractIds.map(legacyContractId => ({ ...context, legacyContractId })));
          }
        }
      });
      committed.push(customer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      customer.report.error = message;
      for (const agreement of customer.report.agreements) for (const term of agreement.terms) term.flags.push(`Copy failed: ${message}`);
      plan.report.failures.push({ customerId: customer.report.customerId, customerName: customer.report.customerName, error: message });
    }
  }
  plan.report.dryRun = false;
  plan.report.summary = summarizePlans(committed, plan.report.summary.alreadyCopied);
  return plan.report;
}
