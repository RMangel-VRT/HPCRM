import type { ActiveCustomerRow, ActiveCustomersResponse, LineState } from "../../../../../lib/db/src/activeCustomers";
import { activeCustomersLocale, activeCustomersText, reportDate, reportText } from "../../../../../lib/db/src/activeCustomersText";
import { documentHtml, escapeHtml as e, firstHeader, MOUNTAIN_RESERVE } from "./layout";

const issueKinds = ["ending_soon", "lapsed", "should_fall_off", "mismatch", "noContract"] as const;
type IssueKind = typeof issueKinds[number];
const lines = ["landscape", "snow"] as const;
/** Presentation only: flags and responsibility are exclusively owned by the projection. */
export function activeCustomersReport(data: ActiveCustomersResponse, language: unknown) {
  const locale = activeCustomersLocale(language), text = activeCustomersText[locale], p = text.pdf;
  const date = (value: string | null, long = false) => reportDate(value, locale, long);
  const order = (a: ActiveCustomerRow, b: ActiveCustomerRow) => a.customerName.localeCompare(b.customerName, locale) || a.customerId.localeCompare(b.customerId);
  const sorted = [...data.rows].sort(order);
  const responsible = sorted.filter(r => r.responsible);
  const byId = new Map(responsible.map(r => [r.customerId, r]));
  const children = new Map<string, ActiveCustomerRow[]>();
  for (const r of responsible) {
    if (!r.viaParent || !r.parentCustomerId || !byId.has(r.parentCustomerId)) continue;
    const group = children.get(r.parentCustomerId) ?? [];
    group.push(r); children.set(r.parentCustomerId, group);
  }
  const grouped: ActiveCustomerRow[] = [];
  const visited = new Set<string>();
  const add = (r: ActiveCustomerRow) => {
    if (visited.has(r.customerId)) return;
    visited.add(r.customerId); grouped.push(r);
    for (const child of children.get(r.customerId) ?? []) add(child);
  };
  responsible.filter(r => !(r.viaParent && r.parentCustomerId && byId.has(r.parentCustomerId))).forEach(add);
  responsible.forEach(add);
  const chip = (label: string, tone: string) => `<span class="chip ${tone}">${e(label)}</span>`;
  const customer = (r: ActiveCustomerRow) => `<div class="${r.viaParent ? "branch" : ""}"><strong>${e(r.customerName)}</strong>${r.customerStatus !== "active"
    ? `<div>${chip(reportText(p.status, { status: text.status[r.customerStatus] }), "red")}</div>` : ""}</div>`;
  function lineCell(line: LineState) {
    if (line.state === "none") return "—";
    const note = line.note ? `<div>${chip(p[line.note], line.note === "renewed" ? "green" : "amber")}</div>` : "";
    if (line.state === "in_effect") return `<strong>${e(line.seasonLabel ?? "—")}</strong><div>${e(date(line.startDate))} – ${e(date(line.endDate))}</div>${note}`;
    const label = line.state === "starting" ? text.state.starting : line.state === "lapsed" ? p.lapsed : text.state.ended;
    return `<span class="${line.state === "lapsed" ? "red-text" : line.state === "ended" ? "muted" : ""}">${e(reportText(label, { date: date(line.state === "starting" ? line.startDate : line.endDate) }))}</span>${note}`;
  }
  function detail(r: ActiveCustomerRow, kind: IssueKind) {
    if (kind === "should_fall_off") return p.fallOffDetail;
    if (kind === "mismatch") return p.mismatchDetail;
    if (kind === "noContract") return p.noContractDetail;
    const terms = lines.filter(key => {
      const l = r[key];
      if (kind === "lapsed") return l.state === "lapsed";
      return l.state === "in_effect" && l.endDate && l.endDate >= data.asOf &&
        Date.parse(l.endDate) - Date.parse(data.asOf) <= 30 * 86400000 && l.note !== "renewed";
    }).map(key => `${text.cols[key]} · ${date(r[key].endDate)}`).join("; ");
    // Never infer a missing date or decision when the projected flag has no line detail.
    return reportText(kind === "ending_soon" ? p.endingDetail : p.lapsedDetail, { terms: terms || "—" });
  }
  const issues = sorted.flatMap(row => issueKinds.filter(kind => kind === "noContract" ? row.noContract : row.flags.includes(kind))
    .map(kind => ({ row, kind, detail: detail(row, kind) })));
  const inactive = sorted.filter(r => r.customerStatus === "inactive" && !r.responsible);
  const lastTerm = (r: ActiveCustomerRow) => {
    // Same latest-end convention as the page; future/starting terms are not ended history.
    const end = lines.map(key => r[key]).filter(l => l.state === "ended" || l.state === "lapsed")
      .map(l => l.endDate).filter((d): d is string => !!d).sort().at(-1);
    return end ? reportText(end > data.asOf ? p.stopped : text.state.ended, { date: date(end) }) : "—";
  };
  const section = (title: string, labels: string[], widths: number[], rows: string[]) =>
    `<h2>${e(title)}</h2><table><thead><tr>${labels.map((label, i) => `<th style="width:${widths[i]}%">${e(label)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${labels.length}" class="muted">${e(p.empty)}</td></tr>`}</tbody></table>`;
  const html = documentHtml(`<style>
    @page{size:letter landscape;margin:96px 0 76px}@page:first{margin-top:0}
    .band{padding:20px 64px 18px}.band img{height:60px}.band h1{font-size:22pt}
    .content{padding-top:18px}.figures{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
    .figure{padding:10px}.figure strong{font-size:23pt}.figure .label{font-size:7.5pt;min-height:22px;margin-bottom:2px}
    h2{break-after:avoid}th{font-size:7.5pt}td{font-size:8.5pt;padding:7px 6px;line-height:1.45}
    .chip{display:inline-block;max-width:100%;overflow-wrap:anywhere;font-size:7pt;border-radius:8px;padding:2px 6px;margin:3px 2px 0 0}
    .green{background:#eef6e3;color:#285226}.amber{background:#fff1cf;color:#7a4a00}.red{background:#fde7e7;color:#a32020}
    .red-text{color:#a32020}.muted{color:#647067}.branch{padding-left:16px;border-left:2px solid #8cc640}
    .mountain-space{height:${MOUNTAIN_RESERVE}px}
    </style>${firstHeader({ title: p.title, number: "", dateLine: reportText(p.subtitle, { date: date(data.asOf, true) }) })}
    <main class="content"><div class="figures">${[
      [p.active, data.counts.responsible], [p.landscape, data.counts.landscape], [p.snow, data.counts.snow], [p.attention, issues.length],
    ].map(([label, count]) => `<div class="figure"><div class="label">${e(label)}</div><strong>${e(count)}</strong></div>`).join("")}</div>
    ${section(p.title, [text.cols.customer, p.management, text.cols.landscape, text.cols.snow], [29, 19, 26, 26],
      grouped.map(r => `<tr><td>${customer(r)}</td><td>${e(r.managingAgentName || "—")}</td><td>${lineCell(r.landscape)}</td><td>${lineCell(r.snow)}</td></tr>`))}
    ${section(p.attention, [text.cols.customer, p.issue, p.detail], [29, 19, 52], issues.map(({ row, kind, detail }) =>
      `<tr><td>${e(row.customerName)}</td><td>${chip(kind === "lapsed" ? p.lapsedIssue : kind === "mismatch" ? p.mismatch : text.flag[kind], kind === "ending_soon" || kind === "noContract" ? "amber" : "red")}</td><td>${e(detail)}</td></tr>`))}
    ${section(p.inactive, [text.cols.customer, p.management, p.lastTerm, p.note], [29, 19, 26, 26], inactive.map(r =>
      `<tr><td>${e(r.customerName)}</td><td>${e(r.managingAgentName || "—")}</td><td>${e(lastTerm(r))}</td><td>${e(p.inactiveNote)}</td></tr>`))}
    <div class="mountain-space"></div></main>`);
  return { html, footerLabel: reportText(p.footer, { date: date(data.asOf) }), shortHeaderNumber: p.title,
    pageCountTemplate: p.page, issues, responsible: grouped, inactive };
}
