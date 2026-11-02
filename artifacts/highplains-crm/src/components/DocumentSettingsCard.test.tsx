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
    json: async () => url === "/api/estimates" ? [{ id: "estimate" }] : url === "/api/estimates/estimate" ? {
      id: "estimate", estimateNumber: "EST-2026-0001", version: { id: "v", versionNumber: 1, status: "draft" },
    } : method === "PATCH" ? body : defaults,
  }));
});
afterEach(cleanup);
describe("document settings card", () => {
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
