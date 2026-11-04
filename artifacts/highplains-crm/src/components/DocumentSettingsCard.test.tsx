// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { DOCUMENT_FIELDS, emptyDocumentSettings } from "@shared/schema";
const fx = vi.hoisted(() => ({ user: { id: "actor", activeCompanyId: "a", activeRole: "admin" }, request: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.request }));
vi.mock("@/components/estimates/PdfPreviewDialog", () => ({ PdfPreviewDialog: (props: { companyId: string; estimateId: string }) => <div data-testid="preview">{props.companyId}:{props.estimateId}</div> }));
import DocumentSettingsCard from "./DocumentSettingsCard";
const defaults = emptyDocumentSettings();
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><DocumentSettingsCard /></QueryClientProvider>) };
}
beforeEach(async () => {
  fx.user = { id: "actor", activeCompanyId: "a", activeRole: "admin" };
  vi.resetAllMocks(); await i18n.changeLanguage("en");
  fx.request.mockImplementation(async (method: string, url: string, body?: unknown) => ({
    json: async () => url.endsWith("/renderer") ? { status: "ready", reason: null, browserVersion: "138.0" } : url === "/api/estimates" ? [{ id: "estimate" }] : url === "/api/estimates/estimate" ? {
      id: "estimate", estimateNumber: "EST-2026-0001", version: { id: "v", versionNumber: 1, status: "draft" },
    } : method === "PATCH" ? body : defaults,
  }));
});
afterEach(cleanup);
describe("document settings card", () => {
  it.each(["en", "es"])("shows readiness and refetches unavailable reasons in %s", async language => {
    await i18n.changeLanguage(language);
    mount();
    await screen.findByText(i18n.t("documents.engine.ready", { version: "138.0" }));
    fx.request.mockImplementation(async (_method, url) => ({
      json: async () => url.endsWith("/renderer") ? { status: "unavailable", reason: "LAUNCH_FAILED", browserVersion: null } : defaults,
    }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("documents.engine.checkAgain") }));
    await screen.findByText(i18n.t("documents.engine.unavailable", { reason: i18n.t("documents.engine.reasons.LAUNCH_FAILED") }));
    const calls = fx.request.mock.calls.filter(args => args[1].endsWith("/renderer"));
    expect(calls).toHaveLength(2);
    expect(calls[1][3].headers).toMatchObject({ "X-Company-Id": "a" });
  });
  it("shows checking and request error instead of cached readiness during a refetch", async () => {
    mount();
    await screen.findByText(i18n.t("documents.engine.ready", { version: "138.0" }));
    let fail!: (error: Error) => void;
    fx.request.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("Checking PDF engine…");
    expect(screen.queryByText(/Ready —/)).toBeNull();
    fail(new Error("503"));
    await screen.findByText("Could not check the PDF engine. Try again.");
    expect(screen.queryByText(/Ready —/)).toBeNull();
  });
  it("does not display late previous-company or previous-user status", async () => {
    let resolve!: (response: unknown) => void;
    fx.request.mockImplementation(async (_method, url, _body, options) => {
      if (url.endsWith("/renderer") && options.headers["X-Company-Id"] === "a")
        return new Promise(done => { resolve = done; });
      return { json: async () => url.endsWith("/renderer") ? { status: "unavailable", reason: "RENDER_FAILED" } : defaults };
    });
    const { rerender, client } = mount();
    await screen.findByText("Checking PDF engine…");
    fx.user = { ...fx.user, id: "second", activeCompanyId: "b" };
    rerender(<QueryClientProvider client={client}><DocumentSettingsCard /></QueryClientProvider>);
    await screen.findByText(/The test PDF could not be rendered/);
    resolve({ json: async () => ({ status: "ready", browserVersion: "OLD" }) });
    await waitFor(() => expect(screen.queryByText(/OLD/)).toBeNull());
  });
  it("edits every field, saves the exact contract with captured company and enables saved preview", async () => {
    mount();
    await screen.findByLabelText("Address line 1");
    expect(screen.getAllByRole("textbox")).toHaveLength(DOCUMENT_FIELDS.length);
    fireEvent.change(screen.getByLabelText("Plant warranty"), { target: { value: "Warranty A" } });
    expect((screen.getByRole("button", { name: "Preview estimate PDF" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));
    await screen.findByText("Document settings saved.");
    const call = fx.request.mock.calls.find(args => args[0] === "PATCH")!;
    expect(call[2]).toEqual({ ...defaults, warrantyText: "Warranty A" });
    expect(call[3].headers).toMatchObject({ "X-Company-Id": "a" });
    fireEvent.click(screen.getByRole("button", { name: "Preview estimate PDF" }));
    expect((await screen.findByTestId("preview")).textContent).toBe("a:estimate");
  });
  it("shows all Spanish field labels and translated actions", async () => {
    await i18n.changeLanguage("es"); mount();
    await screen.findByLabelText("Dirección, línea 1");
    for (const field of DOCUMENT_FIELDS) expect(screen.getByLabelText(i18n.t(`documents.fields.${field}`))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar documentos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vista previa del presupuesto PDF" })).toBeTruthy();
  });
  it("discards unsaved old-company form and preview on company switch", async () => {
    const { rerender, client } = mount();
    await screen.findByLabelText("Phone");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "old company" } });
    fx.user = { ...fx.user, activeCompanyId: "b" };
    rerender(<QueryClientProvider client={client}><DocumentSettingsCard /></QueryClientProvider>);
    await waitFor(() => expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe(""));
    const calls = fx.request.mock.calls.filter(args => args[0] === "GET");
    expect(calls.at(-1)![3].headers).toMatchObject({ "X-Company-Id": "b" });
  });
  it("keeps failed saves visible and preserves the entered text", async () => {
    mount(); await screen.findByLabelText("Phone");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "unsaved" } });
    fx.request.mockRejectedValueOnce(new Error("failure"));
    fireEvent.click(screen.getByRole("button", { name: "Save documents" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("unsaved");
  });
});
