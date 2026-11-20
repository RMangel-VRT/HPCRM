import { ESTIMATE_VALIDITY_DAYS, type IssuedEstimateAttachment } from "@workspace/db/estimate-contracts";
import { addCalendarDays, companyDateString } from "../../lib/companyDay";
import { renderEmailLayout, type Block, type EmailCompany } from "./layout";
import { fillWording, getEmailWording, PLACEHOLDERS, type EmailWording } from "./wording";

type Instant = string | Date;
interface SentFacts { versionNumber: number; sentAt: Instant | null; frozenSubtotalCents: number | null }
interface EstimateFacts { companyId: string; estimateNumber: string; title: string; customerName: string; workLocation: string | null }
interface VersionFacts extends SentFacts {
  totals: { subtotalCents: number; bySection: Record<string, number> };
  sections: { id: string; name: string; lines: readonly unknown[] }[];
  photos: readonly unknown[];
}
interface Input {
  estimate: EstimateFacts; version: VersionFacts; previous?: SentFacts; company: EmailCompany;
  now: Date; attachment: IssuedEstimateAttachment & { approximate?: boolean };
  note?: string; subject?: string; wording?: EmailWording;
}
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dollars = (cents: number) => currency.format(cents / 100);
const prettyDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const formatDate = (calendar: string) => prettyDate.format(new Date(`${calendar}T12:00:00Z`));
const savedDate = (instant: Instant) => companyDateString(new Date(instant));

export function buildEstimateEmail({ estimate, version, previous, company, note, now, attachment,
  subject: subjectOverride, wording }: Input) {
  const { versionNumber } = version;
  const revised = versionNumber > 1;
  const key = revised ? "estimate_revised" : "estimate";
  const template = wording ?? getEmailWording(estimate.companyId, key);
  const date = version.sentAt ? savedDate(version.sentAt) : companyDateString(now);
  const validUntil = formatDate(addCalendarDays(date, ESTIMATE_VALIDITY_DAYS));
  const cents = version.frozenSubtotalCents ?? version.totals.subtotalCents;
  const total = dollars(cents);
  const values = {
    customerName: estimate.customerName, companyName: company.name, companyPhone: company.phone, companyEmail: company.email,
    estimateNumber: estimate.estimateNumber, title: estimate.title, total, validUntil, versionNumber: String(versionNumber),
    previousSentDate: previous?.sentAt ? formatDate(savedDate(previous.sentAt)) : "",
  };
  const fill = (value: string) => fillWording(value, values, PLACEHOLDERS[key]);
  const docType = revised ? `Estimate · Version ${versionNumber}` : "Estimate";
  const subject = subjectOverride ?? fill(template.subject).replace(/[\s\u0000]+/g, " ").slice(0, 255).replace(/[\uD800-\uDBFF]$/, "").trim();
  const preview = fill(template.preview);
  const blocks: Block[] = [];
  if (note?.trim()) blocks.push({ kind: "note", text: note.trim() });
  if (revised) {
    const oldCents = previous?.frozenSubtotalCents;
    const rows = previous && oldCents != null ? [
      { label: `Version ${previous.versionNumber} total`, value: dollars(oldCents), strike: true },
      { label: "Change", value: `${cents < oldCents ? "−" : "+"} ${dollars(Math.abs(cents - oldCents))}` },
    ] : [];
    blocks.push({ kind: "facts", rows, total: { label: "New total", value: total } });
  } else {
    const workLocation = estimate.workLocation?.split(/\r?\n/, 1)[0].trim();
    blocks.push(
      { kind: "chips", items: [{ label: "Total", value: total }, { label: "Valid until", value: validUntil },
        ...(version.photos.length ? [{ label: "Photos", value: `${version.photos.length} attached` }] : [])] },
      { kind: "summary", title: "Summary", rows: version.sections.map(section => ({
        label: section.name, detail: `${section.lines.length} ${section.lines.length === 1 ? "line" : "lines"}`,
        amount: dollars(version.totals.bySection[section.id]),
      })) },
      { kind: "facts", rows: [
        ...(workLocation ? [{ label: "Work location", value: workLocation }] : []),
        { label: "Estimate date", value: formatDate(date) },
      ], total: { label: "Estimate total", value: total } },
      { kind: "steps", title: "What happens next", active: 1, items: [
        { title: "Review", text: "Look over the scope, pricing and photos." },
        { title: "Sign", text: "Sign the last page or simply reply “Approved”." },
        { title: "Schedule", text: "We’ll call with a start date." },
      ] },
    );
  }
  blocks.push({ kind: "attachments", items: [{ title: docType, filename: attachment.filename,
    detail: `${attachment.approximate ? "Approx. " : ""}${attachment.pageCount} ${attachment.pageCount === 1 ? "page" : "pages"}`,
  }] });
  if (!revised) blocks.push({ kind: "reply", text: "Questions or changes? Just reply — this email goes straight to our office." });
  return { subject, preview, ...renderEmailLayout({
    subject, preview, docType, docNumber: estimate.estimateNumber, stripe: revised ? "sky" : "lime", company, blocks,
    greeting: estimate.customerName.trim() ? `Hello ${estimate.customerName},` : "Hello,",
    wording: { eyebrow: fill(template.eyebrow), headline: fill(template.headline), intro: fill(template.intro), closing: fill(template.closing) },
  }) };
}
