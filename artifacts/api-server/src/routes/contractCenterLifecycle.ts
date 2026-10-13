import type { Express, Request, Response } from "express";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  agreements, agreementTerms, customers, propertyManagementCompanies, termLegacySources,
  termScopeLines, termRates, termBillingMonths, termDocuments, type TermStatus,
} from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { pickProvided } from "../lib/patchBody";
import {
  ContractCenterError, createContractSchema, termFieldsSchema, scopeSchema, ratesSchema, paymentsSchema,
  renewSchema, validateDates, validateSnow, expandPayments, recoverPayments, paymentSummary,
  buildScope, snapshotRates, assertEditable, assertMove, selectCurrent, displayStatus,
  increasedPayments, renewalDates, renewalRates, cents,
} from "../lib/contractCenterService";
import {
  fullDetail, getTerm, getAgreement, lockAgreement, lockTerm, writeTerm, addHistory,
  activeCard, termWhere, listSummary, type Transaction,
} from "../lib/contractCenterPersistence";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAccessGroupType, ObjectPermission } from "../objectAcl";
import { assertNotParentCustomer } from "../utils/parentGuard";
import type { Session } from "express-session";

type Authorize = (req: Request, res: Response) => UserWithContext | null;
type UploadSession = Session & { contractCenterUploads?: Record<string, { companyId: string; termId: string }> };
const documentsSchema = z.object({
  uploadURL: z.string().min(1), filename: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(0).max(2147483647), mimeType: z.string().trim().min(1).max(150),
  kind: z.enum(["signed", "their_form", "other"]),
});
function context(req: Request, user: UserWithContext) {
  return { companyId: user.activeCompanyId, userId: user.id, id: String(req.params.termId ?? req.params.agreementId) };
}
async function replaceRows(tx: Transaction, companyId: string, termId: string,
  table: typeof termScopeLines | typeof termRates | typeof termBillingMonths, rows: object[]) {
  await tx.delete(table).where(termWhere(table, companyId, termId));
  if (rows.length) {
    // Each call is made with a validated service output for its table.
    await tx.insert(table).values(rows.map(row => ({ ...row, companyId, termId })) as never);
  }
}
export function registerContractCenterLifecycle(app: Express, authorize: Authorize) {
  const handle = (fn: (req: Request, res: Response, user: UserWithContext) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const user = authorize(req, res); if (!user) return;
      try { await fn(req, res, user); } catch (error) {
        if (error instanceof ContractCenterError) { res.status(error.status).json({ message: error.message, ...(error.allowed ? { allowed: error.allowed } : {}) }); return; }
        if (error instanceof z.ZodError) { res.status(400).json({ message: error.message }); return; }
        req.log?.error({ err: error }, "Contract Center request failed");
        res.status(500).json({ message: "Contract Center request failed" });
      }
    };
  app.get("/api/contract-center/contracts", handle(async (req, res, user) => {
    const filter = z.object({ line: z.enum(["landscape", "snow"]).optional(), customerId: z.string().min(1).optional(), q: z.string().max(200).optional() }).parse(req.query);
    const companyId = user.activeCompanyId;
    if (filter.customerId) {
      const [customer] = await db.select().from(customers).where(and(eq(customers.id, filter.customerId), eq(customers.companyId, companyId)));
      if (!customer) throw new ContractCenterError(404, "Customer not found");
    }
    const rows = await db.select({ agreement: agreements, customerName: customers.name }).from(agreements)
      .innerJoin(customers, and(eq(customers.id, agreements.customerId), eq(customers.companyId, companyId)))
      .where(and(eq(agreements.companyId, companyId),
        filter.line ? inArray(agreements.line, [filter.line, "both"]) : undefined,
        filter.customerId ? eq(agreements.customerId, filter.customerId) : undefined,
        filter.q ? ilike(customers.name, `%${filter.q}%`) : undefined));
    const terms = await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
    res.json(rows.map(({ agreement, customerName }) => ({ ...agreement, customerName, ...listSummary(terms.filter(t => t.agreementId === agreement.id)) })));
  }));
  app.get("/api/contract-center/contracts/by-legacy/:legacyContractId", handle(async (req, res, user) => {
    const [row] = await db.select({ agreementId: agreementTerms.agreementId }).from(termLegacySources)
      .innerJoin(agreementTerms, and(eq(agreementTerms.id, termLegacySources.termId), eq(agreementTerms.companyId, user.activeCompanyId)))
      .where(and(eq(termLegacySources.companyId, user.activeCompanyId), eq(termLegacySources.legacyContractId, String(req.params.legacyContractId))));
    if (!row) throw new ContractCenterError(404, "Contract not found");
    await getAgreement(db, user.activeCompanyId, row.agreementId);
    res.json(row);
  }));
  app.get("/api/contract-center/contracts/:agreementId", handle(async (req, res, user) => {
    res.json(await fullDetail(db, user.activeCompanyId, String(req.params.agreementId)));
  }));
  app.post("/api/contract-center/contracts", handle(async (req, res, user) => {
    const body = createContractSchema.parse(req.body), companyId = user.activeCompanyId;
    const [customer] = await db.select().from(customers).where(and(eq(customers.id, body.customerId), eq(customers.companyId, companyId)));
    if (!customer) throw new ContractCenterError(404, "Customer not found");
    if (await assertNotParentCustomer(body.customerId, companyId, res)) return;
    validateDates(body.term.startDate, body.term.endDate); validateSnow(body.line, body.term);
    const detail = await db.transaction(async tx => {
      const managementId = body.propertyManagementCompanyId ?? customer.propertyManagementCompanyId;
      if (managementId) {
        const [management] = await tx.select().from(propertyManagementCompanies).where(and(eq(propertyManagementCompanies.id, managementId), eq(propertyManagementCompanies.companyId, companyId)));
        if (!management) throw new ContractCenterError(404, "Management company not found");
      }
      const scope = buildScope(body.scope, body.line), rates = snapshotRates(await activeCard(tx, companyId), body.rates, body.line);
      const billing = expandPayments(body.payments, body.term.startDate, body.term.endDate);
      const [agreement] = await tx.insert(agreements).values({ companyId, customerId: body.customerId,
        line: body.line, form: body.form, propertyManagementCompanyId: managementId }).returning();
      const term = await writeTerm(tx, companyId, user.id, null, { ...body.term, agreementId: agreement.id, status: "draft",
        ...paymentSummary(body.payments, body.line, body.term.snowPricing) }, "Created in the Contract Center");
      await replaceRows(tx, companyId, term.id, termScopeLines, scope);
      await replaceRows(tx, companyId, term.id, termRates, rates);
      await replaceRows(tx, companyId, term.id, termBillingMonths, billing);
      return fullDetail(tx, companyId, agreement.id);
    });
    res.status(201).json(detail);
  }));
  app.patch("/api/contract-center/terms/:termId", handle(async (req, res, user) => {
    const parsed = termFieldsSchema.partial().parse(req.body);
    const updates = pickProvided(parsed, req.body);
    if (!Object.keys(updates).length) throw new ContractCenterError(400, "Nothing to update");
    const { companyId, userId, id } = context(req, user);
    const result = await db.transaction(async tx => {
      const { term, agreement } = await lockTerm(tx, companyId, id); assertEditable(term.status);
      const next = { ...term, ...updates };
      validateDates(next.startDate, next.endDate); validateSnow(agreement.line, next);
      const payments = recoverPayments(await tx.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, id)));
      const row = await writeTerm(tx, companyId, userId, term, { ...updates,
        ...paymentSummary(payments, agreement.line, next.snowPricing) }, Object.keys(updates).join(", "));
      if (next.startDate !== term.startDate || next.endDate !== term.endDate)
        await replaceRows(tx, companyId, id, termBillingMonths, expandPayments(payments, next.startDate, next.endDate));
      return row;
    });
    res.json(result);
  }));
  for (const part of ["scope", "rates", "payments"] as const) {
    app.put(`/api/contract-center/terms/:termId/${part}`, handle(async (req, res, user) => {
      // Accept the named field or the array itself for full replacements.
      const input = Array.isArray(req.body) ? req.body : req.body?.[part];
      const { companyId, userId, id } = context(req, user);
      const result = await db.transaction(async tx => {
        const { term, agreement } = await lockTerm(tx, companyId, id); assertEditable(term.status);
        if (part === "scope") await replaceRows(tx, companyId, id, termScopeLines, buildScope(scopeSchema.parse(input), agreement.line));
        if (part === "rates") await replaceRows(tx, companyId, id, termRates, snapshotRates(await activeCard(tx, companyId), ratesSchema.parse(input), agreement.line));
        let summary = {};
        if (part === "payments") {
          const payments = paymentsSchema.parse(input);
          summary = paymentSummary(payments, agreement.line, term.snowPricing);
          await replaceRows(tx, companyId, id, termBillingMonths, expandPayments(payments, term.startDate, term.endDate));
        }
        return writeTerm(tx, companyId, userId, term, summary, part);
      });
      res.json(result);
    }));
  }
  app.post("/api/contract-center/terms/:termId/status", handle(async (req, res, user) => {
    const body = z.object({ to: z.string(), note: z.string().max(10000).optional() }).parse(req.body);
    const { companyId, userId, id } = context(req, user);
    const row = await db.transaction(async tx => {
      const { term } = await lockTerm(tx, companyId, id); assertMove(term, body.to);
      const source = term.renewedFromTermId ? await getTerm(tx, companyId, term.renewedFromTermId) : null;
      if (source && source.agreementId !== term.agreementId) throw new ContractCenterError(404, "Renewal source not found");
      const updated = await writeTerm(tx, companyId, userId, term, { status: body.to as TermStatus,
        ...(body.to === "sent" ? { sentAt: new Date() } : {}),
        ...(body.to === "signed" ? { signedAt: new Date() } : {}) }, body.note ?? `Status changed to ${body.to}`);
      if (source && body.to === "signed") await writeTerm(tx, companyId, userId, source, { status: "renewed" }, `Renewed by ${term.seasonLabel}`);
      if (source && body.to === "lost") await addHistory(tx, companyId, userId, source, "Renewal lost");
      return updated;
    });
    res.json(row);
  }));
  app.post("/api/contract-center/contracts/:agreementId/renew", handle(async (req, res, user) => {
    const body = renewSchema.parse(req.body), { companyId, userId, id } = context(req, user);
    const result = await db.transaction(async tx => {
      const agreement = body.dryRun ? await getAgreement(tx, companyId, id) : await lockAgreement(tx, companyId, id);
      const terms = await tx.select().from(agreementTerms).where(and(eq(agreementTerms.agreementId, id), eq(agreementTerms.companyId, companyId)));
      const source = selectCurrent(terms);
      if (!source || !["active", "signed", "expired"].includes(displayStatus(source, terms))) throw new ContractCenterError(409, "Current term cannot be renewed");
      if (terms.some(t => t.renewedFromTermId === source.id && ["draft", "sent"].includes(t.status))) throw new ContractCenterError(409, "A draft or sent renewal already exists");
      const scope = await tx.select().from(termScopeLines).where(termWhere(termScopeLines, companyId, source.id));
      const oldRates = await tx.select().from(termRates).where(termWhere(termRates, companyId, source.id));
      const before = recoverPayments(await tx.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, source.id)));
      const after = increasedPayments(before, body.increasePct, body.roundTo);
      const { rates, changes } = renewalRates(oldRates, await activeCard(tx, companyId), agreement.line);
      const dates = renewalDates(source);
      const snowAfter = source.snowFlatPriceCents === null ? null : Math.round(source.snowFlatPriceCents * (100 + body.increasePct) / 100);
      if (snowAfter !== null) cents.parse(snowAfter);
      const fields = {
        ...dates, agreementId: id, status: "draft" as const, renewedFromTermId: source.id,
        renewalIncreasePct: String(body.increasePct), legalName: source.legalName, managingAgentName: source.managingAgentName,
        projectContact: source.projectContact, contactPhone: source.contactPhone, contactEmail: source.contactEmail,
        projectAddress: source.projectAddress, snowTriggers: source.snowTriggers, po: source.po, notes: source.notes,
        snowPricing: source.snowPricing ?? (agreement.line === "landscape" ? null : "time_and_materials"),
        snowFlatPriceCents: snowAfter, ...paymentSummary(after, agreement.line, source.snowPricing),
      };
      validateSnow(agreement.line, fields);
      if (body.dryRun) return { ...fields, payments: before.map((p, i) => ({ component: p.component, before: p.months, after: after[i].months })),
        snowFlatPrice: { before: source.snowFlatPriceCents, after: snowAfter }, rateChanges: changes };
      const term = await writeTerm(tx, companyId, userId, null, fields,
        `Renewed from ${source.seasonLabel} at ${body.increasePct >= 0 ? "+" : ""}${body.increasePct}%`);
      await replaceRows(tx, companyId, term.id, termScopeLines, scope.map(({ id: _id, companyId: _company, termId: _term, createdAt: _created, updatedAt: _updated, ...s }) => s));
      await replaceRows(tx, companyId, term.id, termRates, rates);
      await replaceRows(tx, companyId, term.id, termBillingMonths, expandPayments(after, dates.startDate, dates.endDate));
      return fullDetail(tx, companyId, id);
    });
    res.status(body.dryRun ? 200 : 201).json(result);
  }));
  app.post("/api/contract-center/terms/:termId/documents/upload-url", handle(async (req, res, user) => {
    await getTerm(db, user.activeCompanyId, String(req.params.termId));
    const service = new ObjectStorageService(), uploadURL = await service.getObjectEntityUploadURL();
    const session = req.session as UploadSession;
    // Bind uploaded objects to the authorized company/term, not an arbitrary client URL.
    const pending = session.contractCenterUploads ?? {};
    session.contractCenterUploads = Object.fromEntries(Object.entries(pending).slice(-49));
    session.contractCenterUploads[service.normalizeObjectEntityPath(uploadURL)] = { companyId: user.activeCompanyId, termId: String(req.params.termId) };
    res.json({ uploadURL });
  }));
  app.post("/api/contract-center/terms/:termId/documents", handle(async (req, res, user) => {
    const body = documentsSchema.parse(req.body), { companyId, userId, id } = context(req, user);
    const row = await db.transaction(async tx => {
      await lockTerm(tx, companyId, id);
      const service = new ObjectStorageService(), path = service.normalizeObjectEntityPath(body.uploadURL);
      if (!path.startsWith("/objects/")) throw new ContractCenterError(400, "Invalid storage object path");
      const binding = (req.session as UploadSession).contractCenterUploads?.[path];
      if (!binding || binding.companyId !== companyId || binding.termId !== id) throw new ContractCenterError(404, "Upload not found for this term");
      await service.getObjectEntityFile(path);
      await service.trySetObjectEntityAclPolicy(body.uploadURL, { owner: userId, visibility: "private",
        aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: companyId }, permission: ObjectPermission.READ }] });
      const existing = await tx.select().from(termDocuments).where(and(termWhere(termDocuments, companyId, id), eq(termDocuments.kind, body.kind)));
      const version = Math.max(0, ...existing.map(d => d.version)) + 1;
      const [document] = await tx.insert(termDocuments).values({ companyId, termId: id, uploadedBy: userId,
        version, storageObjectPath: path, filename: body.filename, fileSize: body.fileSize, mimeType: body.mimeType, kind: body.kind }).returning();
      return document;
    });
    delete (req.session as UploadSession).contractCenterUploads?.[row.storageObjectPath];
    res.status(201).json(row);
  }));
}
