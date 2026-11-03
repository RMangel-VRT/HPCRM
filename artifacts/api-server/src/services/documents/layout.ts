import { assetUri } from "./assets";
import type { DocumentSettings } from "@workspace/db/document-contracts";

export const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const money = (cents: number, total = false) => `${total ? "$" : ""}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");
/** Calendar strings are not instants: format their components without Denver re-projection. */
export function displayDate(value: string): string {
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(calendar ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) throw new Error("DOCUMENT_INVALID_DATE");
  return date.toLocaleDateString("en-US", { timeZone: calendar ? "UTC" : "America/Denver", month: "short", day: "numeric", year: "numeric" });
}
export function quantity(value: string): string {
  // Do not round through Number: commercial decimal strings can exceed its precision.
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("DOCUMENT_INVALID_QUANTITY");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}
export const PAGE_BOTTOM_MARGIN = 76;
export const MOUNTAIN_RESERVE = 47 + 84 + 16 - PAGE_BOTTOM_MARGIN;
export function pageCss(): string {
  return `<style>${[400, 500, 600, 700].map(weight => `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};src:url("${assetUri(`inter-${weight}.woff2`)}") format("woff2")}`).join("")}
  @page{size:letter;margin:96px 0 76px}@page:first{margin-top:0}
  *{box-sizing:border-box}body{margin:0;color:#161616;font:10.5pt Inter,sans-serif;font-variant-numeric:tabular-nums;line-height:1.4}
  .content{padding:24px 64px 0}.band{background:#37443D;border-bottom:6px solid #8CC640;padding:24px 64px 22px;color:white;display:flex;justify-content:space-between;align-items:center;gap:16px}
  .band img{height:80px;width:auto}.band h1{font-size:24pt;margin:0}.identity{text-align:right}.number{color:#d6ecb8;font-size:11pt}.date{color:#e4ebe6;font-size:9.5pt;margin-top:6px}
  .pill{display:inline-block;font-size:8pt;border:1px solid #d6ecb8;border-radius:12px;padding:3px 9px;margin-top:6px}
  .columns{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:20px;margin-bottom:22px}
  .label{font-size:8.5pt;text-transform:uppercase;letter-spacing:.07em;color:#4f5a53;margin-bottom:5px}
  .secondary{color:#4f5a53;font-size:9pt}.figure{background:#EEF6E3;border:1.5px solid #8CC640;border-radius:8px;padding:12px}
  .figure strong{display:block;color:#37443D;font-size:22pt}.figure small{display:block;color:#4f5a53;font-size:8pt}
  h2{color:#37443D;font-size:11.5pt;margin:18px 0 8px}h3{color:#37443D;font-size:10.5pt;margin:12px 0 5px}
  table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th{background:#37443D;color:white;font-size:8pt;text-transform:uppercase;font-weight:500;text-align:left;padding:8px 6px}
  td{padding:4px 6px;border-bottom:1px solid #e4e6e2;vertical-align:top;overflow-wrap:anywhere;font-size:10.5pt}
  th.num,td.num{text-align:right}tr,.keep{break-inside:avoid}.section td{font-weight:700;color:#37443D;background:#f7f8f5}.group-end td{border-bottom:1.5px solid #8CC640}
  .summary,.final-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:20px}
  .pair{display:flex;justify-content:space-between;gap:16px;margin:6px 0}.total{font-weight:700;color:#37443D;font-size:13pt;border-top:1.5px solid #8CC640;padding-top:8px}
   .final{margin-top:16px}.mountain-space{height:${MOUNTAIN_RESERVE}px}.acceptance{border:1.5px solid #37443D;border-radius:8px;overflow:hidden;margin-top:18px}.accept-title{padding:10px;background:#37443D;color:white;display:flex;justify-content:space-between;align-items:center;gap:12px}.accept-title strong{font-size:12.5pt;font-weight:700}.accept-body{padding:0 14px 14px}
   .final-grid{margin-top:0;grid-template-columns:1fr 1fr;gap:20px}.final-grid h2{margin:0 0 5px}.remit{margin-top:5px;font-size:8.5pt;white-space:nowrap}
   .invoice-content{padding-top:16px}.invoice-content .columns{margin-bottom:10px}.invoice-content .memo{padding:8px;margin-bottom:6px}
   .invoice-content .final-grid .boilerplate{font-size:9pt}.invoice-content .final-grid .total{font-size:12pt;white-space:nowrap}.invoice-content .final-grid .pair{margin:4px 0}
   .table-page.continuation{break-before:page}.table-page{display:flow-root}
  .signatures{display:grid;grid-template-columns:2fr 1fr;gap:28px 24px;margin-top:30px}.signature{border-top:1px solid #4f5a53;padding-top:5px;font-size:8.5pt;color:#4f5a53}
  .memo{background:#f1f2ef;padding:12px;margin-bottom:18px;overflow-wrap:anywhere}.boilerplate{white-space:normal;overflow-wrap:anywhere}
   .contact{font-size:8.5pt;color:#c9d6cd;margin-top:6px;max-width:440px}.identity .number,.identity .date{letter-spacing:normal;font-variant-numeric:normal}.terms-page{break-before:page}
  </style>`;
}
export function firstHeader(input: { title: string; number: string; dateLine: string; draft?: boolean; settings?: DocumentSettings }): string {
  return `<header class="band"><img alt="High Plains" src="${assetUri("hp-logo-white-horizontal.png")}"><div class="identity"><h1>${escapeHtml(input.title)}</h1><div class="number">${escapeHtml(input.number)}</div>${input.draft ? '<div class="pill">DRAFT — not yet issued</div>' : ""}<div class="date">${escapeHtml(input.dateLine)}</div>${input.settings ? contactLine(input.settings) : ""}</div></header>`;
}
export function keyFigureBox(label: string, cents: number, note: string): string {
  return `<div class="figure"><div class="label">${escapeHtml(label)}</div><strong>${money(cents, true)}</strong><small>${escapeHtml(note)}</small></div>`;
}
export function contactLine(settings: DocumentSettings): string {
  const text = [settings.addressLine1, settings.addressLine2, [settings.city, settings.state, settings.postalCode].filter(Boolean).join(" "), settings.phone, settings.email, settings.website].filter(Boolean).join(" · ");
  return text ? `<div class="contact">${escapeHtml(text)}</div>` : "";
}
export const documentHtml = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">${pageCss()}</head><body>${body}</body></html>`;
export const tableHead = (labels: string[], widths: number[]) => `<thead><tr>${labels.map((label, i) => `<th style="width:${widths[i]}%" class="${i > 0 && label !== "Description" ? "num" : ""}">${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
