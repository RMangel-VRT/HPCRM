import { afterEach, describe, expect, it, vi } from "vitest";
import { publicAppUrl } from "../../lib/publicAppUrl";
import { renderEmailLayout, type Block, type EmailLayoutInput, type Stripe } from "./layout";
import { DEFAULT_WORDING, fillWording, PLACEHOLDERS, WORDING_FIELDS, type EmailKey } from "./wording";

const input: EmailLayoutInput = {
  subject: "Subject <&>", preview: "Preview <&>", docType: "Estimate", docNumber: "EST-2026-0014",
  stripe: "lime", greeting: "Hello Customer,", wording: { eyebrow: "Eyebrow", headline: "High-end", intro: "Intro", closing: "Closing" },
  blocks: [], company: { name: "High & Plains", addressLine: "", phone: "", email: "office@example.test", website: "" },
};
afterEach(() => vi.unstubAllEnvs());

describe("customer email layout", () => {
  it.each([
    ["lime", "#8CC640", "#4d7a1c"], ["sky", "#5B9BD5", "#255a8a"], ["amber", "#E3A008", "#8a5a00"],
    ["red", "#C8372D", "#9b1c14"], ["slate", "#9AA59F", "#4f5a53"],
  ] as [Stripe, string, string][])("uses the %s stripe and eyebrow", (stripe, bgcolor, ink) => {
    const { html } = renderEmailLayout({ ...input, stripe });
    expect(html).toContain(`bgcolor="${bgcolor}" height="6"`);
    expect(html).toContain(`color:${ink};margin:0 0 6px">Eyebrow`);
  });

  it("uses the stable public PNGs, first-in-body preheader, light metadata and email-safe markup", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    expect(publicAppUrl()).toBe("https://app.highplainsprop.com");
    vi.stubEnv("PUBLIC_APP_URL", " https://crm.example.test/// ");
    const { html, text } = renderEmailLayout(input);
    expect(html).toMatch(/<body[^>]*><div style="display:none;[^"]*">Preview &lt;&amp;&gt;(?:&#847;&zwnj;&nbsp;){90}<\/div>/);
    expect(html).toContain('<title>Subject &lt;&amp;&gt;</title>');
    for (const name of ["color-scheme", "supported-color-schemes"]) expect(html).toContain(`name="${name}" content="light"`);
    expect(html).toContain('name="format-detection" content="telephone=no,date=no,address=no,email=no"');
    expect(html).toContain("High‑end");
    expect(html).toContain("width:100%;max-width:600px");
    for (const name of ["hp-logo-white-horizontal", "hp-logo-badge", "mountains-footer"])
      expect(html).toContain(`https://crm.example.test/email/${name}.png`);
    expect(html).toContain('<tr><td bgcolor="#27312C" style="padding:0;line-height:0"><img src="https://crm.example.test/email/mountains-footer.png" width="600" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>\n<tr><td bgcolor="#27312C" style="padding:22px 32px;border-radius:0 0 14px 14px">');
    expect(html).not.toContain("/email/mountains.png");
    expect(html).not.toMatch(/display:(?:flex|grid)|<style|<svg|linear-gradient|data:image|\p{Extended_Pictographic}/u);
    expect(text).toBe("High & Plains\n\nHigh-end\n\nHello Customer,\n\nIntro\n\nClosing\n\nThank you,\nHigh & Plains\n\noffice@example.test");
    expect(html).toContain('href="mailto:office@example.test"');
    expect(html).not.toMatch(/ · |<br><br>/);
  });

  it("uses a plain internal footer and permits a missing greeting", () => {
    const { html, text } = renderEmailLayout({ ...input, internal: true, greeting: null });
    expect(html).not.toMatch(/mountains(?:-footer)?\.png|hp-logo-badge\.png|office@example\.test/);
    expect(text).not.toMatch(/Hello|office@example/);
  });

  it("escapes internal text links and omits them and the field note label from customer output", () => {
    const link = { label: "Open <CRM>", url: "https://crm.example.test/?a=1&b=2" };
    const blocks: Block[] = [{ kind: "note", label: "Field note", text: "Note" }];
    const staff = renderEmailLayout({ ...input, blocks, link, internal: true });
    expect(staff.html).toContain('href="https://crm.example.test/?a=1&amp;b=2"');
    expect(staff.html).toContain(">Open &lt;CRM&gt;</a>");
    expect(staff.text).toContain("Open <CRM>: https://crm.example.test/?a=1&b=2");
    const customer = renderEmailLayout({ ...input, blocks, link });
    expect(customer.html).toContain("A note from High Plains");
    expect(customer.text).toContain("A note from High Plains");
    expect(`${customer.html}\n${customer.text}`).not.toMatch(/Field note|crm\.example\.test|Open &lt;CRM/);
    const unsafe = renderEmailLayout({ ...input, internal: true, link: { ...link, url: "javascript:alert(1)" } });
    expect(`${unsafe.html}\n${unsafe.text}`).not.toContain("javascript:");
  });

  const cases: [Block, string, string][] = [
    [{ kind: "note", text: "<script> alert &\nsecond line" }, "&lt;script&gt; alert &amp;<br>second line", "A note from High Plains\n<script> alert &\nsecond line"],
    [{ kind: "chips", items: [{ label: "Total", value: "$800" }, { label: "Photos", value: "3" }] }, "<strong>$800</strong>", "Total: $800\nPhotos: 3"],
    [{ kind: "facts", title: "Facts", rows: [{ label: "Previous", value: "<b>$600</b>", strike: true }], total: { label: "New total", value: "$800" } },
      'text-decoration:line-through;color:#8b948e">&lt;b&gt;$600&lt;/b&gt;', "Facts\nPrevious: <b>$600</b> (previous)\nNew total: $800"],
    [{ kind: "summary", title: "Summary", rows: [{ label: "Section", detail: "2 lines", amount: "$800" }], footnote: "Scope only" }, "Scope only", "Summary\nSection (2 lines): $800\nScope only"],
    [{ kind: "steps", title: "What happens next", items: [{ title: "Sign", text: "Reply" }], active: 1 }, 'align="center" bgcolor="#8CC640"', "What happens next\n1. Sign: Reply"],
    [{ kind: "dates", planned: { date: "Nov 21", window: "Morning" }, backup: { date: "Nov 22", note: "If wet" } }, "Backup date", "Planned date: Nov 21\nMorning\nBackup date: Nov 22\nIf wet"],
    [{ kind: "checklist", title: "Before we arrive", tone: "amber", items: ["Open gate", "Secure pets"] }, 'bgcolor="#E3A008"', "Before we arrive\n- Open gate\n- Secure pets"],
    [{ kind: "card", title: "Payment", rows: [{ label: "Account", value: "Office" }] }, ">Payment</div>", "Payment\nAccount: Office"],
    [{ kind: "person", title: "Contact", lines: ["Alex", "Office manager"] }, "Alex<br>Office manager", "Contact\nAlex\nOffice manager"],
    [{ kind: "photos", title: "Work photos", urls: ["https://example.test/a.png?x=1&y=2", "javascript:alert(1)"], caption: "North side" },
      'src="https://example.test/a.png?x=1&amp;y=2"', "Work photos\nhttps://example.test/a.png?x=1&y=2\nNorth side"],
    [{ kind: "info", tone: "sky", title: "Heads up", text: "Reply <today>" }, "Reply &lt;today&gt;", "Heads up\nReply <today>"],
    [{ kind: "attachments", items: [{ title: "Estimate", filename: "estimate.pdf", detail: "3 pages" }] }, "estimate.pdf · 3 pages", "Attached: estimate.pdf · 3 pages"],
    [{ kind: "reply", text: "Questions? Just reply <here>." }, "<strong>Questions?</strong> Just reply &lt;here&gt;.", "Questions? Just reply <here>."],
  ];
  it.each(cases)("renders block $kind as escaped HTML and readable text", (block, htmlPart, textPart) => {
    const { html, text } = renderEmailLayout({ ...input, blocks: [block] });
    expect(html).toContain(htmlPart);
    expect(text).toContain(textPart);
    expect(html).not.toMatch(/<script>|javascript:/);
  });
});

describe("wording catalog", () => {
  it("validates case-sensitive placeholders before dropping incomplete sentences and substitutes once", () => {
    expect(fillWording("Hello {customerName}. Call {companyPhone}. Reply! Thanks?", {
      customerName: "   Acme\u00a0 &\tSons  ", companyPhone: "\u00a0 \t",
    })).toBe("Hello Acme & Sons. Reply! Thanks?");
    expect(fillWording("Missing {companyPhone}! Keep {title}.", { title: "A {companyPhone}. Inc" },
      ["title", "companyPhone"])).toBe("Keep A {companyPhone}. Inc.");
    expect(() => fillWording("Call {companyPhone} and {CompanyPhone}.", { companyPhone: "" }))
      .toThrow("Unknown email placeholder: CompanyPhone");
    expect(() => fillWording("{total}", { total: "$4" }, PLACEHOLDERS.documents)).toThrow("Unknown email placeholder: total");
  });
  it("provides all six fields for each of the 14 approved keys", () => {
    const keys = Object.keys(DEFAULT_WORDING) as EmailKey[];
    expect(keys).toHaveLength(14);
    for (const key of keys) {
      expect(Object.keys(DEFAULT_WORDING[key])).toEqual([...WORDING_FIELDS]);
      const values = Object.fromEntries(PLACEHOLDERS[key].map(name => [name, `valueFor${name}`]));
      for (const template of Object.values(DEFAULT_WORDING[key])) {
        const filled = fillWording(template, values, PLACEHOLDERS[key]);
        expect(filled).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });
});
