import { renderEmailLayout, type Block, type EmailCompany } from "./layout";
import { greetingFor, normalizeEmailText } from "./text";
import { DEFAULT_WORDING, fillWording, getEmailWording, PLACEHOLDERS, type EmailKey, type EmailWording } from "./wording";

function copy(key: EmailKey, wording: EmailWording, company: EmailCompany, customerName = "", extra: Record<string, string> = {}) {
  const values = { customerName, companyName: company.name, companyPhone: company.phone, companyEmail: company.email, ...extra };
  const fill = (text: string) => fillWording(text, values, PLACEHOLDERS[key]);
  return {
    subject: fill(wording.subject).replace(/[\s\u0000]+/g, " ").trim(),
    preview: fill(wording.preview),
    wording: { eyebrow: fill(wording.eyebrow), headline: fill(wording.headline), intro: fill(wording.intro), closing: fill(wording.closing) },
  };
}

export async function buildDocumentsEmail({ companyId, company, documents, note, subject: override, wording, customerName, greetCustomer = true }: {
  companyId: string; company: EmailCompany; documents: { title: string; filename: string; pageCount?: number }[];
  note?: string; subject?: string; wording?: EmailWording; customerName?: string; greetCustomer?: boolean;
}) {
  const defaults = copy("documents", wording ?? await getEmailWording(companyId, "documents"), company, customerName,
    { documentCount: String(documents.length) });
  const subject = override ?? (defaults.subject || copy("documents", DEFAULT_WORDING.documents, company).subject)
    .slice(0, 255).replace(/[\uD800-\uDBFF]$/, "");
  const blocks: Block[] = [];
  if (note?.trim()) blocks.push({ kind: "note", text: note.trim() });
  if (documents.length) blocks.push({ kind: "attachments", items: documents.map(({ pageCount, ...item }) => ({
    ...item, detail: pageCount ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : undefined,
  })) });
  return { subject, preview: defaults.preview, ...renderEmailLayout({
    ...defaults, subject, company, docType: "Documents", docNumber: `${documents.length} attached`,
    stripe: "lime", greeting: greetingFor(greetCustomer ? customerName : undefined), blocks,
  }) };
}

export async function buildGeneralMessage({ companyId, company, customerName, subject: override, sampleSubject, body, wording, connection }: {
  companyId: string; company: EmailCompany; customerName?: string; body: string;
  wording?: EmailWording; connection?: Parameters<typeof getEmailWording>[2];
} & ({ subject: string; sampleSubject?: never } | { subject?: never; sampleSubject: string })) {
  const defaults = copy("general_message", wording ?? await getEmailWording(companyId, "general_message", connection),
    company, customerName, { subject: override ?? sampleSubject });
  const subject = override ?? defaults.subject;
  const messageParagraphs = body.replace(/\r\n?/g, "\n").split(/\n(?:[ \t]*\n)+/).map(part => part.trim()).filter(Boolean);
  return { subject, preview: defaults.preview, ...renderEmailLayout({
    ...defaults, subject, company, docType: "Message", docNumber: normalizeEmailText(customerName),
    stripe: "lime", greeting: greetingFor(customerName), messageParagraphs, preserveHeadlinePunctuation: true, blocks: [],
  }) };
}
