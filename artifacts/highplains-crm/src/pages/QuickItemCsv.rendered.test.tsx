// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import ServicesCatalog from "./ServicesCatalog";
import EquipmentFeesCatalog from "./EquipmentFeesCatalog";
import { quickItemCsvMessage } from "@/lib/quickItemCsv";

const auth = vi.hoisted(() => ({ user: { id: "user", activeCompanyId: "a", activeRole: "admin" } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
const fetchMock = vi.fn();
const createUrl = vi.fn(() => "blob:csv");
const revokeUrl = vi.fn();
const click = vi.fn();
const response = (body: unknown, status = 200, headers = {}) => ({
  ok: status < 400, status, statusText: "test",
  json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob(["csv"]),
  headers: new Headers(headers),
});
const result = { inserted: 2, updated: 1, categoriesCreated: ["New Category"], skipped: [{ line: 4, reason: "Unknown unit: pallet" }] };
let importResponse: () => Promise<ReturnType<typeof response>>;
let exportResponse: () => Promise<ReturnType<typeof response>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  auth.user = { id: "user", activeCompanyId: "a", activeRole: "admin" };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
  importResponse = async () => response(result);
  exportResponse = async () => response("csv", 200, { "Content-Disposition": 'attachment; filename="whole-catalog.csv"' });
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes("/import-csv")) return importResponse();
    if (url.includes("/export-csv")) return exportResponse();
    if (url.includes("service-categories")) return response([{ id: "cat", companyId: auth.user.activeCompanyId, name: "General", defaultUnit: "HR", defaultUmbrellaKey: "landscape_labor", isActive: true, sortOrder: 0, itemCount: 0 }]);
    if (init.method === "GET") return response([]);
    return response({});
  });
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

function page(catalog: "services" | "equipment-fees") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const location = memoryLocation({ path: `/dashboard/estimates/catalogs/${catalog}` });
  const element = () => <QueryClientProvider client={client}><Router hook={location.hook}>
    {catalog === "services" ? <ServicesCatalog /> : <EquipmentFeesCatalog />}
  </Router></QueryClientProvider>;
  const view = render(element());
  return { client, rerender: () => view.rerender(element()) };
}
const upload = () => fireEvent.change(screen.getByTestId("input-csv-file"), {
  target: { files: [new File(["kind,category,name,unit,price,posts_to,active"], "items.csv", { type: "text/csv" })] },
});
describe.each(["services", "equipment-fees"] as const)("%s CSV page controls", catalog => {
  it.each(["en", "es"])("imports and exports with the exact scoped contract in %s", async language => {
    await i18n.changeLanguage(language);
    const { client } = page(catalog);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(screen.getByTestId("button-import-csv").textContent).toContain(language === "en" ? "Import CSV" : "Importar CSV");
    expect(screen.getByTestId("button-export-csv").textContent).toContain(language === "en" ? "Export CSV" : "Exportar CSV");
    upload();
    await screen.findByTestId("panel-import-result");
    expect(screen.getByTestId("text-import-summary").textContent).toContain("2");
    expect(screen.getByTestId("list-created-categories").textContent).toContain(language === "en" ? "Categories created" : "Categorías creadas");
    expect(screen.getByTestId("list-created-categories").textContent).toContain("New Category");
    expect(screen.queryByTestId("list-skipped")).toBeNull();
    fireEvent.click(screen.getByTestId("button-toggle-skipped"));
    expect(screen.getByTestId("list-skipped").textContent).toContain(language === "en" ? "Unknown unit: pallet" : "Unidad desconocida: pallet");
    const [url, init] = fetchMock.mock.calls.find(([u]) => u.includes("/import-csv"))!;
    expect(url).toBe(`/api/quick-items/import-csv?scope=${catalog}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("file").name).toBe("items.csv");
    expect(init.headers).toEqual({ "X-Company-Id": "a" });
    const predicates = invalidate.mock.calls.map(([arg]) => arg?.predicate).filter(Boolean);
    for (const key of ["/api/quick-items", "/api/estimates/service-categories", "estimate-picker", "estimate-catalog-matches"]) {
      expect(predicates.some(p => p!({ queryKey: [key, "a"] } as never))).toBe(true);
      expect(predicates.some(p => p!({ queryKey: [key, "b"] } as never))).toBe(false);
    }
    fireEvent.click(screen.getByTestId("button-export-csv"));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const [exportUrl, exportInit] = fetchMock.mock.calls.find(([u]) => u.includes("/export-csv"))!;
    expect(exportUrl).toBe(`/api/quick-items/export-csv?scope=${catalog}`);
    expect(exportInit.headers).toEqual({ "X-Company-Id": "a" });
    expect(exportInit.signal).toBeInstanceOf(AbortSignal);
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith("blob:csv"));
    fireEvent.click(screen.getByTestId("button-dismiss-import"));
    expect(screen.queryByTestId("panel-import-result")).toBeNull();
  });
  it("shows independent pending states, supports importing again, and displays failures", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    importResponse = () => pending.promise;
    page(catalog); upload();
    expect((screen.getByTestId("button-import-csv") as HTMLButtonElement).disabled).toBe(true);
    pending.resolve(response(result));
    await screen.findByTestId("panel-import-result");
    await waitFor(() => expect((screen.getByTestId("button-import-csv") as HTMLButtonElement).disabled).toBe(false));
    importResponse = async () => response({ message: "CSV must contain exactly these headers: kind,category,name,unit,price,posts_to,active" }, 400);
    upload();
    await waitFor(() => expect(toast.mock.calls.some(([value]) => value.variant === "destructive")).toBe(true));
    const exported = deferred<ReturnType<typeof response>>();
    exportResponse = () => exported.promise;
    fireEvent.click(screen.getByTestId("button-export-csv"));
    expect((screen.getByTestId("button-export-csv") as HTMLButtonElement).disabled).toBe(true);
    exported.resolve(response({ message: 'Cannot export "Bad": unknown unit "pallet". Resolve it before a roundtrip export.' }, 422));
    await waitFor(() => expect(toast.mock.calls.some(([value]) => value.description.includes("unknown unit"))).toBe(true));
    expect(createUrl).not.toHaveBeenCalled();
  });
  it.each(["activeCompanyId", "id", "activeRole"] as const)("clears results and suppresses late imports/exports on %s switches", async field => {
    const view = page(catalog);
    upload(); await screen.findByTestId("panel-import-result");
    toast.mockClear();
    const pendingImport = deferred<ReturnType<typeof response>>();
    const pendingExport = deferred<ReturnType<typeof response>>();
    importResponse = () => pendingImport.promise;
    exportResponse = () => pendingExport.promise;
    upload();
    fireEvent.click(screen.getByTestId("button-export-csv"));
    const signal = fetchMock.mock.calls.find(([u]) => u.includes("/export-csv"))![1].signal;
    auth.user = { ...auth.user, [field]: field === "activeRole" ? "office" : "changed" };
    view.rerender();
    expect(screen.queryByTestId("panel-import-result")).toBeNull();
    expect(signal.aborted).toBe(true);
    pendingImport.resolve(response(result));
    pendingExport.resolve(response("csv"));
    await waitFor(() => expect((screen.getByTestId("button-import-csv") as HTMLButtonElement).disabled).toBe(false));
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(toast).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByTestId("panel-import-result")).toBeNull();
  });
  it("clears a successful old result when company changes", async () => {
    const view = page(catalog);
    upload(); await screen.findByTestId("panel-import-result");
    auth.user = { ...auth.user, activeCompanyId: "b" }; view.rerender();
    expect(screen.queryByTestId("panel-import-result")).toBeNull();
  });
  it("blocks files above 5 MB before uploading and reports transport errors", async () => {
    page(catalog);
    const big = new File(["csv"], "large.csv");
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByTestId("input-csv-file"), { target: { files: [big] } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(fetchMock.mock.calls.some(([u]) => u.includes("import-csv"))).toBe(false);
    toast.mockClear();
    importResponse = async () => { throw new Error("Network offline"); };
    upload();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Network offline" })));
  });
});

it("provides localized CSV diagnostic prose without changing canonical CSV values", async () => {
  await i18n.changeLanguage("es");
  const samples = ["Expected seven columns", "Kind must be service, equipment or fee", "Unknown posts_to: unknown",
    "Active must be true/false, yes/no or 1/0", "Unable to save row", "New or reassigned services require an active category",
    "Malformed CSV quoting", "Unterminated quoted field", "Dollar amount exceeds the supported maximum",
    "Name already belongs to another kind (fee)", "label: Too big", "category: Too big"];
  for (const sample of samples) expect(quickItemCsvMessage(sample, i18n.t)).not.toBe(sample);
});
