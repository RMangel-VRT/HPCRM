/* CQ5 customer setup wizard: one form state, pure validation and request shaping.
   The CRM customer row owns every billing fact below; nothing here is a second owner. */

export type WizardStatus = "prospect" | "active";
export type BillToMode = "property" | "management_company" | "custom";
export type BranchMode = "master" | "separate";
export type MissingField = "street" | "city" | "state" | "zip" | "billingName" | "billingEmails" | "billTo";
export const MISSING_FIELDS: MissingField[] = ["street", "city", "state", "zip", "billingName", "billingEmails", "billTo"];
export const EMAIL_LIMIT = 100;
export const STEP_COUNT = 5;

export interface ContactRow {
  key: string; id?: string; name: string; role: string; emails: string; phones: string; isPrimary: boolean;
  propertyManagerId?: string | null;
  /** "ap" marks a one-time snapshot copied from the AP contact at creation. It is never re-synced. */
  source?: "ap";
}

export interface SiteFacts {
  gateCode: string; accessNotes: string; watchOutNotes: string; petStationCount: string;
  petStationLocations: string; irrigationControllerLocations: string; includeInRoute: boolean;
}

export interface WizardDraft {
  name: string; street: string; city: string; state: string; zip: string;
  customerType: "commercial" | "hoa"; status: WizardStatus;
  parentCustomerId: string | null; isParent: boolean; branchBillingMode: BranchMode;
  snowEnabled: boolean; acres: string; complexityScore: string;
  billToMode: BillToMode; propertyManagementCompanyId: string | null; propertyManagerId: string | null;
  billStreet: string; billStreet2: string; billCity: string; billState: string; billZip: string;
  billingName: string; billingNameTouched: boolean; billingCompanyName: string; billingContactName: string;
  billingEmails: string[]; billingPhone: string; billingMobile: string;
  qboTermId: string; termTouched: boolean;
  contacts: ContactRow[]; deletedContactIds: string[];
  site: SiteFacts;
  sendNow: boolean; linkQboId: string | null; linkQboName: string | null;
}

export interface PmCompany { id: string; name: string; street?: string | null; city?: string | null; state?: string | null; zip?: string | null }
export interface PmManager { id: string; name: string; email?: string | null; phone?: string | null; propertyManagementCompanyId?: string }
export interface ParentLite { id: string; name: string; branchBillingMode?: string | null; parentCustomerId?: string | null; isParent?: string | boolean | null; companyId?: string }

let seq = 0;
export const rowKey = () => `row-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const blankSite = (): SiteFacts => ({
  gateCode: "", accessNotes: "", watchOutNotes: "", petStationCount: "", petStationLocations: "", irrigationControllerLocations: "", includeInRoute: false,
});

export function newWizardDraft(): WizardDraft {
  return {
    name: "", street: "", city: "", state: "", zip: "", customerType: "commercial", status: "prospect",
    parentCustomerId: null, isParent: false, branchBillingMode: "master", snowEnabled: false, acres: "", complexityScore: "",
    billToMode: "property", propertyManagementCompanyId: null, propertyManagerId: null,
    billStreet: "", billStreet2: "", billCity: "", billState: "", billZip: "",
    billingName: "", billingNameTouched: false, billingCompanyName: "", billingContactName: "",
    billingEmails: [], billingPhone: "", billingMobile: "", qboTermId: "", termTouched: false,
    contacts: [], deletedContactIds: [], site: blankSite(), sendNow: false, linkQboId: null, linkQboName: null,
  };
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()).map(String) : []);

/** Server record (setup or prefill) to draft. Unknown keys are ignored. */
export function draftFromServer(c: Record<string, unknown>, contacts: Record<string, unknown>[] = []): WizardDraft {
  const base = newWizardDraft();
  const status = c.status === "active" ? "active" : "prospect";
  const billingName = s(c.billingName);
  return {
    ...base,
    name: s(c.name), street: s(c.street), city: s(c.city), state: s(c.state), zip: s(c.zip),
    customerType: c.customerType === "hoa" ? "hoa" : "commercial", status,
    parentCustomerId: (c.parentCustomerId as string) || null,
    isParent: c.isParent === true || c.isParent === "true",
    branchBillingMode: c.branchBillingMode === "separate" ? "separate" : "master",
    snowEnabled: !!c.snowEnabled, acres: s(c.acres), complexityScore: s(c.complexityScore),
    billToMode: (["property", "management_company", "custom"].includes(String(c.billToMode)) ? c.billToMode : "property") as BillToMode,
    propertyManagementCompanyId: (c.propertyManagementCompanyId as string) || null,
    propertyManagerId: (c.propertyManagerId as string) || null,
    billStreet: s(c.billStreet), billStreet2: s(c.billStreet2), billCity: s(c.billCity), billState: s(c.billState), billZip: s(c.billZip),
    billingName, billingNameTouched: !!billingName && billingName !== s(c.name),
    billingCompanyName: s(c.billingCompanyName), billingContactName: s(c.billingContactName),
    billingEmails: arr(c.billingEmails), billingPhone: s(c.billingPhone), billingMobile: s(c.billingMobile),
    qboTermId: s(c.qboTermId), termTouched: !!c.qboTermId,
    contacts: contacts.map(ct => ({
      key: rowKey(), id: ct.id ? String(ct.id) : undefined, name: s(ct.name), role: s(ct.role),
      emails: arr(ct.emails).join(", "), phones: arr(ct.phones).join(", "),
      isPrimary: ct.isPrimary === true || ct.isPrimary === "true", propertyManagerId: (ct.propertyManagerId as string) || null,
    })),
    site: {
      gateCode: s(c.gateCode), accessNotes: s(c.accessNotes), watchOutNotes: s(c.watchOutNotes),
      petStationCount: s(c.petStationCount), petStationLocations: s(c.petStationLocations),
      irrigationControllerLocations: s(c.irrigationControllerLocations), includeInRoute: !!c.includeInRoute,
    },
  };
}

/* ---------- Validation ---------- */

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());
export const joinedEmailLength = (emails: string[]) => emails.join(",").length;
export const emailsRemaining = (emails: string[]) => EMAIL_LIMIT - joinedEmailLength(emails);
/** Can this chip be added without pushing the joined list past the QuickBooks limit? */
export function chipProblem(emails: string[], raw: string): "invalid" | "duplicate" | "tooLong" | null {
  const v = raw.trim();
  if (!isEmail(v)) return "invalid";
  if (emails.some(e => e.toLowerCase() === v.toLowerCase())) return "duplicate";
  if (joinedEmailLength([...emails, v]) > EMAIL_LIMIT) return "tooLong";
  return null;
}

/** Mirrors CQ1 validateDisplayName: required, no colon, at most 100 characters. */
export function displayNameProblem(name: string): "required" | "colon" | "tooLong" | null {
  if (!name.trim()) return "required";
  if (name.includes(":")) return "colon";
  if (name.length > 100) return "tooLong";
  return null;
}

export const effectiveBillingName = (d: WizardDraft) => (d.billingNameTouched ? d.billingName : d.billingName || d.name);

export const parentIsMaster = (d: WizardDraft, parent: ParentLite | null | undefined) =>
  !!d.parentCustomerId && !!parent && parent.id === d.parentCustomerId && (parent.branchBillingMode ?? "master") !== "separate";

const filled = (...v: (string | null | undefined)[]) => v.every(x => !!x && !!x.trim());
export const pmAddressComplete = (pm: PmCompany | null | undefined) => !!pm && filled(pm.street, pm.city, pm.state, pm.zip);

export function billToComplete(d: WizardDraft, pm: PmCompany | null | undefined) {
  if (d.billToMode === "property") return filled(d.street, d.city, d.state, d.zip);
  if (d.billToMode === "custom") return filled(d.billStreet, d.billCity, d.billState, d.billZip);
  return !!d.propertyManagementCompanyId && pmAddressComplete(pm);
}

/** Required-for-active fields. Master-billed branches skip billing; the parent supplies it. */
export function missingForActive(d: WizardDraft, ctx: { master: boolean; pm?: PmCompany | null }): MissingField[] {
  const out: MissingField[] = [];
  for (const k of ["street", "city", "state", "zip"] as const) if (!d[k].trim()) out.push(k);
  if (ctx.master) return out;
  if (displayNameProblem(effectiveBillingName(d))) out.push("billingName");
  if (d.billingEmails.length === 0) out.push("billingEmails");
  if (!billToComplete(d, ctx.pm)) out.push("billTo");
  return out;
}

export interface StepCtx { master: boolean; pm?: PmCompany | null; duplicateBlocking: boolean; requireActive: boolean }
export type StepIssue =
  | { kind: "required"; field: string }
  | { kind: "missing"; field: MissingField }
  | { kind: "billingName"; problem: "colon" | "tooLong" | "required" }
  | { kind: "emailsTooLong" }
  | { kind: "duplicate" }
  | { kind: "parentIsSelf" }
  | { kind: "masterLink" }
  | { kind: "contactName"; index: number }
  | { kind: "petCount" };

export function stepIssues(d: WizardDraft, step: number, ctx: StepCtx): StepIssue[] {
  const out: StepIssue[] = [];
  const active = ctx.requireActive;
  if (step === 1) {
    if (!d.name.trim()) out.push({ kind: "required", field: "name" });
    if (active) for (const k of ["street", "city", "state", "zip"] as const) if (!d[k].trim()) out.push({ kind: "missing", field: k });
    if (d.isParent && d.parentCustomerId) out.push({ kind: "parentIsSelf" });
    if (ctx.master && d.linkQboId) out.push({ kind: "masterLink" });
  }
  if (step === 2 && !ctx.master) {
    const name = effectiveBillingName(d);
    const p = displayNameProblem(name);
    if (p && (active || name.trim())) out.push({ kind: "billingName", problem: p });
    if (joinedEmailLength(d.billingEmails) > EMAIL_LIMIT) out.push({ kind: "emailsTooLong" });
    if (active && d.billingEmails.length === 0) out.push({ kind: "missing", field: "billingEmails" });
    if (active && !billToComplete(d, ctx.pm)) out.push({ kind: "missing", field: "billTo" });
    // CQ1 validates a deliberately selected custom address even on prospects.
    // An empty prospect can keep property mode without supplying billing facts.
    if (!active && d.billToMode === "custom" && !billToComplete(d, ctx.pm))
      out.push({ kind: "required", field: "billTo" });
    if (ctx.duplicateBlocking) out.push({ kind: "duplicate" });
  }
  if (step === 3) d.contacts.forEach((c, i) => { if (!c.name.trim()) out.push({ kind: "contactName", index: i }); });
  if (step === 4 && d.site.petStationCount.trim() && !/^\d+$/.test(d.site.petStationCount.trim())) out.push({ kind: "petCount" });
  return out;
}

export const stepOfMissing = (f: MissingField) => (["street", "city", "state", "zip"].includes(f) ? 1 : 2);

/* ---------- Request body ---------- */

const opt = (v: string) => (v.trim() ? v.trim() : undefined);
const list = (v: string) => v.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);

export interface WizardBody {
  customer: Record<string, unknown>;
  contacts: Record<string, unknown>[];
  siteNotes: Record<string, unknown>;
  qbo: { sendNow: boolean; linkQboId?: string };
  deletedContactIds?: string[];
  expectedUpdatedAt?: string;
}

/** Blank optional values are omitted on create (never fabricated as ""); edit mode sends null to clear. */
export function buildBody(d: WizardDraft, opts: { master: boolean; edit: boolean }): WizardBody {
  const clear = (v: string) => (opts.edit ? (v.trim() ? v.trim() : null) : opt(v));
  const customer: Record<string, unknown> = {
    name: d.name.trim(), customerType: d.customerType, status: d.status,
    parentCustomerId: d.parentCustomerId, isParent: d.isParent ? "true" : "false",
    snowEnabled: d.snowEnabled, includeInRoute: d.site.includeInRoute,
  };
  if (d.isParent) customer.branchBillingMode = d.branchBillingMode;
  // Create omits blank address parts. Setup sends "" for a cleared part (columns are NOT NULL), never null.
  for (const k of ["street", "city", "state", "zip"] as const) { const v = opt(d[k]); if (v) customer[k] = v; else if (opts.edit) customer[k] = ""; }
  const acres = clear(d.acres); if (acres !== undefined) customer.acres = acres;
  const cx = clear(d.complexityScore); if (cx !== undefined) customer.complexityScore = cx;
  if (!opts.master) {
    Object.assign(customer, {
      billToMode: d.billToMode,
      propertyManagementCompanyId: d.propertyManagementCompanyId,
      propertyManagerId: d.propertyManagementCompanyId ? d.propertyManagerId : null,
      billingEmails: d.billingEmails,
    });
    const bn = effectiveBillingName(d);
    const fields: [string, string][] = [
      ["billingName", bn], ["billingCompanyName", d.billingCompanyName], ["billingContactName", d.billingContactName],
      ["billingPhone", d.billingPhone], ["billingMobile", d.billingMobile], ["qboTermId", d.qboTermId],
    ];
    if (d.billToMode === "custom") fields.push(["billStreet", d.billStreet], ["billStreet2", d.billStreet2], ["billCity", d.billCity], ["billState", d.billState], ["billZip", d.billZip]);
    for (const [k, v] of fields) { const x = clear(v); if (x !== undefined) customer[k] = x; }
  }
  const contacts = d.contacts.map(c => ({
    ...(c.id ? { id: c.id } : {}), name: c.name.trim(), role: opt(c.role) ?? null,
    emails: list(c.emails), phones: list(c.phones), isPrimary: c.isPrimary ? "true" : "false",
  }));
  const site: Record<string, unknown> = {};
  for (const k of ["gateCode", "accessNotes", "watchOutNotes", "petStationLocations", "irrigationControllerLocations"] as const) {
    const x = clear(d.site[k]); if (x !== undefined) site[k] = x;
  }
  const pc = d.site.petStationCount.trim();
  if (pc) site.petStationCount = Number(pc); else if (opts.edit) site.petStationCount = null;
  const body: WizardBody = {
    customer, contacts, siteNotes: site,
    qbo: { sendNow: d.status === "prospect" && d.sendNow && !opts.master && !d.linkQboId, ...(d.linkQboId ? { linkQboId: d.linkQboId } : {}) },
  };
  if (opts.edit && d.deletedContactIds.length) body.deletedContactIds = d.deletedContactIds;
  return body;
}

/** Prospect-lite quick-add uses the same atomic wizard envelope, without fake address values. */
export function prospectQuickAddBody(name: string,
  address: { street: string; city: string; state: string; zip: string },
  contact: { name: string; email: string; phone: string }) {
  const customer: Record<string, string> = { name: name.trim(), status: "prospect" };
  for (const [key, value] of Object.entries(address))
    if (value.trim()) customer[key] = value.trim();
  const hasContact = !!(contact.name.trim() || contact.email.trim() || contact.phone.trim());
  const contacts = hasContact ? [{
    name: contact.name.trim() || "Primary Contact", role: "Primary Contact", isPrimary: "true",
    emails: contact.email.trim() ? [contact.email.trim()] : [],
    phones: contact.phone.trim() ? [contact.phone.trim()] : [],
  }] : [];
  return { customer, contacts, siteNotes: {}, qbo: { sendNow: false } };
}

/** One-time copy of the AP contact into a new contact row. A deliberate creation snapshot, not a link. */
export function apSnapshotContact(d: WizardDraft): ContactRow {
  return {
    key: rowKey(), name: d.billingContactName.trim(), role: "Accounts payable",
    emails: d.billingEmails[0] ?? "", phones: d.billingPhone.trim(), isPrimary: d.contacts.length === 0, source: "ap",
  };
}

/* ---------- Server responses ---------- */

export interface QboOutcome { state: string; review?: { id: string; kind: string } | null; reason?: string | null }

/** Parse apiRequest's "400: {json}" error into the activation contract. */
export function activationError(err: unknown): { missingFields: MissingField[]; message?: string } | null {
  const raw = err instanceof Error ? err.message : "";
  const m = raw.match(/^(\d{3}):\s*/);
  if (!m || m[1] !== "400") return null;
  try {
    const b = JSON.parse(raw.slice(m[0].length));
    if (b?.code !== "ACTIVATION_INCOMPLETE") return null;
    return { missingFields: (Array.isArray(b.missingFields) ? b.missingFields : []).filter((x: string) => MISSING_FIELDS.includes(x as MissingField)), message: b.message };
  } catch { return null; }
}

export interface DuplicateCandidate { qboId: string; displayName: string; city?: string | null; zip?: string | null; matchType?: string; source?: string }
