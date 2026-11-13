// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import HardscapeCatalog from "./HardscapeCatalog";
import EstimatesBoardPage from "./EstimatesBoardPage";
import { apiRequest } from "@/lib/queryClient";
import { parseDollarsToCents } from "@/lib/hardscapeCatalog";
import { isEstimatesHubPage } from "@/components/nav/estimatesRail";
import { insertHardscapeCatalogItemSchema } from "@shared/schema";
import { accessRole, type Role } from "../../../../lib/db/src/accessRole";
import { ProtectedRoute } from "@/lib/protected-route";

function userFor(role: Role = "admin", companyId = "c1") {
  return {
    id: "u1", activeCompanyId: companyId, activeRole: role, accessRole: accessRole(role),
    activeTags: [], isSuperAdminBool: false,
  };
}
const auth = vi.hoisted(() => ({ user: null as ReturnType<typeof userFor> | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user, isLoading: false }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));

const item = {
  id: "h1", companyId: "c1", sku: "PV-12", category: "pavers", name: "Holland paver, charcoal", description: "60mm",
  unit: "sqft", wholesaleCostCents: 412, retailPriceCents: 875, umbrellaKey: "landscape_materials", isActive: true,
  createdAt: "", updatedAt: "",
};
const listBody = { items: [item], categories: ["general", "pavers"] };
const fetchMock = vi.fn();

function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() };
}

beforeEach(() => {
  auth.user = userFor();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("/api/estimates/board")) return jsonRes({ stages: [] });
    if (String(url).includes("/api/companies/users")) return jsonRes([]);
    return jsonRes(listBody);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});

function renderPage(protectedRoute = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const path = "/dashboard/estimates/catalogs/hardscape";
  const loc = memoryLocation({ path, record: true });
  const ui = () => (
    <QueryClientProvider client={client}><Router hook={loc.hook}>
      {protectedRoute ? <ProtectedRoute path={path} component={HardscapeCatalog} allowedRoles={["admin", "office"]} /> : <HardscapeCatalog />}
    </Router></QueryClientProvider>
  );
  const r = render(ui());
  return { ...r, history: loc.history!, rerenderPage: () => r.rerender(ui()) };
}

describe("dollars parsing", () => {
  it.each([
    ["$1,234.50", 123450], ["12", 1200], ["0.5", 50], ["", null], ["  ", null],
    ["-1", "invalid"], ["1e3", "invalid"], ["1.234", "invalid"], ["12,34", "invalid"], ["21474837", "tooLarge"],
  ])("%s -> %s", (raw, out) => expect(parseDollarsToCents(raw)).toBe(out));
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
    url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body, signal: init?.signal ?? undefined,
  }));
}
const listCalls = () => calls().filter((c) => c.method === "GET" && c.url.startsWith("/api/hardscape-catalog") && !c.url.includes("export"));
/** Route mutating calls; GET list falls through to listBody. */
function route(handler: (c: Call) => unknown | undefined) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const c = { url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body, signal: init?.signal ?? undefined };
    const r = handler(c);
    return r === undefined ? jsonRes(listBody) : r;
  });
}
function errRes(status: number, body: unknown) {
  return { ok: false, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() };
}
function switchCompany(rerenderPage: () => void, companyId = "c2") {
  auth.user = userFor(auth.user!.activeRole, companyId);
  rerenderPage();
}

describe("HardscapeCatalog", () => {
  it.each(["admin", "office", "account_manager"] as const)("loads the guarded catalog for %s with resolved access and company context", async role => {
    auth.user = userFor(role, "c2");
    fetchMock.mockResolvedValue(jsonRes({ items: [{ ...item, companyId: "c2" }], categories: ["pavers"] }));
    renderPage(true);
    await screen.findByTestId("text-name-h1");
    expect(auth.user.activeRole).toBe(role);
    expect(auth.user.accessRole).toBe(role === "office" ? "office" : "admin");
    expect(listCalls()).toHaveLength(1);
    expect(listCalls()[0].headers["X-Company-Id"]).toBe("c2");
  });
  it.each(["field", "field_manager", "crew_supervisor", "mapping", "landscape_supervisor", "chemical_manager", "shop_manager", "irrigation_manager"] as const)(
    "denies %s at the real route guard without fetching the catalog", async role => {
      auth.user = userFor(role);
      const { history } = renderPage(true);
      await waitFor(() => expect(history.at(-1)).toBe("/access-denied"));
      expect(screen.queryByTestId("page-hardscape-catalog")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("redirects signed-out users without fetching the catalog", async () => {
    auth.user = null;
    const { history } = renderPage(true);
    await waitFor(() => expect(history.at(-1)).toBe("/login"));
    expect(screen.queryByTestId("page-hardscape-catalog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["add", "edit"])("cancels %s without saving changes", async mode => {
    renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId(mode === "add" ? "button-add-item" : "button-edit-h1"));
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Unsaved material" } });
    fireEvent.click(screen.getByTestId("button-cancel-item"));
    await waitFor(() => expect(screen.queryByTestId("dialog-hardscape-item")).toBeNull());
    expect(calls().filter(c => c.method !== "GET")).toEqual([]);
    fireEvent.click(screen.getByTestId(mode === "add" ? "button-add-item" : "button-edit-h1"));
    expect((screen.getByTestId("input-name") as HTMLInputElement).value).toBe(mode === "add" ? "" : item.name);
  });
  it("mirrors the API insert category default without accepting explicit blank categories", () => {
    const input = { companyId: "c1", name: "Rock" };
    expect(insertHardscapeCatalogItemSchema.parse(input)).toEqual({
      ...input, category: "General", unit: "EA", isActive: true,
    });
    for (const category of ["", "  ", null]) {
      expect(insertHardscapeCatalogItemSchema.safeParse({ ...input, category }).success).toBe(false);
    }
  });
  it.each([
    { categories: ["General", "General"], expected: ["General"] },
    { categories: [], expected: ["General"] },
    { categories: ["pavers", "Pavers", "general", "stone"], expected: ["general", "Pavers", "stone"] },
  ])("deduplicates chips and add suggestions from stored categories $categories", async ({ categories, expected }) => {
    fetchMock.mockResolvedValue(jsonRes({ items: [item], categories }));
    renderPage();
    await screen.findByTestId("text-name-h1");
    const chips = screen.getByTestId("chips-category");
    expect([...chips.querySelectorAll("button")].slice(1).map(chip => chip.textContent)).toEqual(expected);
    fireEvent.click(screen.getByTestId("button-add-item"));
    expect((screen.getByTestId("input-category") as HTMLInputElement).value).toBe("General");
    expect([...screen.getByTestId("list-category-options").querySelectorAll("option")].map(option => option.value)).toEqual(expected);
    expect(screen.queryByTestId("suggest-category-rock_cobble")).toBeNull();
    expect(screen.queryByTestId("suggest-category-wall_block")).toBeNull();
    fireEvent.click(screen.getByTestId(`suggest-category-${expected[0]}`));
    expect((screen.getByTestId("input-category") as HTMLInputElement).value).toBe(expected[0]);
  });

  it("preserves mixed-case edit values and sends the retained chip spelling with company binding", async () => {
    fetchMock.mockResolvedValue(jsonRes({ items: [{ ...item, category: "pAvErS" }], categories: ["pavers", "PAVERS"] }));
    renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId("chip-category-PAVERS"));
    await waitFor(() => expect(listCalls().some(call => call.url.endsWith("?category=PAVERS") && call.headers["X-Company-Id"] === "c1")).toBe(true));
    fireEvent.click(screen.getByTestId("button-edit-h1"));
    expect((screen.getByTestId("input-category") as HTMLInputElement).value).toBe("pAvErS");
    expect([...screen.getByTestId("list-category-options").querySelectorAll("option")].map(option => option.value)).toEqual(["General", "PAVERS"]);
  });

  it("drops the old company's categories and suggestions when switching company", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      jsonRes({ items: [item], categories: (init?.headers as Record<string, string>)?.["X-Company-Id"] === "c2" ? ["Private B"] : ["Private A"] }));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("chip-category-Private A");
    fireEvent.click(screen.getByTestId("button-add-item"));
    expect(screen.getByTestId("suggest-category-Private A")).toBeTruthy();
    switchCompany(rerenderPage);
    expect(screen.queryByTestId("dialog-hardscape-item")).toBeNull();
    await screen.findByTestId("chip-category-Private B");
    expect(screen.queryByTestId("chip-category-Private A")).toBeNull();
    fireEvent.click(screen.getByTestId("button-add-item"));
    expect(screen.queryByTestId("suggest-category-Private A")).toBeNull();
    expect(screen.getByTestId("suggest-category-Private B")).toBeTruthy();
    expect(screen.getByTestId("suggest-category-General")).toBeTruthy();
  });

  it("renders rows, chips, rail and debounced search, all with X-Company-Id", async () => {
    renderPage();
    expect(await screen.findByTestId("text-name-h1")).toBeTruthy();
    expect(screen.getByTestId("text-price-h1").textContent).toBe("$8.75");
    expect(screen.getByTestId("chip-category-pavers")).toBeTruthy();
    expect(screen.getByTestId("rail-hardscape").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("rail-plant_library").getAttribute("href")).toContain("/dashboard/estimates/catalogs/plants");
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "hol" } });
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "holland" } });
    await waitFor(() => expect(listCalls().some((c) => c.url === "/api/hardscape-catalog?search=holland")).toBe(true));
    expect(listCalls().some((c) => c.url === "/api/hardscape-catalog?search=hol")).toBe(false);
    fireEvent.click(screen.getByTestId("chip-category-pavers"));
    await waitFor(() => expect(listCalls().some((c) => c.url === "/api/hardscape-catalog?search=holland&category=pavers")).toBe(true));
    fireEvent.click(screen.getByTestId("switch-include-inactive"));
    await waitFor(() => expect(listCalls().some((c) => c.url.includes("includeInactive=true"))).toBe(true));
    expect(listCalls().every((c) => c.headers["X-Company-Id"] === "c1" && c.signal)).toBe(true);
  });

  it("shows visible validation errors and posts cents on add", async () => {
    route((c) => (c.method === "POST" ? jsonRes({ ...item, id: "h2" }) : undefined));
    renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId("button-add-item"));
    fireEvent.change(screen.getByTestId("input-cost"), { target: { value: "-4" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    expect(screen.getByTestId("error-name")).toBeTruthy();
    expect(screen.getByTestId("error-cost").textContent).toMatch(/dollars/i);
    expect(calls().some((c) => c.method === "POST")).toBe(false);
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "  River rock 3in  " } });
    fireEvent.change(screen.getByTestId("input-cost"), { target: { value: "$1,234.50" } });
    fireEvent.change(screen.getByTestId("input-category"), { target: { value: "rock_cobble" } });
    fireEvent.change(screen.getByTestId("input-description"), { target: { value: "  keep spaces " } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().some((c) => c.method === "POST")).toBe(true));
    const post = calls().find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/hardscape-catalog");
    expect(post.headers).toEqual({ "Content-Type": "application/json", "X-Company-Id": "c1" });
    expect(JSON.parse(String(post.body))).toEqual({
      sku: null, category: "rock_cobble", name: "River rock 3in", description: "  keep spaces ", unit: "EA",
      wholesaleCostCents: 123450, retailPriceCents: null, isActive: true,
    });
    await waitFor(() => expect(screen.queryByTestId("dialog-hardscape-item")).toBeNull());
  });

  it("edits with a partial PATCH and surfaces server errors", async () => {
    route((c) => (c.method === "PATCH" ? errRes(409, { message: "SKU already exists" }) : undefined));
    renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId("button-edit-h1"));
    expect((screen.getByTestId("input-cost") as HTMLInputElement).value).toBe("4.12");
    fireEvent.change(screen.getByTestId("input-price"), { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    expect((await screen.findByTestId("error-form")).textContent).toBe("SKU already exists");
    const patch = calls().find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/hardscape-catalog/h1");
    expect(patch.headers["X-Company-Id"]).toBe("c1");
    expect(JSON.parse(String(patch.body))).toEqual({ retailPriceCents: 900, unit: "SF" });
  });

  it("deactivates via confirm with DELETE and reactivates with PATCH", async () => {
    let active = true;
    route((c) => {
      if (c.method === "DELETE") { active = false; return jsonRes({ ...item, isActive: false }); }
      if (c.method === "PATCH") { active = true; return jsonRes(item); }
      if (c.method === "GET") return jsonRes({ ...listBody, items: [{ ...item, isActive: active }] });
    });
    renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId("switch-include-inactive"));
    fireEvent.click(screen.getByTestId("button-deactivate-h1"));
    fireEvent.click(await screen.findByTestId("button-confirm-deactivate"));
    await waitFor(() => expect(calls().some((c) => c.method === "DELETE")).toBe(true));
    const del = calls().find((c) => c.method === "DELETE")!;
    expect(del.url).toBe("/api/hardscape-catalog/h1");
    expect(del.headers).toEqual({ "X-Company-Id": "c1" });
    expect(del.body).toBeUndefined();
    fireEvent.click(await screen.findByTestId("button-reactivate-h1"));
    await waitFor(() => expect(calls().some(c => c.method === "PATCH")).toBe(true));
    const patch = calls().find(c => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/hardscape-catalog/h1");
    expect(patch.headers["X-Company-Id"]).toBe("c1");
    expect(JSON.parse(String(patch.body))).toEqual({ isActive: true });
    await screen.findByTestId("button-deactivate-h1");
  });

  it("imports CSV as multipart through real apiRequest; company switch clears the summary", async () => {
    route((c) => (c.url.endsWith("import-csv") ? jsonRes({ inserted: 3, updated: 1, skipped: [{ line: 4, reason: "name is required" }] }) : undefined));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-h1");
    const file = new File(["sku,category,name\n"], "goods.csv", { type: "text/csv" });
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [file] } });
    expect((await screen.findByTestId("text-import-summary")).textContent).toBe("3 inserted, 1 updated, 1 skipped");
    const imp = calls().find((c) => c.url.endsWith("import-csv"))!;
    expect(imp.method).toBe("POST");
    expect(imp.body).toBeInstanceOf(FormData);
    expect((imp.body as FormData).get("file")).toBeTruthy();
    expect(imp.headers).toEqual({ "X-Company-Id": "c1" }); // no Content-Type: browser sets multipart boundary
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Import finished" }));
    fireEvent.click(screen.getByTestId("button-toggle-skipped"));
    expect(screen.getByTestId("row-skipped-4").textContent).toContain("name is required");

    switchCompany(rerenderPage);
    expect(screen.queryByTestId("panel-import-result")).toBeNull();
    await waitFor(() => expect(listCalls().some((c) => c.headers["X-Company-Id"] === "c2")).toBe(true));
  });

  it("late import result from the old company never shows after a switch", async () => {
    let resolveImport: (v: unknown) => void = () => {};
    route((c) => (c.url.endsWith("import-csv") ? new Promise((r) => { resolveImport = r; }) : undefined));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.change(screen.getByTestId("input-import-file"), { target: { files: [new File(["x"], "a.csv")] } });
    await waitFor(() => expect(calls().some((c) => c.url.endsWith("import-csv"))).toBe(true));
    expect(calls().find((c) => c.url.endsWith("import-csv"))!.headers["X-Company-Id"]).toBe("c1");
    switchCompany(rerenderPage);
    resolveImport(jsonRes({ inserted: 9, updated: 0, skipped: [] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("panel-import-result")).toBeNull();
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Import finished" }));
  });

  it("aborts an in-flight list request on company change and never renders its rows", async () => {
    const pending: { signal?: AbortSignal; resolve: (v: unknown) => void }[] = [];
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.headers && (init.headers as Record<string, string>)["X-Company-Id"] === "c2") {
        return Promise.resolve(jsonRes({ items: [{ ...item, id: "z9", companyId: "c2", name: "Cedar mulch" }], categories: ["mulch"] }));
      }
      return new Promise((resolve) => pending.push({ signal: init?.signal ?? undefined, resolve }));
    });
    const { rerenderPage } = renderPage();
    await waitFor(() => expect(pending.length).toBe(1));
    switchCompany(rerenderPage);
    await waitFor(() => expect(pending[0].signal?.aborted).toBe(true));
    pending[0].resolve(jsonRes(listBody));
    expect(await screen.findByTestId("text-name-z9")).toBeTruthy();
    expect(screen.queryByTestId("text-name-h1")).toBeNull();
    expect(screen.queryByTestId("chip-category-pavers")).toBeNull();
  });

  it("clears an open edit dialog (and its prices) on company change; late save does not reopen state", async () => {
    let resolvePatch: (v: unknown) => void = () => {};
    route((c) => (c.method === "PATCH" ? new Promise((r) => { resolvePatch = r; }) : undefined));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId("button-edit-h1"));
    fireEvent.change(screen.getByTestId("input-price"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().some((c) => c.method === "PATCH")).toBe(true));
    expect(calls().find((c) => c.method === "PATCH")!.headers["X-Company-Id"]).toBe("c1");
    switchCompany(rerenderPage);
    expect(screen.queryByTestId("dialog-hardscape-item")).toBeNull();
    expect(screen.queryByTestId("input-price")).toBeNull();
    resolvePatch(jsonRes(item));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("dialog-hardscape-item")).toBeNull();
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Item saved" }));
  });

  it("aborts an in-flight export when the company changes and never downloads it", async () => {
    let exp: Call | undefined;
    let resolveExport: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("export-csv")) {
        exp = { url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: undefined, signal: init?.signal ?? undefined };
        return new Promise((r) => { resolveExport = r; });
      }
      return jsonRes(listBody);
    });
    const createUrl = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    const { rerenderPage } = renderPage();
    await screen.findByTestId("text-name-h1");
    fireEvent.click(screen.getByTestId("button-export-csv"));
    await waitFor(() => expect(exp).toBeDefined());
    expect(exp!.headers["X-Company-Id"]).toBe("c1");
    switchCompany(rerenderPage);
    await waitFor(() => expect(exp!.signal?.aborted).toBe(true));
    resolveExport({ ok: true, blob: async () => new Blob(["x"]), headers: new Headers({ "Content-Disposition": 'attachment; filename="hardscape-catalog-2025-10-26.csv"' }) });
    await new Promise((r) => setTimeout(r, 10));
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("renders Spanish copy", async () => {
    await i18n.changeLanguage("es");
    renderPage();
    await screen.findByTestId("text-name-h1");
    expect(screen.getByTestId("text-page-title").textContent).toBe("Catálogo de materiales");
    expect(screen.getByText("Exportar CSV")).toBeTruthy();
    expect(i18n.t("hardscapeCatalog.fileTooLarge")).toContain("5 MB");
  });
});

describe("apiRequest options", () => {
  it("keeps 3-arg JSON behaviour and merges headers/signal", async () => {
    fetchMock.mockResolvedValue(jsonRes({}));
    await apiRequest("POST", "/x", { a: 1 });
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}', credentials: "include" });
    const ctrl = new AbortController();
    await apiRequest("GET", "/y", undefined, { headers: { "X-Company-Id": "c9" }, signal: ctrl.signal });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { "X-Company-Id": "c9" }, body: undefined, signal: ctrl.signal });
    const fd = new FormData();
    await apiRequest("POST", "/z", fd, { headers: { "Content-Type": "text/plain", "X-Company-Id": "c9" } });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ headers: { "X-Company-Id": "c9" }, body: fd });
  });
});

describe("estimates rail", () => {
  it("board renders the current shared rail with catalogs and unchanged board links", async () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <Router hook={memoryLocation({ path: "/dashboard/estimates" }).hook}><EstimatesBoardPage /></Router>
    </QueryClientProvider>);
    expect(screen.getByTestId("rail-all").getAttribute("href")).toBe("/dashboard/estimates");
    expect(screen.getByTestId("rail-all").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("rail-builder").getAttribute("href")).toBe("/dashboard/estimates/builder");
    expect(screen.queryByTestId("rail-estimate_request")).toBeNull();
    expect(screen.queryByTestId("rail-rfp_request")).toBeNull();
    expect(screen.getByTestId("rail-hardscape").getAttribute("href")).toBe("/dashboard/estimates/catalogs/hardscape");
    expect(screen.getByTestId("rail-quickbooks").getAttribute("href")).toContain("/settings/quickbooks");
    expect(screen.getByTestId("rail-library").getAttribute("href")).toBe("/dashboard/estimates/catalogs/plants");
    expect(screen.getByTestId("rail-matches").getAttribute("href")).toBe("/dashboard/estimates/catalogs/plants/matches");
    await screen.findByTestId("empty-estimates");
  });
  it("marks hub pages as rail pages", () => {
    expect(isEstimatesHubPage("/dashboard/estimates/catalogs/hardscape")).toBe(true);
    expect(isEstimatesHubPage("/dashboard/estimates")).toBe(false);
  });
});
