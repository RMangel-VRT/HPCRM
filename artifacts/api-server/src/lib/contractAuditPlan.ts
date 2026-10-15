import type { AgreementLine, AgreementForm, TermStatus, ContractDocument } from "@workspace/db";
import { dollarCents, MONTHS, type CsvRow, type Diagnostic, type AuditFiles } from "./contractAuditFiles";
import type { AuditData } from "./contractAuditData";
import { validateDates, validateSnow, validatePayments, paymentSummary, expandPayments, buildScope, snapshotRates,
  termFieldsSchema, ratesSchema, scopeSchema, type Payments } from "./contractCenterService";

type BuiltScope = ReturnType<typeof buildScope>;
type BuiltRates = ReturnType<typeof snapshotRates>;
export type ImportTerm = {
  source: CsvRow; contractRef: string; renewsRef?: string; legacyIds: string[];
  values: ReturnType<typeof termFieldsSchema.parse> & { status: TermStatus; signedAt: Date | null; reviewNote: string | null;
    annualPriceCents: number | null; billingType: ReturnType<typeof paymentSummary>["billingType"] };
  scope: BuiltScope; rates: BuiltRates; billing: ReturnType<typeof expandPayments>;
  documents: Array<{ source: ContractDocument; kind: "signed" | "their_form" | "other" }>;
  paymentCount: number;
};
export type ImportAgreement = { ref: string; line: AgreementLine; form: AgreementForm; replaceId?: string; terms: ImportTerm[] };
export type ImportCustomer = { id: string; name: string; managementId: string | null; agreements: ImportAgreement[] };
export type ImportPlan = { errors: Diagnostic[]; warnings: Diagnostic[]; customers: ImportCustomer[] };

/** Interpret a calendar signed day as noon Denver, including winter/summer offset. */
export function signedNoon(day: string): Date {
  validateDates(day, day);
  const utc = new Date(`${day}T12:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hourCycle: "h23" }).format(utc));
  return new Date(utc.getTime() + (12 - hour) * 3600000);
}
function message(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    return (error as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  return error instanceof Error ? error.message : "Invalid value";
}
export function planAuditImport(files: AuditFiles, data: AuditData): ImportPlan {
  const plan: ImportPlan = { errors: [...files.errors], warnings: [], customers: [] };
  const diagnostic = (row: CsvRow, msg: string, column?: string, warning = false) =>
    (warning ? plan.warnings : plan.errors).push({ file: row.file, row: row.row, column, contractRef: row.values.contract_ref, message: msg });
  const required = (row: CsvRow, column: string) => {
    const value = row.values[column];
    if (!value) diagnostic(row, "Required value", column);
    else if (/<[^>]+>/.test(value)) diagnostic(row, "Replace the template ID placeholder with an audit-export ID", column);
    return value ?? "";
  };
  const money = (row: CsvRow, column: string) => {
    if (!row.values[column]) return undefined;
    try { return dollarCents(row.values[column]); } catch (e) { diagnostic(row, message(e), column); return undefined; }
  };
  const integer = (row: CsvRow, column: string) => {
    const value = row.values[column];
    if (!value) return undefined;
    if (!/^\d+$/.test(value) || BigInt(value) > 2147483647n) { diagnostic(row, "Expected bounded non-negative integer", column); return undefined; }
    return Number(value);
  };
  const boolean = (row: CsvRow, column: string, fallback = false) => {
    if (!row.values[column]) return fallback;
    if (!["true", "false"].includes(row.values[column])) diagnostic(row, "Expected true or false", column);
    return row.values[column] === "true";
  };
  const attempt = <T>(row: CsvRow, fn: () => T, fallback: T, column?: string): T => {
    try { return fn(); } catch (e) { diagnostic(row, message(e), column); return fallback; }
  };
  const rows = files.tables["contracts.csv"] ?? [];
  const byRef = new Map<string, CsvRow>();
  const agreementOwners = new Map<string, CsvRow>();
  for (const row of rows) {
    const ref = required(row, "contract_ref"), agreementRef = required(row, "agreement_ref");
    required(row, "customer_id");
    for (const col of ["line", "form", "start_date", "end_date", "status"]) required(row, col);
    if (byRef.has(ref)) diagnostic(row, "Duplicate contract_ref", "contract_ref");
    else byRef.set(ref, row);
    const previous = agreementOwners.get(agreementRef);
    if (previous && ["customer_id", "line", "form"].some(k => previous.values[k] !== row.values[k]))
      diagnostic(row, "Agreement rows must agree on customer, line and form", "agreement_ref");
    else agreementOwners.set(agreementRef, row);
  }
  const replacements = new Set<string>();
  for (const [ref, row] of agreementOwners) {
    const existing = data.agreements.find(a => a.importRef === ref);
    if (existing) {
      if (existing.customerId !== row.values.customer_id) diagnostic(row, "Import reference belongs to another customer", "agreement_ref");
      else replacements.add(existing.id);
    }
  }
  const usedLegacy = new Set<string>(), usedDocuments = new Set<string>();
  for (const [file, childRows] of Object.entries(files.tables)) {
    if (file === "contracts.csv") continue;
    for (const row of childRows) {
      const ref = required(row, "contract_ref");
      if (!byRef.has(ref)) diagnostic(row, "Unknown contract_ref", "contract_ref");
    }
  }
  for (const row of rows) {
    const v = row.values;
    const customer = data.customers.find(c => c.id === v.customer_id);
    if (!customer) diagnostic(row, "Unknown customer in active company", "customer_id");
    else if (customer.isParent === "true") diagnostic(row, "Parent customers cannot have agreements", "customer_id");
    if (customer && v.customer_name && v.customer_name.toLowerCase() !== customer.name.toLowerCase())
      diagnostic(row, `Customer name does not match ${customer.name}`, "customer_name", true);
    const line = v.line as AgreementLine, form = v.form as AgreementForm;
    if (!["landscape", "snow", "both"].includes(line)) diagnostic(row, "Unknown line", "line");
    if (!["ours", "theirs"].includes(form)) diagnostic(row, "Unknown form", "form");
    const status = (v.status === "active" ? "signed" : v.status) as TermStatus;
    if (!["draft", "sent", "signed", "renewed", "lost", "cancelled"].includes(status)) diagnostic(row, "Unknown status", "status");
    attempt(row, () => validateDates(v.start_date, v.end_date), undefined, "start_date");
    const snowFlatPriceCents = money(row, "snow_flat_price");
    const values = { seasonLabel: v.season_label || (v.start_date?.slice(0, 4) === v.end_date?.slice(0, 4)
      ? v.start_date?.slice(0, 4) : `${v.start_date?.slice(0, 4)}–${v.end_date?.slice(2, 4)}`),
      startDate: v.start_date ?? "", endDate: v.end_date ?? "", snowPricing: v.snow_pricing as "time_and_materials" | "flat_rate" | undefined,
      snowFlatPriceCents, needsReview: boolean(row, "needs_review"),
      ...Object.fromEntries(["managing_agent_name", "legal_name", "project_contact", "contact_phone", "contact_email", "project_address", "po", "snow_triggers", "notes"]
        .filter(k => v[k] !== undefined).map(k => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v[k]])) };
    attempt(row, () => termFieldsSchema.parse(values), undefined);
    attempt(row, () => validateSnow(line, values), undefined, "snow_pricing");
    const signedAt = v.signed_date ? attempt(row, () => signedNoon(v.signed_date), null, "signed_date") : null;
    if (v.renews_ref) {
      const source = byRef.get(v.renews_ref);
      if (!source || source.values.agreement_ref !== v.agreement_ref || source.values.start_date >= v.start_date)
        diagnostic(row, "Renewal must reference an earlier season in the same agreement", "renews_ref");
      const visited = new Set([v.contract_ref]); let next: CsvRow | undefined = source;
      while (next) {
        if (visited.has(next.values.contract_ref)) { diagnostic(row, "Renewal chain forms a loop", "renews_ref"); break; }
        visited.add(next.values.contract_ref); next = byRef.get(next.values.renews_ref);
      }
    }
    const children = (file: string) => (files.tables[file] ?? []).filter(r => r.values.contract_ref === v.contract_ref);
    const payments: Payments = children("payments.csv").map(r => ({
      component: required(r, "payment_line"), months: MONTHS.flatMap((m, i) => {
        const amount = money(r, m); return amount ? [{ month: i + 1, amountCents: amount }] : [];
      }),
    }));
    if (line === "snow" && v.snow_pricing === "time_and_materials" && payments.length)
      diagnostic(children("payments.csv")[0], "Snow-only time-and-materials seasons must have no payment rows", "contract_ref");
    const paymentContext = children("payments.csv")[0] ?? row;
    attempt(paymentContext, () => validatePayments(payments), []);
    const summary = attempt(paymentContext, () => paymentSummary(payments, line, v.snow_pricing), { annualPriceCents: null, billingType: "monthly_variable" as const });
    const billing = attempt(paymentContext, () => expandPayments(payments, v.start_date, v.end_date), []);
    const rateInputs = children("rates.csv").map(r => {
      const key = required(r, "rate_key");
      if (!data.card.some(c => c.rateKey === key) && !key.startsWith("custom_")) diagnostic(r, "Non-card rates must start with custom_", "rate_key");
      const price = money(r, "price");
      const input = { rateKey: key, ...(price === undefined ? {} : { priceCents: price }),
        ...Object.fromEntries(["price_text", "minimum", "unit", "label", "category", "line"].filter(k => r.values[k] !== undefined)
          .map(k => [k === "price_text" ? "priceText" : k, r.values[k]])) };
      attempt(r, () => ratesSchema.element.parse(input), undefined);
      attempt(r, () => snapshotRates(data.card, [input], line), [], "rate_key");
      return input;
    });
    const rates = attempt(children("rates.csv")[0] ?? row, () => snapshotRates(data.card, rateInputs, line), []);
    const scopeInputs = children("scope.csv").map(r => {
      const quantity = integer(r, "quantity"), spread = MONTHS.some(m => r.values[m] !== undefined)
        ? MONTHS.map(m => integer(r, m) ?? 0) : undefined;
      if (spread && spread.reduce((a, b) => a + b, 0) !== quantity) diagnostic(r, "Scope distribution does not add up to quantity", "quantity", true);
      const key = required(r, "service_key");
      if (key.startsWith("other:") && !/^other:[a-z0-9][a-z0-9_-]*$/.test(key)) diagnostic(r, "Custom scope requires other:<slug>", "service_key");
      required(r, "included");
      const input = { serviceKey: key, included: boolean(r, "included"), quantity, unit: r.values.unit,
        monthSpread: spread, notes: r.values.notes, details: r.values.label ? { label: r.values.label } : {} };
      attempt(r, () => scopeSchema.element.parse(input), undefined);
      attempt(r, () => buildScope([input], line), [], "service_key");
      return input;
    });
    const scope = attempt(children("scope.csv")[0] ?? row, () => buildScope(scopeInputs, line), []);
    const legacyIds = v.legacy_contract_ids ? v.legacy_contract_ids.split(";").map(id => id.trim()) : [];
    for (const id of legacyIds) {
      const old = data.contracts.find(c => c.id === id);
      if (!old || old.customerId !== v.customer_id) diagnostic(row, "Unknown or cross-customer legacy contract ID", "legacy_contract_ids");
      if (usedLegacy.has(id)) diagnostic(row, "Legacy contract used on more than one season", "legacy_contract_ids");
      usedLegacy.add(id);
      const link = data.links.find(l => l.legacyContractId === id);
      const linkedTerm = link && data.terms.find(t => t.id === link.termId);
      if (link && (!linkedTerm || !replacements.has(linkedTerm.agreementId))) diagnostic(row, "Legacy contract is linked outside the agreements being replaced", "legacy_contract_ids");
      if (old && files.manifest && old.updatedAt.getTime() > Date.parse(files.manifest.exportedAt))
        diagnostic(row, "Changed in the old system after the export; re-check", "legacy_contract_ids", true);
    }
    const documents: ImportTerm["documents"] = [];
    for (const r of children("documents.csv")) {
      const id = required(r, "document_id"), kind = required(r, "kind");
      const doc = data.documents.find(d => d.id === id);
      const old = doc && data.contracts.find(c => c.id === doc.contractId);
      if (!doc || !old || old.customerId !== v.customer_id) diagnostic(r, "Unknown or cross-customer document ID", "document_id");
      if (usedDocuments.has(id)) diagnostic(r, "Document used on more than one season", "document_id");
      usedDocuments.add(id);
      if (!["signed", "their_form", "other"].includes(kind)) diagnostic(r, "Unknown document kind", "kind");
      if (doc) documents.push({ source: doc, kind: kind as "signed" | "their_form" | "other" });
    }
    if (!customer) continue;
    let group = plan.customers.find(c => c.id === customer.id);
    if (!group) { group = { id: customer.id, name: customer.name, managementId: customer.propertyManagementCompanyId, agreements: [] }; plan.customers.push(group); }
    let agreement = group.agreements.find(a => a.ref === v.agreement_ref);
    if (!agreement) {
      agreement = { ref: v.agreement_ref, line, form, replaceId: data.agreements.find(a => a.importRef === v.agreement_ref)?.id, terms: [] };
      group.agreements.push(agreement);
    }
    agreement.terms.push({ source: row, contractRef: v.contract_ref, renewsRef: v.renews_ref, legacyIds,
      values: { ...values, status, signedAt, reviewNote: v.review_note ?? null, ...summary },
      scope, rates, billing, documents, paymentCount: payments.length });
  }
  for (const customer of plan.customers) {
    const row = customer.agreements[0].terms[0].source;
    if (data.agreements.some(a => a.customerId === customer.id && a.importRef === null))
      diagnostic(row, "Customer has Contract Center agreements with no import_ref; they are left untouched. Skip those seasons in the audit CSVs.", undefined, true);
    for (const old of data.contracts.filter(c => c.customerId === customer.id && !usedLegacy.has(c.id)))
      diagnostic(row, `Old contract ${old.id} (${old.serviceType}, ${old.startDate.toISOString().slice(0, 10)} – ${old.endDate?.toISOString().slice(0, 10) ?? ""}) isn't covered by this import`, undefined, true);
    for (const agreement of customer.agreements) {
      agreement.terms.sort((a, b) => a.values.startDate.localeCompare(b.values.startDate));
      for (const [i, term] of agreement.terms.entries()) for (const other of agreement.terms.slice(i + 1))
        if (![term, other].some(t => ["renewed", "lost", "cancelled"].includes(t.values.status)) &&
          term.values.startDate <= other.values.endDate && other.values.startDate <= term.values.endDate)
          diagnostic(other.source, `Live seasons overlap with ${term.contractRef}`, "start_date", true);
      for (const old of data.terms.filter(t => t.agreementId === agreement.replaceId)) {
        const lastImport = data.history.filter(h => h.termId === old.id && h.note?.startsWith("Imported from audit ("))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        // Renew creates a term on the existing agreement, so its agreement may
        // still have an import_ref. Never cascade-delete post-audit additions.
        const importedCreation = data.history.some(h => h.termId === old.id && h.oldStatus === null && h.note?.startsWith("Imported from audit ("));
        if (!importedCreation)
          diagnostic(row, `Season ${old.seasonLabel} (${old.id}) was created in Contract Center, not by audit import. This agreement cannot be replaced; its season and documents are left untouched.`, "agreement_ref");
        for (const doc of data.termDocs.filter(d => d.termId === old.id)) {
          const importedSource = data.documents.some(source =>
            source.storageObjectPath === doc.storageObjectPath && source.filename === doc.filename &&
            source.mimeType === doc.mimeType && source.fileSize === doc.fileSize &&
            source.uploadedBy === doc.uploadedBy && source.version === doc.version &&
            source.uploadedAt.getTime() === doc.createdAt.getTime());
          if (!importedCreation || !importedSource)
            diagnostic(row, `Document ${doc.filename} (${doc.id}) on season ${old.seasonLabel} was attached in Contract Center. This agreement cannot be replaced; the document is left untouched.`, "agreement_ref");
        }
        if (lastImport && old.updatedAt > lastImport.createdAt)
          diagnostic(row, `Season ${old.seasonLabel}: Was edited after the last import; importing replaces those edits`, undefined, true);
      }
    }
  }
  return plan;
}

export function auditReport(plan: ImportPlan, dryRun: boolean) {
  const customers = plan.customers.map(c => ({ customerId: c.id, customerName: c.name,
    agreements: c.agreements.map(a => ({ agreementRef: a.ref, line: a.line, form: a.form, action: a.replaceId ? "replace" : "create",
      terms: a.terms.map(t => ({ contractRef: t.contractRef, season: t.values.seasonLabel, startDate: t.values.startDate,
        endDate: t.values.endDate, status: t.values.status, annualPrice: t.values.annualPriceCents, paymentLines: t.paymentCount,
        rates: t.rates.length, scope: t.scope.length, documents: t.documents.length, needsReview: t.values.needsReview ?? false })) })) }));
  const agreements = plan.customers.flatMap(c => c.agreements), terms = agreements.flatMap(a => a.terms);
  return { mode: "audit" as const, dryRun, errors: plan.errors, warnings: plan.warnings, customers,
    summary: { customers: customers.length, agreements: agreements.length, terms: terms.length,
      replaced: agreements.filter(a => a.replaceId).length, documents: terms.reduce((n, t) => n + t.documents.length, 0),
      warnings: plan.warnings.length, errors: plan.errors.length } };
}
