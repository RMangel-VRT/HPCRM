import { parse } from "node-html-parser";

function splitText(value: string) {
  const text = value.replace(/\r\n?/g, "\n");
  const marker = /^(?:On[ \t]+[^\n]+[ \t]+wrote:[ \t]*$|[ \t]*>)/im.exec(text);
  return marker ? [text.slice(0, marker.index).trim(), text.slice(marker.index).trim()] as const
    : [text.trim(), ""] as const;
}

function plainHtml(html: string) {
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ""));
  for (const node of root.querySelectorAll("head,script,style,title,template,[hidden]")) node.remove();
  return root.structuredText.trim();
}

/** Split copies, never rewrite the imported message. Compare HTML markers as
 * parsed attributes, not strings (spacing, attribute order and case vary). */
export function splitEmailQuote(bodyHtml: string | null, bodyText: string) {
  const [newPlain, earlierPlain] = splitText(bodyText);
  let newHtml = bodyHtml, earlierHtml: string | null = null;
  if (bodyHtml) {
    const root = parse(bodyHtml);
    const marker = root.querySelectorAll("div,blockquote").find(node => {
      const attrs = Object.fromEntries(Object.entries(node.attributes).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]));
      return node.tagName === "DIV"
        ? attrs.name === "messagereplysection" || attrs.class?.split(/\s+/).includes("gmail_quote")
          || attrs.id === "divrplyfwdmsg" || attrs.id === "appendonsend"
        : attrs.type === "cite";
    });
    if (marker) {
      newHtml = bodyHtml.slice(0, marker.range[0]);
      earlierHtml = bodyHtml.slice(marker.range[0]);
    } else if (earlierPlain) {
      // Some clients only mark quotations in the plain MIME alternative.
      // Never show that entire HTML alternative above the disclosure.
      newHtml = null;
    }
  }
  // Older HTML-only Gmail imports used a tag-stripped version of the entire
  // HTML alternative as body_text. That surrogate still includes the quote.
  const generatedPlain = earlierHtml && bodyHtml
    && bodyText === bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const newText = bodyText.trim() && !generatedPlain ? newPlain : newHtml ? plainHtml(newHtml) : newPlain;
  return { newHtml, earlierHtml, newText, earlierText: earlierPlain || (earlierHtml ? plainHtml(earlierHtml) : "") };
}

export const emailSnippet = (text: string) => text.replace(/\s+/gu, " ").trim().slice(0, 200);
