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

  it("uses content-sized headers and shared expanding minimum rows, with out-of-flow hints and pending copies", () => {
    expect(rule(".sb-grid")).toContain("grid-template-rows: auto");
    expect(rule(".sb-grid")).toContain("grid-auto-rows: minmax(var(--lane-h, 120px), auto)");
    expect(rule(".sb-grid")).toContain("align-content: start");
    for (const selector of [".sb-cell", ".sb-crew"]) expect(rule(selector)).toContain("min-height: var(--lane-h, 120px)");
    expect(rule(".sb-cell > .sb-empty")).toContain("position: absolute");
    expect(rule(".sb-cell > .sb-empty")).toContain("pointer-events: none");
    expect(rule(".sb-pending")).toContain("position: absolute");
  });
  it("tints today in both themes with continuous input-transparent two-pixel side lines", () => {
    expect(rule(".sb-grid")).toContain("--today-alpha: .10");
    expect(rule(".dark .sb-grid")).toContain("--today-alpha: .14");
    const overlay = rule('.sb-cell[data-today="true"]::before, .sb-dayhead[data-today="true"]::before');
    expect(overlay).toContain("var(--today-alpha)");
    expect(overlay).toContain("border-left: 2px solid hsl(var(--primary))");
    expect(overlay).toContain("border-right: 2px solid hsl(var(--primary))");
    expect(overlay).toContain("bottom: -11px");
    expect(overlay).toContain("pointer-events: none");
    expect(rule('.sb-cell[data-today="true"][data-last-lane="true"]::before')).toContain("bottom: 0");
    expect(rule(".sb-card")).toContain("background: hsl(var(--card))");
    expect(rule('.sb-cell[data-today="true"] .sb-cap[data-tone="ok"]')).toContain("hsl(var(--foreground)) 70%");
    expect(rule('.sb-cell[data-today="true"] .sb-cap[data-tone="amber"]')).toContain("hsl(var(--warning)) 55%");
    expect(rule('.sb-cell[data-today="true"] .sb-cap[data-tone="red"]')).toContain("hsl(var(--foreground)) 80%");
    expect(rule('.sb-cell[data-today="true"] > .sb-empty')).toContain("hsl(var(--muted-foreground)) 75%");
  });
});
