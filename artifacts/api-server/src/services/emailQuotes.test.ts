import { expect, it } from "vitest";
import { emailSnippet, splitEmailQuote } from "./emailQuotes";
import { buildReplyEmail } from "./outgoingEmail/replyEmail";

it.each([
  `<div class="client" NAME = 'messageReplySection'>Earlier</div>`,
  '<div class="other gmail_quote">Earlier</div>',
  '<blockquote type="cite">Earlier</blockquote>',
  '<div id="divRplyFwdMsg">Earlier</div>',
  '<div id=appendonsend>Earlier</div>',
])("folds the first marked HTML quote: %s", marker => {
  const original = `<!doctype html><p>New &amp; readable</p>${marker}<div>More earlier text</div>`;
  const split = splitEmailQuote(original, "");
  expect(split.newHtml).toBe("<!doctype html><p>New &amp; readable</p>");
  expect(split.newText).toBe("New & readable");
  expect(split.earlierHtml).toBe(`${marker}<div>More earlier text</div>`);
  expect(split.earlierText).toContain("More earlier text");
});

it("handles legacy derived plain text, plain headers, quote blocks and unquoted text", () => {
  const original = "<p>New</p><div class='gmail_quote'>Earlier</div>";
  expect(splitEmailQuote(original, "New Earlier").newText).toBe("New");
  expect(splitEmailQuote(null, "New\r\n\r\nOn Sat, Jan 1, Alex wrote:\r\nEarlier").newText).toBe("New");
  expect(splitEmailQuote(null, "New\n  >Earlier\n  > More").earlierText).toBe(">Earlier\n  > More");
  expect(splitEmailQuote("<p>New</p>", " New  text\n next ")).toMatchObject({ newText: "New  text\n next", earlierText: "", earlierHtml: null });
  expect(emailSnippet(" New  text\n next ")).toBe("New text next");
});

it("builds independent HTML and text alternatives with company sign-off and a safe quote", () => {
  const company = { name: "Example & Co", addressLine: "Example Street", phone: "555-0100", email: "office@example.test", website: "example.test" };
  const email = buildReplyEmail({ body: "A <b>literal</b>.\n\nSecond paragraph.", company, firstName: "Alex",
    parent: { at: "2026-11-20T14:00:00Z", name: "Alex & Co", address: "alex@example.test", text: "First line\nSecond <line>" } });
  expect(email.greeting).toBe("Hi Alex,");
  expect(email.html).toContain("A &lt;b&gt;literal&lt;/b&gt;.");
  expect(email.html).toContain('src="https://');
  expect(email.html).toContain('width="36"');
  expect(email.html).toContain('blockquote type="cite"');
  expect(email.html).toContain("Alex &amp; Co &lt;alex@example.test&gt; wrote:");
  expect(email.text).toContain("Thank you,\nExample & Co");
  expect(email.text).toContain("555-0100 · office@example.test · example.test");
  expect(email.text).toContain("> First line\n> Second <line>");
  expect(buildReplyEmail({ body: "", company, firstName: null,
    parent: { at: "2026-01-01T00:00:00Z", name: null, address: "alex@example.test", text: "Hello" } }).greeting).toBe("Hello,");
});
