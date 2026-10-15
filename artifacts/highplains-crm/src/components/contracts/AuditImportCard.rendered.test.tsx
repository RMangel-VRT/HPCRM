// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

const fx = vi.hoisted(() => ({ invalidate: vi.fn(), api: vi.fn(), companyId: "company" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: "admin", activeCompanyId: fx.companyId } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.api, queryClient: { invalidateQueries: fx.invalidate } }));
import AuditImportCard, { type ImportReport } from "./AuditImportCard";

function report(mode: "audit" | "renewal" = "audit"): ImportReport {
  return { mode, dryRun: true, errors: [], warnings: [], summary: { customers: 1, agreements: 1, terms: 1,
    replaced: 0, removed: mode === "audit" ? 2 : 0, documents: 2, warnings: 0, errors: 0 },
    removals: mode === "audit" ? [{ id: "old", ref: "branch-1", customerName: "Branch 1", seasons: 2 }] : [],
    customers: [{ customerId: "parent", customerName: "Parent", agreements: [{
      agreementRef: "parent", line: "landscape", form: "theirs", action: mode === "audit" ? "create" : "add renewal",
      terms: [{ contractRef: "term", season: "2026–27", action: mode === "audit" ? undefined : "add renewal", description: "Add 2026–27 to Parent",
        startDate: "2026-01-01", endDate: "2026-12-31", status: "signed", annualPrice: 1680000,
        paymentLines: 2, rates: 0, scope: 0, documents: 2, needsReview: false }],
    }] }],
  };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Router><AuditImportCard /></Router></QueryClientProvider>);
}
function choose(name = "consolidation.zip") {
  fireEvent.change(screen.getByTestId("input-import-files"), { target: { files: [new File(["fixture"], name)] } });
}
beforeEach(() => {
  fx.companyId = "company"; fx.invalidate.mockReset(); fx.api.mockReset().mockResolvedValue({ json: async () => [] });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("mode-aware import Settings", () => {
  it("shows removals before additions, confirms destructive scope and refreshes affected caches after commit", async () => {
    const p = report();
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => p })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...p, dryRun: false, removed: p.removals,
        successes: [{ customerId: "parent", customerName: "Parent", agreements: 1, terms: 1 }], failures: [] }) });
    vi.stubGlobal("fetch", fetcher);
    mount(); choose();
    await userEvent.click(screen.getByTestId("button-preview-import"));
    await screen.findByLabelText("Planned removals");
    expect(screen.getByTestId("summary-removed").textContent).toBe("2");
    expect(screen.getByLabelText("Planned removals").textContent).toContain("Remove branch-1 (Branch 1): 2 seasons");
    expect(screen.getByLabelText("Planned removals").compareDocumentPosition(screen.getByTestId("import-customers")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByTestId("button-import"));
    expect(screen.getByTestId("import-confirmation").textContent).toContain("entire upload succeeds or rolls back together");
    expect(screen.getByTestId("import-confirmation").textContent).toContain("2 imported agreements and their seasons will be removed");
    await userEvent.click(screen.getByTestId("button-confirm-import"));
    await waitFor(() => expect(screen.getByTestId("import-result").textContent).toContain("Removed 1 imported agreements: branch-1"));
    expect(fetcher.mock.calls[1][0]).toBe("/api/admin/contract-center/import?dryRun=false");
    const predicates = fx.invalidate.mock.calls.map(([o]) => o.predicate);
    for (const path of ["/api/contract-center/contracts", "/api/contract-center/contracts/id", "/api/customers", "/api/admin/contract-center/current-export"])
      expect(predicates.some(p => p({ queryKey: [path] }))).toBe(true);
    choose("another.zip"); expect(screen.queryByTestId("import-report")).toBeNull();
    expect((screen.getByTestId("button-import") as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows renewal mode and mode-safe removal diagnostics while disabling Import", async () => {
    const p = report("renewal"); p.errors = [{ file: "remove_agreements.csv", row: 1, message: "remove_agreements.csv is only allowed in audit imports" }];
    p.summary.errors = 1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => p }));
    mount(); choose("renewal.zip"); await userEvent.click(screen.getByTestId("button-preview-import"));
    await screen.findByTestId("import-errors");
    expect(screen.getByTestId("import-report").textContent).toContain("Renewal import");
    expect(screen.getByTestId("import-errors").textContent).toContain("only allowed in audit imports");
    expect(screen.queryByLabelText("Planned removals")).toBeNull();
    expect((screen.getByTestId("button-import") as HTMLButtonElement).disabled).toBe(true);
  });
  it("does not claim removed contracts when the entire upload rolled back", async () => {
    const p = report();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => p })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...p, dryRun: false, summary: { ...p.summary, removed: 0 }, removed: [],
        successes: [], failures: [{ customerId: "", customerName: "Entire upload", error: "Entire upload rolled back; no contracts were removed or imported. Run Preview again." }] }) }));
    mount(); choose(); await userEvent.click(screen.getByTestId("button-preview-import"));
    await screen.findByLabelText("Planned removals"); await userEvent.click(screen.getByTestId("button-import"));
    await userEvent.click(screen.getByTestId("button-confirm-import"));
    await screen.findByTestId("import-failures");
    expect(screen.getByTestId("summary-removed").textContent).toBe("0");
    expect(screen.getByTestId("import-result").textContent).toContain("Entire upload rolled back");
    expect(screen.getByTestId("import-result").textContent).not.toContain("Removed 2");
  });
});
