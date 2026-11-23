const tags = new Set(("a abbr b blockquote br center code dd div dl dt em font h1 h2 h3 h4 h5 h6 hr i img " +
  "li ol p pre s small span strong sub sup table tbody td th thead tfoot tr u ul").split(" "));
const drop = new Set("base form head input button select textarea meta link script style iframe frame object embed svg math template video audio source".split(" "));
const formatting = new Set("role width height valign align bgcolor cellpadding cellspacing border colspan rowspan color size face alt title dir".split(" "));
const properties = new Set(("background-color background border border-top border-right border-bottom border-left border-radius border-collapse border-spacing " +
  "color font font-family font-size font-weight font-style letter-spacing line-height text-align text-decoration text-transform display margin margin-left margin-right " +
  "margin-bottom margin-top padding padding-left padding-right padding-bottom padding-top width min-width max-width height max-height vertical-align white-space " +
  "overflow overflow-wrap opacity word-break").split(" "));
const publicBrand = /^\/email\/(?:hp-logo-badge|hp-logo-white-horizontal|mountains|mountains-footer)\.png$/u;

function safeUrl(raw: string, image: boolean) {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (image) {
      // Never make an authenticated request to an application URL chosen by
      // imported HTML. Only the public branding path is allowed on this host.
      if (url.origin === window.location.origin) {
        return publicBrand.test(url.pathname) && !url.search && !url.hash ? url.href : null;
      }
      return url.protocol === "https:" ? url.href : null;
    }
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function safeStyle(source: string) {
  return source.split(";").flatMap(declaration => {
    const at = declaration.indexOf(":");
    if (at < 0) return [];
    const property = declaration.slice(0, at).trim().toLowerCase(), value = declaration.slice(at + 1).trim();
    // No URL-bearing functions, escaping, variables or positional overlays.
    // The allowed function forms are just numeric color values.
    const simple = /^[\w .,%#'"/+-]+$/u.test(value);
    const color = /^rgba?\([\d.,% \t]+\)$/iu.test(value);
    return properties.has(property) && (simple || color) ? [`${property}:${value}`] : [];
  }).join(";");
}

/** Parse in an inert template and reconstruct new, allowlisted nodes. The
 * iframe sees neither imported head elements nor original markup/attributes. */
export function storedEmailDocument(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const safe = document.createElement("template");
  const inert = safe.content.ownerDocument;
  function copy(node: Node, target: Node) {
    if (node.nodeType === Node.TEXT_NODE) { target.appendChild(inert.createTextNode(node.textContent ?? "")); return; }
    if (!(node instanceof Element) || node.namespaceURI !== "http://www.w3.org/1999/xhtml" || drop.has(node.localName)) return;
    if (!tags.has(node.localName)) { node.childNodes.forEach(child => copy(child, target)); return; }
    const element = inert.createElement(node.localName);
    for (const attribute of node.attributes) {
      if (formatting.has(attribute.name)) element.setAttribute(attribute.name, attribute.value);
    }
    const style = safeStyle(node.getAttribute("style") ?? "");
    if (style) element.setAttribute("style", style);
    if (node.localName === "img") {
      const url = safeUrl(node.getAttribute("src") ?? "", true);
      if (!url) return;
      element.setAttribute("referrerpolicy", "no-referrer");
      element.setAttribute("src", url);
    }
    if (node.localName === "a") {
      const href = safeUrl(node.getAttribute("href") ?? "", false);
      if (href) element.setAttribute("href", href);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
    node.childNodes.forEach(child => copy(child, element));
    target.appendChild(element);
  }
  template.content.childNodes.forEach(node => copy(node, safe.content));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
    <base target="_blank"><style>html,body{margin:0;background:#fff}#email-content{display:flow-root;overflow-wrap:anywhere;font:14px/1.5 Helvetica,Arial,sans-serif}
    img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body><div id="email-content">${safe.innerHTML}</div></body></html>`;
}
