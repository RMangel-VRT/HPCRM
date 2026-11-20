import { colors as c, escape, font, httpUrl, label, multiline, table } from "./markup";

type Fact = { label: string; value: string; strike?: boolean };
export type Block =
  | { kind: "note"; text: string }
  | { kind: "chips"; items: Fact[] }
  | { kind: "facts"; title?: string; rows: Fact[]; total?: { label: string; value: string } }
  | { kind: "summary"; title: string; rows: { label: string; detail?: string; amount: string }[]; footnote?: string }
  | { kind: "steps"; title: string; items: { title: string; text: string }[]; active: number }
  | { kind: "dates"; planned?: { date: string; window?: string }; backup?: { date: string; note: string } }
  | { kind: "checklist"; title: string; tone: "lime" | "amber"; items: string[] }
  | { kind: "card"; title: string; rows: Fact[] }
  | { kind: "person"; title: string; lines: string[] }
  | { kind: "photos"; title: string; urls: string[]; caption?: string }
  | { kind: "info"; tone: "sky" | "lime"; title: string; text: string }
  | { kind: "attachments"; title?: string; items: { title: string; filename: string; detail?: string; href?: string }[] }
  | { kind: "reply"; text: string };

const line = (row: Fact) => `${row.label}: ${row.value}${row.strike ? " (previous)" : ""}`;
const small = (text: string) => `<div style="${font};font-size:12.5px;line-height:1.45;color:${c.muted}">${multiline(text)}</div>`;
const bold = (text: string) => `<strong>${escape(text)}</strong>`;
const frame = (rows: string) => table(rows, `border:1px solid ${c.line};border-radius:10px;border-collapse:separate;table-layout:fixed`, c.white);
const card = (content: string, bg = c.soft, border = `1px solid ${c.line}`) =>
  table(`<tr><td style="padding:12px 16px;${font};font-size:14px;line-height:1.55;color:${c.ink};overflow-wrap:anywhere">${content}</td></tr>`,
    `border:${border};border-radius:10px`, bg);
const callout = (title: string, text: string, bg: string, accent: string, ink: string) =>
  table(`<tr><td style="padding:14px 18px;${font};font-size:14px;line-height:1.6;color:${c.ink};overflow-wrap:anywhere">${label(title, ink)}${multiline(text)}</td></tr>`,
    `border-left:4px solid ${accent};border-radius:8px`, bg);
const columns = (cells: string[]) => table(`<tr>${cells.map((cell, i) =>
  `<td valign="top" width="${Math.floor(100 / cells.length)}%" style="padding-right:${i === cells.length - 1 ? 0 : 6}px;overflow-wrap:anywhere">${cell}</td>`).join("")}</tr>`,
  "table-layout:fixed");

function facts(rows: Fact[], total?: { label: string; value: string }) {
  return frame(rows.map((row, i) => {
    const style = `padding:10px 16px;border-top:${i ? "1px solid #eef0ec" : "0"};${font};font-size:14px;overflow-wrap:anywhere`;
    const value = multiline(row.value);
    return `<tr><td style="${style};color:${c.muted}">${escape(row.label)}</td><td align="right" style="${style};color:${c.ink};font-weight:600">${row.strike
      ? `<span style="text-decoration:line-through;color:#8b948e">${value}</span>` : value}</td></tr>`;
  }).join("") + (total ? `<tr><td bgcolor="${c.band}" style="padding:14px 16px;${font};font-size:14px;font-weight:700;color:#fff;border-radius:0 0 0 9px">${escape(total.label)}</td>
<td align="right" bgcolor="${c.band}" style="padding:14px 16px;${font};font-size:22px;font-weight:800;color:#fff;border-radius:0 0 9px 0;overflow-wrap:anywhere">${escape(total.value)}</td></tr>` : ""));
}

export function renderBlock(block: Block): { html: string; text: string } {
  const render = (html: string, ...lines: (string | undefined)[]) => ({ html, text: lines.filter(Boolean).join("\n") });
  switch (block.kind) {
    case "note": {
      const title = "A note from High Plains";
      return render(callout(title, block.text, c.paleLime, c.lime, c.limeText), title, block.text);
    }
    case "chips":
      return render(columns(block.items.map(item => table(`<tr><td style="padding:10px 12px;${font};font-size:15px;color:${c.ink};overflow-wrap:anywhere">${label(item.label)}${bold(item.value)}</td></tr>`,
        `border:1px solid ${c.line};border-radius:10px`, c.white))), ...block.items.map(line));
    case "facts":
    case "card": {
      const total = block.kind === "facts" ? block.total : undefined;
      return render((block.title ? label(block.title) : "") + facts(block.rows, total),
        block.title, ...block.rows.map(line), total && line(total));
    }
    case "summary": {
      const head = (text: string, align: string) => `<td align="${align}" bgcolor="${c.soft}" style="padding:8px 14px;${font};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${c.muted}">${text}</td>`;
      const style = `padding:9px 14px;border-top:1px solid #eef0ec;${font};font-size:14px;color:${c.ink};overflow-wrap:anywhere`;
      return render(label(block.title) + table(`<tr>${head("Section", "left")}${head("Amount", "right")}</tr>` + block.rows.map(row =>
        `<tr><td style="${style}">${escape(row.label)}${row.detail ? small(row.detail) : ""}</td><td align="right" style="${style}">${escape(row.amount)}</td></tr>`).join(""),
      `border:1px solid ${c.line};border-radius:10px;border-collapse:separate`, c.white) + (block.footnote ? small(block.footnote) : ""),
      block.title, ...block.rows.map(row => `${row.label}${row.detail ? ` (${row.detail})` : ""}: ${row.amount}`), block.footnote);
    }
    case "steps":
      return render(label(block.title) + table(`<tr><td style="padding:16px">${columns(block.items.map((item, i) => {
        const active = i + 1 === block.active;
        return table(`<tr><td width="26" height="26" align="center" bgcolor="${active ? c.lime : c.white}" style="border:2px solid ${active ? c.lime : c.line};border-radius:13px;${font};font-size:12px;font-weight:800;color:${c.ink}">${i + 1}</td></tr>`, "", undefined, "26")
          + `<div style="margin-top:8px;${font};font-size:14px;color:${c.ink}">${bold(item.title)}</div>${small(item.text)}`;
      }))}</td></tr>`, "border-radius:10px", c.soft),
      block.title, ...block.items.map((item, i) => `${i + 1}. ${item.title}: ${item.text}`));
    case "dates":
      return render(columns([
        ...(block.planned ? [callout("Planned date", [block.planned.date, block.planned.window].filter(Boolean).join("\n"), c.paleLime, c.lime, c.limeText)] : []),
        ...(block.backup ? [callout("Backup date", `${block.backup.date}\n${block.backup.note}`, "#fff5dd", "#E3A008", "#8a5a00")] : []),
      ]), block.planned?.date ? `Planned date: ${block.planned.date}` : undefined, block.planned?.window,
      block.backup && `Backup date: ${block.backup.date}`, block.backup?.note);
    case "checklist": {
      const amber = block.tone === "amber";
      return render(label(block.title) + table(block.items.map(item => `<tr>
<td width="26" valign="top" style="padding:4px 0">${table(`<tr><td width="18" height="18" align="center" bgcolor="${amber ? "#E3A008" : c.lime}" style="border-radius:9px;${font};font-size:11px;font-weight:800;color:${amber ? c.white : c.ink}">${amber ? "!" : "&#10003;"}</td></tr>`, "", undefined, "18")}</td>
<td style="padding:3px 0;${font};font-size:14px;line-height:1.55;color:${c.ink}">${multiline(item)}</td></tr>`).join("")),
      block.title, ...block.items.map(item => `- ${item}`));
    }
    case "person":
      return render(label(block.title) + card(block.lines.map(multiline).join("<br>")), block.title, ...block.lines);
    case "photos": {
      const urls = block.urls.map(httpUrl).filter((url): url is string => !!url);
      if (!urls.length) return render("");
      const rows: string[] = [];
      for (let i = 0; i < urls.length; i += 3) {
        const row = urls.slice(i, i + 3);
        rows.push(columns(row.map((url, j) =>
          `<img src="${escape(url)}" alt="Photo ${i + j + 1}" width="${Math.floor(520 / row.length)}" style="display:block;width:100%;height:auto;border-radius:8px">`)));
      }
      return render(label(block.title) + rows.join('<div style="height:8px;line-height:8px;font-size:0">&nbsp;</div>')
        + (block.caption ? small(block.caption) : ""), block.title, ...urls, block.caption);
    }
    case "info": {
      const sky = block.tone === "sky";
      return render(callout(block.title, block.text, sky ? "#eaf3fa" : c.paleLime, sky ? "#5B9BD5" : c.lime, sky ? "#255a8a" : c.limeText),
        block.title, block.text);
    }
    case "attachments": {
      const items = block.items.map(item => ({ ...item, url: item.href ? httpUrl(item.href) : null }));
      return render(label(block.title ?? "Attached") + items.map(item => table(`<tr><td width="44" align="center" style="padding:12px 0 12px 12px">
${table(`<tr><td width="30" height="36" align="center" bgcolor="${c.band}" style="border-radius:4px;${font};font-size:9px;font-weight:800;color:${c.lime};letter-spacing:.04em">${/\.pdf$/i.test(item.filename) ? "PDF" : "FILE"}</td></tr>`, "", undefined, "30")}
</td><td style="padding:12px 14px;${font};font-size:14px;color:${c.ink};overflow-wrap:anywhere">${item.url ? `<a href="${escape(item.url)}" style="color:${c.limeText};font-weight:700">${escape(item.title)}</a>` : bold(item.title)}${small([item.filename, item.detail].filter(Boolean).join(" · "))}</td></tr>`,
      `border:1px solid ${c.line};border-radius:10px;margin-bottom:8px;table-layout:fixed`, c.soft)).join(""),
      ...items.map(item => `${block.title ?? "Attached"}: ${[item.filename || item.title, item.detail].filter(Boolean).join(" · ")}${item.url ? `\n${item.url}` : ""}`));
    }
    case "reply": {
      const question = block.text.match(/^[^?\n]+\?/u)?.[0];
      return render(card(question ? bold(question) + multiline(block.text.slice(question.length)) : multiline(block.text), c.white, "1px dashed #c9d6cd"), block.text);
    }
  }
}
