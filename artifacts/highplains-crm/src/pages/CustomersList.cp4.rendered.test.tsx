// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import i18n from "@/i18n";
import CustomersList from "./CustomersList";

const fx = vi.hoisted(() => ({ api: vi.fn(), role: "admin" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u", activeCompanyId: "co", activeRole: fx.role, accessRole: fx.role } }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }), apiRequest: (...a: unknown[]) => fx.api(...a) };
});
const rows = [
  { id: "p", name: "Parent Co", isParent: "true", status: "active", active: "true", customerType: "commercial", qboState: "linked", management: null, managerSearch: "" },
  { id: "b", name: "Branch East", parentCustomerId: "p", status: "active", active: "true", customerType: "hoa", city: "Lamar", qboState: "via_parent", management: "Summit", managerSearch: "summit kelly" },
  { id: "s", name: "Solo HOA", status: "prospect", active: "true", customerType: "hoa", city: "Pueblo", qboState: "not_linked", management: null, managerSearch: "" },
  { id: "z", name: "Old Place", status: "inactive", active: "false", customerType: "commercial", city: "Ordway", qboState: "error", management: null, managerSearch: "" },
];
const summaryCalls = () => fx.api.mock.calls.filter(c => String(c[1]).startsWith("/api/customers/list-summary"));
beforeEach(() => {
  fx.role = "admin"; queryClient.clear(); fx.api.mockReset(); localStorage.clear();
  fx.api.mockImplementation(async (_m: string, url: string) => {
    if (url === "/api/customer-account-managers") return { json: async () => ({ managers: [{ id: "am", name: "Kim" }], assignments: { s: { id: "am", name: "Kim" } } }) };
    if (url.startsWith("/api/customers?page")) return { json: async () => ({ customers: rows, total: rows.length }) };
    if (url.startsWith("/api/customers/list-summary")) return { json: async () => ({ summaries: { s: { current: [{ termId: "t", label: "L", line: "landscape", annualCents: 875000 }], season: {}, branchCount: 0, openTickets: 3, qboState: "not_linked", management: null, managerSearch: "" } } }) };
    throw new Error(url);
  });
});
afterEach(async () => { cleanup(); await i18n.changeLanguage("en"); });
const page = () => render(<QueryClientProvider client={queryClient}><CustomersList /></QueryClientProvider>);

describe("CP4 customers list", () => {
  it.each([
    ["en", "light", "expanded"],
    ["es", "dark", "collapsed"],
  ])("captures the populated %s/%s/%s layout without a zero-selection bulk bar", async (language, theme, sidebar) => {
    await i18n.changeLanguage(language);
    const populated = Array.from({ length: 24 }, (_, index) => ({
      id: `visual-${index}`, name: `${String(index + 1).padStart(2, "0")} ${["Aspen Ridge Apartments", "Front Range Commons", "Ute Creek HOA", "Northfield Office Park"][index % 4]}`,
      isParent: "false", active: "true", status: "active", customerType: index % 2 ? "hoa" : "commercial",
      city: "Fort Collins", management: index % 3 ? null : "Front Range Management", qboState: index % 4 ? "not_linked" : "linked",
    }));
    localStorage.setItem("recentCustomerIds:co", JSON.stringify(populated.slice(0, 5).map(c => c.id)));
    fx.api.mockImplementation(async (_method: string, url: string) => {
      if (url === "/api/customer-account-managers") return { json: async () => ({
        managers: [{ id: "am", name: "Taylor Reed" }],
        assignments: Object.fromEntries(populated.filter((_, index) => index % 3 === 0).map(c => [c.id, { id: "am", name: "Taylor Reed" }])),
      }) };
      if (url.startsWith("/api/customers?page")) return { json: async () => ({ customers: populated, total: populated.length }) };
      if (url.startsWith("/api/customers/list-summary")) return { json: async () => ({ summaries: Object.fromEntries(populated.map((c, index) => [c.id, {
        current: index % 3 ? [] : [{ termId: `term-${index}`, line: "landscape", annualCents: 2400000 }],
        season: {}, branchCount: 0, openTickets: index % 3, qboState: c.qboState, management: c.management,
      }])) }) };
      throw new Error(url);
    });
    const view = page();
    await screen.findByTestId("row-customer-visual-0");
    await waitFor(() => expect(screen.queryByTestId("season-visual-0-loading")).toBeNull());
    expect(screen.getAllByTestId(/^row-customer-/)).toHaveLength(24);
    expect(screen.getAllByTestId(/^card-recent-/)).toHaveLength(5);
    expect(screen.queryByTestId("bulk-bar")).toBeNull();
    expect(summaryCalls()).toHaveLength(1);

    // Optional static evidence: actual rendered component markup and the app's Vite CSS,
    // never a sign-in bypass or an application route. Output stays outside deployment/Git.
    if (process.env.CP4_CAPTURE_LAYOUT === "1") {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const path = await import("node:path");
      const output = path.resolve(process.cwd(), "../../generated-artifacts/cp4");
      await mkdir(output, { recursive: true });
      const sideWidth = sidebar === "expanded" ? 256 : 64;
      await writeFile(path.join(output, `list-${language}-${theme}-${sidebar}.html`), `<!doctype html>
<html lang="${language}" class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/index.css?direct"><title>CP4 static list layout evidence</title>
<style>body{margin:0}.fixture-side{position:fixed;inset:0 auto 0 0;width:${sideWidth}px}.fixture-main{margin-left:${sideWidth}px}.fixture-top{height:106px;border-bottom:1px solid hsl(var(--border));padding:24px}.fixture-content{padding:32px 40px}@media(max-width:767px){.fixture-side{display:none}.fixture-main{margin-left:0}.fixture-content{padding:20px 16px}}</style></head>
<body class="bg-background text-foreground"><aside class="fixture-side bg-sidebar border-r p-3"><span class="text-xs">${sidebar === "expanded" ? "High Plains · static layout fixture" : "HP"}</span></aside>
<main class="fixture-main"><header class="fixture-top text-sm text-muted-foreground">CP4 · ${language} · ${theme} · ${sidebar}<br>Static layout evidence — actual CustomersList markup, synthetic records</header>
<div class="fixture-content">${view.container.innerHTML}</div></main></body></html>`);
    }
  });

  it("recent cards from storage; hidden when empty", async () => {
    page(); await screen.findByTestId("row-customer-s");
    expect(screen.queryByTestId("recent-customers")).toBeNull();
    cleanup(); localStorage.setItem("recentCustomerIds:co", JSON.stringify(["s", "z", "missing"]));
    page(); expect(await screen.findByTestId("card-recent-s")).toBeTruthy();
    expect(screen.queryByTestId("card-recent-z")).toBeNull();
  });
  it("branches collapsed, expandable; one summary batch per page; season + tickets", async () => {
    page(); await screen.findByTestId("row-customer-p");
    expect(screen.queryByTestId("row-customer-b")).toBeNull();
    expect(screen.queryByTestId("bulk-bar")).toBeNull();
    expect(screen.getByTestId("row-customer-p").className).toContain("h-11");
    expect(screen.getByTestId("table-customers").className).toContain("table-fixed");
    expect(screen.getByTestId("button-expand-p").getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(summaryCalls()).toHaveLength(1));
    expect(String(summaryCalls()[0]![1])).toContain("ids=p,s");
    expect(await screen.findByText("$8,750")).toBeTruthy();
    expect(screen.getByTestId("open-tickets-s").textContent).toBe("3");
    fireEvent.click(screen.getByTestId("button-expand-p"));
    expect(screen.getByTestId("row-customer-b")).toBeTruthy();
    await waitFor(() => expect(summaryCalls()).toHaveLength(2));
    expect(String(summaryCalls()[1]![1])).toContain("ids=b,p,s");
  });
  it("paginates flattened rows (branches included) with one batch of exactly the rendered ids; selection survives expand/collapse", async () => {
    const kids = Array.from({ length: 60 }, (_, i) => ({ id: `k${String(i).padStart(2, "0")}`, name: `Kid ${String(i).padStart(2, "0")}`, parentCustomerId: "p", status: "active", active: "true", customerType: "hoa" }));
    const all = [...rows, ...kids];
    fx.api.mockImplementation(async (_m: string, url: string) => {
      if (url === "/api/customer-account-managers") return { json: async () => ({ managers: [], assignments: {} }) };
      if (url.startsWith("/api/customers?page")) return { json: async () => ({ customers: all, total: all.length }) };
      if (url.startsWith("/api/customers/list-summary")) return { json: async () => ({ summaries: {} }) };
      throw new Error(url);
    });
    page(); await screen.findByTestId("row-customer-p");
    fireEvent.click(screen.getByRole("checkbox", { name: /Solo HOA/ }));
    fireEvent.click(screen.getByTestId("button-expand-p"));
    expect(screen.getAllByTestId(/^row-customer-/)).toHaveLength(50);
    await waitFor(() => expect(String(summaryCalls().at(-1)![1]).split("ids=")[1]!.split(",")).toHaveLength(50));
    fireEvent.click(screen.getByTestId("button-list-next"));
    await screen.findByTestId("row-customer-s");
    const ids = screen.getAllByTestId(/^row-customer-/).map(r => r.getAttribute("data-testid")!.slice(13)).sort();
    await waitFor(() => expect(String(summaryCalls().at(-1)![1])).toContain(`ids=${ids.join(",")}`));
    expect((screen.getByRole("checkbox", { name: /Solo HOA/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId("button-list-prev")); fireEvent.click(screen.getByTestId("button-expand-p"));
    expect(screen.getByTestId("bulk-set-account-manager").textContent).toContain("(1)");
  });
  it("each filter narrows rows; a matching branch auto-shows its parent", async () => {
    page(); await screen.findByTestId("row-customer-s");
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "kelly" } });
    expect(screen.getByTestId("row-customer-p")).toBeTruthy(); expect(screen.getByTestId("row-customer-b")).toBeTruthy();
    expect(screen.queryByTestId("row-customer-s")).toBeNull();
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("chip-status-prospect"));
    expect(screen.getByTestId("row-customer-s")).toBeTruthy(); expect(screen.queryByTestId("row-customer-p")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-status-all"));
    fireEvent.change(screen.getByTestId("filter-type"), { target: { value: "parent" } });
    expect(screen.queryByTestId("row-customer-s")).toBeNull(); expect(screen.getByTestId("row-customer-p")).toBeTruthy();
    fireEvent.change(screen.getByTestId("filter-type"), { target: { value: "all" } });
    fireEvent.change(screen.getByTestId("filter-qbo"), { target: { value: "not_linked" } });
    expect(screen.getByTestId("row-customer-s")).toBeTruthy(); expect(screen.queryByTestId("row-customer-p")).toBeNull();
    fireEvent.change(screen.getByTestId("filter-qbo"), { target: { value: "all" } });
    await waitFor(() => expect((screen.getByTestId("filter-account-manager") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByTestId("filter-account-manager"), { target: { value: "am" } });
    expect(screen.getByTestId("row-customer-s")).toBeTruthy(); expect(screen.queryByTestId("row-customer-p")).toBeNull();
    fireEvent.change(screen.getByTestId("filter-account-manager"), { target: { value: "all" } });
    expect(screen.queryByTestId("row-customer-z")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-show-archived"));
    expect(screen.getByTestId("row-customer-z")).toBeTruthy();
  });
  it("row menu has Open/Edit/Archive and no Delete anywhere", async () => {
    page(); await screen.findByTestId("row-customer-s");
    expect(document.querySelector("[data-testid^='button-delete-']")).toBeNull();
    const trigger = screen.getByTestId("button-row-menu-s");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false }); fireEvent.keyDown(trigger, { key: "Enter" });
    expect(await screen.findByTestId("menu-open-s")).toBeTruthy();
    expect(screen.getByTestId("menu-edit-s")).toBeTruthy();
    expect(screen.getByTestId("button-archive-s")).toBeTruthy();
    expect(screen.queryByText(/delete/i)).toBeNull();
  });
  it("summary cells: skeleton while loading, error + retry on failure, Unavailable for omitted ids; '—' only for no terms", async () => {
    let fail = true; let release: (() => void) | undefined;
    const base = fx.api.getMockImplementation()!;
    fx.api.mockImplementation(async (m: string, url: string, ...rest: unknown[]) => {
      if (url.startsWith("/api/customers/list-summary")) {
        await new Promise<void>(r => { release = r; });
        if (fail) throw new Error("500");
      }
      return base(m, url, ...rest);
    });
    page(); await screen.findByTestId("row-customer-s");
    expect(await screen.findByTestId("season-s-loading")).toBeTruthy();
    release!();
    expect(await screen.findByTestId("summary-error")).toBeTruthy();
    expect(screen.getByTestId("season-s-unavailable").textContent).toBe(i18n.t("cp4.list.unavailable"));
    fail = false; fireEvent.click(screen.getByTestId("button-retry-summary"));
    await waitFor(() => expect(release).toBeTypeOf("function")); release!();
    expect(await screen.findByText("$8,750")).toBeTruthy();
    expect(screen.getByTestId("season-p-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("summary-error")).toBeNull();
  });
  it("non-privileged roles get no commercial columns and no summary request", async () => {
    fx.role = "field_manager"; page(); await screen.findByTestId("row-customer-s");
    expect(screen.queryByTestId("season-s")).toBeNull(); expect(screen.queryByTestId("qbo-s")).toBeNull();
    expect(screen.queryByTestId("filter-qbo")).toBeNull();
    expect(summaryCalls()).toHaveLength(0);
  });
});
