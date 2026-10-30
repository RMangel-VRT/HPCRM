import { and, eq, sql } from "drizzle-orm";
import { invoices, invoiceLines, invoiceNumberSequences, invoiceEvents, customers, users, type Invoice } from "@workspace/db";
import { createInvoiceSchema, patchInvoiceSchema, createInvoiceLineSchema, patchInvoiceLineSchema,
  reorderInvoiceLinesSchema, cancelInvoiceSchema, prefixForCategory, type CreateInvoiceInput, type PatchInvoiceInput,
  type CreateInvoiceLineInput, type PatchInvoiceLineInput, type InvoiceStatus, type InvoiceCategory } from "@workspace/db/invoice-contracts";
import { db, type AppTransaction } from "../db";
import { InvoiceError, requireInvoice } from "./invoiceErrors";
import { normalizeQuantity } from "./estimateMath";
import { invoiceLineAmount, computeInvoiceSubtotal } from "./invoiceMath";
import { invoicePayload } from "./invoiceReads";
export { pushReadiness } from "./invoiceMath";

const invoiceWhere = (companyId: string, id: string) => and(eq(invoices.companyId, companyId), eq(invoices.id, id));
const linesWhere = (companyId: string, id: string) => and(eq(invoiceLines.companyId, companyId), eq(invoiceLines.invoiceId, id));
async function customerLock(tx: AppTransaction, companyId: string, id: string) {
  return requireInvoice((await tx.select().from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.id, id))).for("share"))[0]);
}
async function event(tx: AppTransaction, invoice: Invoice, actorId: string | null, kind: string, detail?: unknown) {
  await tx.insert(invoiceEvents).values({ companyId: invoice.companyId, invoiceId: invoice.id,
    revision: invoice.revision, actorId, kind, detail });
}
export async function createDraftInvoice(companyId: string, userId: string | null, raw: CreateInvoiceInput) {
  const input = createInvoiceSchema.parse(raw);
  return db.transaction(async tx => {
    const customer = await customerLock(tx, companyId, input.customerId);
    // next_value is the most recently allocated value, despite its historical
    // spec name: INSERT returns 1001; subsequent allocations increment once.
    const [counter] = await tx.insert(invoiceNumberSequences).values({ companyId, prefix: input.prefix, nextValue: 1001 })
      .onConflictDoUpdate({ target: [invoiceNumberSequences.companyId, invoiceNumberSequences.prefix],
        set: { nextValue: sql`${invoiceNumberSequences.nextValue} + 1` } }).returning();
    const [invoice] = await tx.insert(invoices).values({
      companyId, customerId: customer.id, invoicePrefix: input.prefix, invoiceSeq: counter.nextValue,
      kind: input.kind, title: input.title, memo: input.memo, poNumber: input.poNumber, txnDate: input.txnDate,
      sourceSummary: "Manual", createdById: userId,
    }).returning();
    await event(tx, invoice, userId, "created");
    return invoicePayload(tx, companyId, invoice);
  });
}
type Context = { tx: AppTransaction; invoice: Invoice };
/** Every existing draft mutation locks the company-qualified invoice FIRST. */
async function mutateDraft(companyId: string, id: string, work: (ctx: Context) => Promise<void>) {
  return db.transaction(async tx => {
    const invoice = requireInvoice((await tx.select().from(invoices).where(invoiceWhere(companyId, id)).for("update"))[0]);
    if (invoice.status !== "draft") throw new InvoiceError(409, "INVOICE_NOT_DRAFT");
    await work({ tx, invoice });
    const lines = await tx.select({ amountCents: invoiceLines.amountCents }).from(invoiceLines).where(linesWhere(companyId, id));
    const subtotalCents = computeInvoiceSubtotal(lines);
    const [updated] = await tx.update(invoices).set({ subtotalCents, updatedAt: new Date() }).where(invoiceWhere(companyId, id)).returning();
    return invoicePayload(tx, companyId, updated);
  });
}
export async function patchDraftInvoice(companyId: string, userId: string | null, id: string, raw: PatchInvoiceInput) {
  const input = patchInvoiceSchema.parse(raw);
  return mutateDraft(companyId, id, async ({ tx, invoice }) => {
    if (input.customerId !== undefined && input.customerId !== invoice.customerId) {
      if ((await tx.select({ id: invoiceLines.id }).from(invoiceLines).where(linesWhere(companyId, id)).limit(1)).length)
        throw new InvoiceError(409, "CUSTOMER_CHANGE_REQUIRES_EMPTY_INVOICE");
      await customerLock(tx, companyId, input.customerId);
    }
    await tx.update(invoices).set(input).where(invoiceWhere(companyId, id));
    await event(tx, invoice, userId, "header_updated", { fields: Object.keys(input) });
  });
}
function checkCategory(invoice: Invoice, category: InvoiceCategory) {
  if (prefixForCategory(category) !== invoice.invoicePrefix) throw new InvoiceError(409, "PREFIX_CATEGORY_MISMATCH");
}
async function lineFor(tx: AppTransaction, companyId: string, id: string, lineId: string) {
  const line = requireInvoice((await tx.select().from(invoiceLines)
    .where(and(linesWhere(companyId, id), eq(invoiceLines.id, lineId))))[0]);
  if (line.sourceType !== "manual") throw new InvoiceError(409, "MANUAL_LINE_REQUIRED");
  return line;
}
export async function createInvoiceLine(companyId: string, userId: string | null, id: string, raw: CreateInvoiceLineInput) {
  const input = createInvoiceLineSchema.parse(raw);
  return mutateDraft(companyId, id, async ({ tx, invoice }) => {
    checkCategory(invoice, input.category);
    const [actor] = userId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, userId)) : [];
    const [last] = await tx.select({ order: sql<number>`coalesce(max(${invoiceLines.displayOrder}), -1)` }).from(invoiceLines).where(linesWhere(companyId, id));
    const quantity = input.quantity == null ? null : normalizeQuantity(input.quantity);
    const rateCents = input.rateCents ?? null;
    const [line] = await tx.insert(invoiceLines).values({ ...input, companyId, invoiceId: id,
      quantity, rateCents, amountCents: invoiceLineAmount(quantity, rateCents), displayOrder: last.order + 1,
      sourceType: "manual", sourceId: null, sourceLabel: `Added by ${actor?.name.trim().split(/\s+/)[0] || "Unknown"}`, addedById: userId,
    }).returning();
    await event(tx, invoice, userId, "line_added", { lineId: line.id });
  });
}
export async function patchInvoiceLine(companyId: string, userId: string | null, id: string, lineId: string, raw: PatchInvoiceLineInput) {
  const input = patchInvoiceLineSchema.parse(raw);
  return mutateDraft(companyId, id, async ({ tx, invoice }) => {
    const line = await lineFor(tx, companyId, id, lineId);
    checkCategory(invoice, input.category ?? line.category);
    const quantity = input.quantity === undefined ? line.quantity : input.quantity === null ? null : normalizeQuantity(input.quantity);
    const rateCents = input.rateCents === undefined ? line.rateCents : input.rateCents;
    await tx.update(invoiceLines).set({ ...input, quantity, rateCents, amountCents: invoiceLineAmount(quantity, rateCents), updatedAt: new Date() })
      .where(and(linesWhere(companyId, id), eq(invoiceLines.id, lineId)));
    await event(tx, invoice, userId, "line_updated", { lineId, fields: Object.keys(input) });
  });
}
export async function deleteInvoiceLine(companyId: string, userId: string | null, id: string, lineId: string) {
  return mutateDraft(companyId, id, async ({ tx, invoice }) => {
    await lineFor(tx, companyId, id, lineId);
    await tx.delete(invoiceLines).where(and(linesWhere(companyId, id), eq(invoiceLines.id, lineId)));
    await event(tx, invoice, userId, "line_removed", { lineId });
  });
}
export async function reorderInvoiceLines(companyId: string, userId: string | null, id: string, rawIds: string[]) {
  const { lineIds } = reorderInvoiceLinesSchema.parse({ lineIds: rawIds });
  return mutateDraft(companyId, id, async ({ tx, invoice }) => {
    const rows = await tx.select({ id: invoiceLines.id }).from(invoiceLines).where(linesWhere(companyId, id));
    const members = new Set(rows.map(r => r.id));
    if (members.size !== lineIds.length || new Set(lineIds).size !== lineIds.length || lineIds.some(l => !members.has(l)))
      throw new InvoiceError(409, "INVALID_LINE_ORDER");
    if (lineIds.length) {
      const cases = sql.join(lineIds.map((lineId, order) => sql`WHEN ${lineId} THEN ${order}::integer`), sql` `);
      await tx.update(invoiceLines).set({ displayOrder: sql`CASE ${invoiceLines.id} ${cases} END`, updatedAt: new Date() }).where(linesWhere(companyId, id));
    }
    await event(tx, invoice, userId, "lines_reordered", { lineIds });
  });
}
/** THE ONLY existing-row status/live writer. Nothing else may write status or
 * live. Internal only (no HTTP endpoint); IC3/IC9 must call inside their transaction.
 * It acquires the invoice lock first, even when called outside mutateDraft. */
export async function setInvoiceStatus(tx: AppTransaction, companyId: string, id: string, status: InvoiceStatus) {
  // Runtime validation protects future internal callers too.
  const allowed: InvoiceStatus[] = ["draft", "issued", "void", "cancelled", "superseded"];
  if (!allowed.includes(status)) throw new InvoiceError(400, "INVALID_STATUS");
  requireInvoice((await tx.select({ id: invoices.id }).from(invoices).where(invoiceWhere(companyId, id)).for("update"))[0]);
  await tx.update(invoices).set({ status, updatedAt: new Date() }).where(invoiceWhere(companyId, id));
  await tx.update(invoiceLines).set({ live: status === "draft" || status === "issued", updatedAt: new Date() }).where(linesWhere(companyId, id));
}
export async function cancelDraftInvoice(companyId: string, userId: string | null, id: string, reason: string) {
  const input = cancelInvoiceSchema.parse({ reason });
  return mutateDraft(companyId, id, async ({ tx, invoice }) => {
    await setInvoiceStatus(tx, companyId, id, "cancelled");
    await tx.update(invoices).set({ cancelledAt: new Date(), cancelReason: input.reason }).where(invoiceWhere(companyId, id));
    await event(tx, invoice, userId, "cancelled", { reason: input.reason });
  });
}
