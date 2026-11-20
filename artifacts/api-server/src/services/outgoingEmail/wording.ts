import { and, eq } from "drizzle-orm";
import { companyEmailWording } from "@workspace/db";
import { db } from "../../db";
import { PLACEHOLDERS, WORDING_FIELDS, WORDING_LIMITS, wordingProblem,
  type EmailKey, type EmailWording, type WordingField } from "../../../../../lib/db/src/emailWordingContracts";

export { PLACEHOLDERS, WORDING_FIELDS, type EmailKey, type EmailWording };

export const DEFAULT_WORDING: Record<EmailKey, Readonly<EmailWording>> = {
  estimate: {
    subject: "Estimate {estimateNumber} – {title}",
    preview: "{total} · good for 30 days · sign the last page to approve",
    eyebrow: "Your estimate is ready",
    headline: "{title}",
    intro: "Thank you for the chance to bid this work. Your estimate is attached and summarized below. Prices are good until {validUntil}.",
    closing: "Questions about this estimate? Reply to this email or call us at {companyPhone}.",
  },
  estimate_revised: {
    subject: "Revised estimate {estimateNumber} (Version {versionNumber}) – {title}",
    preview: "Updated total {total} · replaces the earlier version",
    eyebrow: "Revised estimate",
    headline: "We’ve updated your estimate",
    intro: "Here is Version {versionNumber} of your estimate. It replaces the version we sent on {previousSentDate}.",
    closing: "Questions about the changes? Reply to this email or call us at {companyPhone}.",
  },
  invoice_contract: {
    subject: "Invoice {invoiceNumber} – {customerName} – {period}",
    preview: "{amountDue} due {dueDate} · {period} maintenance",
    eyebrow: "{period} · Maintenance",
    headline: "Your {period} invoice is ready",
    intro: "Your invoice for {period} is attached. It covers {paymentOf} on your {contractName}.",
    closing: "Questions about this invoice? Reply to this email or call us at {companyPhone}.",
  },
  invoice_project: {
    subject: "Invoice {invoiceNumber} – {title}",
    preview: "Work complete · {amountDue} due {dueDate}",
    eyebrow: "Project complete",
    headline: "Thank you — here’s your project invoice",
    intro: "We finished {title} on {completedDate}. Your invoice is attached; payment is due by {dueDate}.",
    closing: "Questions about this invoice? Reply to this email or call us at {companyPhone}.",
  },
  reminder_friendly: {
    subject: "Reminder: Invoice {invoiceNumber} – {customerName}",
    preview: "{amountDue} · a quick reminder",
    eyebrow: "Friendly reminder",
    headline: "A quick reminder about invoice {invoiceNumber}",
    intro: "Our records show invoice {invoiceNumber} is {pastDueText}. If payment is already on its way, thank you — please disregard this note.",
    closing: "If anything on this invoice doesn’t look right, reply and we’ll sort it out, or call us at {companyPhone}.",
  },
  reminder_past_due: {
    subject: "Past due: Invoice {invoiceNumber} – {customerName}",
    preview: "{amountDue} · invoice {invoiceNumber} is past due",
    eyebrow: "Payment past due",
    headline: "Invoice {invoiceNumber} is past due",
    intro: "Invoice {invoiceNumber} is now {pastDueText} and remains unpaid. Please send payment, or reply with the date we can expect it.",
    closing: "If payment has been sent, reply with the date and check number so we can match it.",
  },
  reminder_final: {
    subject: "Final notice: Invoice {invoiceNumber} – {customerName}",
    preview: "{amountDue} · final notice",
    eyebrow: "Final notice",
    headline: "Final notice for invoice {invoiceNumber}",
    intro: "Invoice {invoiceNumber} is {pastDueText} and still unpaid after our earlier reminders. This is our final notice before we take further steps.",
    closing: "Please reply today with payment or the date payment will be made.",
  },
  chemical_upcoming: {
    subject: "Upcoming {treatmentName} – {customerName}",
    preview: "Planned {plannedDate} · {timeWindow}",
    eyebrow: "Scheduled visit · {campaignTitle}",
    headline: "We’re treating your lawn soon",
    intro: "This is your advance notice of a {treatmentName} application at your property.",
    closing: "If the weather is unsafe on the planned day, we’ll move to the backup date and let you know.",
  },
  chemical_completed: {
    subject: "{treatmentName} completed – {customerName}",
    preview: "Applied {completedDate} · keep off treated areas until dry",
    eyebrow: "Completed · {campaignTitle}",
    headline: "Your lawn was treated today",
    intro: "We completed your {treatmentName} application. Here’s what we did and what to expect.",
    closing: "Notice anything unexpected? Reply to this email or call us at {companyPhone}.",
  },
  work_completed: {
    subject: "Work completed – {ticketTitle}",
    preview: "Finished {completedDate} · photos inside",
    eyebrow: "Work complete",
    headline: "We finished the work at your property",
    intro: "Our crew finished {ticketTitle} on {completedDate}. Here’s a quick summary, with photos.",
    closing: "Questions about the work? Reply to this email or call us at {companyPhone}.",
  },
  documents: {
    subject: "Requested documents – {companyName}",
    preview: "{documentCount} documents attached",
    eyebrow: "Documents",
    headline: "Here are the documents you asked for",
    intro: "Attached are the documents you requested. Let us know if you need anything else.",
    closing: "Need these sent to someone else? Just reply with their email.",
  },
  general_message: {
    subject: "Message from {companyName}",
    preview: "A message from {companyName}",
    eyebrow: "From our office",
    headline: "A message from {companyName}",
    intro: "",
    closing: "Thank you for working with us.",
  },
  contract_renewal: {
    subject: "Your {contractName} renewal – {customerName}",
    preview: "Renewal for the season starting {renewalStart}",
    eyebrow: "Contract renewal",
    headline: "It’s time to renew your service",
    intro: "Your {contractName} ends soon. The renewal for the season starting {renewalStart} is attached for your review.",
    closing: "Questions about the renewal or want to change the scope? Reply to this email or call us at {companyPhone}.",
  },
  contract_welcome: {
    subject: "Welcome to {companyName} – {customerName}",
    preview: "Your service starts {startDate}",
    eyebrow: "Welcome",
    headline: "Welcome — we’re glad to be working with you",
    intro: "Your {contractName} starts {startDate}. Below is what to expect this season and how to reach us.",
    closing: "Questions anytime? Reply to this email or call us at {companyPhone}.",
  },
};

/** Split the template, not the values (an address or URL may contain punctuation). */
export function fillWording(template: string, values: Readonly<Record<string, string>>, allowed: readonly string[] = Object.keys(values)): string {
  const token = /\{([a-zA-Z]+)\}/g;
  for (const [, name] of template.matchAll(token)) {
    if (!allowed.includes(name)) throw new Error(`Unknown email placeholder: ${name}`);
  }
  return template.split(/(?<=[.!?]) +/).flatMap(sentence => {
    const names = [...sentence.matchAll(token)].map(([, name]) => name);
    if (names.some(name => !Object.hasOwn(values, name) || !values[name].trim())) return [];
    return [sentence.replace(token, (_match, name: string) => values[name])];
  }).join(" ").trim();
}

export function selectWording({ subject, preview, eyebrow, headline, intro, closing }: EmailWording): EmailWording {
  return { subject, preview, eyebrow, headline, intro, closing };
}

export async function getEmailWording(companyId: string, key: EmailKey, connection: Pick<typeof db, "select"> = db): Promise<EmailWording> {
  const [row] = await connection.select().from(companyEmailWording)
    .where(and(eq(companyEmailWording.companyId, companyId), eq(companyEmailWording.emailKey, key)));
  return selectWording(row ?? DEFAULT_WORDING[key]);
}

export function validateWording(key: EmailKey, input: unknown): Partial<Record<WordingField, string>> | null {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const errors: Partial<Record<WordingField, string>> = {};
  for (const field of WORDING_FIELDS) {
    const problem = wordingProblem(key, field, raw[field]);
    switch (problem?.code) {
      case "required": errors[field] = "This field is required."; break;
      case "length": errors[field] = `Use ${WORDING_LIMITS[field]} characters or fewer.`; break;
      case "newline": errors[field] = "Keep this to one paragraph."; break;
      case "plaintext": errors[field] = "Use plain text without HTML, formatting, or links."; break;
      case "braces": errors[field] = "Placeholders need both braces, like {customerName}."; break;
      case "placeholder": errors[field] = `Unknown placeholder ${problem.token}. Use one of: ${PLACEHOLDERS[key].map(name => `{${name}}`).join(", ")}`; break;
    }
  }
  return Object.keys(errors).length ? errors : null;
}
