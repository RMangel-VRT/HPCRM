import type { EstimateDocumentModel } from "../estimatePdf";
import { documentSettingsModel } from "@workspace/db/document-contracts";
import { assetUri } from "./assets";
import { documentHtml, escapeHtml as e, multiline, firstHeader, displayDate, keyFigureBox, tableHead, quantity } from "./layout";
import { estimatePricingFragment, estimateAcceptanceFragment } from "./estimate";

export interface DocumentImage { caption: string; dataUri: string }
export interface ProposalPlantRow {
  quantity: string; name: string; botanicalName: string | null; size: string | null;
  typeLabel: string; dataUri: string | null;
}
export interface ProposalDocumentInput {
  title: string; number: string; documentDate: string; scopeOfWork: string;
  customerName: string; customerAddress: string; workLocation: string | null;
  estimate: Omit<EstimateDocumentModel, "showVersion">; coverSource: string; hero: DocumentImage | null;
  visualScope: DocumentImage[];
  palette: { introText: string; groups: { label: string; cards: { name: string; typeLabel: string; dataUri: string | null }[] }[] };
  schedule: { quantity: string; name: string; botanicalName: string | null; size: string | null }[];
  plants?: ProposalPlantRow[]; includePlantPalette?: boolean;
  photos: (DocumentImage & { order: number })[]; photoLayout: string;
}
const safeImage = (uri: string | null | undefined) => uri && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : null;
/** Pure allowlist. No ORM records, provenance, internal identities or clock. */
export function buildProposalDocumentModel(i: ProposalDocumentInput): ProposalDocumentInput {
  const m = i.estimate;
  const image = (v: DocumentImage) => ({ caption: v.caption, dataUri: safeImage(v.dataUri)! });
  return {
    title: i.title, number: i.number, documentDate: i.documentDate, scopeOfWork: i.scopeOfWork,
    customerName: i.customerName, customerAddress: i.customerAddress, workLocation: i.workLocation,
    // Reproject even nested inputs: accidental fields on a supplied model cannot escape.
    estimate: {
      companyName: m.companyName, estimateNumber: m.estimateNumber, versionNumber: m.versionNumber, documentDate: m.documentDate,
      status: m.status, statusLine: m.draft ? "DRAFT — not sent" : m.statusLine, draft: m.draft, customerName: m.customerName,
      customerAddress: m.customerAddress, projectTitle: m.projectTitle, linkedTicketTitle: m.linkedTicketTitle,
      subtotalCents: m.subtotalCents, totalCents: m.totalCents, terms: null, workLocation: m.workLocation,
      discounts: (m.discounts ?? []).map(d => ({ label: d.label, kind: d.kind, displayValue: d.displayValue, cents: d.cents })),
      scopeOfWork: m.scopeOfWork, hasPlants: m.hasPlants,
      companyDocument: documentSettingsModel(m.companyDocument),
      sections: m.sections.map(s => ({ name: s.name, subtotalCents: s.subtotalCents,
        lines: s.lines.map(l => ({ name: l.name, detail: l.detail, quantity: l.quantity, unit: l.unit,
          unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents })) })),
      categorySummary: m.categorySummary.map(c => ({ label: c.label, cents: c.cents })),
    },
    coverSource: i.coverSource, hero: i.coverSource !== "none" && i.hero && safeImage(i.hero.dataUri) ? image(i.hero) : null,
    visualScope: i.visualScope.filter(v => safeImage(v.dataUri)).map(image),
    palette: { introText: i.palette.introText, groups: i.palette.groups.filter(g => g.cards.length).map(g => ({
      label: g.label, cards: g.cards.map(c => ({ name: c.name, typeLabel: c.typeLabel, dataUri: safeImage(c.dataUri) })),
    })) },
    schedule: i.schedule.map(r => ({ quantity: r.quantity, name: r.name, botanicalName: r.botanicalName, size: r.size })),
    plants: (i.plants ?? []).map(r => ({ quantity: r.quantity, name: r.name, botanicalName: r.botanicalName,
      size: r.size, typeLabel: r.typeLabel, dataUri: safeImage(r.dataUri) })),
    includePlantPalette: i.includePlantPalette === true,
    photos: [...i.photos].sort((a, b) => a.order - b.order).filter(v => safeImage(v.dataUri)).map(v => ({ ...image(v), order: v.order })),
    photoLayout: i.photoLayout === "grid" ? "grid" : "large",
  };
}
const figure = (image: DocumentImage) => `<figure class="keep"><figcaption>${e(image.caption)}</figcaption><img alt="" src="${image.dataUri}"></figure>`;
/** Attachments-free and full flows have identical prefixes for acceptance-page detection. */
export function proposalDocumentHtml(m: ProposalDocumentInput, attachments = true): string {
  const settings = m.estimate.companyDocument;
  const address = [m.estimate.companyName, settings.addressLine1, settings.addressLine2,
    [settings.city, settings.state, settings.postalCode].filter(Boolean).join(" "), settings.phone, settings.website].filter(Boolean).join(" · ");
  const hero = safeImage(m.hero?.dataUri);
  const cover = `<section class="proposal-cover ${hero ? "image-cover" : "type-cover"}"><header class="band"><img alt="High Plains" src="${assetUri("hp-logo-white-horizontal.png")}"><h1>Proposal</h1></header>${hero ? `<img class="hero" alt="" src="${hero}">` : ""}<div class="cover-copy"><div class="label">Prepared for</div><h2>${e(m.customerName)}</h2><h1>${e(m.title)}</h1><div class="secondary">${e(m.number)}　 ${displayDate(m.documentDate)}</div>${hero ? "" : `<div class="cover-details"><div><div class="label">Work location</div>${multiline(m.workLocation ?? "—")}</div>${keyFigureBox("Proposal total", m.estimate.totalCents, "plus sales tax where it applies")}</div>`}</div><div class="cover-mountains"><img alt="" src="${assetUri("mountains.png")}"></div><footer>${e(address)}</footer></section>`;
  const opening = `${firstHeader({ title: "Proposal", number: m.number, dateLine: displayDate(m.documentDate), draft: m.estimate.draft, settings: m.estimate.companyDocument })}<main class="content"><div class="columns"><div><div class="label">Prepared for</div><strong>${e(m.customerName)}</strong><div class="secondary">${multiline(m.customerAddress)}</div></div><div><div class="label">Work location</div>${m.workLocation ? multiline(m.workLocation) : "—"}</div>${keyFigureBox("Proposal total", m.estimate.totalCents, "plus sales tax where it applies")}</div>${m.scopeOfWork.trim() ? `<h2>Scope of work</h2><div class="boilerplate">${m.scopeOfWork.split("[PAGE BREAK]").map(multiline).join('<div class="new-page"></div>')}</div>` : ""}</main>`;
  const visuals = m.visualScope.map(v => `<section class="content new-page"><h2>Visual Scope</h2>${figure(v)}</section>`).join("");
  const pricing = `<section class="content"><h2>Pricing</h2><p class="secondary">${e(m.estimate.estimateNumber)} · Version ${m.estimate.versionNumber}</p>${estimatePricingFragment(m.estimate)}</section>`;
  const plants = m.plants?.length ? `<section class="content plants"><h2>Plants</h2>${m.includePlantPalette && m.palette.introText ? `<p>${multiline(m.palette.introText)}</p>` : ""}<table>${tableHead(m.includePlantPalette ? ["", "Qty", "Plant", "Size"] : ["Qty", "Plant", "Size"], m.includePlantPalette ? [16, 9, 56, 19] : [12, 66, 22])}<tbody>${m.plants.map(r => `<tr>${m.includePlantPalette ? `<td>${safeImage(r.dataUri) ? `<img alt="" src="${r.dataUri}">` : ""}</td>` : ""}<td>${quantity(r.quantity)}</td><td><strong>${e(r.name)}</strong>${r.botanicalName ? `<div class="secondary botanical">${e(r.botanicalName)}</div>` : ""}${m.includePlantPalette ? `<div class="secondary">${e(r.typeLabel)}</div>` : ""}</td><td>${e(r.size)}</td></tr>`).join("")}</tbody></table></section>` : "";
  // Keep acceptance/signatures/clearance together, but allow settings text to overflow.
  const acceptance = `<section class="content legal">${estimateAcceptanceFragment(m.estimate)}</section>`;
  const perPage = m.photoLayout === "grid" ? 4 : 2;
  const photos = attachments ? Array.from({ length: Math.ceil(m.photos.length / perPage) }, (_, i) =>
    `<section class="content new-page attachment"><h2>${i ? "Attachment A: Photos (continued)" : "Attachment A: Photos"}</h2><div class="photos ${m.photoLayout}">${m.photos.slice(i * perPage, (i + 1) * perPage).map(figure).join("")}</div></section>`).join("") : "";
  const css = `<style>
    @page cover{margin:0}
    @page opening{margin:0 0 76px}
    .proposal-cover{page:cover;height:1056px;background:white;position:relative;overflow:hidden}
    .proposal-cover .band{padding:20px 64px 22px}.proposal-cover .band img{height:72px}
    .cover-copy{padding:36px 64px 0;color:#37443D}.cover-copy h1{font-size:28pt;margin:22px 0 16px;overflow-wrap:anywhere}
    .cover-copy h2{font-size:14pt;font-weight:500;margin:4px 0 22px}.hero{display:block;width:100%;height:520px;object-fit:cover}
    .type-cover .cover-copy{padding-top:150px}.type-cover .cover-copy h1{font-size:36pt;margin:24px 0}
    .type-cover .cover-copy h2{font-size:18pt}.cover-details{border-top:1px solid #ddd;margin-top:70px;padding-top:28px;display:grid;grid-template-columns:2fr 1fr;gap:32px}
    .cover-mountains{position:absolute;bottom:47px;width:100%;height:84px;overflow:hidden;opacity:.6}.cover-mountains img{display:block;width:100%;height:auto}
    .proposal-cover footer{position:absolute;bottom:0;width:100%;height:47px;border-top:1.5px solid #37443D;padding:16px 64px 0;color:#4f5a53;font-size:8pt}
    .proposal-opening{page:opening;break-before:page;padding-top:96px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
    .proposal-opening>.band{margin-top:-96px}
    .new-page{break-before:page}h2,h3,figcaption{break-after:avoid}figure{margin:0 0 18px}figcaption{margin-bottom:8px;overflow-wrap:anywhere}
    figure img{display:block;width:100%;height:650px;object-fit:contain}
    .plants{padding-top:48px}.plants th{text-align:left}.plants td{vertical-align:middle;padding-top:5px;padding-bottom:5px}.plants img{display:block;width:84px;height:62px;object-fit:cover;border-radius:3px}.botanical{font-style:italic}
    .photos.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.photos.grid img{height:290px}
    .attachment figure{height:375px;display:flex;flex-direction:column}
    .attachment figcaption{flex:none}
    .attachment img{min-height:0;flex:1;height:0}.attachment .grid figure{height:345px}
    .legal{padding-top:48px}.legal .estimate-legal{orphans:3;widows:3}.legal .mountain-space{height:116px}
  </style>`;
  return documentHtml(`${css}${cover}<section class="proposal-opening" data-pricing-region data-pricing-flow>${opening}${visuals}${pricing}${plants}${acceptance}</section>${photos}`);
}
