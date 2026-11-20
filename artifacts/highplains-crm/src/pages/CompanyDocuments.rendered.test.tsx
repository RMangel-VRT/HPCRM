// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDocumentDto, CompanyDocumentsResponse } from "../../../../lib/db/src/companyDocumentContracts";

const fx = vi.hoisted(() => ({
  role: "admin", lang: "en" as "en" | "es", companyId: "co1",
  api: null as any,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeRole: fx.role, accessRole: fx.role === "account_manager" ? "admin" : fx.role, activeCompanyId: fx.companyId } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock("@/lib/schedulingStatus", () => ({ companyToday: () => "2026-11-17" }));
vi.mock("@/lib/queryClient", async (orig) => ({ ...(await orig() as object), apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("react-i18next", async () => {
  const { default: en } = await import("@/i18n/locales/en");
  const { default: es } = await import("@/i18n/locales/es");
  const get = (dict: any, k: string) => k.split(".").reduce<any>((o, p) => o?.[p], dict);
  const t = (k: string, o: Record<string, any> = {}) => {
    const dict = fx.lang === "es" ? es : en;
    let v = (o.count != null && o.count !== 1 ? get(dict, `${k}_other`) : undefined) ?? get(dict, k);
    if (typeof v !== "string") v = o.defaultValue ?? k;
    return (v as string).replace(/\{\{(\w+)\}\}/g, (_, n) => String(o[n] ?? ""));
  };
  return { useTranslation: () => ({ t, i18n: { language: fx.lang } }) };
});

import CompanyDocumentsPage from "./CompanyDocumentsPage";
import { companyDocumentsKey, oneYearFromToday } from "@/components/companyDocuments/companyDocumentsApi";

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
});

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const doc = (p: Partial<CompanyDocumentDto> & { id: string; name: string }): CompanyDocumentDto => ({
  category: "other", role: null, expiresOn: null, visibility: "office", pinned: false, status: "none", daysUntilExpiry: null,
  currentFile: { fileName: `${p.id}.pdf`, fileType: "pdf", fileSize: 1000, uploadedAt: "2026-03-02T17:00:00Z", uploadedByName: "Randy Mangel" },
  openUrl: `/api/company-documents/${p.id}/open?companyId=co1`, downloadUrl: `/api/company-documents/${p.id}/open?companyId=co1&download=1`,
  updatedAt: "2026-03-02T17:00:00Z", ...p,
});
const W9 = doc({ id: "w9", name: "W-9", category: "tax", pinned: true });
const LIC = doc({ id: "lic", name: "Commercial pesticide applicator license", category: "licenses", role: "pesticide_license", visibility: "everyone",
  pinned: true, expiresOn: "2026-12-31", status: "expiring", daysUntilExpiry: 44 });
const GL = doc({ id: "gl", name: "Certificate of insurance — General liability", category: "insurance", pinned: true, expiresOn: "2027-03-01", status: "current", daysUntilExpiry: 104 });
const GS = doc({ id: "gs", name: "Certificate of good standing", category: "business" });

let listBody: CompanyDocumentsResponse;
let templates: { id: string; preVisitHtml: string; postVisitHtml: string }[];
const calls: { method: string; url: string; body?: any; headers?: any }[] = [];
let qc: QueryClient;

beforeEach(() => {
  fx.role = "admin"; fx.lang = "en"; calls.length = 0; templates = [];
  listBody = { documents: [W9, LIC, GL, GS], license: { number: "28374", documentId: "lic", expiresOn: "2026-12-31" } };
  fx.api = vi.fn(async (method: string, url: string, body?: unknown, opts?: { headers?: Record<string, string> }) => {
    calls.push({ method, url, body, headers: opts?.headers });
    if (method === "GET" && url === "/api/company-documents") return json(listBody);
    if (method === "GET" && url === "/api/chemical-notification-templates") return json(templates);
    if (method === "GET" && url === "/api/company-documents/email-options") return json({ companyName: "Fixture Company", phone: "303-555-0100" });
    if (method === "GET" && url === "/api/mailbox-accounts") return json([
      { id: "own", companyId: "co1", syncEnabled: true, syncStatus: "connected", isActive: true, accountType: "personal", ownerUserId: "u1", displayName: "Own", emailAddress: "own@example.test" },
      { id: "shared", companyId: "co1", syncEnabled: true, syncStatus: "connected", isActive: true, accountType: "shared", displayName: "Office", emailAddress: "office@example.test" },
    ]);
    if (method === "GET" && url === "/api/property-managers") return json([{ id: "pm", name: "Manager", companyId: "co1" }]);
    if (method === "GET" && url === "/api/property-managers/pm/emails") return json([{ email: "pm@example.test" }]);
    if (method === "GET" && url.endsWith("/sends")) return json([]);
    if (method === "GET" && url.endsWith("/files")) return json([
      { id: "f2", fileName: "lic-2026.pdf", fileSize: 1, uploadedAt: "2026-01-04T00:00:00Z", uploadedByName: "Randy", isCurrent: true, openUrl: "/o2", downloadUrl: "/d2" },
      { id: "f1", fileName: "lic-2025.pdf", fileSize: 1, uploadedAt: "2025-01-06T00:00:00Z", uploadedByName: "Randy", isCurrent: false, openUrl: "/o1", downloadUrl: "/d1" },
    ]);
    if (method === "PUT") return json({ number: (body as any).number });
    return json({});
  });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); qc.clear(); });

const renderPage = () => render(<QueryClientProvider client={qc}><CompanyDocumentsPage /></QueryClientProvider>);

describe("Company documents page", () => {
  it("compose loads suggestions only on open, defaults shared mailbox/phone and sends exact selection", async () => {
    renderPage(); await screen.findByTestId("table-company-documents");
    expect(calls.some(c => c.url === "/api/property-managers")).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Email documents" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Email documents" });
    await waitFor(() => expect((within(dialog).getByLabelText("From") as HTMLSelectElement).value).toBe("shared"));
    expect((within(dialog).getByLabelText("Subject") as HTMLInputElement).value).toBe("Fixture Company — requested documents");
    expect((within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value).toContain("303-555-0100");
    await waitFor(() => expect(calls.some(c => c.url === "/api/property-managers/pm/emails")).toBe(true));
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "pm@example.test" } });
    fireEvent.click(within(dialog).getByLabelText(/W-9/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.find(c => c.url === "/api/company-documents/email")?.body).toMatchObject({
      mailboxAccountId: "shared", to: ["pm@example.test"], documentIds: ["w9"],
    }));
    expect(calls.find(c => c.url === "/api/company-documents/email")?.headers).toEqual({ "X-Company-Id": "co1" });
  });
  it("compose keeps failures visible and never retries automatically", async () => {
    const original = fx.api;
    fx.api = vi.fn(async (...args: any[]) => {
      if (args[0] === "POST" && args[1] === "/api/company-documents/email") {
        calls.push({ method: "POST", url: args[1] }); throw new Error('502: {"code":"COMPANY_DOCUMENT_EMAIL_FAILED"}');
      }
      return original(...args);
    });
    renderPage(); await screen.findByTestId("table-company-documents");
    fireEvent.click(screen.getAllByRole("button", { name: "Email documents" })[1]);
    const dialog = await screen.findByRole("dialog", { name: "Email documents" });
    await waitFor(() => expect((within(dialog).getByLabelText("From") as HTMLSelectElement).value).toBe("shared"));
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "pm@example.test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Nothing was retried automatically");
    expect(calls.filter(c => c.url === "/api/company-documents/email")).toHaveLength(1);
  });
  it("admin view: manage actions, expiry banner, grouped table, company-bound request and shared key", async () => {
    renderPage();
    await screen.findByTestId("table-company-documents");
    expect(screen.getByTestId("button-upload-company-document")).toBeTruthy();
    expect(screen.getByTestId("banner-company-documents-expiry").textContent).toContain("Commercial pesticide applicator license");
    expect(screen.getByTestId("banner-company-documents-expiry").textContent).toContain("44 days left");
    expect(screen.queryByTestId("notice-company-documents-field")).toBeNull();
    expect((screen.getByTestId("input-company-license-number") as HTMLInputElement).value).toBe("28374");
    const list = calls.find(c => c.url === "/api/company-documents")!;
    expect(list.headers).toEqual({ "X-Company-Id": "co1" });
    expect(qc.getQueryData(companyDocumentsKey("co1"))).toBeTruthy();
    expect(companyDocumentsKey("co1")).toEqual(["/api/company-documents", "co1"]);
  });

  it("field view: read-only, notice, no manage controls, no history, no inferred license expiry", async () => {
    fx.role = "field";
    listBody = { documents: [{ ...LIC, role: null }], license: { number: "28374", documentId: null, expiresOn: null } };
    renderPage();
    await screen.findByTestId("table-company-documents");
    expect(screen.getByTestId("notice-company-documents-field")).toBeTruthy();
    expect(screen.queryByTestId("button-upload-company-document")).toBeNull();
    expect(screen.queryByTestId("banner-company-documents-expiry")).toBeNull();
    expect(screen.getByTestId("text-company-license-number").textContent).toBe("28374");
    expect(screen.queryByTestId("input-company-license-number")).toBeNull();
    expect(screen.queryByTestId("text-company-license-expires")).toBeNull();
    expect(screen.queryByTestId("button-upload-company-license")).toBeNull();
    expect(screen.queryByTestId("link-open-company-license")).toBeNull();
    fireEvent.click(screen.getByTestId("row-company-document-lic"));
    const drawer = await screen.findByTestId("drawer-company-document");
    expect(within(drawer).getByTestId("button-drawer-download-company-document")).toBeTruthy();
    expect(within(drawer).queryByTestId("button-edit-company-document")).toBeNull();
    expect(within(drawer).queryByTestId("button-replace-company-document")).toBeNull();
    expect(within(drawer).queryByTestId("section-company-document-history")).toBeNull();
    expect(calls.some(c => c.url.endsWith("/files"))).toBe(false);
    expect(calls.some(c => c.url === "/api/chemical-notification-templates")).toBe(false);
  });

  it("account managers project to admin and get manage controls", async () => {
    fx.role = "account_manager";
    renderPage();
    await screen.findByTestId("button-upload-company-document");
  });

  it("license card with a license document: editable expiry PATCHes that document and opens the file", async () => {
    renderPage();
    const exp = await screen.findByTestId("input-company-license-expires") as HTMLInputElement;
    expect(exp.value).toBe("2026-12-31");
    fireEvent.change(exp, { target: { value: "2027-01-31" } });
    fireEvent.blur(exp);
    await waitFor(() => expect(calls.find(c => c.method === "PATCH")).toMatchObject({ url: "/api/company-documents/lic", body: { expiresOn: "2027-01-31" }, headers: { "X-Company-Id": "co1" } }));
    fireEvent.click(screen.getByTestId("link-open-company-license"));
    const drawer = await screen.findByTestId("drawer-company-document");
    expect(within(drawer).getByText("Commercial pesticide applicator license")).toBeTruthy();
    expect(await within(drawer).findByText("lic-2025.pdf")).toBeTruthy();
  });

  it("license card without a license document: upload prompt opens Upload with Licenses and role preset; blank number shows template warning", async () => {
    listBody = { documents: [W9], license: { number: null, documentId: null, expiresOn: null } };
    templates = [{ id: "chemical-template", preVisitHtml: "", postVisitHtml: "" }];
    renderPage();
    expect(await screen.findByTestId("empty-company-license-document")).toBeTruthy();
    expect(screen.queryByTestId("input-company-license-expires")).toBeNull();
    expect(await screen.findByTestId("warning-company-license-templates")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-upload-company-license"));
    const dialog = await screen.findByTestId("dialog-company-document-upload");
    expect(within(dialog).getByTestId("checkbox-company-document-license").getAttribute("data-state")).toBe("checked");
    expect(within(dialog).getByTestId("select-company-document-category").textContent).toContain("Licenses");
  });

  it("saves the license number through PUT with the company header", async () => {
    renderPage();
    const input = await screen.findByTestId("input-company-license-number");
    fireEvent.change(input, { target: { value: "99120" } });
    fireEvent.click(screen.getByTestId("button-save-company-license-number"));
    await waitFor(() => expect(calls.find(c => c.method === "PUT")).toMatchObject({ url: "/api/company-documents/license-number", body: { number: "99120" }, headers: { "X-Company-Id": "co1" } }));
  });

  it("pinned tiles shorten COI names; search filters; empty categories are hidden", async () => {
    renderPage();
    await screen.findByTestId("table-company-documents");
    const tiles = screen.getByTestId("pinned-company-documents");
    expect(within(tiles).getByText("COI — General liability")).toBeTruthy();
    expect(within(tiles).queryByTestId("tile-company-document-gs")).toBeNull();
    expect(screen.getByTestId("group-company-documents-tax")).toBeTruthy();
    expect(screen.queryByTestId("group-company-documents-other")).toBeNull();
    fireEvent.change(screen.getByTestId("input-search-company-documents"), { target: { value: "insurance" } });
    expect(screen.getByTestId("row-company-document-gl")).toBeTruthy();
    expect(screen.queryByTestId("row-company-document-w9")).toBeNull();
    expect(screen.queryByTestId("group-company-documents-tax")).toBeNull();
    expect(screen.getByTestId("text-company-documents-count").textContent).toBe("1 document");
  });

  it("replace suggests one year after today's Colorado date, not the current expiration, with the check hint", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("row-company-document-lic"));
    fireEvent.click(await screen.findByTestId("button-replace-company-document"));
    const dialog = await screen.findByTestId("dialog-company-document-replace");
    expect((within(dialog).getByTestId("input-company-document-replace-expires") as HTMLInputElement).value).toBe("2027-11-17");
    expect(within(dialog).getByTestId("hint-company-document-replace").textContent).toBe("Check it against the new copy.");
    expect(oneYearFromToday("2028-02-29")).toBe("2029-02-28");
  });

  it("empty state offers prefilled starters to manage roles", async () => {
    listBody = { documents: [], license: { number: null, documentId: null, expiresOn: null } };
    renderPage();
    fireEvent.click(await screen.findByTestId("button-starter-w9"));
    const dialog = await screen.findByTestId("dialog-company-document-upload");
    expect((within(dialog).getByTestId("input-company-document-name") as HTMLInputElement).value).toBe("W-9");
  });

  it("renders Spanish text and plain-word errors", async () => {
    fx.lang = "es";
    fx.api.mockImplementationOnce(async () => { throw new Error('409: {"code":"COMPANY_DOCUMENT_COMPANY_CHANGED"}'); });
    renderPage();
    expect((await screen.findByTestId("error-company-documents")).textContent).toContain("Cambió de empresa");
    expect(screen.getByText("Documentos de la empresa")).toBeTruthy();
  });
});
