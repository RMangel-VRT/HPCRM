// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import IrrigationCatalog from "./IrrigationCatalog";
import { condensedSpec, runFromError } from "@/lib/irrigationCatalog";
import { isEstimatesHubPage } from "@/components/nav/estimatesRail";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "admin" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));

const item = {
  id: "i1", companyId: "c1", externalSku: "RB-1804", category: "sprays", name: "Rain Bird 1804 pop-up", description: "4in body",
  material: "ABS", size: "1/2in", brand: "Rain Bird", fittingType: "FPT", detail: null, unit: "ea",
  wholesaleCostCents: 287, retailPriceCents: 645, umbrellaKey: "irrigation_materials", isActive: true,
  lastSeenAt: "", createdAt: "", updatedAt: "",
};
const inactive = { ...item, id: "i2", externalSku: "OLD-9", name: "Retired valve", isActive: false, material: null, brand: null };
const listBody = { items: [item], categories: ["sprays", "valves"], brands: ["Hunter", "Rain Bird"] };
const run = (o: Record<string, unknown> = {}) => ({
  id: "r1", companyId: "c1", status: "success", source: "irrigopro_csv", startedAt: "2025-10-27T15:04:00.000Z", finishedAt: "2025-10-27T15:04:02.000Z",
  itemsUpserted: 41, itemsDeactivated: 3, itemsSkipped: 0, errorMessage: null, filename: "parts.csv", importedById: "u1", skippedRows: [], ...o,
});
const fetchMock = vi.fn();

function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() };
}
function errRes(status: number, body: unknown) {
  return { ok: false, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() };
}
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
    url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body, signal: init?.signal ?? undefined,
  }));
}
const listCalls = () => calls().filter((c) => c.method === "GET" && c.url.startsWith("/api/irrigation-catalog") && !c.url.includes("sync-runs"));
let runsBody: unknown[] = [];
function route(handler: (c: Call) => unknown | undefined) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const c = { url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body, signal: init?.signal ?? undefined };
    const r = handler(c);
    if (r !== undefined) return r;
    return c.url.includes("sync-runs") ? jsonRes(runsBody) : jsonRes(listBody);
  });
}

beforeEach(() => {
  auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "admin" };
  runsBody = [];
  route(() => undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path: "/dashboard/estimates/catalogs/irrigation" });
  const ui = () => <QueryClientProvider client={client}><Router hook={loc.hook}><IrrigationCatalog /></Router></QueryClientProvider>;
  const r = render(ui());
  return { ...r, rerenderPage: () => r.rerender(ui()) };
}
function switchCompany(rerenderPage: () => void, companyId = "c2") {
  auth.user = { id: "u1", activeCompanyId: companyId, activeRole: "admin" };
  rerenderPage();
}

describe("irrigation helpers", () => {
  it("condenses spec and reads runs from error bodies", () => {
    expect(condensedSpec(item)).toBe("ABS · 1/2in · Rain Bird · FPT");
    expect(condensedSpec({ material: " ", size: null, brand: "Hunter", fittingType: null })).toBe("Hunter");
    expect(runFromError(new Error(`400: ${JSON.stringify({ message: "bad", run: run({ status: "error" }) })}`))?.status).toBe("error");
    expect(runFromError(new Error("500: oops"))).toBeNull();
  });
});

describe("IrrigationCatalog", () => {
  it("renders read-only table, rail, helper, warning; filters with X-Company-Id", async () => {
    renderPage();
    expect(await screen.findByTestId("text-name-i1")).toBeTruthy();
    expect(screen.getByTestId("text-sku-i1").textContent).toBe("RB-1804");
    expect(screen.getByTestId("text-spec-i1").textContent).toBe("ABS · 1/2in · Rain Bird · FPT");
    expect(screen.getByTestId("text-price-i1").textContent).toBe("$6.45");
    expect(screen.getByTestId("text-cost-i1").textContent).toBe("$2.87");
    expect(screen.getByTestId("text-import-helper").textContent).toBe("Export the Parts Catalog from IrrigoPro as CSV, then upload it here.");
    expect(screen.getByTestId("text-replace-warning").textContent).toMatch(/complete catalog/);
    expect(screen.getByTestId("rail-irrigation").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("rail-hardscape").getAttribute("href")).toBe("/dashboard/estimates/catalogs/hardscape");
    expect(await screen.findByTestId("text-no-imports")).toBeTruthy();
    // No editing affordances anywhere.
    expect(screen.queryByTestId("button-add-item")).toBeNull();
    expect(screen.queryByTestId("button-edit-i1")).toBeNull();
    expect(screen.queryByTestId("button-deactivate-i1")).toBeNull();
    expect(screen.getByTestId("table-irrigation").querySelector("input,textarea,select")).toBeNull();

    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "rain" } });
    await waitFor(() => expect(listCalls().some((c) => c.url === "/api/irrigation-catalog?search=rain")).toBe(true));
    fireEvent.click(screen.getByTestId("chip-category-sprays"));
    await waitFor(() => expect(listCalls().some((c) => c.url === "/api/irrigation-catalog?search=rain&category=sprays")).toBe(true));
    fireEvent.click(screen.getByTestId("chip-brand-Hunter"));
    await waitFor(() => expect(listCalls().some((c) => c.url === "/api/irrigation-catalog?search=rain&category=sprays&brand=Hunter")).toBe(true));
    expect(screen.getByTestId("chip-brand-Hunter").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("switch-include-inactive"));
    await waitFor(() => expect(listCalls().some((c) => c.url.endsWith("includeInactive=true"))).toBe(true));
    expect(calls().filter((c) => c.method === "GET").every((c) => c.headers["X-Company-Id"] === "c1")).toBe(true);
    expect(calls().some((c) => c.method !== "GET")).toBe(false);
  });

  it("grays inactive rows when shown", async () => {
    route((c) => (c.url.includes("includeInactive") ? jsonRes({ ...listBody, items: [item, inactive] }) : undefined));
    renderPage();
    await screen.findByTestId("text-name-i1");
    fireEvent.click(screen.getByTestId("switch-include-inactive"));
    expect(await screen.findByTestId("status-inactive-i2")).toBeTruthy();
    expect(screen.getByTestId("row-item-i2").className).toContain("opacity-70");
    expect(screen.getByTestId("row-item-i1").className).not.toContain("opacity-70");
  });

  it("shows persistent history with loud partial state and skipped lines", async () => {
    runsBody = [
      run({ id: "r2", status: "partial", itemsSkipped: 3, skippedRows: [{ line: 7, reason: "Invalid dollar amount (use nonnegative dollars with at most two decimal places)" }, { line: 9, reason: "Duplicate SKU: first occurrence wins" }, { line: 11, reason: "something new from server" }] }),
      run({ id: "r1", status: "error", errorMessage: "Missing required CSV headers: sku", itemsUpserted: 0, itemsDeactivated: 0 }),
    ];
    renderPage();
    expect((await screen.findByTestId("status-run-r2")).textContent).toBe("Partial");
    expect(screen.getByTestId("text-partial-banner")).toBeTruthy();
    expect(screen.getByTestId("text-last-run-counts").textContent).toBe("41 added or changed, 3 deactivated, 3 skipped");
    fireEvent.click(screen.getByTestId("button-toggle-skipped-r2"));
    expect(screen.getByTestId("row-skipped-r2-9").textContent).toBe("Line 9Duplicate SKU: the first occurrence wins.");
    expect(screen.getByTestId("row-skipped-r2-11").textContent).toContain("could not be imported");
    expect(screen.getByTestId("row-run-r1").textContent).toContain("Missing required CSV headers: sku.");
    expect(calls().find((c) => c.url.includes("sync-runs"))!.url).toBe("/api/irrigation-catalog/sync-runs?limit=10");
  });

  it("history load error offers retry", async () => {
    route((c) => (c.url.includes("sync-runs") ? errRes(500, { message: "boom" }) : undefined));
    renderPage();
    expect(await screen.findByTestId("runs-error")).toBeTruthy();
    route(() => undefined);
    fireEvent.click(screen.getByTestId("button-runs-retry"));
    expect(await screen.findByTestId("text-no-imports")).toBeTruthy();
  });

  it("list load error and empty state", async () => {
    route((c) => (!c.url.includes("sync-runs") ? errRes(500, { message: "x" }) : undefined));
    renderPage();
    expect(await screen.findByTestId("irrigation-error")).toBeTruthy();
    route((c) => (!c.url.includes("sync-runs") ? jsonRes({ items: [], categories: [], brands: [] }) : undefined));
    fireEvent.click(screen.getByTestId("button-irrigation-retry"));
    expect((await screen.findByTestId("irrigation-empty")).textContent).toContain("No irrigation parts yet.");
  });

  it("imports multipart with company header and shows the returned run", async () => {
    route((c) => (c.method === "POST" ? jsonRes(run({ id: "r9", itemsUpserted: 12 })) : undefined));
    renderPage();
    await screen.findByTestId("text-name-i1");
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [new File(["sku,name,category,price\n"], "parts.csv", { type: "text/csv" })] } });
    expect((await screen.findByTestId("text-last-run-counts")).textContent).toBe("12 added or changed, 3 deactivated, 0 skipped");
    const imp = calls().find((c) => c.method === "POST")!;
    expect(imp.url).toBe("/api/irrigation-catalog/import");
    expect(imp.body).toBeInstanceOf(FormData);
    expect(imp.headers).toEqual({ "X-Company-Id": "c1" });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Import finished" }));
    await waitFor(() => expect(calls().filter((c) => c.url.includes("sync-runs")).length).toBeGreaterThan(1));
  });

  it("400 with run renders the error run loudly", async () => {
    route((c) => (c.method === "POST" ? errRes(400, { message: "Missing required CSV headers: price", run: run({ id: "r5", status: "error", errorMessage: "Missing required CSV headers: price", itemsUpserted: 0, itemsDeactivated: 0 }) }) : undefined));
    renderPage();
    await screen.findByTestId("text-name-i1");
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [new File(["x"], "bad.csv")] } });
    expect((await screen.findByTestId("text-run-error-message")).textContent).toBe("Missing required CSV headers: price.");
    expect(screen.getByTestId("text-error-banner")).toBeTruthy();
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Import failed", variant: "destructive" }));
  });

  it("rejects files over 5 MiB without uploading", async () => {
    renderPage();
    await screen.findByTestId("text-name-i1");
    const big = new File(["x"], "big.csv");
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [big] } });
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "CSV exceeds the 5 MB upload limit." })));
    expect(calls().some((c) => c.method === "POST")).toBe(false);
  });

  it("late import from old company never renders after switch", async () => {
    let resolveImport: (v: unknown) => void = () => {};
    route((c) => (c.method === "POST" ? new Promise((r) => { resolveImport = r; }) : undefined));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-i1");
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [new File(["x"], "a.csv")] } });
    await waitFor(() => expect(calls().some((c) => c.method === "POST")).toBe(true));
    expect(screen.getByTestId("button-import-irrigopro").hasAttribute("disabled")).toBe(true);
    switchCompany(rerenderPage);
    expect(screen.getByTestId("button-import-irrigopro").hasAttribute("disabled")).toBe(false);
    resolveImport(jsonRes(run({ id: "rX", itemsUpserted: 999 })));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/999 added/)).toBeNull();
    expect(toastSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(calls().some((c) => c.headers["X-Company-Id"] === "c2")).toBe(true));
  });

  it("aborts in-flight list/history on switch and never renders old-company data", async () => {
    const pending: { signal?: AbortSignal; resolve: (v: unknown) => void; url: string }[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>)?.["X-Company-Id"] === "c2") {
        return Promise.resolve(String(url).includes("sync-runs") ? jsonRes([])
          : jsonRes({ items: [{ ...item, id: "z9", companyId: "c2", name: "Hunter PGP" }], categories: ["rotors"], brands: ["Hunter"] }));
      }
      return new Promise((resolve) => pending.push({ signal: init?.signal ?? undefined, resolve, url: String(url) }));
    });
    const { rerenderPage } = renderPage();
    await waitFor(() => expect(pending.length).toBe(2));
    switchCompany(rerenderPage);
    await waitFor(() => expect(pending.every((p) => p.signal?.aborted)).toBe(true));
    pending.forEach((p) => p.resolve(p.url.includes("sync-runs") ? jsonRes([run()]) : jsonRes(listBody)));
    expect(await screen.findByTestId("text-name-z9")).toBeTruthy();
    expect(screen.queryByTestId("text-name-i1")).toBeNull();
    expect(screen.queryByTestId("chip-category-sprays")).toBeNull();
    expect(screen.queryByTestId("panel-last-run")).toBeNull();
  });

  it("role switch resets filters", async () => {
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-i1");
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "rain" } });
    auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "office" };
    rerenderPage();
    expect((screen.getByTestId("input-search") as HTMLInputElement).value).toBe("");
  });

  it("newer history supersedes the local result; local result survives a failed history refetch", async () => {
    route((c) => (c.method === "POST" ? jsonRes(run({ id: "r9", itemsUpserted: 12, startedAt: "2025-10-27T16:00:00.000Z" })) : undefined));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-i1");
    route((c) => (c.method === "POST" ? jsonRes(run({ id: "r9", itemsUpserted: 12, startedAt: "2025-10-27T16:00:00.000Z" }))
      : c.url.includes("sync-runs") ? errRes(500, { message: "x" }) : undefined));
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [new File(["x"], "a.csv")] } });
    expect(await screen.findByTestId("runs-error")).toBeTruthy();
    expect(screen.getByTestId("status-run-r9")).toBeTruthy();
    runsBody = [run({ id: "r10", status: "partial", itemsSkipped: 1, startedAt: "2025-10-27T17:00:00.000Z" }), run({ id: "r9", startedAt: "2025-10-27T16:00:00.000Z" })];
    route(() => undefined);
    fireEvent.click(screen.getByTestId("button-runs-retry"));
    expect(await screen.findByTestId("status-run-r10")).toBeTruthy();
    expect(screen.getByTestId("panel-last-run").textContent).toContain("Partial");
    rerenderPage();
  });

  it("polls history while a run is running", async () => {
    runsBody = [run({ status: "running", finishedAt: null })];
    renderPage();
    expect((await screen.findByTestId("status-run-r1")).textContent).toBe("Running");
    runsBody = [run()];
    await waitFor(() => expect(screen.getByTestId("status-run-r1").textContent).toBe("Success"), { timeout: 4500 });
  }, 8000);

  it("disallowed role sees a translated denied state and no import affordance or requests", async () => {
    auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "field" };
    renderPage();
    expect(screen.getByTestId("irrigation-denied").textContent).toContain("Only admin and office");
    expect(screen.queryByTestId("button-import-irrigopro")).toBeNull();
    expect(screen.queryByTestId("input-import-file")).toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("translates server reasons in Spanish", async () => {
    await i18n.changeLanguage("es");
    runsBody = [run({ status: "error", errorMessage: "CSV has no valid parts; catalog was not replaced" })];
    renderPage();
    expect((await screen.findByTestId("text-run-error-message")).textContent).toBe("El CSV no tiene piezas válidas; el catálogo no se reemplazó.");
  });

  it("renders Spanish copy and hub detection", async () => {
    await i18n.changeLanguage("es");
    renderPage();
    await screen.findByTestId("text-name-i1");
    expect(screen.getByTestId("text-page-title").textContent).toContain("Catálogo de riego");
    expect(screen.getByTestId("button-import-irrigopro").textContent).toBe("Importar desde IrrigoPro");
    expect(isEstimatesHubPage("/dashboard/estimates/catalogs/irrigation")).toBe(true);
  });
});
