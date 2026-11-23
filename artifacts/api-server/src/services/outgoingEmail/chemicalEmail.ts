import type { ChemicalNotificationTemplate } from "@workspace/db";
import { loadEmailCompany } from "./company";
import { renderEmailLayout, type Block, type EmailCompany } from "./layout";
import { httpUrl } from "./markup";
import { greetingFor } from "./text";
import { fillWording, getEmailWording, PLACEHOLDERS, type EmailWording } from "./wording";

export const emptyLegacyChemicalWording = {
  preVisitSubject: "", preVisitHtml: "", postVisitSubject: "", postVisitHtml: "",
};

export type ChemicalEmailFields = Pick<ChemicalNotificationTemplate,
  "name" | "productName" | "activeIngredient" | "epaRegNumber" | "purposeText" |
  "reentryInterval" | "wateringInstructions" | "mowingInstructions" | "postApplicationExpectation">;

export async function renderChemicalEmail(
  template: ChemicalEmailFields,
  companyId: string,
  kind: "pre" | "post",
  visit: Record<string, string>,
  photoUrls: readonly string[] = [],
  options?: { wording?: EmailWording; company?: EmailCompany },
) {
  const vars: Record<string, string | null> = {
    productName: template.productName,
    activeIngredient: template.activeIngredient,
    epaRegNumber: template.epaRegNumber,
    purpose: template.purposeText,
    reentryInterval: template.reentryInterval,
    wateringInstructions: template.wateringInstructions,
    mowingInstructions: template.mowingInstructions,
    postApplicationExpectation: template.postApplicationExpectation,
  };
  for (const [key, value] of Object.entries(visit)) {
    if (value?.trim()) vars[key] = value;
  }
  const read = (key: string) => vars[key]?.trim() ?? "";
  const key = kind === "pre" ? "chemical_upcoming" : "chemical_completed";
  const [company, wording] = await Promise.all([
    options?.company ?? loadEmailCompany(companyId),
    options?.wording ?? getEmailWording(companyId, key),
  ]);
  const values = {
    companyName: company.name, companyPhone: company.phone, companyEmail: company.email,
    treatmentName: template.name.trim(), customerName: read("customerName"),
    campaignTitle: read("campaignTitle"), plannedDate: read("targetDate"),
    backupDate: read("backupDate"), timeWindow: read("timeWindow"),
    completedDate: read("completionDate"),
  };
  const fill = (field: keyof EmailWording) => fillWording(wording[field], values, PLACEHOLDERS[key]);
  const aftercare = [
    read("reentryInterval") && `Stay off treated areas: ${read("reentryInterval").replace(/\.$/, "")}.`,
    read("wateringInstructions"), read("mowingInstructions"),
  ].filter(Boolean);
  const blocks: Block[] = [];
  const facts = (entries: [string, string][]) =>
    entries.filter(([, value]) => value).map(([label, value]) => ({ label, value }));

  if (kind === "pre") {
    if (values.plannedDate || values.timeWindow || values.backupDate) blocks.push({
      kind: "dates",
      planned: values.plannedDate || values.timeWindow ? { date: values.plannedDate, window: values.timeWindow } : undefined,
      backup: values.backupDate ? { date: values.backupDate, note: "Only if we can’t apply safely" } : undefined,
    });
    blocks.push({ kind: "checklist", title: "Before we arrive", tone: "lime", items: [
      "Keep pets and children indoors during the application.",
      "Pick up toys, hoses and pet bowls from the lawn.",
      "Close windows facing the lawn while we’re on site.",
    ] });
    if (aftercare.length) blocks.push({ kind: "checklist", title: "After the application", tone: "amber", items: aftercare });
    const rows = facts([
      ["Product", read("productName")], ["Active ingredients", read("activeIngredient")],
      ["EPA Reg. No.", read("epaRegNumber")], ["Purpose", read("purpose")],
    ]);
    if (rows.length) blocks.push({ kind: "card", title: "What we’re applying", rows });
    const name = read("applicatorName");
    const license = read("pesticideLicenseNumber") || read("applicatorLicense");
    if (name || license) blocks.push({
      kind: "person", title: "Licensed applicator on your visit", lines: [
        name, license && `Colorado Commercial Applicator · License #${license}`,
      ].filter(Boolean),
      companyPhone: company.phone ? { label: "Questions on the day?", value: company.phone } : undefined,
    });
  } else {
    const items = facts([
      ["Completed", [values.completedDate, read("completionTime")].filter(Boolean).join(" · ")],
      ["Areas", read("areasTreated")], ["Conditions", read("applicationConditions")],
    ]);
    if (items.length) blocks.push({ kind: "chips", items });
    if (aftercare.length) blocks.push({ kind: "checklist", title: "For the next two days", tone: "amber", items: aftercare });
    const expectation = read("postApplicationExpectation");
    if (expectation) blocks.push({ kind: "info", title: "What to expect", tone: "lime", text: expectation });
    const urls = photoUrls.filter(url => httpUrl(url));
    if (urls.length) blocks.push({ kind: "photos", title: "Photos from today", urls });
    const rows = facts([["Next visit", read("nextVisitTitle")], ["Planned", read("nextVisitDate")]]);
    if (rows.length) blocks.push({ kind: "facts", rows });
  }

  const href = httpUrl(read("labelAttachmentUrl"));
  if (href) blocks.push({ kind: "attachments", title: "Product label", items: [{
    title: read("labelAttachmentName") || "Product label PDF",
    filename: read("labelAttachmentName") || "Product label.pdf",
    detail: "Required by Colorado law", href,
  }] });
  if (read("notes")) blocks.push({ kind: "note", text: read("notes") });

  const subject = fill("subject");
  const preview = fill("preview");
  const { html, text } = renderEmailLayout({
    company, subject, preview, stripe: "lime", docNumber: values.treatmentName,
    docType: kind === "pre" ? "Scheduled visit" : "Visit complete",
    greeting: greetingFor(values.customerName),
    wording: { eyebrow: fill("eyebrow"), headline: fill("headline"), intro: fill("intro"), closing: fill("closing") },
    blocks,
  });
  return { subject, preview, html, textBody: text };
}
