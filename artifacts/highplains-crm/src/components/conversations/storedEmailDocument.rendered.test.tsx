// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { storedEmailDocument } from "./storedEmailDocument";
import { StoredEmailFrame } from "./StoredEmailFrame";

afterEach(cleanup);

it("renders branded email without copying active markup or allowing privileged navigation", () => {
  const origin = window.location.origin;
  const html = `<!doctype html><html><head>
    <base href="https://untrusted.example/" target="_top"><meta http-equiv="refresh" content="0">
    <script>throw new Error('must not run')</script></head><body>
    <table cellspacing="0" style="background-color:#123456; width:100%; background:url(https://untrusted.example/pixel);">
      <tr><td onclick="alert(1)">Branded content</td></tr>
    </table>
    <img src="${origin}/email/hp-logo-badge.png" width="36" onerror="alert(1)" srcset="${origin}/api/private 2x">
    <img src="${origin}/api/private"><img src="${origin}/other/email/hp-logo-badge.png"><img src="${origin}/email/mountains.png?other=1">
    <a href="javascript:alert(1)" target="_top">Unsafe</a>
    <a href="https://example.test/view" ping="https://untrusted.example/" target="_top">Safe link</a>
    <form action="${origin}/api/private"><input></form><iframe src="${origin}/api/private"></iframe>
    <svg><a href="javascript:alert(1)">Unsafe SVG</a></svg>
    </body></html>`;
  const doc = new DOMParser().parseFromString(storedEmailDocument(html), "text/html");
  expect(doc.querySelector("script, form, input, iframe, svg, [onclick], [onerror], [srcset], [ping]")).toBeNull();
  expect(doc.querySelector("#email-content td")?.textContent).toBe("Branded content");
  expect(doc.querySelector("table")?.getAttribute("style")).toBe("background-color:#123456;width:100%");
  expect([...doc.images].map(image => image.src)).toEqual([`${origin}/email/hp-logo-badge.png`]);
  expect(doc.images[0].getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(doc.querySelector("a")?.hasAttribute("href")).toBe(false);
  const safe = doc.querySelector("a[href]")!;
  expect([safe.getAttribute("target"), safe.getAttribute("rel")]).toEqual(["_blank", "noopener noreferrer"]);
  expect(doc.querySelectorAll("base")).toHaveLength(1);
  expect(doc.querySelector("base")?.getAttribute("target")).toBe("_blank");
  render(<StoredEmailFrame html={html} title="Stored message" />);
  const frame = screen.getByTitle("Stored message");
  expect(frame.getAttribute("sandbox")).toBe("allow-same-origin allow-popups");
  expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
});
