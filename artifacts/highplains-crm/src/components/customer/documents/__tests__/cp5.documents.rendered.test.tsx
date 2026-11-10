// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarContext } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { CustomerSubNav } from "@/components/customer/CustomerSubNav";
import { visibleCustomerPages } from "@/components/customer/customerPages";
import DocumentsPage from "../DocumentsPage";
import { MapPdfsCard } from "../MapPdfsCard";
import type { CustomerContractDocumentDto, CustomerDocumentDto } from "../documentModel";

const fx = vi.hoisted(() => ({ role: "admin", lang: "en" as "en" | "es", companyId: "co1", userId: "u1" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: fx.userId, activeRole: fx.role, accessRole: fx.role, activeCompanyId: fx.companyId } }) }));
vi.mock("@/hooks/use-reduced-motion", () => ({ usePrefersReducedMotion: () => true }));
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

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
});

const doc = (p: Partial<CustomerDocumentDto> & { id: string }): CustomerDocumentDto => ({
  customerId: "c1", companyId: "co1", name: p.id, category: "map", note: null, mimeType: "application/pdf", fileType: "pdf",
  fileSize: 2048, uploadedByName: "Dana Ruiz", createdAt: "2026-03-01T12:00:00Z", updatedAt: "2026-03-01T12:00:00Z",
  openUrl: `/api/customers/c1/documents/${p.id}/open?companyId=co1`, downloadUrl: `/api/customers/c1/documents/${p.id}/open?companyId=co1&download=1`, ...p,
});
const contractDoc: CustomerContractDocumentDto = {
  id: "td1", filename: "2026 signed agreement.pdf", kind: "clarifications", seasonLabel: "2026 Landscape", createdAt: "2026-02-01T00:00:00Z",
  agreementId: "ag1", termId: "tm1", openUrl: "/api/contract-center/files/td1?companyId=co1",
};

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let routes: Record<string, Handler> = {};
const calls: { method: string; url: string; body?: any; headers?: any }[] = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

class FakeXHR {
  static fail = new Set<string>();
  upload: { onprogress?: (e: any) => void } = {};
  onload?: () => void; onerror?: () => void; onabort?: () => void;
  status = 0; responseText = ""; url = "";
  open(_m: string, url: string) { this.url = url; }
  setRequestHeader() {}
  send(file: File) {
    setTimeout(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      setTimeout(() => {
        if (FakeXHR.fail.has(file.name)) { this.onerror?.(); return; }
        this.status = 200; this.onload?.();
      }, 5);
    }, 5);
  }
}

beforeEach(() => {
  fx.role = "admin"; fx.lang = "en"; fx.companyId = "co1"; fx.userId = "u1"; routes = {}; calls.length = 0; FakeXHR.fail.clear();
  queryClient.clear();
  window.localStorage.clear();
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, url, body: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers });
    const h = routes[`${method} ${url}`] ?? routes[`${method} ${url.split("?")[0]}`];
    return h ? h(url, init) : json({ message: "not mocked" }, 404);
  }));
  vi.stubGlobal("open", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

describe("CP5 navigation", () => {
  const rail = (kind: "regular" | "parent", role: string) => render(<SidebarContext.Provider value={{
    state: "expanded", open: true, setOpen: vi.fn(), openMobile: false, setOpenMobile: vi.fn(), isMobile: false, toggleSidebar: vi.fn(),
  }}><TooltipProvider><CustomerSubNav pages={visibleCustomerPages({ kind, accessRole: role, snowCovered: false })} activeTab="documents" onTabChange={vi.fn()} /></TooltipProvider></SidebarContext.Provider>);

  it.each([["en", "Documents"], ["es", "Documentos"]] as const)("regular + parent rails put %s Documents right after Notes", (lang, label) => {
    fx.lang = lang;
    for (const [kind, role] of [["regular", "admin"], ["regular", "crew_member"], ["parent", "office"]] as const) {
      rail(kind, role);
      const nav = screen.getByTestId("customer-sub-nav").querySelector("nav")!;
      const items = within(nav).getAllByTestId(/^nav-item-/).map(e => e.getAttribute("data-testid"));
      expect(items[items.indexOf("nav-item-notes") + 1]).toBe("nav-item-documents");
      expect(within(nav).getByTestId("nav-item-documents").textContent).toBe(label);
      if (kind === "parent") expect(items.indexOf("nav-item-branches")).toBe(1);
      cleanup();
    }
  });
});

describe("CP5 Documents page", () => {
  it.each(["companyId", "userId"] as const)("stops upload before PUT/finalization when %s changes during the URL request", async changed => {
    routes["GET /api/customers/c1/documents"] = () => json([]);
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    let release!: (r: Response) => void;
    routes["POST /api/customers/c1/documents/upload-url"] = () => new Promise<Response>(resolve => { release = resolve; });
    const send = vi.spyOn(FakeXHR.prototype, "send");
    const ui = () => <QueryClientProvider client={queryClient}><DocumentsPage customerId="c1" privileged /></QueryClientProvider>;
    const rendered = render(ui());
    await screen.findByTestId("documents-empty");
    fireEvent.change(screen.getByTestId("input-document-files"), { target: { files: [file("scope.pdf", "application/pdf")] } });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    fx[changed] = "changed";
    rendered.rerender(ui());
    await act(async () => { release(json({ uploadURL: "https://store/scoped", uploadToken: "opaque" })); });
    expect(await screen.findByTestId("text-upload-error-scope.pdf")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    expect(calls.some(c => c.method === "POST" && c.url === "/api/customers/c1/documents")).toBe(false);
    send.mockRestore();
  });
  it("empty state: hint only for privileged users", async () => {
    routes["GET /api/customers/c1/documents"] = () => json([]);
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    wrap(<DocumentsPage customerId="c1" privileged />);
    expect(await screen.findByTestId("documents-empty-message")).toHaveProperty("textContent", "No documents yet. Drop files here or use Upload.");
    cleanup(); queryClient.clear(); fx.role = "crew_member";
    wrap(<DocumentsPage customerId="c1" privileged={false} />);
    expect((await screen.findByTestId("documents-empty-message")).textContent).toBe("No documents yet.");
  });

  it("batch upload: per-file progress and errors, then metadata sheet PATCHes only changes and stores the category per user", async () => {
    let created = 0;
    routes["GET /api/customers/c1/documents"] = () => json([]);
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    routes["POST /api/customers/c1/documents/upload-url"] = (_u, i) => json({ uploadURL: `https://store/${JSON.parse(i.body as string).fileName}`, objectPath: "/objects/x", uploadToken: "opaque.signed.token" });
    routes["POST /api/customers/c1/documents"] = (_u, i) => {
      const b = JSON.parse(i.body as string);
      if (b.name === "bad") return json({ message: "x", code: "DOCUMENT_INVALID_CONTENT" }, 422);
      created += 1;
      return json(doc({ id: `d${created}`, name: b.name, category: b.category }));
    };
    routes["PATCH /api/customers/c1/documents/d1"] = (_u, i) => json(doc({ id: "d1", ...JSON.parse(i.body as string) }));
    wrap(<DocumentsPage customerId="c1" privileged />);
    await screen.findByTestId("documents-empty");
    const input = screen.getByTestId("input-document-files") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("North lot.pdf", "application/pdf"), file("virus.exe", "application/octet-stream"), file("bad.png", "image/png"), file("drop.png", "image/png")] } });
    FakeXHR.fail.add("drop.png");

    expect((await screen.findByTestId("text-upload-error-virus.exe")).textContent).toMatch(/Only PDF, JPG, PNG/);
    await waitFor(() => expect(screen.getByTestId("text-upload-status-North lot.pdf").textContent).toMatch(/50%|Saving|Uploaded/));
    expect((await screen.findByTestId("text-upload-error-bad.png")).textContent).toBe("The file contents don't match an allowed type.");
    expect((await screen.findByTestId("text-upload-error-drop.png")).textContent).toMatch(/Upload interrupted/);

    const sheet = await screen.findByTestId("sheet-document-metadata");
    const finalize = calls.find(c => c.method === "POST" && c.url === "/api/customers/c1/documents" && c.body.name === "North lot")!;
    expect(finalize.body).toEqual({ uploadToken: "opaque.signed.token", name: "North lot", category: "map", note: null });
    expect(finalize.headers["X-Company-Id"]).toBe("co1");
    expect(within(sheet).getAllByTestId(/^metadata-entry-/)).toHaveLength(1);
    expect((screen.getByTestId("input-doc-name-d1") as HTMLInputElement).value).toBe("North lot");
    fireEvent.change(screen.getByTestId("input-doc-note-d1"), { target: { value: "Gate code on page 2" } });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("select-doc-category-d1"));
    await user.click(await screen.findByTestId("option-category-site_plan"));
    await user.click(screen.getByTestId("button-metadata-save"));
    await waitFor(() => expect(screen.queryByTestId("sheet-document-metadata")).toBeNull());
    const patch = calls.find(c => c.method === "PATCH")!;
    expect(patch.body).toEqual({ category: "site_plan", note: "Gate code on page 2" });
    expect(window.localStorage.getItem("hp:cp5:docCategory:co1:u1")).toBe("site_plan");
  });

  it("later uploads reuse the stored category; storage failures are safe", async () => {
    window.localStorage.setItem("hp:cp5:docCategory:co1:u1", "irrigation");
    routes["GET /api/customers/c1/documents"] = () => json([]);
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    routes["POST /api/customers/c1/documents/upload-url"] = () => json({ uploadURL: "https://store/x", objectPath: "/o", uploadToken: "tok" });
    routes["POST /api/customers/c1/documents"] = (_u, i) => json(doc({ id: "d9", ...JSON.parse(i.body as string) }));
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    wrap(<DocumentsPage customerId="c1" privileged />);
    await screen.findByTestId("documents-empty");
    fireEvent.change(screen.getByTestId("input-document-files"), { target: { files: [file("controller.pdf", "application/pdf")] } });
    await screen.findByTestId("sheet-document-metadata");
    expect(calls.find(c => c.method === "POST" && c.url === "/api/customers/c1/documents")!.body.category).toBe("irrigation");
    fireEvent.click(screen.getByTestId("button-metadata-save"));
    await waitFor(() => expect(screen.queryByTestId("sheet-document-metadata")).toBeNull());
    spy.mockRestore();
  });

  const seeded = () => [
    doc({ id: "photo-new", name: "Front entry", category: "photo", mimeType: "image/jpeg", fileType: "jpg", createdAt: "2026-05-01T00:00:00Z", note: "Sprinkler head broken" }),
    doc({ id: "map-old", name: "Mowing map", createdAt: "2026-01-01T00:00:00Z" }),
    doc({ id: "map-new", name: "Snow map", createdAt: "2026-04-01T00:00:00Z" }),
    doc({ id: "photo-old", name: "Back lot", category: "photo", mimeType: "image/png", fileType: "png", createdAt: "2026-02-01T00:00:00Z" }),
    doc({ id: "legacy", name: "Legacy", category: "other", mimeType: null, fileType: "", fileSize: null, uploadedByName: null, createdAt: "2026-03-01T00:00:00Z" }),
  ];

  it("sorts newest first with maps pinned under All, filters by chip, searches name and note, keeps unknowns unknown", async () => {
    routes["GET /api/customers/c1/documents"] = () => json(seeded());
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([contractDoc]);
    wrap(<DocumentsPage customerId="c1" privileged />);
    const ids = () => screen.getAllByTestId(/^row-document-/).map(r => r.getAttribute("data-testid")!.replace("row-document-", ""));
    await screen.findByTestId("list-documents");
    expect(ids()).toEqual(["map-new", "map-old", "photo-new", "legacy", "photo-old"]);
    expect(screen.getByTestId("text-document-uploader-legacy").textContent).toBe("\u2014");
    expect(screen.getByTestId("text-document-size-legacy").textContent).toBe("\u2014");
    expect(screen.getByTestId("row-document-legacy").querySelector("[data-kind]")!.getAttribute("data-kind")).toBe("unknown");
    fireEvent.click(screen.getByTestId("chip-filter-photo"));
    expect(ids()).toEqual(["photo-new", "photo-old"]);
    expect(screen.queryByTestId("section-from-contracts")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-filter-all"));
    fireEvent.change(screen.getByTestId("input-document-search"), { target: { value: "sprinkler" } });
    expect(ids()).toEqual(["photo-new"]);
    fireEvent.change(screen.getByTestId("input-document-search"), { target: { value: "zzz" } });
    expect(screen.getByTestId("documents-no-match")).toBeTruthy();
  });

  it("PDF opens in a new tab; images open an accessible lightbox with next/previous", async () => {
    routes["GET /api/customers/c1/documents"] = () => json(seeded());
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    wrap(<DocumentsPage customerId="c1" privileged />);
    fireEvent.click(await screen.findByTestId("text-document-name-map-new"));
    expect(window.open).toHaveBeenCalledWith("/api/customers/c1/documents/map-new/open?companyId=co1", "_blank", "noopener,noreferrer");
    fireEvent.keyDown(screen.getByTestId("row-document-photo-new"), { key: "Enter" });
    const box = await screen.findByTestId("document-lightbox");
    expect(within(box).getByRole("img", { name: /Front entry/ }).getAttribute("src")).toContain("/documents/photo-new/open?companyId=co1");
    expect(screen.getByTestId("text-lightbox-counter").textContent).toBe("1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByTestId("text-lightbox-name").textContent).toBe("Back lot");
    fireEvent.keyDown(box, { key: "ArrowLeft" });
    expect(screen.getByTestId("text-lightbox-name").textContent).toBe("Front entry");
    fireEvent.click(screen.getByTestId("button-lightbox-close"));
    await waitFor(() => expect(screen.queryByTestId("document-lightbox")).toBeNull());
  });

  it("privileged menu: rename, change category, delete with confirmation; failure keeps dialog open", async () => {
    routes["GET /api/customers/c1/documents"] = () => json(seeded());
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    routes["PATCH /api/customers/c1/documents/map-new"] = (_u, i) => json(doc({ id: "map-new", ...JSON.parse(i.body as string) }));
    let del = 0;
    routes["DELETE /api/customers/c1/documents/map-old"] = () => (++del === 1 ? json({ message: "x", code: "DOCUMENT_CLEANUP_FAILED" }, 500) : new Response(null, { status: 204 }));
    const user = userEvent.setup();
    wrap(<DocumentsPage customerId="c1" privileged />);
    await user.click(await screen.findByTestId("button-document-menu-map-new"));
    for (const k of ["open", "download", "rename", "category", "note", "delete"]) expect(screen.getByTestId(`menu-${k}-map-new`)).toBeTruthy();
    await user.click(screen.getByTestId("menu-rename-map-new"));
    const input = await screen.findByTestId("input-edit-doc-name");
    await user.clear(input); await user.type(input, "Winter plow map");
    await user.click(screen.getByTestId("button-save-edit-doc"));
    await waitFor(() => expect(calls.some(c => c.method === "PATCH" && c.body.name === "Winter plow map")).toBe(true));

    await user.click(screen.getByTestId("button-document-menu-map-old"));
    await user.click(screen.getByTestId("menu-delete-map-old"));
    expect(calls.some(c => c.method === "DELETE")).toBe(false);
    await user.click(await screen.findByTestId("button-confirm-delete-doc"));
    expect((await screen.findByTestId("text-delete-doc-error")).textContent).toMatch(/couldn't be removed from storage/);
    await user.click(screen.getByTestId("button-confirm-delete-doc"));
    await waitFor(() => expect(screen.queryByTestId("dialog-delete-document")).toBeNull());
    expect(del).toBe(2);
  });

  it("field roles: Open/Download only, no upload, no contract chip/section and no contract request", async () => {
    fx.role = "crew_member";
    routes["GET /api/customers/c1/documents"] = () => json(seeded());
    const user = userEvent.setup();
    wrap(<DocumentsPage customerId="c1" privileged={false} />);
    await user.click(await screen.findByTestId("button-document-menu-map-new"));
    expect(screen.getByTestId("menu-open-map-new")).toBeTruthy();
    expect(screen.getByTestId("menu-download-map-new").getAttribute("href")).toContain("download=1");
    expect(screen.queryByTestId("menu-rename-map-new")).toBeNull();
    expect(screen.queryByTestId("menu-delete-map-new")).toBeNull();
    expect(screen.queryByTestId("input-document-files")).toBeNull();
    expect(screen.queryByTestId("chip-filter-contracts")).toBeNull();
    expect(screen.queryByTestId("section-from-contracts")).toBeNull();
    expect(calls.some(c => c.url.includes("from-contracts"))).toBe(false);
  });

  it.each(["en", "es"] as const)("From contracts (%s) is read-only, localizes kinds and links to the Contract Center term", async lang => {
    fx.lang = lang;
    routes["GET /api/customers/c1/documents"] = () => json([]);
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([contractDoc]);
    wrap(<DocumentsPage customerId="c1" privileged />);
    fireEvent.click(await screen.findByTestId("chip-filter-contracts"));
    const section = await screen.findByTestId("section-from-contracts");
    expect(screen.getByTestId("text-contract-kind-td1").textContent).toBe(lang === "es" ? "Aclaraciones" : "Clarifications");
    expect(screen.getByTestId("link-contract-term-td1").getAttribute("href")).toBe("/dashboard/contracts/ag1#term-tm1");
    expect(within(section).queryByRole("button", { name: /delete|eliminar|upload|subir/i })).toBeNull();
    fireEvent.click(within(section).getByText("2026 signed agreement.pdf"));
    expect(window.open).toHaveBeenCalledWith(contractDoc.openUrl, "_blank", "noopener,noreferrer");
  });

  it("parent customers list their own documents", async () => {
    routes["GET /api/customers/parent1/documents"] = () => json([doc({ id: "p1", customerId: "parent1", name: "HOA master plan", category: "site_plan" })]);
    routes["GET /api/customers/parent1/documents/from-contracts"] = () => json([]);
    wrap(<DocumentsPage customerId="parent1" privileged />);
    expect((await screen.findByTestId("text-document-name-p1")).textContent).toBe("HOA master plan");
    expect(calls.every(c => !c.url.includes("/api/customers/c1/"))).toBe(true);
  });

  it("upload is abandoned when the company changes mid-flight", async () => {
    // covered by assertSame: simulate by failing finalize as company-changed code from server
    routes["GET /api/customers/c1/documents"] = () => json([]);
    routes["GET /api/customers/c1/documents/from-contracts"] = () => json([]);
    routes["POST /api/customers/c1/documents/upload-url"] = () => json({ message: "x", code: "DOCUMENT_COMPANY_CHANGED" }, 409);
    wrap(<DocumentsPage customerId="c1" privileged />);
    await screen.findByTestId("documents-empty");
    await act(async () => { fireEvent.change(screen.getByTestId("input-document-files"), { target: { files: [file("a.pdf", "application/pdf")] } }); });
    expect((await screen.findByTestId("text-upload-error-a.pdf")).textContent).toMatch(/active company changed/);
    expect(screen.queryByTestId("sheet-document-metadata")).toBeNull();
  });
});

describe("CP5 Property Map PDFs card", () => {
  it("lists up to five map documents newest first with open links and All documents", async () => {
    routes["GET /api/customers/c1/documents"] = () => json(Array.from({ length: 7 }, (_, i) => doc({ id: `m${i}`, name: `Map ${i}`, createdAt: `2026-0${i + 1}-01T00:00:00Z` })));
    wrap(<MapPdfsCard customerId="c1" />);
    const links = await screen.findAllByTestId(/^link-map-pdf-/);
    expect(links.map(l => l.getAttribute("data-testid"))).toEqual(["link-map-pdf-m6", "link-map-pdf-m5", "link-map-pdf-m4", "link-map-pdf-m3", "link-map-pdf-m2"]);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(calls[0].url).toBe("/api/customers/c1/documents?category=map");
    expect(screen.getByTestId("link-all-documents").getAttribute("href")).toBe("/dashboard/customers/c1?tab=documents");
  });
  it("es: empty card copy", async () => {
    fx.lang = "es";
    routes["GET /api/customers/c1/documents"] = () => json([]);
    wrap(<MapPdfsCard customerId="c1" />);
    expect((await screen.findByTestId("text-no-map-pdfs")).textContent).toBe("Aún no hay archivos de mapa.");
    expect(screen.getByText("Mapas PDF")).toBeTruthy();
  });
});
