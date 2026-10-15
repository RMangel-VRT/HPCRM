import type { AgreementTerm, AgreementLine, AgreementForm, TermScopeLine } from "@workspace/db";
import type { AuditData } from "./contractAuditData";
import type { AuditFiles, CsvRow, Diagnostic } from "./contractAuditFiles";
import { planAuditImport, type ImportTerm } from "./contractAuditPlan";
import { renewalRates, snapshotRates } from "./contractCenterService";
import { addCalendarDays } from "./companyDay";

export type RenewalTerm = Omit<ImportTerm, "documents" | "scope"> & {
  scope: (ImportTerm["scope"][number] | Omit<TermScopeLine, "id" | "companyId" | "termId" | "createdAt" | "updatedAt">)[];
  sourceTerm: AgreementTerm; agreementId: string; skipped: boolean;
  line: AgreementLine; form: AgreementForm;
  documents: { file: string; kind: "signed" | "their_form" | "other" }[];
  values: ImportTerm["values"] & { renewalIncreasePct?: string };
};
export type RenewalPlan = { errors: Diagnostic[]; warnings: Diagnostic[]; customers: {
  id: string; name: string; terms: RenewalTerm[];
}[] };
const fields = "legal_name managing_agent_name project_contact contact_phone contact_email project_address po snow_triggers notes".split(" ");
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export function planRenewalImport(files: AuditFiles, data: AuditData): RenewalPlan {
  const plan: RenewalPlan = { errors: [...files.errors], warnings: [], customers: [] };
  const diag = (r: CsvRow, message: string, column?: string, warning = false) =>
    (warning ? plan.warnings : plan.errors).push({ file: r.file, row: r.row, contractRef: r.values.contract_ref, column, message });
  const rows = files.tables["renewals.csv"] ?? [];
  const refs = new Set<string>(), sources = new Set<string>();
  for (const r of rows) {
    const v = r.values;
    if (!v.contract_ref) diag(r, "Required value", "contract_ref");
    else if (refs.has(v.contract_ref)) diag(r, "Duplicate contract_ref", "contract_ref");
    refs.add(v.contract_ref);
    if (sources.has(v.renews_term_id)) diag(r, "Two rows renew the same source", "renews_term_id");
    sources.add(v.renews_term_id);
  }
  for (const [name, children] of Object.entries(files.tables)) if (name !== "renewals.csv")
    for (const r of children) if (!r.values.contract_ref || !refs.has(r.values.contract_ref))
      diag(r, "Unknown contract_ref", "contract_ref");
  for (const row of rows) {
    const v = row.values, source = data.terms.find(t => t.id === v.renews_term_id);
    const agreement = source && data.agreements.find(a => a.id === source.agreementId);
    const customer = agreement && data.customers.find(c => c.id === agreement.customerId);
    if (!source || !agreement || !customer) { diag(row, "Unknown renewal source in active company", "renews_term_id"); continue; }
    const renewals = data.terms.filter(t => t.renewedFromTermId === source.id);
    const skipped = renewals.some(t => t.startDate === v.start_date &&
      data.history.some(h => h.termId === t.id && h.note?.startsWith("Imported signed renewal (")));
    if (skipped) diag(row, "Already imported; skipped", undefined, true);
    else {
      if (["lost", "cancelled"].includes(source.status)) diag(row, "Lost or cancelled seasons cannot be renewed", "renews_term_id");
      if (renewals.some(t => ["signed", "active", "renewed"].includes(t.status))) diag(row, "Source already has a signed, active or renewed renewal", "renews_term_id");
      if (renewals.some(t => ["draft", "sent"].includes(t.status)))
        diag(row, "A draft or sent renewal already exists; cancel it in the Contract Center first, or import this as its replacement next time", "renews_term_id");
    }
    if (!["draft", "sent", "signed"].includes(v.status)) diag(row, "Status must be draft, sent or signed", "status");
    if (v.status === "signed" && !v.signed_date) diag(row, "Signed rows require signed_date", "signed_date");
    if (v.start_date <= source.startDate) diag(row, "New start must be after the source start", "start_date");
    if (v.start_date !== addCalendarDays(source.endDate, 1))
      diag(row, `Gap or overlap with ${source.seasonLabel}: ${source.startDate} – ${source.endDate}`, "start_date", true);
    const children = (name: string) => (files.tables[name] ?? []).filter(r => r.values.contract_ref === v.contract_ref);
    const inherited: Record<string, string> = {};
    for (const key of fields) {
      const value = source[camel(key) as keyof AgreementTerm];
      if (value != null) inherited[key] = String(value);
    }
    const snowPricing = v.snow_pricing || source.snowPricing || undefined;
    const snowPrice = v.snow_flat_price || (source.snowFlatPriceCents == null ? undefined :
      `${Math.floor(source.snowFlatPriceCents / 100)}.${String(source.snowFlatPriceCents % 100).padStart(2, "0")}`);
    const synthetic = { ...row, values: { ...inherited, ...v, agreement_ref: agreement.id, customer_id: customer.id,
      line: agreement.line, form: agreement.form, ...(snowPricing ? { snow_pricing: snowPricing } : {}),
      ...(snowPrice ? { snow_flat_price: snowPrice } : {}) } };
    let rates = renewalRates((data.rates ?? []).filter(r => r.termId === source.id), data.card, agreement.line).rates;
    const overrideRows = children("rates.csv").map(r => {
      const existing = rates.find(rate => rate.rateKey === r.values.rate_key);
      return existing ? { ...r, values: { label: existing.label, unit: existing.unit, category: existing.category,
        line: existing.line, ...r.values } } : r;
    });
    // Renew retains custom/retired rates; allow partial overrides of those
    // snapshots without requiring their metadata to be repeated in the CSV.
    const builderCard = data.card.map(c => rates.some(r => r.rateKey === c.rateKey) ? { ...c, active: true } : c);
    for (const rate of rates) if (!builderCard.some(c => c.rateKey === rate.rateKey))
      builderCard.push({ ...rate, id: rate.rateKey, companyId: agreement.companyId, active: true,
        createdAt: source.createdAt, updatedAt: source.updatedAt });
    // Reuse audit's exact money, CSV child validation and canonical builders.
    const built = planAuditImport({ filename: files.filename, errors: [], tables: {
      "contracts.csv": [synthetic], "payments.csv": children("payments.csv"), "scope.csv": children("scope.csv"),
      "rates.csv": overrideRows, "documents.csv": [],
    } }, { ...data, card: builderCard, agreements: [], terms: [], contracts: [], documents: [], links: [], termDocs: [], history: [] });
    plan.errors.push(...built.errors); plan.warnings.push(...built.warnings);
    const term = built.customers[0]?.agreements[0]?.terms[0];
    if (!term) continue;
    if (!(agreement.line === "snow" && snowPricing === "time_and_materials") &&
        (!children("payments.csv").length || term.values.annualPriceCents == null))
      diag(row, "Payments must be supplied for the new season", "contract_ref");
    if (v.renewal_increase_pct !== undefined &&
        (!/^-?\d+(?:\.\d{1,2})?$/.test(v.renewal_increase_pct) || Math.abs(Number(v.renewal_increase_pct)) > 999.99))
      diag(row, "Expected a percentage with at most two decimals between -999.99 and 999.99", "renewal_increase_pct");
    for (const r of children("rates.csv")) {
      try {
        const existing = rates.find(rate => rate.rateKey === r.values.rate_key);
        const supplied = term.rates.find(rate => rate.rateKey === r.values.rate_key);
        if (!supplied) continue;
        const keys = Object.keys(r.values).filter(k => k !== "contract_ref" && k !== "rate_key")
          .map(k => k === "price" ? "priceCents" : camel(k));
        if (existing) rates = rates.map(rate => rate === existing ? { ...rate,
          ...Object.fromEntries(keys.map(k => [k, supplied[k as keyof typeof supplied]])) } : rate);
        else {
          // Validation of custom metadata is shared with normal rate snapshots.
          snapshotRates(data.card, [supplied], agreement.line);
          rates.push(supplied);
        }
      } catch { diag(r, "Invalid rate override", "rate_key"); }
    }
    const documents: RenewalTerm["documents"] = [];
    const seenDocs = new Set<string>();
    for (const r of children("documents.csv")) {
      const { file, kind } = r.values;
      if (!file || !files.pdfs?.[file]) diag(r, "Referenced PDF is missing, invalid or too large", "file");
      if (!["signed", "their_form", "other"].includes(kind)) diag(r, "Unknown document kind", "kind");
      if (seenDocs.has(file)) diag(r, "Duplicate document reference", "file");
      seenDocs.add(file);
      if (file && files.pdfs?.[file] && ["signed", "their_form", "other"].includes(kind))
        documents.push({ file, kind: kind as RenewalTerm["documents"][number]["kind"] });
    }
    if (v.status === "signed" && !documents.some(d => d.kind === "signed"))
      diag(row, "Signed row has no signed document attached", "status", true);
    const scope = children("scope.csv").length ? term.scope : (data.scope ?? []).filter(s => s.termId === source.id)
      .map(({ id: _id, companyId: _company, termId: _term, createdAt: _created, updatedAt: _updated, ...s }) => s);
    let group = plan.customers.find(c => c.id === customer.id);
    if (!group) { group = { id: customer.id, name: customer.name, terms: [] }; plan.customers.push(group); }
    group.terms.push({ ...term, sourceTerm: source, agreementId: agreement.id, line: agreement.line, form: agreement.form, skipped, scope, rates, documents,
      values: { ...term.values, ...(v.renewal_increase_pct ? { renewalIncreasePct: v.renewal_increase_pct } : {}) } });
  }
  return plan;
}
export function renewalReport(plan: RenewalPlan, dryRun: boolean) {
  const terms = plan.customers.flatMap(c => c.terms).filter(t => !t.skipped);
  return { mode: "renewal" as const, dryRun, errors: plan.errors, warnings: plan.warnings,
    customers: plan.customers.map(c => ({ customerId: c.id, customerName: c.name,
      agreements: [...new Set(c.terms.map(t => t.agreementId))].map(id => ({
        agreementRef: id, action: "add renewal", line: c.terms.find(t => t.agreementId === id)!.line,
        form: c.terms.find(t => t.agreementId === id)!.form,
        terms: c.terms.filter(t => t.agreementId === id).map(t => ({
          contractRef: t.contractRef, action: t.skipped ? "skip" : "add renewal",
          description: `${t.skipped ? "Skip" : "Add"} ${t.values.seasonLabel} to ${c.name} (renews ${t.sourceTerm.seasonLabel})`,
          season: t.values.seasonLabel, startDate: t.values.startDate, endDate: t.values.endDate,
          status: t.values.status, annualPrice: t.values.annualPriceCents, paymentLines: t.paymentCount,
          rates: t.rates.length, scope: t.scope.length, documents: t.documents.length, needsReview: t.values.needsReview ?? false,
        })),
      })) })),
    summary: { customers: plan.customers.length, agreements: new Set(terms.map(t => t.agreementId)).size,
      terms: terms.length, replaced: 0, documents: terms.reduce((n, t) => n + t.documents.length, 0),
      warnings: plan.warnings.length, errors: plan.errors.length } };
}
