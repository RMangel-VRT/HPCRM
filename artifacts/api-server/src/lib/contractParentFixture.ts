// Disposable development verification only; no storage objects are created.
import { eq } from "drizzle-orm";
import { customers, contracts } from "@workspace/db";
import { db } from "../db";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { parseAuditFiles, type UploadFile } from "./contractAuditFiles";
import { executeAuditImport } from "./contractAuditExecution";

export function parentEntries(customerId: string, legacyIds: string[], docIds: string[], consolidate: boolean): UploadFile[] {
  const refs = consolidate ? ["parent"] : ["branch-1", "branch-2"];
  return [
    { name: "contracts.csv", data: Buffer.from("contract_ref,agreement_ref,customer_id,line,form,start_date,end_date,status,signed_date,legacy_contract_ids\n" +
      refs.map((ref, i) => `${ref},${ref},${customerId.split(";")[i] ?? customerId},landscape,theirs,2026-01-01,2026-12-31,signed,2025-12-01,${consolidate ? legacyIds.join(";") : legacyIds.filter((_, n) => n % 2 === i).join(";")}`).join("\n")) },
    { name: "payments.csv", data: Buffer.from("contract_ref,payment_line,jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec\n" +
      [0, 1].map(i => `${consolidate ? "parent" : refs[i]},FB0${i + 1} – Branch ${i + 1},${Array(12).fill(i ? "710" : "690").join(",")}`).join("\n")) },
    { name: "documents.csv", data: Buffer.from("contract_ref,document_id,kind\n" +
      docIds.map((id, i) => `${consolidate ? "parent" : refs[i]},${id},signed`).join("\n")) },
    { name: "rates.csv", data: Buffer.from("contract_ref,rate_key\n") },
    { name: "scope.csv", data: Buffer.from("contract_ref,service_key,included\n") },
    ...(consolidate ? [{ name: "remove_agreements.csv", data: Buffer.from("agreement_ref\nbranch-1\nbranch-2\n") }] : []),
  ];
}

export async function createParentFixture() {
  const f = await createAuditFixture();
  try {
    const [parent, branch2] = await db.insert(customers).values([
      { companyId: f.companyId, name: "Disposable Parent Bank", isParent: "true" as const, street: "1", city: "Denver", state: "CO", zip: "80000" },
      { companyId: f.companyId, name: "Branch 2", customerNumber: "FB02", street: "2", city: "Denver", state: "CO", zip: "80000" },
    ]).returning();
    await db.update(customers).set({ parentCustomerId: parent.id, name: "Branch 1", customerNumber: "FB01" }).where(eq(customers.id, f.customerId));
    await db.update(customers).set({ parentCustomerId: parent.id }).where(eq(customers.id, branch2.id));
    for (const id of [f.oldIds[1], f.oldIds[3]])
      await db.update(contracts).set({ customerId: branch2.id }).where(eq(contracts.id, id));
    const branches = await parseAuditFiles(parentEntries(`${f.customerId};${branch2.id}`, f.oldIds, f.docIds, false));
    const imported = await executeAuditImport(branches, f.companyId, f.userId);
    if (imported.errors.length || imported.failures.length) throw new Error("Disposable branch import failed");
    const entries = parentEntries(parent.id, f.oldIds, f.docIds, true);
    return { ...f, parentId: parent.id, branch2Id: branch2.id, entries, files: await parseAuditFiles(entries) };
  } catch (error) { await removeAuditFixture(f.companyId, f.userId); throw error; }
}
