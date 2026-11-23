import { escape } from "./markup";
import { normalizeEmailText } from "./text";

export function companyPhoneTarget(phone: string): string | null {
  // Require unambiguous North American formatting: no extensions, labels,
  // other country codes, or digit scraping from arbitrary settings text.
  const value = normalizeEmailText(phone);
  if (!/^(?:\+?1[ .-]?)?(?:\([0-9]{3}\)|[0-9]{3})[ .-]?[0-9]{3}[ .-]?[0-9]{4}$/.test(value)) return null;
  return `tel:+1${value.replace(/\D/g, "").slice(-10)}`;
}

const link = (escaped: string, target: string, quiet = false) =>
  `<a href="${target}" style="${quiet ? "color:#c9d2cc;text-decoration:none" : "color:inherit;text-decoration:underline"}">${escaped}</a>`;

export function renderCompanyPhone(phone: string, quiet = false): string {
  const escaped = escape(phone);
  const target = companyPhoneTarget(phone);
  return target ? link(escaped, target, quiet) : escaped;
}

/** Only for already-escaped wording, never HTML with existing tags or links. */
export function linkWordingPhone(escaped: string, phone: string, format = (text: string) => text): string {
  const target = companyPhoneTarget(phone);
  if (!target) return format(escaped);
  const literal = escape(normalizeEmailText(phone)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Do not link a suffix/prefix of a longer number, even with separators.
  const pattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}+])(?<!\d[ .(-]+)${literal}(?![\p{L}\p{N}])(?![ .)-]*\d)`, "gu",
  );
  let start = 0, html = "";
  for (const match of escaped.matchAll(pattern)) {
    html += format(escaped.slice(start, match.index)) + link(match[0], target);
    start = match.index + match[0].length;
  }
  return html + format(escaped.slice(start));
}
