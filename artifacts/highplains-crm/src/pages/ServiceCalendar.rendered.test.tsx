// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({
  user: { id: "u1", activeCompanyId: "co1", activeRole: "admin", accessRole: "admin", isSuperAdminBool: false, activeTags: [] as string[] },
  api: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/components/nav/SettingsRailLayout", () => ({ SettingsRailLayout: ({ children }: { children: unknown }) => children }));
import ServiceCalendarPage, { toPayload, rowsFromEntries } from "@/pages/ServiceCalendarPage";
import { QueryPreservingRedirect } from "@/components/nav/QueryPreservingRedirect";
import { unsavedGuard } from "@/lib/unsavedGuard";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";
import "@/i18n";

const ok = (d: unknown) => Promise.resolve({ json: async () => d });
const e = (id: string, serviceKey: string, kind: string, position: number, name: string, opensMd: string, dueMd: string, extra: object = {}) =>
  ({ id, serviceKey, kind, position, name, opensMd, dueMd, inStandard: kind === "round", pattern: null, includes: null, updatedAt: "x", ...extra });
const usage = (serviceKey: string, over: object = {}) => ({
  serviceKey, seasons: 0, byCount: [], noCount: 0, noCountWithoutMonths: 0, needsRounds: [], zero: 0, invalid: 0, duplicate: 0,
  problems: [], legacyChemical: [], ...over,
});
const link = (termId: string, customerName: string, reason: string) => ({ termId, agreementId: `a-${termId}`, customerId: "c", customerName, reason });
const data = () => ({
  entries: [
    e("n2", "native_areas", "round", 2, "Fall full native mow", "09-01", "10-31"),
    e("n1", "native_areas", "round", 1, "Spring full native mow", "04-01", "05-31"),
    e("nb", "native_areas", "recurring", 1, "Native beauty bands", "04-01", "10-31", { pattern: "Every other week", includes: "Beauty bands" }),
    e("c1", "cleanups", "round", 1, "Spring clean-up", "03-01", "04-15"),
    e("c2", "cleanups", "round", 2, "Fall leaf clean-up 1", "11-01", "11-30"),
    e("g1", "ornamental_grass", "round", 1, "Ornamental grass cutback", "12-01", "01-30"),
    e("bf", "backflow", "checklist", 1, "Backflow testing", "01-01", "12-31", { inStandard: false }),
  ],
  usage: [
    usage("cleanups", { seasons: 40, noCount: 33, needsRounds: [link("t4", "Cherry Hills HOA", "needs_rounds")], zero: 1, problems: [link("t9", "Aspen Ridge HOA", "zero")] }),
    usage("fertilization", { seasons: 27, legacyChemical: [link("t7", "Sloan Lake Villas", "legacy_chemical")] }),
    usage("broadleaf"),
  ],
});
let getData: ReturnType<typeof data> | { entries: never[]; usage: never[] } = data();

function mount(path = "/dashboard/settings/service-calendar") {
  fx.api.mockImplementation((method: string) => ok(method === "GET" || method === "PUT" || method === "POST" ? getData : {}));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path, record: true });
  const ui = () => (
    <QueryClientProvider client={qc}><Router hook={loc.hook}>
      <Switch>
        <Route path="/dashboard/settings/service-calendar" component={ServiceCalendarPage} />
        <Route path="/dashboard/settings/service-timing"><QueryPreservingRedirect to="/dashboard/settings/service-calendar" /></Route>
        <Route>elsewhere</Route>
      </Switch>
    </Router></QueryClientProvider>
  );
  const r = render(ui());
  return { ...r, loc, rerender: () => r.rerender(ui()) };
}
const putBody = () => fx.api.mock.calls.find(c => c[0] === "PUT")?.[2] as { entries: Record<string, unknown>[]; allowEmptyStandard?: boolean };

beforeEach(() => {
  fx.api.mockReset(); fx.toast.mockReset(); getData = data();
  fx.user = { ...fx.user, activeCompanyId: "co1", activeRole: "admin", accessRole: "admin" };
});
afterEach(() => { cleanup(); unsavedGuard.setDirty(false); });

describe("Service calendar settings", () => {
  it("renders every section with the deadline rule, scoped to the active company", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    expect(fx.api).toHaveBeenCalledWith("GET", "/api/service-calendar", undefined, { headers: { "X-Company-Id": "co1" } });
    expect(screen.getByTestId("box-deadline-rule").textContent).toContain("The deadline decides the year");
    for (const id of ["section-rounds", "section-checklists", "section-recurring", "section-on-request"]) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId("text-on-request-list").textContent).toContain("Fall aeration");
    expect(screen.getByTestId("badge-crosses-ornamental_grass-round-0")).toBeTruthy();
  });

  it("shows usage flags with contract links", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    expect(screen.getByTestId("text-nocount-cleanups").textContent).toBe("Used by 33 seasons that give no count.");
    expect(screen.getByTestId("flag-needs-rounds-cleanups").textContent).toContain("1 season states a count");
    expect(screen.getByTestId("link-problem-t4-needs_rounds").getAttribute("href")).toBe("/dashboard/contracts/a-t4#term-t4");
    expect(screen.getByTestId("flag-legacy-chemical").textContent).toContain("from before the split");
    expect(screen.getByTestId("text-broadleaf-none").textContent).toBe("No contract lists broadleaf on its own line yet.");
    expect(screen.getByTestId("chip-zero-cleanups")).toBeTruthy();
  });

  it("derives the standard text from the ticks", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    expect(screen.getByTestId("text-standard-cleanups").textContent).toContain("Standard: 2 rounds (Spring clean-up, Fall leaf clean-up 1)");
    fireEvent.click(screen.getByTestId("checkbox-std-cleanups-round-1"));
    expect(screen.getByTestId("text-standard-cleanups").textContent).toContain("Standard: 1 round (Spring clean-up)");
    expect(screen.getByTestId("card-service-cleanups").getAttribute("data-dirty")).toBe("true");
  });

  it("keeps mixed native-area kinds together with per-kind positions and stable ids", async () => {
    mount();
    await screen.findByTestId("card-service-native_areas");
    // Rounds are shown in position order even though the server sent 2 before 1.
    expect((screen.getByTestId("input-name-native_areas-round-0") as HTMLInputElement).value).toBe("Spring full native mow");
    fireEvent.click(screen.getByTestId("button-down-native_areas-round-0"));
    fireEvent.change(screen.getByTestId("input-pattern-native_areas-recurring-0"), { target: { value: "Biweekly" } });
    fireEvent.click(screen.getByTestId("button-save-native_areas"));
    await waitFor(() => expect(putBody()).toBeTruthy());
    expect(fx.api.mock.calls.find(c => c[0] === "PUT")?.[1]).toBe("/api/service-calendar/native_areas");
    expect(putBody().entries).toEqual([
      expect.objectContaining({ id: "n2", kind: "round", position: 1, name: "Fall full native mow" }),
      expect.objectContaining({ id: "n1", kind: "round", position: 2, name: "Spring full native mow" }),
      expect.objectContaining({ id: "nb", kind: "recurring", position: 1, pattern: "Biweekly", includes: "Beauty bands", inStandard: false }),
    ]);
    expect(putBody().allowEmptyStandard).toBeUndefined();
    for (const entry of putBody().entries) { expect(entry).not.toHaveProperty("companyId"); expect(entry).not.toHaveProperty("updatedById"); }
  });

  it("pure payload restarts positions per kind and keeps ids", () => {
    const rows = rowsFromEntries(data().entries as never, "native_areas");
    const p = toPayload(rows);
    expect(p.map(x => `${x.kind}:${x.position}:${x.id}`)).toEqual(["round:1:n1", "round:2:n2", "recurring:1:nb"]);
    expect(p[0].pattern).toBeNull();
  });

  it("new rounds have no id; removed rows are omitted", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    fireEvent.click(screen.getByTestId("button-remove-cleanups-round-1"));
    fireEvent.click(screen.getByTestId("button-add-round-cleanups"));
    fireEvent.change(screen.getByTestId("input-name-cleanups-round-1"), { target: { value: "Fall leaf clean-up" } });
    fireEvent.click(screen.getByTestId("button-save-cleanups"));
    await waitFor(() => expect(putBody()).toBeTruthy());
    expect(putBody().entries.map(x => x.id ?? "new")).toEqual(["c1", "new"]);
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Calendar saved" })));
  });

  it("warns before saving a service with no standard round", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    fireEvent.click(screen.getByTestId("checkbox-std-cleanups-round-0"));
    fireEvent.click(screen.getByTestId("checkbox-std-cleanups-round-1"));
    expect(screen.getByTestId("text-standard-cleanups").textContent).toContain("No standard");
    fireEvent.click(screen.getByTestId("button-save-cleanups"));
    expect(await screen.findByTestId("text-std-warning")).toBeTruthy();
    expect(putBody()).toBeUndefined();
    fireEvent.click(screen.getByTestId("button-confirm-std-warning"));
    await waitFor(() => expect(putBody()?.allowEmptyStandard).toBe(true));
  });

  it("warns when the last standard rounds are deleted, not only unticked", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    fireEvent.click(screen.getByTestId("button-remove-cleanups-round-1"));
    fireEvent.click(screen.getByTestId("button-remove-cleanups-round-0"));
    expect(screen.getByTestId("empty-cleanups")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-save-cleanups"));
    expect(await screen.findByTestId("text-std-warning")).toBeTruthy();
    expect(putBody()).toBeUndefined();
    fireEvent.click(screen.getByTestId("button-confirm-std-warning"));
    await waitFor(() => expect(putBody()).toEqual({ entries: [], allowEmptyStandard: true }));
  });

  it("locks the service while its PUT is in flight so later edits are never silently dropped", async () => {
    mount();
    await screen.findByTestId("card-service-native_areas");
    let resolve!: (v: unknown) => void;
    fx.api.mockImplementation((method: string) => method === "PUT" ? new Promise(r => { resolve = r; }) : ok(getData));
    fireEvent.change(screen.getByTestId("input-name-native_areas-round-0"), { target: { value: "Spring native mow" } });
    fireEvent.click(screen.getByTestId("button-save-native_areas"));
    await waitFor(() => expect(putBody()).toBeTruthy());
    expect((screen.getByTestId("card-service-native_areas-fields") as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByTestId("card-recurring-native_areas-fields") as HTMLFieldSetElement).disabled).toBe(true);
    // Even if an event slips through, the draft does not change while pending.
    fireEvent.change(screen.getByTestId("input-pattern-native_areas-recurring-0"), { target: { value: "Weekly" } });
    expect((screen.getByTestId("input-pattern-native_areas-recurring-0") as HTMLTextAreaElement).value).toBe("Every other week");
    // Other services stay editable.
    expect((screen.getByTestId("card-service-cleanups-fields") as HTMLFieldSetElement).disabled).toBe(false);
    await act(async () => { resolve({ json: async () => getData }); });
    await waitFor(() => expect((screen.getByTestId("card-service-native_areas-fields") as HTMLFieldSetElement).disabled).toBe(false));
  });

  it("a malformed save reply fails loudly and keeps the draft", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    fx.api.mockImplementation((method: string) => method === "PUT" ? ok({ ok: true }) : ok(getData));
    fireEvent.change(screen.getByTestId("input-name-cleanups-round-0"), { target: { value: "Spring" } });
    fireEvent.click(screen.getByTestId("button-save-cleanups"));
    expect(await screen.findByTestId("error-cleanups")).toBeTruthy();
    expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The calendar was not changed", variant: "destructive" }));
    expect((screen.getByTestId("input-name-cleanups-round-0") as HTMLInputElement).value).toBe("Spring");
    expect(unsavedGuard.isDirty()).toBe(true);
  });

  it("a malformed load reply fails loudly", async () => {
    getData = { entries: [], usage: [] };
    mount();
    await screen.findByTestId("state-empty");
    fx.api.mockImplementation((method: string) => method === "POST" ? Promise.resolve({ json: async () => { throw new Error("bad json"); } }) : ok(getData));
    fireEvent.click(screen.getByTestId("button-load-starting"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.getByTestId("state-empty")).toBeTruthy();
  });

  it("office is read-only", async () => {
    fx.user = { ...fx.user, activeRole: "office", accessRole: "office" };
    mount();
    await screen.findByTestId("card-service-cleanups");
    expect(screen.getByTestId("badge-read-only")).toBeTruthy();
    expect(screen.queryByTestId("input-name-cleanups-round-0")).toBeNull();
    expect(screen.queryByTestId("button-add-round-cleanups")).toBeNull();
    expect(screen.queryByTestId("button-save-cleanups")).toBeNull();
    expect((screen.getByTestId("checkbox-std-cleanups-round-0") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("text-opens-cleanups-round-0").textContent).toBe("Mar 1");
  });

  it("marks the page dirty, and discard clears it", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    fireEvent.change(screen.getByTestId("input-name-cleanups-round-0"), { target: { value: "Spring" } });
    await waitFor(() => expect(unsavedGuard.isDirty()).toBe(true));
    fireEvent.click(screen.getByTestId("button-discard-cleanups"));
    await waitFor(() => expect(unsavedGuard.isDirty()).toBe(false));
  });

  it("guards navigation while dirty", async () => {
    mount();
    await screen.findByTestId("card-service-cleanups");
    fireEvent.change(screen.getByTestId("input-name-cleanups-round-0"), { target: { value: "Spring" } });
    await waitFor(() => expect(unsavedGuard.isDirty()).toBe(true));
    act(() => unsavedGuard.requestLeave("/dashboard"));
    expect(await screen.findByTestId("button-stay")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-stay"));
    expect((screen.getByTestId("input-name-cleanups-round-0") as HTMLInputElement).value).toBe("Spring");
  });

  it("company switch discards drafts, refetches for the new company and warns", async () => {
    const m = mount();
    await screen.findByTestId("card-service-cleanups");
    fireEvent.change(screen.getByTestId("input-name-cleanups-round-0"), { target: { value: "Spring" } });
    await waitFor(() => expect(unsavedGuard.isDirty()).toBe(true));
    fx.user = { ...fx.user, activeCompanyId: "co2" };
    m.rerender();
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("GET", "/api/service-calendar", undefined, { headers: { "X-Company-Id": "co2" } }));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Unsaved calendar edits discarded" })));
    expect(unsavedGuard.isDirty()).toBe(false);
    expect((await screen.findByTestId("input-name-cleanups-round-0") as HTMLInputElement).value).toBe("Spring clean-up");
  });

  it("empty company previews and loads the starting calendar on click only", async () => {
    getData = { entries: [], usage: [] };
    mount();
    await screen.findByTestId("state-empty");
    expect(fx.api.mock.calls.some(c => c[0] === "POST")).toBe(false);
    expect(screen.getByTestId("text-preview-count").textContent).toBe("18 rounds, 1 checklist, 4 recurring visits");
    expect(within(screen.getByTestId("list-starting-preview")).getAllByRole("listitem")).toHaveLength(STARTING_SERVICE_CALENDAR.length);
    getData = data();
    fireEvent.click(screen.getByTestId("button-load-starting"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("POST", "/api/service-calendar/load-starting", undefined, { headers: { "X-Company-Id": "co1" } }));
    expect(await screen.findByTestId("card-service-cleanups")).toBeTruthy();
  });

  it("office sees the empty state without a load button", async () => {
    getData = { entries: [], usage: [] };
    fx.user = { ...fx.user, activeRole: "office", accessRole: "office" };
    mount();
    await screen.findByTestId("state-empty");
    expect(screen.queryByTestId("button-load-starting")).toBeNull();
  });

  it("shows a retryable error", async () => {
    fx.api.mockImplementation(() => Promise.reject(new Error("500: {\"message\":\"boom\"}")));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Router hook={memoryLocation({ path: "/" }).hook}><ServiceCalendarPage /></Router></QueryClientProvider>);
    expect((await screen.findByTestId("state-error")).textContent).toContain("boom");
    expect(screen.getByTestId("button-retry")).toBeTruthy();
  });

  it("redirects the old service-timing route", async () => {
    const m = mount("/dashboard/settings/service-timing?x=1");
    await screen.findByTestId("page-service-calendar");
    expect(m.loc.history?.at(-1)).toBe("/dashboard/settings/service-calendar?x=1");
  });
});
