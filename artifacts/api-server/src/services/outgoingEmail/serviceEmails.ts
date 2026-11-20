import { renderEmailLayout, type Block, type EmailCompany } from "./layout";
import { fillWording, getEmailWording, PLACEHOLDERS, type EmailKey } from "./wording";

function copy(key: EmailKey, company: EmailCompany, customerName = "", extra: Record<string, string> = {}) {
  const values = { customerName, companyName: company.name, companyPhone: company.phone, companyEmail: company.email, ...extra };
  const wording = getEmailWording("", key);
  const fill = (text: string) => fillWording(text, values, PLACEHOLDERS[key]);
  return {
    subject: fill(wording.subject).replace(/[\s\u0000]+/g, " ").trim(),
    preview: fill(wording.preview),
    wording: { eyebrow: fill(wording.eyebrow), headline: fill(wording.headline), intro: fill(wording.intro), closing: fill(wording.closing) },
  };
}

export function buildDocumentsEmail({ company, documents, note, subject: override }: {
  company: EmailCompany; documents: { title: string; filename: string; pageCount?: number }[]; note?: string; subject?: string;
}) {
  const defaults = copy("documents", company, "", { documentCount: String(documents.length) });
  const subject = override ?? defaults.subject;
  const blocks: Block[] = [];
  if (note?.trim()) blocks.push({ kind: "note", text: note.trim() });
  if (documents.length) blocks.push({ kind: "attachments", items: documents.map(({ pageCount, ...item }) => ({
    ...item, detail: pageCount ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : undefined,
  })) });
  return { subject, ...renderEmailLayout({
    ...defaults, subject, company, docType: "Documents", docNumber: `${documents.length} attached`,
    stripe: "lime", greeting: "Hello,", blocks,
  }) };
}

export function buildGeneralMessage({ company, customerName, subject, body }: {
  company: EmailCompany; customerName?: string; subject: string; body: string;
}) {
  const defaults = copy("general_message", company, customerName);
  const introParagraphs = body.replace(/\r\n?/g, "\n").split(/\n(?:[ \t]*\n)+/).map(part => part.trim()).filter(Boolean);
  return { subject, ...renderEmailLayout({
    ...defaults, subject, company, docType: "Message", docNumber: customerName ?? "",
    stripe: "lime", greeting: customerName ? `Hello ${customerName},` : "Hello,", introParagraphs, blocks: [],
  }) };
}
