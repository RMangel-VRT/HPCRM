import { randomUUID } from "node:crypto";
import archiver from "archiver";
import { agreements, customers, termScopeLines, termRates, termBillingMonths } from "@workspace/db";
import { db } from "../db";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { activeCard, writeTerm, replaceRows } from "./contractCenterPersistence";
import { expandPayments, snapshotRates, buildScope } from "./contractCenterService";
import { parseAuditFiles, type UploadFile } from "./contractAuditFiles";

export async function renewalZip(entries: UploadFile[]) {
  const archive = archiver("zip"), chunks: Buffer[] = [];
  const end = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", chunk => chunks.push(chunk)); archive.on("end", () => resolve(Buffer.concat(chunks))); archive.on("error", reject);
  });
  entries.forEach(f => archive.append(f.data, { name: f.name })); await archive.finalize(); return end;
}
/** A tiny valid one-page PDF, not a real signed customer document. */
export function renewalFixturePdf() {
  const stream = "BT /F1 12 Tf 25 100 Td (Disposable renewal verification) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let text = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
export async function seedRenewalSource(companyId: string, userId: string, customerId: string) {
  return db.transaction(async tx => {
    const [agreement] = await tx.insert(agreements).values({ companyId, customerId,
      importRef: `unchanged-${randomUUID()}` }).returning();
    const source = await writeTerm(tx, companyId, userId, null, { agreementId: agreement.id, line: "landscape", form: "ours", seasonLabel: "2025–26",
      startDate: "2025-10-01", endDate: "2026-09-30", status: "signed", signedAt: new Date("2025-09-15T18:00:00Z"),
      annualPriceCents: 120000, billingType: "equal_monthly", legalName: "Original legal name", notes: "Historical notes" }, "Disposable fixture");
    const scope = buildScope([{ serviceKey: "other:fixture", included: true, quantity: 12,
      monthSpread: Array(12).fill(1), details: { label: "Fixture service" } }], "landscape");
    const rates = snapshotRates(await activeCard(tx, companyId), [], "landscape");
    await replaceRows(tx, companyId, source.id, termScopeLines, scope);
    await replaceRows(tx, companyId, source.id, termRates, rates);
    await replaceRows(tx, companyId, source.id, termBillingMonths,
      expandPayments([{ component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 10000 })) }],
        source.startDate, source.endDate));
    return { agreement, source, rateKey: rates[0].rateKey };
  });
}
export function renewalEntries(sourceId: string, rateKey: string, status = "signed", ref = "renewal"): UploadFile[] {
  return [
    { name: "renewals.csv", data: Buffer.from(`contract_ref,renews_term_id,start_date,end_date,status,signed_date,renewal_increase_pct\n${ref},${sourceId},2026-10-01,2027-09-30,${status},2026-10-14,3`) },
    { name: "payments.csv", data: Buffer.from(`contract_ref,payment_line,jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec\n${ref},Grounds maintenance,103,103,103,103,103,103,103,103,103,103,103,103`) },
    { name: "rates.csv", data: Buffer.from(`contract_ref,rate_key,price\n${ref},${rateKey},123.45`) },
    { name: "documents.csv", data: Buffer.from(`contract_ref,file,kind\n${ref},files/fixture.pdf,signed`) },
    { name: "files/fixture.pdf", data: renewalFixturePdf() },
  ];
}
export async function createRenewalFixture() {
  const f = await createAuditFixture();
  try {
    const source = await seedRenewalSource(f.companyId, f.userId, f.customerId);
    const entries = renewalEntries(source.source.id, source.rateKey);
    const zip = await renewalZip(entries);
    return { ...f, ...source, entries, zip, files: await parseAuditFiles([{ name: "renewal.zip", data: zip }]) };
  } catch (error) { await removeAuditFixture(f.companyId, f.userId); throw error; }
}
export async function addRenewalCustomer(companyId: string, userId: string) {
  const [customer] = await db.insert(customers).values({ companyId, name: "Disposable B", street: "2 Fixture Way", city: "Denver", state: "CO", zip: "80000" }).returning();
  return { customer, ...await seedRenewalSource(companyId, userId, customer.id) };
}
