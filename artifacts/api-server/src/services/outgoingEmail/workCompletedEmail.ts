import { renderEmailLayout, type Block, type EmailCompany } from "./layout";
import { fillWording, getEmailWording, PLACEHOLDERS } from "./wording";

const colorado = { timeZone: "America/Denver" };
const date = new Intl.DateTimeFormat("en-US", { ...colorado, year: "numeric", month: "long", day: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { ...colorado, hour: "numeric", minute: "2-digit" });

export function buildWorkCompletedEmail({ ticket, customer, company, photoUrls, followUp }: {
  ticket: { id: string; companyId: string; title: string; completedAt?: Date | null; workCompletedDate?: Date | null;
    actualStartTime?: Date | null; actualEndTime?: Date | null; areasWorked?: string | null;
    workSummaryForCustomer?: string | null; materialsUsed?: string | null; recommendations?: string | null };
  customer: { name: string }; company: EmailCompany; photoUrls: string[];
  followUp?: { title: string; description?: string | null };
}) {
  const completed = ticket.completedAt ?? ticket.workCompletedDate;
  const completedDate = completed ? date.format(completed) : "";
  const { actualStartTime: start, actualEndTime: end } = ticket;
  const mins = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : -1;
  const duration = [mins >= 60 ? `${Math.floor(mins / 60)}h` : "", mins < 60 || mins % 60 ? `${mins % 60}m` : ""].filter(Boolean).join(" ");
  const timeOnSite = start && end && mins >= 0 ? `Arrived ${time.format(start)}, departed ${time.format(end)} (${duration})` : "";
  const values = { ticketTitle: ticket.title, completedDate, customerName: customer.name,
    companyName: company.name, companyEmail: company.email, companyPhone: company.phone };
  const template = getEmailWording(ticket.companyId, "work_completed");
  const fill = (text: string) => fillWording(text, values, PLACEHOLDERS.work_completed);
  const subject = fill(template.subject).replace(/[\s\u0000]+/g, " ").trim();
  const preview = completedDate ? fill(photoUrls.length ? template.preview : template.preview.replace(" · photos inside", ""))
    : photoUrls.length ? "Photos inside" : "";
  const blocks: Block[] = [];
  const chips = [{ label: "Completed", value: completedDate }, { label: "Time on site", value: timeOnSite },
    { label: "Area", value: ticket.areasWorked?.trim() ?? "" }].filter(item => item.value);
  if (chips.length) blocks.push({ kind: "chips", items: chips });
  const summary = ticket.workSummaryForCustomer?.trim();
  const items = summary?.split(/\r\n?|\n|(?<=[.!?])\s+/u).map(item => item.trim().replace(/^[-•]\s+/u, "")).filter(Boolean) ?? [];
  if (items.length > 1) blocks.push({ kind: "checklist", title: "What we did", tone: "lime", items });
  else if (summary) blocks.push({ kind: "info", title: "What we did", tone: "lime", text: summary });
  if (ticket.materialsUsed?.trim()) blocks.push({ kind: "card", title: "Materials", rows: [{ label: "Used", value: ticket.materialsUsed.trim() }] });
  if (photoUrls.length) blocks.push({ kind: "photos", title: "Photos from today", urls: photoUrls });
  if (ticket.recommendations?.trim()) blocks.push({ kind: "info", title: "Our recommendation", tone: "lime", text: ticket.recommendations.trim() });
  const rows = [{ label: "Title", value: followUp?.title.trim() ?? "" },
    { label: "Details", value: followUp?.description?.trim() ?? "" }].filter(row => row.value);
  if (rows.length) blocks.push({ kind: "facts", title: "Follow-up", rows });
  return { subject, ...renderEmailLayout({
    subject, preview, docType: "Work complete", docNumber: `#${ticket.id.slice(0, 6).toUpperCase()}`, stripe: "lime", company,
    wording: { eyebrow: fill(template.eyebrow), headline: fill(template.headline),
      intro: fill(photoUrls.length ? template.intro : template.intro.replace(", with photos", "")), closing: fill(template.closing) },
    greeting: customer.name ? `Hello ${customer.name},` : "Hello,", blocks,
  }) };
}
