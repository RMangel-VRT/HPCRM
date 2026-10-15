import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { customers, termScopeLines, termRates, termBillingMonths, termDocuments } from "@workspace/db";
import { db } from "../db";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAccessGroupType, ObjectPermission } from "../objectAcl";
import type { AuditFiles } from "./contractAuditFiles";
import { loadAuditData } from "./contractAuditData";
import { planRenewalImport, renewalReport } from "./contractRenewalPlan";
import { lockAgreement, replaceRows, writeTerm } from "./contractCenterPersistence";

export async function executeRenewalImport(files: AuditFiles, companyId: string, userId: string,
  storage = new ObjectStorageService()) {
  const initial = planRenewalImport(files, await loadAuditData(companyId));
  const report = renewalReport(initial, false);
  const successes: { customerId: string; customerName: string; agreements: number; terms: number;
    seasons: { agreementId: string; termId: string; season: string }[] }[] = [];
  const failures: { customerId: string; customerName: string; error: string }[] = [];
  if (initial.errors.length) return { ...report, successes, failures };
  for (const customer of initial.customers) {
    const uploaded: string[] = [];
    try {
      const seasons = await db.transaction(async tx => {
        // Same order as audit import: company gate, customer, sorted agreements.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contract-audit:${companyId}`}))`);
        await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, customer.id))).for("update");
        for (const id of [...new Set(customer.terms.map(t => t.agreementId))].sort())
          await lockAgreement(tx, companyId, id);
        const fresh = planRenewalImport(files, await loadAuditData(companyId, tx));
        const refs = new Set(customer.terms.map(t => t.contractRef));
        if (fresh.errors.some(e => !e.contractRef || refs.has(e.contractRef))) throw new Error("Renewal validation changed");
        const group = fresh.customers.find(c => c.id === customer.id);
        if (!group) throw new Error("Customer no longer exists");
        const created: { agreementId: string; termId: string; season: string }[] = [];
        for (const term of group.terms.filter(t => !t.skipped)) {
          const docs = [];
          for (const doc of term.documents) {
            const path = `contract-renewals/${companyId}/${randomUUID()}.pdf`;
            // Register before attempting save: even an ambiguous failed save must be cleaned.
            uploaded.push(path);
            const data = files.pdfs![doc.file];
            await storage.saveBufferToPrivatePath(path, data, "application/pdf");
            const objectPath = `/objects/${path}`;
            await storage.trySetObjectEntityAclPolicy(objectPath, { owner: userId, visibility: "private",
              aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: companyId }, permission: ObjectPermission.READ }] });
            docs.push({ companyId, kind: doc.kind, version: 1, filename: doc.file.split("/").pop()!,
              fileSize: data.length, mimeType: "application/pdf", storageObjectPath: objectPath, uploadedBy: userId });
          }
          const row = await writeTerm(tx, companyId, userId, null, { ...term.values,
            agreementId: term.agreementId, renewedFromTermId: term.sourceTerm.id }, `Imported signed renewal (${files.filename})`);
          await replaceRows(tx, companyId, row.id, termScopeLines, term.scope);
          await replaceRows(tx, companyId, row.id, termRates, term.rates);
          await replaceRows(tx, companyId, row.id, termBillingMonths, term.billing);
          if (docs.length) await tx.insert(termDocuments).values(docs.map(d => ({ ...d, termId: row.id })));
          if (row.status === "signed") await writeTerm(tx, companyId, userId, term.sourceTerm, { status: "renewed" },
            `Renewed by ${row.seasonLabel} (imported)`);
          created.push({ agreementId: term.agreementId, termId: row.id, season: row.seasonLabel });
        }
        return created;
      });
      successes.push({ customerId: customer.id, customerName: customer.name,
        agreements: new Set(seasons.map(s => s.agreementId)).size, terms: seasons.length, seasons });
    } catch {
      const cleanup = await Promise.allSettled(uploaded.map(path => storage.deletePrivatePath(path)));
      const cleanupFailed = cleanup.some(r => r.status === "rejected");
      failures.push({ customerId: customer.id, customerName: customer.name,
        error: `Customer database writes rolled back. Run Preview again.${cleanupFailed
          ? " Some newly uploaded files could not be removed; ask an administrator to check renewal storage cleanup before retrying." : ""}` });
    }
  }
  return { ...report, successes, failures };
}
