import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
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
  buildScope, snapshotRates, assertEditable, assertMove, selectRenewalSource, displayStatus,
  renewalSet,
} from "../lib/contractCenterService";
import {
  fullDetail, getTerm, getAgreement, lockAgreement, lockTerm, writeTerm, addHistory,
  activeCard, termWhere, listSummary, replaceRows, agreementSeasons,
} from "../lib/contractCenterPersistence";
import { planChangingRenewal } from "../lib/contractChangingRenewal";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAccessGroupType, ObjectPermission } from "../objectAcl";
import type { Session } from "express-session";
import { validateRfpCreation, loadLinkedContracts } from "../lib/rfpContracts";
import { applyContractStatus } from "../lib/contractCenterStatusChange";

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
    const filter = z.object({ bidTicketId: z.string().min(1).optional(), line: z.enum(["landscape", "snow"]).optional(), customerId: z.string().min(1).optional(),
      includeParent: z.enum(["true", "false"]).optional(), q: z.string().max(200).optional() }).parse(req.query);
    const companyId = user.activeCompanyId;
    if (filter.bidTicketId) {
      res.json(await loadLinkedContracts(db, companyId, [filter.bidTicketId]));
      return;
    }
    const companyCustomers = await db.select().from(customers).where(eq(customers.companyId, companyId));
    const customer = filter.customerId ? companyCustomers.find(c => c.id === filter.customerId) : undefined;
    if (filter.customerId && !customer) throw new ContractCenterError(404, "Customer not found");
    const parent = filter.includeParent === "true" && customer?.parentCustomerId
      ? companyCustomers.find(c => c.id === customer.parentCustomerId) : undefined;
    const rows = await db.select().from(agreements).where(eq(agreements.companyId, companyId));
    const terms = await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
    const selected = rows.filter(a => companyCustomers.some(c => c.id === a.customerId &&
      (!filter.q || c.name.toLowerCase().includes(filter.q.toLowerCase()))) &&
      (!filter.line || (() => {
        const s = listSummary(terms.filter(t => t.agreementId === a.id));
        return [s.current ?? s.latest, s.renewalDraft].some(t => t?.line === filter.line || t?.line === "both");
      })()) &&
      (!filter.customerId || a.customerId === filter.customerId || a.customerId === parent?.id));
    const billing = parent ? await db.select().from(termBillingMonths).where(eq(termBillingMonths.companyId, companyId)) : [];
    res.json(selected.map(agreement => {
      const owner = companyCustomers.find(c => c.id === agreement.customerId)!;
      const summary = listSummary(terms.filter(t => t.agreementId === agreement.id));
      const viaParent = !!parent && agreement.customerId === parent.id;
      const term = summary.current ?? summary.renewalDraft ?? summary.latest;
      const display = summary.current ?? summary.latest;
      return { ...agreement, line: display?.line, form: display?.form, customerName: owner.name, ...summary,
        locationCount: owner.isParent === "true" ? companyCustomers.filter(c => c.parentCustomerId === owner.id).length : 0,
        ...(viaParent ? { viaParent: true, parentName: owner.name,
          branch: { name: customer!.name, billingCode: customer!.customerNumber },
          payments: term ? recoverPayments(billing.filter(b => b.termId === term.id)) : [] } : {}) };
    }));
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
    validateDates(body.term.startDate, body.term.endDate); validateSnow(body.line, body.term);
    const detail = await db.transaction(async tx => {
      const bid = body.bidTicketId ? await validateRfpCreation(tx, companyId, body.bidTicketId, customer) : null;
      const managementId = body.propertyManagementCompanyId ?? customer.propertyManagementCompanyId;
      if (managementId) {
        const [management] = await tx.select().from(propertyManagementCompanies).where(and(eq(propertyManagementCompanies.id, managementId), eq(propertyManagementCompanies.companyId, companyId)));
        if (!management) throw new ContractCenterError(404, "Management company not found");
      }
      const scope = buildScope(body.scope, body.line), rates = snapshotRates(await activeCard(tx, companyId), body.rates, body.line);
      const billing = expandPayments(body.payments, body.term.startDate, body.term.endDate);
      const [agreement] = await tx.insert(agreements).values({ companyId, customerId: body.customerId,
        propertyManagementCompanyId: managementId }).returning();
      const term = await writeTerm(tx, companyId, user.id, null, { ...body.term, bidTicketId: body.bidTicketId ?? null, line: body.line, form: body.form, agreementId: agreement.id, status: "draft",
        ...paymentSummary(body.payments, body.line, body.term.snowPricing) }, bid ? `Created from RFP ${bid.estimateNumber || bid.title}` : "Created in the Contract Center");
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
      validateDates(next.startDate, next.endDate); validateSnow(term.line, next);
      const payments = recoverPayments(await tx.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, id)));
      const row = await writeTerm(tx, companyId, userId, term, { ...updates,
        ...paymentSummary(payments, term.line, next.snowPricing) }, Object.keys(updates).join(", "));
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
        if (part === "scope") await replaceRows(tx, companyId, id, termScopeLines, buildScope(scopeSchema.parse(input), term.line));
        if (part === "rates") await replaceRows(tx, companyId, id, termRates, snapshotRates(await activeCard(tx, companyId), ratesSchema.parse(input), term.line));
        let summary = {};
        if (part === "payments") {
          const payments = paymentsSchema.parse(input);
          summary = paymentSummary(payments, term.line, term.snowPricing);
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
    const row = await db.transaction(tx => applyContractStatus(tx, { companyId, userId, termId: id, to: body.to, note: body.note }));
    res.json(row);
  }));
  app.post("/api/contract-center/contracts/:agreementId/renew", handle(async (req, res, user) => {
    const body = renewSchema.parse(req.body), { companyId, userId, id } = context(req, user);
    const result = await db.transaction(async tx => {
      const agreement = body.dryRun ? await getAgreement(tx, companyId, id) : await lockAgreement(tx, companyId, id);
      const terms = await tx.select().from(agreementTerms).where(and(eq(agreementTerms.agreementId, id), eq(agreementTerms.companyId, companyId)));
      const source = selectRenewalSource(terms);
      if (!source || !["active", "signed", "expired"].includes(displayStatus(source, terms))) throw new ContractCenterError(409, "Current term cannot be renewed");
      if (terms.some(t => t.renewedFromTermId === source.id && ["draft", "sent"].includes(t.status))) throw new ContractCenterError(409, "A draft or sent renewal already exists");
      const scope = await tx.select().from(termScopeLines).where(termWhere(termScopeLines, companyId, source.id));
      const oldRates = await tx.select().from(termRates).where(termWhere(termRates, companyId, source.id));
      const before = recoverPayments(await tx.select().from(termBillingMonths).where(termWhere(termBillingMonths, companyId, source.id)));
      const plan = planChangingRenewal(source, before, scope, oldRates, await activeCard(tx, companyId), body);
      if (body.dryRun) return plan;
      let previous = source;
      const range = `${plan.years[0].startDate.slice(0, 4)}–${plan.years[plan.years.length - 1].endDate.slice(0, 4)}`;
      for (const [i, year] of plan.years.entries()) {
        const { before: _before, after, payments: _payments, snowFlatPrice: _snow, ...fields } = year;
        const term = await writeTerm(tx, companyId, userId, null, { ...fields, agreementId: id, renewedFromTermId: previous.id },
          `Renewed from ${previous.seasonLabel} (year ${i + 1} of ${range} renewal, ${fields.renewalIncreasePct === null ? "new annual price" :
            `${Number(fields.renewalIncreasePct) >= 0 ? "+" : ""}${fields.renewalIncreasePct}%`})`);
        await replaceRows(tx, companyId, term.id, termScopeLines, plan.scope);
        await replaceRows(tx, companyId, term.id, termRates, plan.rates);
        await replaceRows(tx, companyId, term.id, termBillingMonths, expandPayments(after, fields.startDate, fields.endDate));
        previous = term;
      }
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
      const { term } = await lockTerm(tx, companyId, id);
      if (body.kind === "signed") {
        const terms = await agreementSeasons(tx, companyId, term.agreementId);
        const first = renewalSet(terms, terms.find(t => t.id === id)!)[0];
        if (first.id !== id) throw new ContractCenterError(409, `Upload the signed document to ${first.seasonLabel}.`);
      }
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
