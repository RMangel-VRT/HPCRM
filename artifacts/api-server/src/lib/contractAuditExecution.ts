import { and, eq, inArray, sql } from "drizzle-orm";
import { agreements, customers, contracts, contractDocuments, agreementTerms, termScopeLines, termRates, termBillingMonths, termDocuments, termLegacySources } from "@workspace/db";
import { db } from "../db";
import type { AuditFiles } from "./contractAuditFiles";
import { loadAuditData } from "./contractAuditData";
import { planAuditImport, auditReport, type ImportCustomer } from "./contractAuditPlan";
import { writeTerm, addHistory, type Transaction } from "./contractCenterPersistence";
import { logger } from "./logger";

async function writeCustomer(tx: Transaction, group: ImportCustomer, files: AuditFiles, companyId: string, userId: string, removedRefs: string[] = []) {
  let termCount = 0;
  for (const agreement of group.agreements) {
    if (agreement.replaceId) await tx.delete(agreements).where(and(eq(agreements.companyId, companyId),
      eq(agreements.customerId, group.id), eq(agreements.id, agreement.replaceId), eq(agreements.importRef, agreement.ref)));
    const [created] = await tx.insert(agreements).values({ companyId, customerId: group.id,
      importRef: agreement.ref,
      propertyManagementCompanyId: group.managementId }).returning();
    const termIds = new Map<string, string>();
    for (const term of agreement.terms) {
      const renewedFromTermId = term.renewsRef ? termIds.get(term.renewsRef) : null;
      if (term.renewsRef && !renewedFromTermId) throw new Error("Renewal source was not written");
      const row = await writeTerm(tx, companyId, userId, null, { ...term.values,
        agreementId: created.id, renewedFromTermId }, `Imported from audit (${files.filename})`);
      if (removedRefs.length) await addHistory(tx, companyId, userId, row, `Replaces imported contracts: ${removedRefs.join(", ")}`);
      termIds.set(term.contractRef, row.id); termCount++;
      const context = { companyId, termId: row.id };
      if (term.scope.length) await tx.insert(termScopeLines).values(term.scope.map(r => ({ ...r, ...context })));
      if (term.rates.length) await tx.insert(termRates).values(term.rates.map(r => ({ ...r, ...context })));
      if (term.billing.length) await tx.insert(termBillingMonths).values(term.billing.map(r => ({ ...r, ...context })));
      if (term.legacyIds.length) await tx.insert(termLegacySources).values(term.legacyIds.map(legacyContractId => ({ ...context, legacyContractId })));
    }
    // All identities must exist before forward coverage references are written.
    for (const term of agreement.terms) {
      if (term.documents.length) await tx.insert(termDocuments).values(term.documents.map(({ source, kind, coversThroughRef }) => {
        const coversThroughTermId = coversThroughRef ? termIds.get(coversThroughRef) : null;
        if (coversThroughRef && !coversThroughTermId) throw new Error("Coverage target was not written");
        return { companyId, termId: termIds.get(term.contractRef)!, coversThroughTermId,
          kind, version: source.version, filename: source.filename, storageObjectPath: source.storageObjectPath,
          mimeType: source.mimeType, fileSize: source.fileSize, uploadedBy: source.uploadedBy, createdAt: source.uploadedAt };
      }));
    }
  }
  return { customerId: group.id, customerName: group.name, agreements: group.agreements.length, terms: termCount };
}

export async function executeAuditImport(files: AuditFiles, companyId: string, userId: string) {
  const initial = planAuditImport(files, await loadAuditData(companyId));
  const report = auditReport(initial, false);
  const successes: Array<{ customerId: string; customerName: string; agreements: number; terms: number }> = [];
  const failures: Array<{ customerId: string; customerName: string; error: string }> = [];
  if (initial.errors.length) return { ...report, summary: { ...report.summary, removed: 0 }, successes, failures };
  if (initial.removals.length) {
    try {
      const committed = await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contract-audit:${companyId}`}))`);
        // Conservative company-scoped locks include hierarchy/absent-reference FK
        // gates. Always customer -> agreement -> dependent rows, in primary-key order.
        await tx.select().from(customers).where(eq(customers.companyId, companyId)).orderBy(customers.id).for("update");
        await tx.select().from(agreements).where(eq(agreements.companyId, companyId)).orderBy(agreements.id).for("update");
        await tx.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId)).orderBy(agreementTerms.id).for("update");
        await tx.select().from(termDocuments).where(eq(termDocuments.companyId, companyId)).orderBy(termDocuments.id).for("update");
        await tx.select().from(contracts).where(eq(contracts.companyId, companyId)).orderBy(contracts.id).for("update");
        await tx.select().from(contractDocuments).where(eq(contractDocuments.companyId, companyId)).orderBy(contractDocuments.id).for("update");
        await tx.select().from(termLegacySources).where(eq(termLegacySources.companyId, companyId)).orderBy(termLegacySources.id).for("update");
        const fresh = planAuditImport(files, await loadAuditData(companyId, tx));
        if (fresh.errors.length) throw new Error("Current upload no longer validates");
        // Revalidation above occurs before any destructive write.
        for (const removal of fresh.removals)
          await tx.delete(agreements).where(and(eq(agreements.companyId, companyId),
            eq(agreements.id, removal.id), eq(agreements.importRef, removal.ref)));
        // Release eligible replacement links too before assigning any new links.
        for (const group of fresh.customers) for (const agreement of group.agreements) if (agreement.replaceId)
          await tx.delete(agreements).where(and(eq(agreements.companyId, companyId), eq(agreements.id, agreement.replaceId)));
        const results = [];
        for (const group of fresh.customers)
          results.push(await writeCustomer(tx, group, files, companyId, userId, fresh.removals.map(r => r.ref)));
        return { results, removals: fresh.removals, report: auditReport(fresh, false) };
      });
      // Only log committed removals, never attempts later rolled back.
      logger.info({ companyId, importingAdmin: userId, committedAt: new Date().toISOString(),
        removals: committed.removals }, "Imported contract removals committed");
      return { ...committed.report, successes: committed.results, failures, removed: committed.removals };
    } catch {
      return { ...report, summary: { ...report.summary, removed: 0 }, successes: [], removed: [], failures: [{
        customerId: "", customerName: "Entire upload",
        error: "Entire upload rolled back; no contracts were removed or imported. Run Preview again.",
      }] };
    }
  }
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
        if (group.agreements.some(a => a.replaceId &&
          !current.some(existing => existing.id === a.replaceId && existing.customerId === customer.id && existing.importRef === a.ref)))
          throw new Error("Agreement replacement ownership changed");
        return writeCustomer(tx, group, files, companyId, userId);
      });
      successes.push(counts);
    } catch {
      // Database/storage exceptions can contain SQL or credentials. Never echo them.
      failures.push({ customerId: customer.id, customerName: customer.name,
        error: "Customer import rolled back because validation or a concurrent write conflicted. Run Preview again." });
    }
  }
  return { ...report, successes, failures };
}
