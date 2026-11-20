import { publicAppUrl } from "../../lib/publicAppUrl";
import { loadEmailCompany } from "./company";
import { buildEstimateEmail } from "./estimateEmail";
import { renderChemicalEmail, type ChemicalEmailFields } from "./chemicalEmail";
import { buildDocumentsEmail, buildGeneralMessage } from "./serviceEmails";
import { buildWorkCompletedEmail } from "./workCompletedEmail";
import { renderEmailLayout, type Block, type EmailCompany, type Stripe } from "./layout";
import { fillWording, PLACEHOLDERS, type EmailKey, type EmailWording } from "./wording";

const customerName = "Sample Customer";
const title = "Front entry refresh";
const now = new Date("2026-11-20T19:00:00Z");
const samplePhotos = () => [2, 1, 3].map(n => `${publicAppUrl()}/email/sample-completion-${n}.png`);

export function estimateWordingSample(companyId: string, revised: boolean, company: EmailCompany) {
  const estimate = { companyId, estimateNumber: "EST-2026-0001", title, customerName, workLocation: "Front entry beds" };
  return {
    estimate, company, now,
    version: { versionNumber: revised ? 2 : 1, sentAt: null, frozenSubtotalCents: null, photos: [],
      sections: [{ id: "prep", name: "Site preparation", lines: [1, 2] }, { id: "plants", name: "Planting", lines: [1, 2, 3] }],
      totals: { subtotalCents: 245000, bySection: { prep: 95000, plants: 150000 } } },
    previous: revised ? { versionNumber: 1, sentAt: "2026-11-16T19:00:00Z", frozenSubtotalCents: 220000 } : undefined,
    attachment: { filename: `${estimate.estimateNumber}${revised ? "-v2" : ""}.pdf`, pageCount: 3 },
  };
}

const treatment: ChemicalEmailFields = {
  name: "Broadleaf Weed Control", productName: "Sample broadleaf herbicide", activeIngredient: "Sample label ingredients",
  epaRegNumber: "Sample registration", purposeText: "Broadleaf weed control in turf",
  reentryInterval: "until treated areas are dry", wateringInstructions: "Wait 24 hours before watering.",
  mowingInstructions: "Wait 48 hours before mowing.",
  postApplicationExpectation: "Treated weeds may wilt or discolor over the next several days.",
};
export function chemicalWordingSample(post: boolean) {
  return {
    treatment, kind: post ? "post" as const : "pre" as const,
    visit: { customerName, campaignTitle: "Fall weed control", targetDate: "Nov 27, 2026", backupDate: "Dec 4, 2026",
      timeWindow: "8 AM–noon", completionDate: "Nov 27, 2026", completionTime: "10:15 AM",
      areasTreated: "Front and side lawns", applicationConditions: "Dry turf",
      pesticideLicenseNumber: "Sample license", nextVisitTitle: "Spring turf visit", nextVisitDate: "April 2027",
      labelAttachmentUrl: `${publicAppUrl()}/email/sample-product-label.pdf`, labelAttachmentName: "Sample product label.pdf",
    },
    photos: post ? samplePhotos() : [],
  };
}

type PreviewOnlyKey = "invoice_contract" | "invoice_project" | "reminder_friendly" | "reminder_past_due" |
  "reminder_final" | "contract_renewal" | "contract_welcome";
type PreviewCompany = EmailCompany & { paymentInstructions: string };

/** These samples have no delivery path. Keep the approved board's blocks separate from live business facts. */
function genericPreview(key: PreviewOnlyKey, wording: EmailWording, company: PreviewCompany) {
  const project = key === "invoice_project";
  const invoiceNumber = project ? "PR-1009" : "MA-1042";
  const period = "November 2026";
  const contractName = "2026 Landscape Maintenance";
  const amountDue = project ? "$3,329.60" : "$1,450.00";
  const dueDate = project ? "Jan 3, 2027" : "Dec 30, 2026";
  const completedDate = "Dec 4, 2026";
  const paymentOf = "payment 11 of 12";
  const servicePeriod = "Nov 1 – Nov 30, 2026";
  const renewalStart = "Apr 1, 2027";
  const pastDueText = key === "reminder_final" ? "62 days past due" : key === "reminder_past_due" ? "35 days past due" : "12 days past due";
  const values = { customerName, companyName: company.name, companyPhone: company.phone, companyEmail: company.email,
    invoiceNumber, title, period, contractName, amountDue, dueDate, completedDate, paymentOf, pastDueText,
    renewalStart, renewalTotal: "$17,400.00", startDate: renewalStart };
  const fill = (value: string) => fillWording(value, values, PLACEHOLDERS[key]);
  let stripe: Stripe = "lime";
  let docType = "Invoice";
  let docNumber = invoiceNumber;
  const blocks: Block[] = [];
  const attachment: Block = { kind: "attachments", items: [{
    title: key.startsWith("reminder_") ? `Copy of invoice ${invoiceNumber}` : "Invoice",
    filename: `${invoiceNumber} – ${project ? title : `${customerName} – Nov 2026`}.pdf`,
    detail: key.startsWith("reminder_") ? undefined : "1 page",
  }] };
  if (key === "invoice_contract") {
    blocks.push({ kind: "facts", rows: [{ label: "Invoice", value: invoiceNumber }, { label: "Service period", value: servicePeriod },
      { label: "Contract", value: `${contractName} · ${paymentOf}` }, { label: "Due", value: dueDate }],
      total: { label: "Amount due", value: amountDue } });
    if (company.paymentInstructions) blocks.push({ kind: "info", tone: "lime", title: "How to pay",
      text: company.paymentInstructions.replaceAll("{company name}", () => company.name) });
    blocks.push(attachment);
  } else if (project) {
    blocks.push({ kind: "chips", items: [{ label: "Completed", value: completedDate },
      { label: "Estimate", value: "EST-2026-0001 v2" }, { label: "Due", value: dueDate }] },
    { kind: "facts", rows: [{ label: "Invoice", value: invoiceNumber }, { label: "Project", value: title },
      { label: "Approved estimate", value: amountDue }], total: { label: "Amount due", value: amountDue } },
    { kind: "photos", title: "Photos from today", urls: samplePhotos().slice(0, 2), caption: "Before and after — more in your project folder." },
    { kind: "info", tone: "lime", title: "Plant warranty",
      text: "New plants carry our 1-year limited warranty. Winter watering keeps that coverage in place — ask us about adding it." },
    attachment);
  } else if (key.startsWith("reminder_")) {
    stripe = key === "reminder_final" ? "red" : key === "reminder_past_due" ? "amber" : "lime";
    blocks.push({ kind: "facts", rows: [{ label: "Invoice", value: invoiceNumber }, { label: "Service period", value: servicePeriod },
      { label: "Due date", value: dueDate }, { label: "Status", value: pastDueText }], total: { label: "Balance due", value: amountDue } }, attachment);
  } else {
    // There are no renewal or welcome boards in the approved mockup. Use only the business facts
    // in their catalog wording rather than inventing a delivery or contract workflow.
    docType = key === "contract_renewal" ? "Contract renewal" : "Welcome";
    docNumber = contractName;
    blocks.push({ kind: "facts", rows: [{ label: "Contract", value: contractName }, { label: "Season starts", value: renewalStart }],
      ...(key === "contract_renewal" ? { total: { label: "Renewal total", value: values.renewalTotal } } : {}) });
    if (key === "contract_renewal") blocks.push({ kind: "attachments", items: [{ title: "Renewal agreement", filename: "Landscape Maintenance Renewal.pdf" }] });
  }
  const subject = fill(wording.subject);
  const preview = fill(wording.preview);
  return { subject, preview, ...renderEmailLayout({ company, subject, preview, docType, docNumber, stripe, blocks,
    greeting: `Hello ${customerName},`,
    wording: { eyebrow: fill(wording.eyebrow), headline: fill(wording.headline), intro: fill(wording.intro), closing: fill(wording.closing) },
  }) };
}

export async function renderWordingPreview(key: EmailKey, wording: EmailWording, companyId: string) {
  const company = await loadEmailCompany(companyId);
  switch (key) {
    case "estimate": case "estimate_revised":
      return buildEstimateEmail({ ...estimateWordingSample(companyId, key === "estimate_revised", company), wording });
    case "chemical_upcoming": case "chemical_completed": {
      const { treatment, kind, visit, photos } = chemicalWordingSample(key === "chemical_completed");
      const { subject, preview, html, textBody } = await renderChemicalEmail(treatment, companyId, kind, visit, photos, { company, wording });
      return { subject, preview, html, text: textBody };
    }
    case "work_completed":
      return buildWorkCompletedEmail({ company, wording, customer: { name: customerName }, photoUrls: samplePhotos().slice(1),
        ticket: { id: "000001", companyId, title: "Replace dead shrubs at entry", completedAt: now,
          actualStartTime: new Date("2026-11-20T17:00:00Z"), actualEndTime: now, areasWorked: "Front entry beds",
          workSummaryForCustomer: "Removed the dead shrubs.\nInstalled new shrubs and refreshed the mulch.",
          materialsUsed: "Three shrubs and cedar mulch", recommendations: "Water the new shrubs through dry periods." },
      });
    case "documents":
      return buildDocumentsEmail({ companyId, company, wording, customerName,
        documents: [{ title: "W-9", filename: "W-9.pdf", pageCount: 1 }, { title: "Certificate of Insurance", filename: "COI.pdf", pageCount: 1 }] });
    case "general_message":
      return buildGeneralMessage({ companyId, company, wording, customerName, body: "Thanks for checking in about the front entry. We’ll follow up with a few options next week." });
    default:
      return genericPreview(key, wording, company);
  }
}
