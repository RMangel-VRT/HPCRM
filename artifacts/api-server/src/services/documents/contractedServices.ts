import { documentHtml, firstHeader, escapeHtml as e, MOUNTAIN_RESERVE } from "./layout";
import type { ContractedServicesModel } from "../contractedServicesDocument";
export function contractedServicesHtml(model: ContractedServicesModel): string {
  return documentHtml(`<style>
  .band{padding:20px 56px 18px}.band img{height:56px}.band h1{font-size:21pt}
  .content{padding:18px 56px 0}.prepared{display:flex;justify-content:space-between;gap:24px;margin-bottom:12px;font-size:9pt}
  .prepared .summary-box{text-align:right;max-width:42%}.prepared .label{font-size:7pt;margin:0 0 3px}
  .intro{font-size:8pt;max-width:560px;margin:0 0 12px}
  .services th{font-size:7pt;padding:5px}.services td{font-size:8pt;padding:5px;line-height:1.38}
  .service-description{font-size:7.5pt;color:#4f5a53}
  .visit{display:grid;grid-template-columns:11.2em minmax(0,1fr);gap:6px;min-height:1.5em}
  .visit .date-only,.completed{white-space:nowrap}.visit-label{color:#4f5a53}
  .visit-outcome{display:grid;grid-template-columns:minmax(0,46fr) minmax(0,14fr)}
  .visit-outcome>div{padding:0 5px}.services td.outcomes{padding-left:0;padding-right:0}
  .completed-line{min-height:1.5em}.boundary{font-size:8pt;background:#eef6e3;border:1px solid #8cc640;padding:9px;margin-top:10px}
  .extras{font-size:7.5pt;line-height:1.5;margin-top:8px}.extras p{margin:3px 0}
  .mountain-space{height:${MOUNTAIN_RESERVE}px}
  </style>${firstHeader({ title: "Contracted Services", number: "", dateLine: model.dateLine })}
  <main class="content"><div class="prepared"><div><div class="label">Prepared for</div><strong>${e(model.customerName)}</strong><br>
  ${e(model.address)}${model.managementCompany ? ` · Managed by ${e(model.managementCompany)}` : ""}<br>${e(model.agreement)}</div>
  <div class="summary-box"><div class="label">In your agreement</div><strong>${model.rows.length} contracted services</strong><br>${e(model.lines)}</div></div>
  <p class="intro">This schedule lists each service included in your agreement for this contract year, how many times it is performed, and when it will be done.</p>
  <table class="services" data-pricing><thead><tr>${[["Service",28],["Included",12],["When",46],["Completed",14]].map(([label,width]) => `<th style="width:${width}%">${label}</th>`).join("")}</tr></thead><tbody>
  ${model.rows.map(row => `<tr data-line><td><strong>${e(row.name)}</strong>${row.description ? `<div class="service-description">${e(row.description)}</div>` : ""}</td>
  <td>${e(row.included)}</td><td colspan="2" class="outcomes">${row.visits.map(v => `<div class="visit-outcome">
  ${/^\w{3} \d/.test(v.date) ? `<div class="visit"><span class="date-only">${e(v.date)}</span><span class="visit-label">${e(v.label)}</span></div>` : `<div>${e(v.date)}</div>`}
  <div class="completed">${e(v.completed) || "&nbsp;"}</div></div>`).join("")}</td></tr>`).join("")}
  </tbody></table><div data-totals>${model.boundaryNote ? `<div class="boundary">${e(model.boundaryNote)}</div>` : ""}
  <div class="extras">${model.sections.map(s => `<p><strong>${e(s.title)}:</strong> ${s.entries.map(e).join("; ")}</p>`).join("")}</div><div class="mountain-space"></div></div></main>`);
}
