import { expect, it } from "vitest";
import { companyPhoneTarget, linkWordingPhone, renderCompanyPhone } from "./companyPhone";
import { escape } from "./markup";
import { renderEmailLayout } from "./layout";
import { buildReplyEmail } from "./replyEmail";
import { fillWording } from "./wording";

const phone = "(303)\u00a0 555-0123";
const normalizedPhone = "(303) 555-0123";
const underlined = `<a href="tel:+13035550123" style="color:inherit;text-decoration:underline">${normalizedPhone}</a>`;
const company = { name: "Example & Co.", addressLine: "1 Test Street", email: "office@example.test", website: "", phone };

it.each(["3035550123", phone, "+1 (303) 555-0123", "1-303-555-0123", "13035550123"])("builds a single US prefix for %s", value => {
  expect(companyPhoneTarget(value)).toBe("tel:+13035550123");
});

it.each(["+44 303-555-0123", "303-555-0123 / 303-555-9999", "303-555-0123 x44", "303-555-01234", "1+303-555-0123",
  "<img onerror='x'>303-555-0123", "303) 555-0123", "  "])("leaves ambiguous settings escaped and unlinked: %s", value => {
  expect(companyPhoneTarget(value)).toBeNull();
  expect(renderCompanyPhone(value)).toBe(escape(value));
});

it("links only complete exact occurrences in escaped wording, including normalized settings", () => {
  const raw = fillWording("Call <us> at {companyPhone} & reply. Other: (720) 555-0123; +1 (303) 555-0123; (303) 555-01234; (303) 555-0123-56. Or ({companyPhone}).", { companyPhone: phone });
  expect(linkWordingPhone(escape(raw), phone)).toBe(
    `Call &lt;us&gt; at ${underlined} &amp; reply. Other: (720) 555-0123; +1 (303) 555-0123; (303) 555-01234; (303) 555-0123-56. Or (${underlined}).`,
  );
  expect(linkWordingPhone("12303035550123 30355501234", "3035550123")).not.toContain("tel:");
});

it("styles footer and wording separately and leaves the plain text and typed body free of generated links", () => {
  const wording = { eyebrow: normalizedPhone, headline: normalizedPhone, intro: `Call ${normalizedPhone}.`, closing: `Reply or call ${normalizedPhone}.` };
  const { html, text } = renderEmailLayout({ company, subject: "Test", preview: "Snippet", wording,
    greeting: "Hello,", blocks: [], docType: "Message", docNumber: "", stripe: "lime",
    messageParagraphs: [`<Typed> ${normalizedPhone}`] });
  expect(html.split(underlined)).toHaveLength(5);
  expect(html).toContain(`<a href="tel:+13035550123" style="color:#c9d2cc;text-decoration:none">${phone}</a>`);
  expect(html).toContain(`&lt;Typed&gt; ${normalizedPhone}</p>`);
  expect(text).toContain(phone);
  expect(text).not.toMatch(/tel:|&zwnj;|<a href|Snippet/);
});

it("adds a link only to the slim reply signature, not the typed reply or quote", () => {
  const parent = { at: "2026-11-20T19:00:00Z", name: null, address: "customer@example.test", text: `Earlier: ${normalizedPhone} <b>` };
  const reply = buildReplyEmail({ body: `New: ${normalizedPhone}`, company: { ...company, phone: normalizedPhone }, firstName: "\u00a0Joe ", parent });
  expect(reply.greeting).toBe("Hi Joe,");
  expect(reply.html.split(underlined)).toHaveLength(2);
  expect(reply.html).toContain(`Earlier: ${normalizedPhone} &lt;b&gt;</blockquote>`);
  expect(reply.html).toContain('name="color-scheme" content="light"');
  expect(reply.html).toContain('name="format-detection" content="telephone=no,date=no,address=no,email=no"');
  expect(reply.html).not.toMatch(/mountains|&zwnj;|hp-logo-white-horizontal/);
  expect(reply.text).toContain(`> ${parent.text}`);
  expect(reply.text).not.toMatch(/tel:|&zwnj;/);
  expect(buildReplyEmail({ body: "New", company, firstName: " \u00a0 ", parent }).greeting).toBe("Hello,");
});
