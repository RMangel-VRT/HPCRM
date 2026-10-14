import { and, eq, inArray, sql } from "drizzle-orm";
import { agreements, customers, contracts, agreementTerms, termScopeLines, termRates, termBillingMonths, termDocuments, termLegacySources } from "@workspace/db";
import { db } from "../db";
import type { AuditFiles } from "./contractAuditFiles";
import { loadAuditData } from "./contractAuditData";
import { planAuditImport, auditReport } from "./contractAuditPlan";
import { writeTerm } from "./contractCenterPersistence";

export async function executeAuditImport(files: AuditFiles, companyId: string, userId: string) {
  const initial = planAuditImport(files, await loadAuditData(companyId));
  const report = auditReport(initial, false);
  const successes: Array<{ customerId: string; customerName: string; agreements: number; terms: number }> = [];
  const failures: Array<{ customerId: string; customerName: string; error: string }> = [];
  if (initial.errors.length) return { ...report, successes, failures };
  for (const customer of initial.customers) {
    try {
      const counts = await db.transaction(async tx => {
        // Serialize audit imports including absent import_refs. Unique constraints
        // remain the final arbiter against older Copy/lifecycle writers.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contract-audit:${companyId}`}))`);
        await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, customer.id))).for("update");
        const current = await tx.select().from(agreements)
          .where(and(eq(agreements.companyId, companyId), eq(agreements.customerId, customer.id)))
          .orderBy(agreements.id).for("update");
        const ids = customer.agreements.flatMap(a => a.terms.flatMap(t => t.legacyIds)).sort();
        if (ids.length) await tx.select().from(contracts)
          .where(and(eq(contracts.companyId, companyId), inArray(contracts.id, ids))).orderBy(contracts.id).for("update");
        // Rebuild from the actual upload and current data after acquiring locks.
        const fresh = planAuditImport(files, await loadAuditData(companyId, tx));
        const blocking = fresh.errors.filter(e => !e.contractRef ||
          customer.agreements.some(a => a.terms.some(t => t.contractRef === e.contractRef)));
        if (blocking.length) throw new Error("Current data no longer validates; run Preview again");
        const group = fresh.customers.find(c => c.id === customer.id);
        if (!group) throw new Error("Customer no longer exists");
        let termCount = 0;
        for (const agreement of group.agreements) {
          if (agreement.replaceId) {
            if (!current.some(a => a.id === agreement.replaceId && a.customerId === customer.id && a.importRef === agreement.ref))
              throw new Error("Agreement replacement ownership changed");
            await tx.delete(agreements).where(and(eq(agreements.companyId, companyId),
              eq(agreements.customerId, customer.id), eq(agreements.id, agreement.replaceId), eq(agreements.importRef, agreement.ref)));
          }
          const [created] = await tx.insert(agreements).values({ companyId, customerId: group.id,
            importRef: agreement.ref, line: agreement.line, form: agreement.form,
            propertyManagementCompanyId: group.managementId }).returning();
          const termIds = new Map<string, string>();
          for (const term of agreement.terms) {
            const renewedFromTermId = term.renewsRef ? termIds.get(term.renewsRef) : null;
            if (term.renewsRef && !renewedFromTermId) throw new Error("Renewal source was not written");
            const row = await writeTerm(tx, companyId, userId, null, { ...term.values,
              agreementId: created.id, renewedFromTermId }, `Imported from audit (${files.filename})`);
            termIds.set(term.contractRef, row.id); termCount++;
            const context = { companyId, termId: row.id };
            if (term.scope.length) await tx.insert(termScopeLines).values(term.scope.map(r => ({ ...r, ...context })));
            if (term.rates.length) await tx.insert(termRates).values(term.rates.map(r => ({ ...r, ...context })));
            if (term.billing.length) await tx.insert(termBillingMonths).values(term.billing.map(r => ({ ...r, ...context })));
            if (term.legacyIds.length) await tx.insert(termLegacySources).values(term.legacyIds.map(legacyContractId => ({ ...context, legacyContractId })));
            if (term.documents.length) await tx.insert(termDocuments).values(term.documents.map(({ source, kind }) => ({
              ...context, kind, version: source.version, filename: source.filename, storageObjectPath: source.storageObjectPath,
              mimeType: source.mimeType, fileSize: source.fileSize, uploadedBy: source.uploadedBy, createdAt: source.uploadedAt,
            })));
          }
        }
        return { agreements: group.agreements.length, terms: termCount };
      });
      successes.push({ customerId: customer.id, customerName: customer.name, ...counts });
    } catch {
      // Database/storage exceptions can contain SQL or credentials. Never echo them.
      failures.push({ customerId: customer.id, customerName: customer.name,
        error: "Customer import rolled back because validation or a concurrent write conflicted. Run Preview again." });
    }
  }
  return { ...report, successes, failures };
}
