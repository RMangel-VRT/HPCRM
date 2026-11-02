import type { InvoiceDocumentModel } from "../invoicePdf";
import { contactLine, documentHtml, escapeHtml as e, firstHeader, keyFigureBox, money, multiline, tableHead } from "./layout";
export function invoiceDocumentHtml(m: InvoiceDocumentModel): string {
  const header = firstHeader({ title: "Invoice", number: `No. ${m.number}${m.revision > 0 ? ` · Rev ${m.revision}` : ""}`,
    dateLine: `${m.documentDate}${m.termsLabel ? ` · ${m.termsLabel}` : ""}`, draft: m.draft });
  const columns = `<div class="columns"><div><div class="label">Bill to</div><strong>${e(m.customerName)}</strong><div class="secondary">${multiline(m.customerAddress)}</div></div><div><div class="label">Work location</div>${m.workLocation ? multiline(m.workLocation) : "—"}${m.poNumber ? `<div class="label" style="margin-top:12px">PO number</div>${e(m.poNumber)}` : ""}</div>
    ${keyFigureBox(m.draft ? "Subtotal before tax" : "Amount due", m.draft ? m.subtotalCents : m.balanceCents ?? m.totalCents ?? m.subtotalCents, m.draft ? "Sales tax calculated by QuickBooks" : m.dueDate ? `Due ${m.dueDate}` : "")}</div>`;
  const rows = m.groups.map(group => `<tbody>${group.lines.map((line, i) => {
    const unpriced = line.quantity === null || line.rateCents === null || line.amountCents === null;
    return `<tr class="${i === group.lines.length - 1 ? "group-end" : ""}"><td style="font-weight:700;color:#37443D">${i === 0 ? e(group.label) : ""}</td><td>${multiline(line.description)}</td><td class="num">${line.quantity === null ? "—" : e(line.quantity)}</td><td class="num">${e(line.unit)}</td><td class="num">${unpriced ? "—" : money(line.rateCents!)}</td><td class="num">${unpriced ? "—" : money(line.amountCents!)}</td></tr>`;
  }).join("")}</tbody>`).join("");
  const payment = m.companyDocument.paymentInstructions.replaceAll("{company name}", () => m.companyName);
  const final = `<div class="final keep"><div class="final-grid"><div>${payment || m.companyDocument.remitTo ? `<h2>How to pay</h2>${payment ? `<div class="boilerplate">${multiline(payment)}</div>` : ""}${m.companyDocument.remitTo ? `<p>${multiline(m.companyDocument.remitTo)}</p>` : ""}` : ""}</div>
    <div><div class="pair"><span>Subtotal</span><span>${money(m.subtotalCents, true)}</span></div><div class="pair secondary"><span>Sales tax</span><span>${m.draft ? "Calculated by QuickBooks" : m.taxCents === null ? "—" : money(m.taxCents, true)}</span></div><div class="pair total"><span>${m.draft ? "Subtotal before tax" : "Amount due"}</span><span>${money(m.draft ? m.subtotalCents : m.balanceCents ?? m.totalCents ?? m.subtotalCents, true)}</span></div></div></div><div class="mountain-space"></div></div>`;
  return documentHtml(`${header}<main class="content">${contactLine(m.companyDocument)}${columns}<div class="memo"><strong>${e(m.title)}</strong>${m.memo ? `<div>${multiline(m.memo)}</div>` : ""}</div><table>${tableHead(["Category", "Description", "Qty", "Unit", "Rate", "Amount"], [20, 33, 9, 10, 13, 15])}${rows}</table>${final}</main>`);
}
