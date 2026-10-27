// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), detail: null as unknown }));
const season = (id: string, o: Record<string, unknown> = {}) => ({ id, seasonLabel: "2026\u201327", startDate: "2026-10-01", endDate: "2027-09-30", status: "active", line: "landscape", form: "theirs", ...o });
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
import { RenewDialog } from "./RenewDialog";

const months = (n: number) => [{ month: 1, amountCents: n }];
const preview = (after: number) => ({ seasonLabel: "2027\u201328", startDate: "2027-10-01", endDate: "2028-09-30",
  payments: [{ component: "Grounds", before: months(100000), after: months(after) }], snowFlatPrice: { before: null, after: null }, rateChanges: [] });
type Call = { body: { increasePct: unknown; roundTo: string; dryRun?: boolean }; resolve: (v: unknown) => void; reject: (e: Error) => void };
let calls: Call[] = [];
beforeEach(() => {
  calls = []; fx.toast.mockReset(); fx.api.mockReset();
  // The display-current season differs from the renewal source (the later signed season).
  fx.detail = { id: "a1", line: "both", form: "ours", terms: [season("t0", { line: "both", form: "ours", startDate: "2025-10-01" }), season("t1")] };
  fx.api.mockImplementation((m: string, _u: string, body: Call["body"]) => m === "GET" ? Promise.resolve({ json: async () => fx.detail }) : new Promise((resolve, reject) => {
    calls.push({ body, resolve: v => resolve({ json: async () => v }), reject });
  }));
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const dry = () => calls.filter(c => c.body.dryRun);
const commits = () => calls.filter(c => !c.body.dryRun);
const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function mount(onClose = vi.fn()) {
  const loc = memoryLocation({ path: "/dashboard/contracts", record: true });
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><Router hook={loc.hook}><RenewDialog target={{ id: "a1", customerName: "Pavilion Villas" }} onClose={onClose} /></Router></QueryClientProvider>);
  return { loc, onClose };
}
const type = (v: string) => fireEvent.change(screen.getByTestId("input-increase-pct"), { target: { value: v } });

describe("RenewDialog", () => {
  it("debounces 300 ms and ignores out-of-order previews", async () => {
    mount();
    await flush(299); expect(dry()).toHaveLength(0);
    await flush(2); expect(dry()).toHaveLength(1);
    type("5"); await flush(100); type("6"); await flush(300);
    expect(dry().map(c => c.body.increasePct)).toEqual([3, 6]);
    await act(async () => { dry()[1].resolve(preview(106000)); }); await flush();
    await act(async () => { dry()[0].resolve(preview(103000)); }); await flush();
    expect(screen.getByTestId("text-line-change-0").textContent).toContain("$1,060");
  });
  it("blocks an invalid percent without calling the server", async () => {
    mount(); await flush(301);
    type("abc"); await flush(400);
    expect(screen.getByTestId("error-increase-pct")).toBeTruthy();
    expect(dry()).toHaveLength(1);
    expect((screen.getByTestId("button-create-renewal") as HTMLButtonElement).disabled).toBe(true);
  });
  it("retries a failed preview", async () => {
    mount(); await flush(301);
    await act(async () => { dry()[0].reject(new Error("500: boom")); }); await flush();
    expect(screen.getByTestId("error-renew").textContent).toContain("boom");
    fireEvent.click(screen.getByTestId("button-retry-renew")); await flush(301);
    expect(dry()).toHaveLength(2);
  });
  it("commits the previewed parameters once, even on a double click, and toasts", async () => {
    const { loc, onClose } = mount(); await flush(301);
    await act(async () => { dry()[0].resolve(preview(103000)); }); await flush();
    const b = screen.getByTestId("button-create-renewal");
    fireEvent.click(b); fireEvent.click(b); await flush();
    expect(commits()).toHaveLength(1);
    expect(commits()[0].body).toEqual({ increasePct: 3, roundTo: "dollar" });
    await act(async () => { commits()[0].resolve({ id: "a1", renewalDraftId: "t2", terms: [{ id: "t1" }, { id: "t2" }] }); }); await flush();
    expect(fx.toast).toHaveBeenCalledWith({ title: "2027\u201328 draft created" });
    expect(onClose).toHaveBeenCalled();
    expect(loc.history!.at(-1)).toBe("/dashboard/contracts/a1#term-t2");
  });
  it("shows a commit error and allows a second attempt", async () => {
    mount(); await flush(301);
    await act(async () => { dry()[0].resolve(preview(103000)); }); await flush();
    fireEvent.click(screen.getByTestId("button-create-renewal")); await flush();
    await act(async () => { commits()[0].reject(new Error("409: A draft or sent renewal already exists")); }); await flush();
    expect(screen.getByTestId("error-renew").textContent).toContain("already exists");
    fireEvent.click(screen.getByTestId("button-retry-renew")); await flush(301);
    await act(async () => { dry()[1].resolve(preview(103000)); }); await flush();
    fireEvent.click(screen.getByTestId("button-create-renewal")); await flush();
    expect(commits()).toHaveLength(2);
  });

  it("shows four sections and defaults form and coverage to the renewal source season", async () => {
    mount(); await flush(301);
    for (const id of ["price", "term", "contract", "start"]) expect(screen.getByTestId(`renew-section-${id}`)).toBeTruthy();
    expect(screen.getByTestId("button-form-theirs").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("button-line-landscape").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("button-rates-carry").getAttribute("aria-pressed")).toBe("true");
  });
  it("switches rates to the card when form becomes ours, sends the changes, and notes snow added", async () => {
    mount(); await flush(301);
    fireEvent.click(screen.getByTestId("button-form-ours"));
    expect(screen.getByTestId("button-rates-card").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("button-line-both"));
    expect(screen.getByTestId("renew-change-notes").textContent).toContain("Snow added");
    fireEvent.click(screen.getByTestId("button-rates-carry"));
    expect(screen.getByTestId("button-rates-carry").getAttribute("aria-pressed")).toBe("true");
    await flush(301);
    expect(dry().at(-1)!.body).toMatchObject({ increasePct: 3, form: "ours", line: "both", rates: "carry", dryRun: true });
  });
  it("lists every year of a 3-year preview and labels the button by length", async () => {
    mount(); await flush(301);
    fireEvent.click(screen.getByTestId("button-length-3"));
    fireEvent.change(screen.getByTestId("input-year-pct-3"), { target: { value: "2.5" } });
    await flush(301);
    expect(dry().at(-1)!.body).toMatchObject({ laterYearPcts: [3, 2.5] });
    const y = (l: string, s: string, p: number) => ({ seasonLabel: l, startDate: s, endDate: s, annualPriceCents: p, payments: [] });
    await act(async () => { dry().at(-1)!.resolve({ ...preview(103000), changes: { form: ["theirs", "ours"] },
      years: [y("2027\u201328", "2027-10-01", 3090000), y("2028\u201329", "2028-10-01", 3182700), y("2029\u201330", "2029-10-01", 3262268)] }); }); await flush();
    expect(screen.getByTestId("text-new-season-3").textContent).toContain("2029");
    expect(screen.getByTestId("button-create-renewal").textContent).toContain("Create 3-year draft (2027\u201330)");
    expect(screen.getByTestId("badge-change-form").textContent).toContain("Their form");
  });
  it("sends a new annual price instead of an increase", async () => {
    mount(); await flush(301);
    fireEvent.click(screen.getByTestId("button-price-mode-target"));
    fireEvent.change(screen.getByTestId("input-target-price"), { target: { value: "31,500" } });
    await flush(301);
    const b = dry().at(-1)!.body as Record<string, unknown>;
    expect(b.targetAnnualCents).toBe(3150000); expect(b.increasePct).toBeUndefined();
  });
});
