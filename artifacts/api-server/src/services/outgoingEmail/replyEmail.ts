import { publicAppUrl } from "../../lib/publicAppUrl";
import type { EmailCompany } from "./layout";
import { colors, escape, font, multiline, paragraph, table } from "./markup";

export const replyLogoUrl = () => `${publicAppUrl()}/email/hp-logo-badge.png`;
export function buildReplyEmail({ body, company, firstName, parent }: {
  body: string; company: EmailCompany; firstName: string | null;
  parent: { at: string | Date; name: string | null; address: string; text: string };
}) {
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const paragraphs = body.trim().replace(/\r\n?/g, "\n").split(/\n(?:[ \t]*\n)+/).filter(Boolean);
  const signoff = `Thank you,\n${company.name}`;
  const contact = [company.phone, company.email, company.website].filter(Boolean).join(" · ");
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Denver" }).format(new Date(parent.at));
  const cite = `On ${date}, ${parent.name && parent.name !== parent.address ? `${parent.name} ` : ""}<${parent.address}> wrote:`;
  const details = [company.name, company.addressLine, contact].filter(Boolean);
  const signature = table(`<tr><td valign="top" width="48"><img alt="" width="36" height="36" src="${escape(replyLogoUrl())}" style="display:block"></td>
    <td valign="top" style="${font};font-size:12px;line-height:1.5;color:${colors.muted}">${details.map(escape).join("<br>")}</td></tr>`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
    <body style="margin:0;background:#fff">${table(`<tr><td style="padding:16px;${font};color:${colors.ink}">
    ${paragraph(greeting, 15, colors.ink)}${paragraphs.map(text => paragraph(text, 15, colors.ink)).join("")}
    <p style="margin:0 0 14px;${font};font-size:15px">Thank you,<br><strong>${escape(company.name)}</strong></p>
    <div style="border-top:1px solid ${colors.line};padding-top:12px">${signature}</div>
    <blockquote type="cite" style="margin:18px 0 0;border-left:2px solid ${colors.line};padding-left:12px;${font};font-size:13px;color:${colors.muted}">
    ${multiline(cite)}<br>${multiline(parent.text)}</blockquote></td></tr>`, "width:100%;max-width:600px", colors.white, "600")}</body></html>`;
  const text = [greeting, ...paragraphs, signoff, details.join("\n"),
    `${cite}\n${parent.text.replace(/\r\n?/g, "\n").split("\n").map(line => `> ${line}`).join("\n")}`].join("\n\n");
  return { html, text, greeting };
}
