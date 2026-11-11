import type { EstimateDocumentModel } from "../estimatePdf";
import { documentSettingsModel } from "@workspace/db/document-contracts";
import { assetUri } from "./assets";
import { documentHtml, escapeHtml as e, multiline, firstHeader, displayDate, keyFigureBox, tableHead } from "./layout";
import { estimatePricingFragment, estimateAcceptanceFragment } from "./estimate";

export interface DocumentImage { caption: string; dataUri: string }
export interface ProposalDocumentInput {
  title: string; number: string; documentDate: string; scopeOfWork: string;
  customerName: string; customerAddress: string; workLocation: string | null;
  estimate: EstimateDocumentModel; coverSource: string; hero: DocumentImage | null;
  visualScope: DocumentImage[];
  palette: { introText: string; groups: { label: string; cards: { name: string; typeLabel: string; dataUri: string | null }[] }[] };
  schedule: { quantity: string; name: string; botanicalName: string | null; size: string | null }[];
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
      status: m.status, statusLine: m.statusLine, draft: m.draft, customerName: m.customerName,
      customerAddress: m.customerAddress, projectTitle: m.projectTitle, linkedTicketTitle: m.linkedTicketTitle,
      totalCents: m.totalCents, terms: null, workLocation: m.workLocation,
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
    photos: [...i.photos].sort((a, b) => a.order - b.order).filter(v => safeImage(v.dataUri)).map(v => ({ ...image(v), order: v.order })),
    photoLayout: i.photoLayout === "grid" ? "grid" : "large",
  };
}
const figure = (image: DocumentImage) => `<figure class="keep"><figcaption>${e(image.caption)}</figcaption><img alt="" src="${image.dataUri}"></figure>`;
/** Attachments-free and full flows have identical prefixes for acceptance-page detection. */
export function proposalDocumentHtml(m: ProposalDocumentInput, attachments = true): string {
  const cover = `<section class="proposal-cover"><img class="cover-logo" alt="High Plains" src="${assetUri("hp-logo-white-horizontal.png")}"><h1>${e(m.title)}</h1><div class="prepared">Prepared for</div><h2>${e(m.customerName)}</h2>${m.hero ? `<img class="hero" alt="" src="${m.hero.dataUri}">` : ""}</section>`;
  const opening = `${firstHeader({ title: "Proposal", number: m.number, dateLine: displayDate(m.documentDate), draft: m.estimate.draft, settings: m.estimate.companyDocument })}<main class="content"><div class="columns"><div><div class="label">Prepared for</div><strong>${e(m.customerName)}</strong><div class="secondary">${multiline(m.customerAddress)}</div></div><div><div class="label">Work location</div>${m.workLocation ? multiline(m.workLocation) : "—"}</div>${keyFigureBox("Proposal total", m.estimate.totalCents, "plus sales tax where it applies")}</div><h2>Scope of work</h2><div class="boilerplate">${m.scopeOfWork.split("[PAGE BREAK]").map(multiline).join('<div class="new-page"></div>')}</div></main>`;
  const visuals = m.visualScope.map(v => `<section class="content new-page"><h2>Visual Scope</h2>${figure(v)}</section>`).join("");
  const pricing = `<section class="content new-page" data-pricing-region><h2>Pricing</h2><p class="secondary">${e(m.estimate.estimateNumber)} · Version ${m.estimate.versionNumber}</p>${estimatePricingFragment(m.estimate)}</section>`;
  const palette = m.palette.groups.length ? `<section class="content new-page"><h2>Plant palette</h2>${m.palette.introText ? `<p>${multiline(m.palette.introText)}</p>` : ""}${m.palette.groups.map(g => `<section><h3>${e(g.label)}</h3><div class="palette">${g.cards.map(c => `<figure class="keep">${c.dataUri ? `<img alt="" src="${c.dataUri}">` : ""}<figcaption><strong>${e(c.name)}</strong><div class="secondary">${e(c.typeLabel)}</div></figcaption></figure>`).join("")}</div></section>`).join("")}</section>` : "";
  const schedule = m.schedule.length ? `<section class="content new-page"><h2>Plant schedule</h2><table>${tableHead(["Qty", "Plant", "Botanical", "Size"], [12, 33, 33, 22])}<tbody>${m.schedule.map(r => `<tr><td>${e(r.quantity)}</td><td>${e(r.name)}</td><td>${e(r.botanicalName)}</td><td>${e(r.size)}</td></tr>`).join("")}</tbody></table></section>` : "";
  // Keep acceptance/signatures/clearance together, but allow settings text to overflow.
  const acceptance = `<section class="content new-page legal">${estimateAcceptanceFragment(m.estimate)}</section>`;
  const perPage = m.photoLayout === "grid" ? 4 : 1;
  const photos = attachments ? Array.from({ length: Math.ceil(m.photos.length / perPage) }, (_, i) =>
    `<section class="content new-page attachment"><h2>${i ? "Attachment A: Photos (continued)" : "Attachment A: Photos"}</h2><div class="photos ${m.photoLayout}">${m.photos.slice(i * perPage, (i + 1) * perPage).map(figure).join("")}</div></section>`).join("") : "";
  const css = `<style>
    @page cover{margin:0}
    @page opening{margin:0 0 76px}
    .proposal-cover{page:cover;height:1056px;padding:80px 64px;background:#37443D;color:white;overflow:hidden}
    .proposal-cover .cover-logo{width:580px;max-height:160px;object-fit:contain;object-position:left}
    .proposal-cover h1{font-size:32pt;margin:65px 0 30px;overflow-wrap:anywhere}.proposal-cover h2{color:white;font-size:20pt;margin:8px 0 30px}
    .prepared{font-size:10pt;text-transform:uppercase;letter-spacing:.08em}.hero{width:688px;height:420px;object-fit:contain}
    .proposal-opening{page:opening;break-before:page;padding-top:96px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
    .proposal-opening>.band{margin-top:-96px}
    .new-page{break-before:page}h2,h3,figcaption{break-after:avoid}figure{margin:0 0 18px}figcaption{margin-bottom:8px;overflow-wrap:anywhere}
    figure img{display:block;width:100%;height:650px;object-fit:contain}
    .palette{display:grid;grid-template-columns:1fr 1fr;gap:20px}.palette img{height:210px}.palette figure{border:1px solid #e4e6e2;padding:12px}
    .photos.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.photos.grid img{height:290px}
    .attachment figure{height:710px;display:flex;flex-direction:column}
    .attachment img{min-height:0;flex:1;height:0}.attachment .grid figure{height:345px}
    .legal .mountain-space{height:116px}
  </style>`;
  return documentHtml(`${css}${cover}<section class="proposal-opening">${opening}</section>${visuals}${pricing}${palette}${schedule}${acceptance}${photos}`);
}
