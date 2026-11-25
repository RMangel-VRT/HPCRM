import { and, eq } from "drizzle-orm";
import { agreements, agreementTerms, propertyManagementCompanies } from "@workspace/db";
import { ContractCenterError } from "./contractCenterService";
import { separateMergeCandidates, separateMergePlan } from "./contractMergeEligibility";
import { addHistory, agreementSeasons, fullDetail, getAgreement, lockAgreement, lockContractCompany, writeTerm,
  type Reader, type Transaction } from "./contractCenterPersistence";

export async function loadMergeCandidates(reader: Reader, companyId: string, targetId: string) {
  const target = await getAgreement(reader, companyId, targetId);
  const rows = await reader.select().from(agreements).where(and(eq(agreements.companyId, companyId), eq(agreements.customerId, target.customerId)));
  const terms = await reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  const management = await reader.select().from(propertyManagementCompanies).where(eq(propertyManagementCompanies.companyId, companyId));
  const name = (id: string | null) => management.find(m => m.id === id)?.name ?? null;
  return separateMergeCandidates(target, terms.filter(t => t.agreementId === targetId), rows, terms)
    .map(c => ({ ...c, managementCompanyName: name(c.propertyManagementCompanyId),
      targetManagementCompanyName: name(target.propertyManagementCompanyId),
      targetPropertyManagementCompanyId: target.propertyManagementCompanyId }));
}

export async function mergeSeparateAgreement(tx: Transaction, companyId: string, userId: string, targetId: string, sourceId: string) {
  await lockContractCompany(tx, companyId);
  const locked = new Map<string, Awaited<ReturnType<typeof lockAgreement>>>();
  for (const id of [...new Set([targetId, sourceId])].sort()) locked.set(id, await lockAgreement(tx, companyId, id));
  const target = locked.get(targetId)!, source = locked.get(sourceId)!;
  if (source.customerId !== target.customerId) throw new ContractCenterError(404, "Contract not found");
  const targetTerms = await agreementSeasons(tx, companyId, target.id), sourceTerms = await agreementSeasons(tx, companyId, source.id);
  const { predecessor, first, blockedReason } = separateMergePlan(target, targetTerms, source, sourceTerms);
  if (blockedReason) throw new ContractCenterError(409, blockedReason);
  if (!first || !predecessor) throw new ContractCenterError(409, "This contract has no season to renew.");
  let movedFirst = first;
  for (const term of sourceTerms) {
    const moved = await writeTerm(tx, companyId, userId, term, { agreementId: target.id },
      `Moved from separate contract ${source.id} (merged into this contract)`, "outcome");
    if (term.id === first.id) movedFirst = { ...first, ...moved };
  }
  const linked = await writeTerm(tx, companyId, userId, movedFirst, { renewedFromTermId: predecessor.id },
    `Linked as the renewal of ${predecessor.seasonLabel}`, "outcome");
  if (["signed", "active", "renewed"].includes(first.status))
    await writeTerm(tx, companyId, userId, predecessor, { status: "renewed" },
      `Renewed by ${first.seasonLabel} (merged from separate contract)`, "outcome");
  else await addHistory(tx, companyId, userId, predecessor, `Renewal ${first.seasonLabel} merged from separate contract`);
  const fields: Partial<typeof agreements.$inferInsert> = { updatedAt: new Date() };
  if (source.propertyManagementCompanyId !== null && source.propertyManagementCompanyId !== target.propertyManagementCompanyId) {
    fields.propertyManagementCompanyId = source.propertyManagementCompanyId;
    const management = await tx.select().from(propertyManagementCompanies).where(eq(propertyManagementCompanies.companyId, companyId));
    const name = (id: string | null) => management.find(m => m.id === id)?.name ?? id ?? "None";
    await addHistory(tx, companyId, userId, linked,
      `Management company changed from ${name(target.propertyManagementCompanyId)} to ${name(source.propertyManagementCompanyId)} (merged from separate contract ${source.id})`);
  }
  if (source.notes) fields.notes = [target.notes, `From merged contract:\n${source.notes}`].filter(Boolean).join("\n\n");
  await tx.update(agreements).set(fields).where(and(eq(agreements.id, target.id), eq(agreements.companyId, companyId)));
  // Check without a company filter too: never allow a cascade to hide an unmoved row.
  const remaining = await tx.select({ id: agreementTerms.id }).from(agreementTerms).where(eq(agreementTerms.agreementId, source.id));
  if (remaining.length) throw new Error("Source contract still contains seasons");
  await tx.delete(agreements).where(and(eq(agreements.id, source.id), eq(agreements.companyId, companyId)));
  return fullDetail(tx, companyId, target.id, true);
}
