import { publicAppUrl } from "../../lib/publicAppUrl";
import { renderBlock, type Block } from "./blocks";
import { colors as c, escape, font, httpUrl, label, paragraph, spacer, table } from "./markup";
import type { EmailWording } from "./wording";

export type { Block } from "./blocks";
const tones = {
  lime: [c.lime, c.limeText], sky: ["#5B9BD5", "#255a8a"], amber: ["#E3A008", "#8a5a00"],
  red: ["#C8372D", "#9b1c14"], slate: ["#9AA59F", "#4f5a53"],
} as const;
export type Stripe = keyof typeof tones;
export interface EmailCompany { name: string; addressLine: string; phone: string; email: string; website: string }
export interface EmailLayoutInput {
  subject: string; preview: string; docType: string; docNumber: string; stripe: Stripe;
  wording: Pick<EmailWording, "eyebrow" | "headline" | "intro" | "closing">;
  greeting: string | null;
  blocks: Block[];
  company: EmailCompany;
  internal?: boolean;
}

const asset = (name: string) => escape(`${publicAppUrl()}/email/${name}`);
const content = (html: string) => `<tr><td style="padding:0 32px;overflow-wrap:anywhere">${html}</td></tr>`;
const footerLink = (value: string, href: string | null) => href
  ? `<a href="${escape(href)}" style="color:#b8dc8a;text-decoration:none">${escape(value)}</a>` : escape(value);
function brandedFooter(company: EmailCompany) {
  const { name, addressLine, phone, email, website } = company;
  const websiteUrl = website && httpUrl(/^[a-z][a-z\d+.-]*:/i.test(website) ? website : `https://${website}`);
  const emailUrl = /^[^\s@]+@[^\s@]+$/.test(email) ? `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}` : null;
  const contacts = [escape(phone), footerLink(email, emailUrl), footerLink(website, websiteUrl || null)].filter(Boolean).join(" · ");
  return `<tr><td style="padding:0;line-height:0"><img src="${asset("mountains.png")}" width="600" alt="" style="display:block;width:100%;height:auto"></td></tr>
<tr><td bgcolor="${c.footer}" style="padding:22px 32px;border-radius:0 0 14px 14px">${table(`<tr><td valign="top" width="54"><img src="${asset("hp-logo-badge.png")}" width="42" height="42" alt="" style="display:block"></td>
<td valign="top" style="${font};font-size:12.5px;line-height:1.6;color:#c9d2cc;overflow-wrap:anywhere">${[
    `<strong style="color:#fff;font-size:13.5px">${escape(name)}</strong>`, escape(addressLine), contacts,
  ].filter(Boolean).join("<br>")}</td></tr>`)}</td></tr>`;
}

export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const { company, wording, greeting } = input;
  const [stripe, eyebrow] = tones[input.stripe];
  const blocks = input.blocks.map(renderBlock);
  const header = `<tr><td bgcolor="${c.band}" style="padding:20px 32px;border-radius:14px 14px 0 0">${table(`<tr>
<td valign="middle" width="82"><img src="${asset("hp-logo-white-horizontal.png")}" height="44" alt="${escape(company.name)}" style="display:block;height:44px;width:auto"></td>
<td valign="middle" align="right" style="padding-left:8px;overflow-wrap:anywhere"><div style="${font};font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#d6ecb8">${escape(input.docType)}</div>
<div style="${font};font-size:18px;font-weight:800;color:#fff">${escape(input.docNumber)}</div></td></tr>`)}</td></tr>`;
  const intro = content((wording.eyebrow ? label(wording.eyebrow, eyebrow) : "")
    + (wording.headline ? `<h1 style="margin:0 0 14px;${font};font-size:26px;line-height:1.25;color:${c.ink};font-weight:800">${escape(wording.headline.replace(/-/g, "\u2011"))}</h1>` : "")
    + paragraph(greeting ?? "", 15, c.ink) + paragraph(wording.intro, 15, c.copy));
  const plainFooter = `<tr><td bgcolor="${c.soft}" style="padding:16px 32px;border-top:1px solid ${c.line};${font};font-size:12px;color:${c.muted}">${escape(company.name)}</td></tr>`;
  const main = header
    + `<tr><td bgcolor="${stripe}" height="6" style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>`
    + spacer(28) + intro
    + blocks.map(({ html }, i) => spacer(i ? 18 : 4) + content(html)).join("")
    + spacer(input.blocks.at(-1)?.kind === "attachments" ? 10 : 18)
    + content(paragraph(wording.closing, 14, c.copy)
      + `<p style="margin:0 0 14px;${font};font-size:14px;line-height:1.6;color:${c.ink}">Thank you,<br><strong>${escape(company.name)}</strong></p>`)
    + spacer(14) + (input.internal ? plainFooter : brandedFooter(company));
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(input.subject)}</title></head>
<body style="margin:0;padding:0;background:${c.page}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escape(input.preview)}</div>
${table(`<tr><td align="center" style="padding:24px 12px">${table(main, "width:100%;max-width:600px;border-radius:14px", c.white, "600")}</td></tr>`, "", c.page)}</body></html>`;
  const text = [company.name, wording.headline, greeting, wording.intro, ...blocks.map(block => block.text),
    wording.closing, `Thank you,\n${company.name}`, !input.internal && [company.addressLine, company.phone, company.email, company.website].filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n\n");
  return { html, text };
}
