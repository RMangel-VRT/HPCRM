import type { EstimateDocumentModel } from "../estimatePdf";
import { displayDate, quantity, documentHtml, escapeHtml as e, firstHeader, keyFigureBox, money, multiline, tableHead } from "./layout";

export function estimateDocumentHtml(m: EstimateDocumentModel): string {
  const header = firstHeader({ title: "Estimate", number: `${m.estimateNumber} · Version ${m.versionNumber}`, dateLine: `${displayDate(m.documentDate)} · ${m.statusLine}`, draft: m.draft, settings: m.companyDocument });
  const sections = m.sections.map(section => `<tbody><tr class="section"><td colspan="4">${e(section.name)}</td><td class="num">${money(section.subtotalCents)}</td></tr>${section.lines.map((line, i) =>
     `<tr data-line class="${i === section.lines.length - 1 ? "group-end" : ""}"><td>${e(line.name)}${line.detail ? `<div class="secondary">${multiline(line.detail)}</div>` : ""}</td><td class="num">${e(quantity(line.quantity))}</td><td class="num">${e(line.unit)}</td><td class="num">${money(line.unitPriceCents)}</td><td class="num">${money(line.lineTotalCents)}</td></tr>`).join("")}</tbody>`).join("");
  const table = `<table data-pricing>${tableHead(["Description", "Qty", "Unit", "Rate", "Amount"], [43, 9, 10, 15, 23])}${sections}</table>`;
  const summary = `<div class="summary keep" data-totals><div><div class="label">By category</div>${m.categorySummary.map(row => `<div class="pair"><span>${e(row.label)}</span><span>${money(row.cents)}</span></div>`).join("")}</div><div class="pair total"><span>Estimate total</span><span>${money(m.totalCents, true)}</span></div></div>`;
  const settings = m.companyDocument;
  const final = `<div class="final keep terms-page">${settings.estimateTerms ? `<h2>Terms</h2><div class="boilerplate">${multiline(settings.estimateTerms)}</div>` : ""}${settings.warrantyText ? `<h2>Plant warranty</h2><div class="boilerplate">${multiline(settings.warrantyText)}</div>` : ""}
     <div class="acceptance"><div class="accept-title"><strong>Acceptance</strong><span>Total ${money(m.totalCents, true)} plus applicable tax</span></div><div class="accept-body">
    <p>Signing below accepts estimate ${e(m.estimateNumber)}, version ${m.versionNumber}, for the work and pricing shown in this estimate.</p>
     <div class="signatures">${["Signature", "Date", "Printed name", "Title or board position"].map(label => `<div class="signature">${label}</div>`).join("")}</div><div class="mountain-space"></div></div></div></div>`;
  return documentHtml(`${header}<main class="content"><div class="columns"><div><div class="label">Prepared for</div><strong>${e(m.customerName)}</strong><div class="secondary">${multiline(m.customerAddress)}</div></div><div><div class="label">Work location</div>${m.workLocation ? multiline(m.workLocation) : "—"}</div>${keyFigureBox("Estimate total", m.totalCents, "plus sales tax where it applies")}</div><h2>${e(m.projectTitle)}</h2>${m.linkedTicketTitle ? `<p class="secondary">${e(m.linkedTicketTitle)}</p>` : ""}${table}${summary}${final}</main>`);
}
