import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./scheduling-board.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
};

describe("scheduling layout boundaries", () => {
  it("exempts Scheduling alone from the padded app shell using the existing rail mechanism", () => {
    expect(app).toMatch(/const isRailPage = [^\n]+location === "\/dashboard\/scheduling"/);
    expect(app).toMatch(/isVisualScopeDraft \|\| isCustomerDetail \|\| isRailPage \? "" : "p-6 md:p-8"/);
    expect(app).toContain('location === "/dashboard/scheduling" ? "sb-main" : "overflow-y-auto"');
    expect(css).toContain("@media (min-width: 860px) { .sb-main { overflow: hidden; } }");
    expect(rule(".sb-page")).toContain("height: 100%");
    expect(rule(".sb-page")).toContain("overflow: hidden");
    expect(rule(".sb-page")).not.toContain("max-width");
  });

  it("limits desktop scrolling to the queue and board, with exact responsive breakpoints", () => {
    expect(rule(".sb-work")).toContain("320px minmax(0, 1fr)");
    expect(rule(".sb-work")).toContain("min-height: 0");
    expect(rule(".sb-queue-list")).toContain("overflow-y: auto");
    expect(rule(".sb-board")).toContain("overflow: auto");
    expect(css).toMatch(/@media\s*\(min-width:\s*1100px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*859\.98px\)/);
    expect(css).toContain("max-height: 46vh");
    expect(css).toContain("height: 70vh");
    expect(css).toContain("overscroll-behavior: contain");
  });

  it("layers sticky day, crew and corner headers above crew-colored lanes", () => {
    expect(rule(".sb-corner, .sb-dayhead")).toContain("position: sticky");
    expect(rule(".sb-corner, .sb-dayhead")).toContain("top: 0");
    expect(rule(".sb-corner")).toContain("z-index: 30");
    expect(rule(".sb-dayhead")).toContain("z-index: 20");
    expect(rule(".sb-crew")).toContain("z-index: 10");
    expect(rule(".sb-crew")).toContain("border-left: 5px solid var(--crew)");
    expect(rule(".sb-cell")).toContain("var(--crew) 7%");
    expect(rule(".sb-grid")).toContain("row-gap: 10px");
    expect(rule(".sb-bar")).toContain("height: 4px");
    expect(css).toContain("box-shadow: inset 0 0 0 2px var(--crew)");
  });

  it("uses stationary translucent sources, lifted overlays and reduced motion", () => {
    expect(rule('.sb-card[data-source="true"]')).toContain("opacity: .3");
    expect(rule('.sb-card[data-closed="true"]')).toContain("opacity: .6");
    expect(rule('.sb-card[data-lifted="true"]')).toContain("width: 260px");
    expect(rule('.sb-card[data-lifted="true"]')).toContain("rotate(-1.5deg)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});
