// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import EstimateBuilder from "./EstimateBuilder";
import { openEstimateLineMenu, openEstimatePicker } from "./estimateBuilderTestInteractions";
import EstimateBuilderList from "./EstimateBuilderList";
import { conflictOf, denverToday, formatCalendarDate, isCalendarDate, listUrl } from "@/lib/estimateBuilder";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "office" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { ...auth.user, accessRole: auth.user.activeRole === "account_manager" ? "admin" : auth.user.activeRole } }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock("@/components/CustomerSearchInput", () => ({ default: () => null }));

const T0 = "2025-04-01T10:00:00.000Z";
const LATER = "2025-04-02T10:00:00.000Z";
const zeroU = { plants: 0, landscape_materials: 0, irrigation_materials: 0, landscape_labor: 0, irrigation_labor: 0, fees_surcharges: 0 };
const life = {
  createdFromVersionId: null, sentAt: null, sentById: null, sentMethod: null, acceptedAt: null, acceptedOn: null, acceptedById: null,
  acceptanceMethod: null, poNumber: null, declinedAt: null, declinedById: null, declineReason: null, supersededAt: null,
  frozenSubtotalCents: null, frozenCostKnownCents: null, frozenCostUnknownLines: null,
};
type V = { id: string; n: number; status: string; o?: Record<string, unknown> };
function line(id: string, o: Record<string, unknown> = {}) {
  return { id, companyId: "c1", versionId: "x", sectionId: "s1", lineType: "custom", priceSource: "manual", plantCatalogItemId: null, hardscapeCatalogItemId: null,
    irrigationCatalogItemId: null, quickItemId: null, rateKey: null, termId: null, name: `Line ${id}`, detail: null, unit: "ea", quantity: "1", unitPriceCents: 1000,
    unitCostCents: null, extendedCents: 1000, umbrellaKey: "landscape_materials", includeInPalette: false, paletteTypeLabel: null, sortOrder: 0, needsPrice: false,
    createdAt: T0, updatedAt: T0, ...o };
}
function detailOf(versions: V[], viewId?: string, o: Record<string, unknown> = {}) {
  const cur = versions[versions.length - 1];
  const view = versions.find((v) => v.id === (viewId ?? cur.id))!;
  return {
    id: "e1", companyId: "c1", customerId: "cu1", ticketId: null, estimateNumber: "E-2025-0042", title: "Spring install", currentVersionId: cur.id,
    voidedAt: null, voidReason: null, createdById: null, createdAt: T0, updatedAt: T0, ...o,
    versions: versions.map((v) => ({ id: v.id, versionNumber: v.n, status: v.status, createdAt: T0, updatedAt: T0, ...life, ...v.o })),
    version: { id: view.id, versionNumber: view.n, status: view.status, companyId: "c1", estimateId: "e1", createdById: null, createdAt: T0, updatedAt: (o.updatedAt as string) ?? T0,
      ...life, ...view.o,
      sections: [{ id: "s1", companyId: "c1", versionId: view.id, name: "Front", sortOrder: 0, createdAt: T0, updatedAt: T0,
        lines: [line("la"), line("lb", { needsPrice: true, unitPriceCents: 0, extendedCents: 0 }), line("lc", { needsPrice: true })] }],
      totals: { subtotalCents: 2000, costKnownCents: 0, costUnknownLines: 3, materialMarginPct: null, byUmbrella: zeroU, bySection: { s1: 2000 } } },
  };
}

const fetchMock = vi.fn();
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });
const requestBody = (init?: RequestInit) => typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
let detail: unknown;
let handler: (c: Call) => unknown | undefined;
const calls = (): Call[] => fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
  url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: requestBody(init) }));
const mutations = () => calls().filter((c) => c.method !== "GET");

beforeEach(() => {
  auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "office" };
  detail = detailOf([{ id: "v1", n: 1, status: "draft" }]);
  handler = () => undefined;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: requestBody(init) };
    const r = handler(c);
    if (r !== undefined) return r;
    if (c.url.startsWith("/api/estimates/rates")) return res({ items: [] });
    if (c.url.startsWith("/api/customers/")) return res({ name: "Ridge HOA" });
    if (c.url.startsWith("/api/estimates/e1")) return res(detail);
    if (c.url.startsWith("/api/estimates") || c.url.startsWith("/api/plant-library") || c.url.startsWith("/api/quick-items")) return res([]);
    if (c.url.startsWith("/api/hardscape-catalog") || c.url.startsWith("/api/irrigation-catalog")) return res({ items: [], categories: [] });
    return res({});
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path, record: true });
  const ui = () => (
    <QueryClientProvider client={client}><Router hook={loc.hook} searchHook={loc.searchHook}>
      <Switch>
        <Route path="/dashboard/estimates/builder/:id" component={EstimateBuilder} />
        <Route path="/dashboard/estimates/builder" component={EstimateBuilderList} />
      </Switch>
    </Router></QueryClientProvider>
  );
  const r = render(ui());
  return { ...r, loc, client, rerenderPage: () => r.rerender(ui()) };
}
const ready = () => screen.findByTestId("text-estimate-total");

const galleryPhoto = (id: string, displayOrder: number, caption: string | null = null) =>
  ({ id, displayOrder, caption, filename: `${id}.jpg`, fileSize: 12, mimeType: "image/jpeg", createdAt: T0 });

describe("version-owned exhibits", () => {
  const vBase = "/api/estimates/e1/versions";
  const path = "/dashboard/estimates/builder/e1";
  it("uploads several files into the gallery and PATCHes only the plant switch", async () => {
    const v1: V = { id: "v1", n: 1, status: "draft", o: { photos: [galleryPhoto("a", 0)], includePlantTable: true } };
    detail = detailOf([v1]);
    let next = 0;
    handler = c => {
      if (c.url.endsWith("/upload-url")) return res({ uploadUrl: `https://signed.example.test/${++next}`, uploadToken: `token-${next}` });
      if (c.url.startsWith("https://signed.example.test/")) return res(null);
      if (c.url.endsWith("/photos") && c.method === "POST") {
        v1.o!.photos = [...v1.o!.photos as ReturnType<typeof galleryPhoto>[], galleryPhoto(`new-${next}`, next)];
        detail = detailOf([v1], undefined, { updatedAt: LATER });
        return res(detail, 201);
      }
      if (c.method === "PATCH") {
        v1.o!.includePlantTable = false;
        detail = detailOf([v1], undefined, { updatedAt: LATER });
        return res(detail);
      }
      return undefined;
    };
    renderAt(path);
    await ready();
    const files = [new File(["photo 1"], "one.jpg", { type: "image/jpeg" }), new File(["photo 2"], "two.jpg", { type: "image/jpeg" })];
    fireEvent.drop(screen.getByTestId("button-add-estimate-photos"), { dataTransfer: { files } });
    await screen.findByTestId("estimate-photo-new-2");
    expect(screen.getByTestId("estimate-photo-end-page-1").textContent).toBe("End of page 1");
    expect(screen.queryByTestId("estimate-photo-end-page-2")).toBeNull();
    expect(screen.getByTestId("text-pdf-photo-count").textContent).toContain("3 photos");
    expect(mutations()).toMatchObject([
      { url: `${vBase}/v1/photos/upload-url`, method: "POST", body: { filename: "one.jpg", fileSize: 7, mimeType: "image/jpeg" } },
      { url: "https://signed.example.test/1", method: "PUT", body: files[0] },
      { url: `${vBase}/v1/photos`, method: "POST", body: { uploadToken: "token-1" }, headers: { "X-Company-Id": "c1" } },
      { url: `${vBase}/v1/photos/upload-url`, method: "POST", body: { filename: "two.jpg" } },
      { url: "https://signed.example.test/2", method: "PUT" },
      { url: `${vBase}/v1/photos`, method: "POST", body: { uploadToken: "token-2" } },
    ]);
    fireEvent.click(screen.getByTestId("switch-estimate-plant-table"));
    await waitFor(() => expect(mutations().at(-1)).toMatchObject({ method: "PATCH", url: `${vBase}/v1`, body: { includePlantTable: false } }));
    expect(screen.getByTestId("switch-estimate-plant-table").getAttribute("aria-checked")).toBe("false");
  });
  it("replays a sent photo caption on its mapped copy and never on the source", async () => {
    const sent: V = { id: "v1", n: 1, status: "sent", o: { photos: [galleryPhoto("old-photo", 0, "Original")] } };
    const draft: V = { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1", photos: [galleryPhoto("new-photo", 0, "Original")] } };
    detail = detailOf([sent]);
    handler = c => {
      if (c.url.endsWith("/revise")) return res({ ...detailOf([sent, draft], undefined, { updatedAt: LATER }), idMap: { sections: {}, lines: {}, photos: { "old-photo": "new-photo" } } });
      if (c.url.endsWith("/photos/new-photo") && c.method === "PATCH") {
        draft.o!.photos = [galleryPhoto("new-photo", 0, "Updated")];
        detail = detailOf([sent, draft], undefined, { updatedAt: LATER });
        return res(detail);
      }
      return undefined;
    };
    renderAt(path);
    await ready();
    const caption = screen.getByTestId("input-estimate-photo-caption-old-photo");
    fireEvent.change(caption, { target: { value: "Updated" } });
    fireEvent.blur(caption);
    await screen.findByTestId("dialog-first-edit-revision");
    expect(mutations()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("button-confirm-first-edit"));
    expect((await screen.findByTestId("input-estimate-photo-caption-new-photo") as HTMLInputElement).value).toBe("Updated");
    expect(mutations()).toMatchObject([
      { method: "POST", url: `${vBase}/v1/revise`, body: { firstEdit: true } },
      { method: "PATCH", url: `${vBase}/v2/photos/new-photo`, body: { caption: "Updated" } },
    ]);
  });
  it("opens a worksheet from the displayed historical version", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }, { id: "v2", n: 2, status: "draft" }], "v1");
    handler = c => c.url.endsWith("/crew-worksheet") ? res({ id: "cw1" }, 201) : undefined;
    const { loc } = renderAt(`${path}?version=1`);
    await ready();
    expect(screen.queryByTestId("button-add-estimate-photos")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("button-overflow"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("menu-estimate-crew-worksheet"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/tools/crew-worksheets/cw1"));
    expect(mutations()).toMatchObject([{ method: "POST", url: `${vBase}/v1/crew-worksheet`, body: {} }]);
  });
});

describe("lib helpers", () => {
  it("parses structured conflicts, Denver today, calendar dates and list urls", () => {
    expect(conflictOf(new Error('409: {"error":"DRAFT_EXISTS","versionId":"v3"}'))).toMatchObject({ status: 409, error: "DRAFT_EXISTS", versionId: "v3" });
    expect(conflictOf(new Error('409: {"error":"LINES_NEED_PRICE","lineIds":["a",1]}'))?.lineIds).toEqual(["a"]);
    expect(conflictOf(new Error("500: nope"))).toBeNull();
    expect(denverToday(new Date("2025-07-01T05:30:00.000Z"))).toBe("2025-06-30");
    expect(isCalendarDate("2025-02-30")).toBe(false);
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("0001-01-01")).toBe(true);
    expect(isCalendarDate("0000-01-01")).toBe(false);
    expect(formatCalendarDate("2025-04-01", "en")).toBe("Apr 1, 2025");
    expect(listUrl("", false, "void")).toBe("/api/estimates?status=void");
    expect(listUrl("x", true, "open")).toBe("/api/estimates?search=x&includeVoid=true&status=open");
  });
});

describe("header actions per state", () => {
  it("keeps acceptance committed after a field PUT failure, shows persistent recovery after reload and repairs without a second PATCH", async () => {
    const statuses = [
      { id: "sent", statusKey: "proposal_sent", displayOrder: 1, name: "Proposal sent", isFinal: "false" },
      { id: "ready", statusKey: "ready_to_schedule", displayOrder: 3, name: "Ready to schedule", isFinal: "false" },
    ];
    const linked = { id: "ticket-uuid", ticketTypeId: "type", currentStatusId: "sent" };
    const values: { fieldId: string; value: string }[] = [];
    let fail = true;
    detail = detailOf([{ id: "v1", n: 1, status: "sent", o: { sentAt: T0, sentMethod: "email" } }], undefined, { ticketId: linked.id });
    handler = c => {
      if (c.method === "POST" && c.url.endsWith("/accept")) {
        detail = detailOf([{ id: "v1", n: 1, status: "accepted", o: { sentAt: T0, sentMethod: "email", acceptedAt: LATER, acceptedOn: "2025-04-02", acceptanceMethod: "phone" } }], undefined, { updatedAt: LATER, ticketId: linked.id });
        return res(detail);
      }
      if (c.url.endsWith("/details")) return res({ ticket: linked, statuses });
      if (c.url.endsWith("/statuses")) return res(statuses);
      if (c.url.endsWith("/fields")) return res([{ id: "decision", fieldKey: "decision_outcome", fieldType: "select", options: ["Approved", "Denied"] }]);
      if (c.url.endsWith("/field-values")) return res(values);
      if (c.method === "PUT") {
        if (fail) { fail = false; return res({ error: "field write failed" }, 500); }
        values.push({ fieldId: "decision", value: "Approved" }); return res({});
      }
      if (c.url === `/api/tickets/${linked.id}`) {
        if (c.method === "PATCH") linked.currentStatusId = (c.body as { currentStatusId: string }).currentStatusId;
        return res(linked);
      }
      return undefined;
    };
    const first = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-record-accept"));
    fireEvent.click(await screen.findByTestId("button-submit-accept"));
    await waitFor(() => expect(linked.currentStatusId).toBe("ready"));
    await waitFor(() => expect(screen.getByTestId("ticket-advance-notice").textContent).toContain("ticket fields are incomplete"));
    expect(screen.queryByTestId("dialog-accept")).toBeNull();
    expect(screen.getByTestId("pill-status-accepted").textContent).toContain("Accepted");
    expect(first.client.getQueryData<{ version: { status: string } }>(["/api/estimates", "by-ticket", "c1", "u1", "office", linked.id])?.version.status).toBe("accepted");
    const writes = mutations();
    expect(writes.map(c => c.method)).toEqual(["POST", "PATCH", "PUT"]);
    first.unmount(); first.client.clear();
    renderAt("/dashboard/estimates/builder/e1"); await ready();
    expect(await screen.findByTestId("ticket-advance-notice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advance ticket" }));
    await waitFor(() => expect(screen.queryByTestId("ticket-advance-notice")).toBeNull());
    expect(mutations().filter(c => c.method === "PATCH")).toHaveLength(1);
    expect(mutations().filter(c => c.url.startsWith("/api/estimates/"))).toHaveLength(1);
  });
  it("draft v1: Mark as Sent, no discard (v1 voids instead), overflow void", async () => {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-mark-sent")).toBeTruthy();
    expect(screen.getByTestId("pill-status-draft").textContent).toBe("Draft");
    expect(screen.getByTestId("text-single-version-pdf")).toBeTruthy();
    expect(screen.queryByTestId("button-discard-draft")).toBeNull();
    expect(screen.queryByTestId("button-record-accept")).toBeNull();
    expect(screen.getByTestId("button-overflow")).toBeTruthy();
    expect(screen.getByTestId("text-next-step").textContent).toContain("mark as sent");
  });
  it("sent: accept/decline, editable lines, sent date and method, manual revision in overflow", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent", o: { sentAt: T0, sentMethod: "email" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-record-accept")).toBeTruthy();
    expect(screen.getByTestId("button-record-decline")).toBeTruthy();
    expect(screen.queryByTestId("button-revise")).toBeNull();
    expect(screen.getByTestId("pill-status-sent").textContent).toBe("Sent");
    expect(screen.getByTestId("banner-edit-revision").textContent).toContain("Sent Apr 1, 2025 by Email.");
    expect(screen.getByTestId("banner-edit-revision").textContent).toContain("your first change starts Version 2");
    expect((screen.getByTestId("input-quantity-la") as HTMLInputElement).disabled).toBe(false);
    fireEvent.keyDown(screen.getByTestId("button-overflow"), { key: "Enter" });
    expect((await screen.findByTestId("menu-start-version")).textContent).toBe("Start Version 2");
    expect(screen.queryByTestId("button-mark-sent")).toBeNull();
    expect(screen.queryByTestId("input-estimate-title")).toBeNull();
  });
  it("accepted: change order + Locked, green banner with Colorado date, method and PO", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "accepted", o: { acceptedOn: "2025-03-31", acceptedAt: "2025-04-01T03:00:00.000Z", acceptanceMethod: "signed_pdf", poNumber: "PO-77" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-revise").textContent).toBe("Start change order (v2)");
    expect(screen.getByTestId("indicator-locked").textContent).toBe("Locked");
    expect((screen.getByTestId("input-quantity-la") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("banner-edit-revision")).toBeNull();
    const b = screen.getByTestId("text-accepted-meta").textContent!;
    expect(b).toContain("Mar 31, 2025"); expect(b).toContain("Signed PDF"); expect(b).toContain("PO PO-77"); expect(b).toContain("Prices frozen");
  });
  it("declined: reason and first-edit hint", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "declined", o: { declineReason: "Timing" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.queryByTestId("button-revise")).toBeNull();
    expect(screen.getByTestId("banner-edit-revision").textContent).toContain("Timing");
  });
  it("change-order draft keeps accepted history visible and offers discard", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "accepted" }, { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("banner-contract").textContent).toContain("v1 is still the accepted contract");
    expect(screen.getByTestId("chip-version-2").textContent).toContain("(change order)");
    expect(screen.getByTestId("chip-version-1").textContent).toContain("Accepted");
    expect(screen.getByTestId("button-discard-draft")).toBeTruthy();
  });
  it("void estimate shows reason and no actions", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "void" }], undefined, { voidedAt: T0, voidReason: "Duplicate" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("text-void-reason").textContent).toContain("Duplicate");
    expect(screen.queryByTestId("button-overflow")).toBeNull();
    expect(screen.queryByTestId("button-mark-sent")).toBeNull();
  });
  it("superseded versions retain their sent/accepted labels and frozen acceptance details", async () => {
    const vs: V[] = [
      { id: "v1", n: 1, status: "superseded", o: { sentAt: T0, sentMethod: "email", acceptedAt: T0, acceptedOn: "2025-03-29", acceptanceMethod: "phone", poNumber: "OLD-PO" } },
      { id: "v2", n: 2, status: "accepted", o: { acceptedAt: LATER, acceptedOn: "2025-04-02" } },
    ];
    handler = c => c.url === "/api/estimates/e1?version=1" ? res(detailOf(vs, "v1")) : undefined;
    renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    expect(screen.getByTestId("chip-version-1").textContent).toContain("Accepted · Superseded");
    expect(screen.getByTestId("banner-read-only").textContent).toContain("OLD-PO");
    expect(screen.getByTestId("banner-read-only").textContent).toContain("Prices frozen");
    expect(screen.queryByTestId("button-revise")).toBeNull();
  });
  it.each(["sent", "accepted", "declined", "superseded", "void"])("historical %s view: back to current and no estimate mutation path", async (status) => {
    const vs: V[] = [{ id: "v1", n: 1, status }, { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1" } }];
    detail = detailOf(vs);
    handler = (c) => c.url === "/api/estimates/e1?version=1" ? res(detailOf(vs, "v1")) : undefined;
    const { loc } = renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    expect(screen.getByTestId("bar-not-current").textContent).toContain("Viewing version 1");
    if (status === "void") expect(screen.queryByTestId("button-overflow")).toBeNull();
    else {
      fireEvent.keyDown(screen.getByTestId("button-overflow"), { key: "Enter" });
      expect(await screen.findByTestId("menu-estimate-crew-worksheet")).toBeTruthy();
      expect(screen.queryByTestId("menu-void")).toBeNull();
      fireEvent.keyDown(screen.getByTestId("menu-estimate-crew-worksheet"), { key: "Escape" });
    }
    expect(screen.queryByTestId("button-revise")).toBeNull();
    expect(screen.queryByTestId("button-record-accept")).toBeNull();
    expect(screen.queryByTestId("button-record-decline")).toBeNull();
    expect(screen.queryByTestId("button-discard-draft")).toBeNull();
    expect(screen.queryByTestId("button-mark-sent")).toBeNull();
    fireEvent.click(screen.getByTestId("button-view-current"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e1"));
  });
});

describe("dialogs", () => {
  it.each(["activate", "incomplete", "cancel", "stale", "failure", "already-active"])("acceptance offers independent activation: %s", async scenario => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    let attempts = 0;
    handler = c => {
      if (c.method === "POST" && c.url.endsWith("/accept")) {
        detail = detailOf([{ id: "v1", n: 1, status: "accepted" }], undefined, {
          updatedAt: LATER,
          ...(scenario === "already-active" ? {} : { customerActivation: { customerId: "cu1", status: "prospect", missingFields: scenario === "incomplete" ? ["billingEmails"] : [] } }),
        });
        return res(detail);
      }
      if (c.method === "PATCH" && c.url === "/api/customers/cu1") {
        attempts++;
        if (scenario === "stale") return res({ code: "ACTIVATION_INCOMPLETE", missingFields: ["billingEmails"] }, 400);
        if (scenario === "failure" && attempts === 1) return res({ message: "Unavailable" }, 503);
        return res({ status: "active" });
      }
      return undefined;
    };
    renderAt("/dashboard/estimates/builder/e1"); await ready();
    fireEvent.click(screen.getByTestId("button-record-accept"));
    fireEvent.click(await screen.findByTestId("button-submit-accept"));
    await screen.findByTestId("indicator-locked");
    if (scenario === "already-active") expect(screen.queryByText("Ridge HOA is still a prospect.")).toBeNull();
    else {
      await screen.findByText("Ridge HOA is still a prospect.");
      expect(screen.queryByTestId("dialog-accept")).toBeNull();
      if (scenario === "incomplete") expect(screen.getByRole("link", { name: "Finish setup" }).getAttribute("href")).toBe("/dashboard/customers/cu1/edit");
      else if (scenario === "cancel") { fireEvent.click(screen.getByText("Not now")); expect(attempts).toBe(0); }
      else {
        fireEvent.click(screen.getByText("Activate now"));
        if (scenario === "stale") await screen.findByRole("link", { name: "Finish setup" });
        else {
          if (scenario === "failure") { await screen.findByRole("alert"); fireEvent.click(screen.getByText("Activate now")); }
          await screen.findByText("Customer activated");
          expect(calls().find(c => c.method === "PATCH" && c.url === "/api/customers/cu1")?.headers).toMatchObject({ "X-Company-Id": "c1" });
        }
      }
    }
    expect(calls().filter(c => c.url.endsWith("/accept") && c.method === "POST")).toHaveLength(1);
  });
  it("send: method, LINES_NEED_PRICE lists server ids only, Send anyway confirms and installs response", async () => {
    let n = 0;
    handler = (c) => {
      if (c.method !== "POST") return undefined;
      n++;
      return n === 1 ? res({ error: "LINES_NEED_PRICE", lineIds: ["lb", "ghost"] }, 409)
        : res(detailOf([{ id: "v1", n: 1, status: "sent", o: { sentAt: T0, sentMethod: "portal" } }], undefined, { updatedAt: LATER }));
    };
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    await screen.findByTestId("dialog-send");
    fireEvent.click(screen.getByTestId("radio-send-method-portal"));
    fireEvent.click(screen.getByTestId("button-submit-send"));
    await screen.findByTestId("panel-need-price");
    expect(screen.getByTestId("need-price-lb").textContent).toBe("Line lb");
    expect(screen.getByTestId("need-price-ghost").textContent).toBe("Line ghost");
    expect(screen.queryByTestId("need-price-lc")).toBeNull();
    fireEvent.click(screen.getByTestId("button-send-anyway"));
    await waitFor(() => expect(screen.queryByTestId("dialog-send")).toBeNull());
    expect(mutations().map((m) => m.body)).toEqual([{ method: "portal" }, { method: "portal", confirmZeroPriced: true }]);
    expect(mutations()[0]).toMatchObject({ url: "/api/estimates/e1/versions/v1/send", headers: { "X-Company-Id": "c1" } });
    await screen.findByTestId("button-record-accept");
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Marked as sent" }));
  });
  it("send prevents duplicate submissions", async () => {
    let release!: () => void;
    handler = (c) => c.method === "POST" ? new Promise((r) => { release = () => r(res(detailOf([{ id: "v1", n: 1, status: "sent" }], undefined, { updatedAt: LATER }))); }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    const btn = await screen.findByTestId("button-submit-send");
    fireEvent.click(btn); fireEvent.click(btn);
    fireEvent.submit(btn.closest("form")!);
    await waitFor(() => expect(mutations()).toHaveLength(1));
    await act(async () => { release(); });
    await screen.findByTestId("button-record-accept");
    expect(mutations()).toHaveLength(1);
  });
  it("accept: method, PO, exact Denver default date, then exact edited date", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    handler = (c) => c.method === "POST" ? res(detailOf([{ id: "v1", n: 1, status: "accepted" }], undefined, { updatedAt: LATER })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-record-accept"));
    const dlg = await screen.findByTestId("dialog-accept");
    expect(dlg.textContent).toContain("Locks this version and freezes its prices.");
    const date = screen.getByTestId("input-accept-date") as HTMLInputElement;
    expect(date.type).toBe("date");
    expect(date.value).toBe(denverToday());
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-submit-accept"));
    expect(screen.getByTestId("error-accept-date")).toBeTruthy();
    expect(mutations()).toHaveLength(0);
    fireEvent.change(date, { target: { value: "2025-03-31" } });
    fireEvent.click(screen.getByTestId("radio-accept-method-phone"));
    fireEvent.change(screen.getByTestId("input-accept-po"), { target: { value: "  PO-9 " } });
    fireEvent.click(screen.getByTestId("button-submit-accept"));
    await waitFor(() => expect(mutations()[0]).toMatchObject({ url: "/api/estimates/e1/versions/v1/accept", body: { method: "phone", poNumber: "PO-9", acceptedOn: "2025-03-31" } }));
    await screen.findByTestId("indicator-locked");
  });
  it("decline: reason required, quick chips fill it", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    handler = (c) => c.method === "POST" ? res(detailOf([{ id: "v1", n: 1, status: "declined", o: { declineReason: "Went with competitor" } }], undefined, { updatedAt: LATER })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-record-decline"));
    await screen.findByTestId("dialog-decline");
    fireEvent.click(screen.getByTestId("button-submit-decline"));
    expect(screen.getByTestId("error-decline-reason")).toBeTruthy();
    fireEvent.click(screen.getByTestId("chip-decline-competitor"));
    fireEvent.click(screen.getByTestId("button-submit-decline"));
    await waitFor(() => expect(mutations()[0]?.body).toEqual({ reason: "Went with competitor" }));
    await screen.findByTestId("text-decline-reason");
  });
  it("discard draft and void (reason required, HAS_ACCEPTED_VERSION translated)", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }, { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1" } }]);
    handler = (c) => {
      if (c.method === "DELETE") return res(detailOf([{ id: "v1", n: 1, status: "sent" }], undefined, { updatedAt: LATER }));
      if (c.url.endsWith("/void")) return res({ error: "HAS_ACCEPTED_VERSION" }, 409);
      return undefined;
    };
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-discard-draft"));
    fireEvent.click(await screen.findByTestId("button-submit-discard"));
    await waitFor(() => expect(mutations()[0]).toMatchObject({ method: "DELETE", url: "/api/estimates/e1/versions/v2" }));
    await screen.findByTestId("button-record-accept");
    fireEvent.keyDown(screen.getByTestId("button-overflow"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("menu-void"));
    await screen.findByTestId("dialog-void");
    fireEvent.click(screen.getByTestId("button-submit-void"));
    expect(screen.getByTestId("error-void-reason")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-void-reason"), { target: { value: " Duplicate " } });
    fireEvent.click(screen.getByTestId("button-submit-void"));
    expect((await screen.findByTestId("error-lifecycle")).textContent).toContain("cannot be voided");
    expect(mutations()[1]).toMatchObject({ url: "/api/estimates/e1/void", body: { reason: "Duplicate" } });
  });
  it("revise DRAFT_EXISTS navigates to the existing draft instead of creating one", async () => {
    const vs: V[] = [{ id: "v1", n: 1, status: "sent" }, { id: "v2", n: 2, status: "sent" }];
    detail = detailOf(vs);
    handler = (c) => c.method === "POST" ? res({ error: "DRAFT_EXISTS", versionId: "v3" }, 409) : undefined;
    const { loc } = renderAt("/dashboard/estimates/builder/e1?version=2");
    await ready();
    fireEvent.keyDown(screen.getByTestId("button-overflow"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("menu-start-version"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e1"));
    expect(mutations()).toHaveLength(1);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "A draft already exists. Opening it." }));
  });
});

describe("first edit on a sent or declined estimate", () => {
  const path = "/dashboard/estimates/builder/e1";
  const versionBase = "/api/estimates/e1/versions";
  const idMap = { sections: { s1: "draft-section" }, lines: { la: "new-a", lb: "new-b", lc: "new-c" } };
  function setup(status = "sent", race?: "same-source" | "missing-target") {
    const source: V = { id: "v1", n: 1, status, o: { scopeOfWork: "Original scope", sentAt: T0, sentMethod: "email" } };
    const initial = detailOf([source]);
    const draftV: V = { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1", scopeOfWork: "Original scope" } };
    const draft = detailOf([source, draftV], undefined, { updatedAt: LATER });
    draft.version.sections = [{ ...draft.version.sections[0], id: "draft-section",
      lines: (race === "missing-target" ? [line("new-c"), line("new-b")] : [line("new-c"), line("new-b"), line("new-a")]) }];
    detail = initial;
    handler = c => {
      if (c.url.endsWith("?kind=fee")) return res([]);
      if (c.url.endsWith("/revise")) {
        detail = draft;
        return race ? res({ error: "DRAFT_EXISTS", versionId: "v2", idMap }, 409) : res({ ...draft, idMap });
      }
      if (c.url === "/api/estimates/e1?version=1") return res(detail === initial ? initial : detailOf([source, draftV], "v1"));
      if (c.method !== "GET") return res(draft);
      return undefined;
    };
    return { draft, initial };
  }
  const edit = (input: HTMLElement, value: string) => {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };
  async function confirm() {
    expect(mutations()).toHaveLength(0);
    await screen.findByTestId("dialog-first-edit-revision");
    fireEvent.click(screen.getByTestId("button-confirm-first-edit"));
  }
  it.each(["quantity", "scope"])("restores %s on Cancel without creating a draft", async field => {
    setup();
    renderAt(path);
    await ready();
    const input = (field === "scope" ? screen.getByRole("textbox", { name: "Scope of work" }) : screen.getByTestId("input-quantity-la")) as HTMLInputElement;
    const before = input.value;
    edit(input, field === "scope" ? "Changed scope" : "5");
    const dialog = await screen.findByTestId("dialog-first-edit-revision");
    expect(dialog.textContent).toContain("Start Version 2?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(input.value).toBe(before));
    expect(mutations()).toHaveLength(0);
  });
  it.each(["fresh", "same-source"] as const)("replays quantity to its mapped line and opens the %s draft", async kind => {
    setup("sent", kind === "fresh" ? undefined : kind);
    const { loc } = renderAt(`${path}?version=1`);
    await ready();
    edit(screen.getByTestId("input-quantity-la"), "5");
    await confirm();
    await waitFor(() => expect(loc.history?.at(-1)).toBe(path));
    expect(mutations()).toMatchObject([
      { method: "POST", url: `${versionBase}/v1/revise`, body: { firstEdit: true }, headers: { "X-Company-Id": "c1" } },
      { method: "PATCH", url: `${versionBase}/v2/lines/new-a`, body: { quantity: "5" }, headers: { "X-Company-Id": "c1" } },
    ]);
    expect((await screen.findByTestId("pill-status-draft")).textContent).toContain("v2");
    expect(screen.getByTestId("chip-version-1").textContent).toContain("Version 1");
  });
  it("opens a competing draft without writing if its copied target was deleted", async () => {
    setup("sent", "missing-target");
    renderAt(path);
    await ready();
    edit(screen.getByTestId("input-quantity-la"), "5");
    await confirm();
    await screen.findByTestId("pill-status-draft");
    expect(mutations()).toHaveLength(1);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("couldn't be applied safely") }));
  });
  it.each([
    ["scope", "PATCH", "/v2", { scopeOfWork: "New scope" }],
    ["rename", "PATCH", "/v2/sections/draft-section", { name: "Side beds" }],
    ["delete", "DELETE", "/v2/lines/new-b", undefined],
    ["add", "POST", "/v2/lines", { sectionId: "draft-section", lineType: "custom", name: "Site fee", unitPriceCents: 500 }],
    ["duplicate", "POST", "/v2/lines/new-b/duplicate", undefined],
    ["description", "PATCH", "/v2/lines/new-b", { detail: "Customer wording" }],
  ] as const)("replays a declined version's first %s edit", async (operation, method, suffix, body) => {
    setup("declined");
    renderAt(path);
    await ready();
    if (operation === "scope") edit(screen.getByRole("textbox", { name: "Scope of work" }), "New scope");
    if (operation === "rename") edit(screen.getByTestId("input-section-name-s1"), "Side beds");
    if (operation === "delete" || operation === "duplicate") {
      openEstimateLineMenu("lb");
      fireEvent.click(await screen.findByTestId(operation === "delete" ? "menu-remove-line-lb" : "menu-duplicate-lb"));
    }
    if (operation === "description") edit(screen.getByTestId("input-description-lb"), "Customer wording");
    if (operation === "add") {
      await openEstimatePicker("custom", "Site fee");
      fireEvent.click(await screen.findByTestId("chip-custom-category-fees"));
      fireEvent.change(await screen.findByTestId("input-free-name"), { target: { value: "Site fee" } });
      fireEvent.change(screen.getByTestId("input-free-rate"), { target: { value: "5" } });
      fireEvent.submit(screen.getByTestId("form-free-entry"));
    }
    await confirm();
    await screen.findByTestId("pill-status-draft");
    expect(mutations()).toHaveLength(2);
    expect(mutations()[1]).toMatchObject({ method, url: `${versionBase}${suffix}` });
    if (body) expect(mutations()[1].body).toMatchObject(body);
  });
});

describe("stale scope and version", () => {
  it("drops a lifecycle response after a version switch and releases busy state", async () => {
    const vs: V[] = [{ id: "v1", n: 1, status: "superseded" }, { id: "v2", n: 2, status: "draft" }];
    detail = detailOf(vs);
    let release!: () => void;
    handler = (c) => {
      if (c.method === "POST") return new Promise((r) => { release = () => r(res(detailOf([...vs.slice(0, 1), { id: "v2", n: 2, status: "sent" }], undefined, { updatedAt: LATER }))); });
      if (c.url === "/api/estimates/e1?version=1") return res(detailOf(vs, "v1"));
      return undefined;
    };
    const { loc } = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    fireEvent.click(await screen.findByTestId("button-submit-send"));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    act(() => loc.navigate("/dashboard/estimates/builder/e1?version=1"));
    await screen.findByTestId("bar-not-current");
    expect(screen.queryByTestId("dialog-send")).toBeNull();
    await act(async () => { release(); });
    expect(screen.getByTestId("bar-not-current")).toBeTruthy();
    expect(toastSpy).not.toHaveBeenCalled();
    act(() => loc.navigate("/dashboard/estimates/builder/e1"));
    expect(await screen.findByTestId("button-mark-sent").catch(() => screen.findByTestId("button-record-accept"))).toBeTruthy();
    expect((screen.queryByTestId("button-mark-sent") ?? screen.getByTestId("button-record-accept")).hasAttribute("disabled")).toBe(false);
  });
  it("tenant switch drops an in-flight lifecycle result", async () => {
    let release!: () => void;
    handler = (c) => c.method === "POST" ? new Promise((r) => { release = () => r(res(detailOf([{ id: "v1", n: 1, status: "sent" }], undefined, { updatedAt: LATER }))); }) : undefined;
    const { rerenderPage } = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    fireEvent.click(await screen.findByTestId("button-submit-send"));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "office" };
    rerenderPage();
    await act(async () => { release(); });
    await ready();
    expect(screen.getByTestId("button-mark-sent")).toBeTruthy();
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe("list filters and Spanish", () => {
  it("status filter intersects Show void; explicit void forces void inclusion", async () => {
    renderAt("/dashboard/estimates/builder");
    await screen.findByTestId("estimates-empty");
    fireEvent.click(screen.getByTestId("filter-status-open"));
    await waitFor(() => expect(calls().some((c) => c.url === "/api/estimates?status=open")).toBe(true));
    fireEvent.click(screen.getByTestId("switch-show-void"));
    await waitFor(() => expect(calls().some((c) => c.url === "/api/estimates?includeVoid=true&status=open")).toBe(true));
    fireEvent.click(screen.getByTestId("filter-status-void"));
    await waitFor(() => expect(calls().some((c) => c.url.endsWith("status=void"))).toBe(true));
    expect((screen.getByTestId("switch-show-void") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-clear-search"));
    await waitFor(() => expect(screen.getByTestId("filter-status-all").getAttribute("aria-checked")).toBe("true"));
  });
  it("renders lifecycle copy in Spanish", async () => {
    await i18n.changeLanguage("es");
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-record-accept").textContent).toBe("Registrar aceptación");
    expect(screen.getByTestId("banner-edit-revision").textContent).toContain("su primer cambio inicia la versión 2");
    fireEvent.click(screen.getByTestId("button-record-accept"));
    expect((await screen.findByTestId("dialog-accept")).textContent).toContain("Bloquea esta versión y congela sus precios.");
  });
  it("en and es lifecycle key sets match", async () => {
    const keys = (o: unknown, p = ""): string[] => typeof o === "object" && o ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
    const en = i18n.getResourceBundle("en", "translation").estimateBuilder;
    const es = i18n.getResourceBundle("es", "translation").estimateBuilder;
    expect(keys(es.life).sort()).toEqual(keys(en.life).sort());
    expect(keys(es.filter).sort()).toEqual(keys(en.filter).sort());
  });
});
