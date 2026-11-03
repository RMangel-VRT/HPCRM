// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import { ProposalPlantExhibits } from "./ProposalPlantExhibits";
import { DEFAULT_PALETTE_INTRO } from "../../../../lib/db/src/plantExhibitContracts";
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", () => ({ apiRequest: api }));
const models = {
  schedule: [{ quantity: "3.30", name: "Pine", botanicalName: "Pinus", size: "5 gal", imagePath: null }],
  palette: { introText: "", groups: [{ category: "tree", cards: [{ id: "pine", name: "Pine", typeLabel: "Feature tree", imagePath: null }] }] },
  provenance: { estimateId: "e", estimateNumber: "EST-2026-0001", versionId: "v", versionNumber: 2 },
};
const proposal = { id: "p", estimateId: "e", includePlantSchedule: true, includePlantPalette: true, paletteIntroText: null as string | null };
function mount(p = proposal, companyId = "c", identity = "c:u:office") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const location = memoryLocation({ path: "/" });
  const view = render(<QueryClientProvider client={client}><Router hook={location.hook}>
    <ProposalPlantExhibits key={identity} proposal={p} companyId={companyId} identity={identity} />
  </Router></QueryClientProvider>);
  return { client, ...view };
}
beforeEach(() => {
  api.mockImplementation(async () => ({ json: async () => models }));
});
afterEach(async () => { cleanup(); vi.clearAllMocks(); await i18n.changeLanguage("en"); });
describe("linked read-only plant exhibits", () => {
  it("renders provenance, schedule columns, grouped effective labels and estimate links without legacy pickers", async () => {
    mount();
    await screen.findByTestId("estimate-plant-schedule");
    expect(screen.getAllByTestId("exhibits-provenance")[0].textContent).toContain("EST-2026-0001 v2");
    for (const text of ["3.30", "Pinus", "5 gal", "Feature tree", "Trees"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit plants in the estimate" }).getAttribute("href")).toContain("/dashboard/estimates/builder/e");
    expect(screen.queryByTestId("button-attach-palette")).toBeNull();
    expect(screen.queryByTestId("button-open-plant-picker")).toBeNull();
    expect(api.mock.calls[0][3].headers).toMatchObject({ "X-Company-Id": "c" });
  });
  it("saves independent switches, explicit empty intro and null reset; invalidates previews", async () => {
    const { client } = mount();
    await screen.findByTestId("estimate-plant-schedule");
    const invalidation = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("switch", { name: "Include plant schedule" }));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === "PATCH" && c[2].includePlantSchedule === false)).toBe(true));
    await waitFor(() => expect((screen.getByRole("switch", { name: "Include plant palette" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Include plant palette" }));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === "PATCH" && c[2].includePlantPalette === false)).toBe(true));
    await waitFor(() => expect((screen.getByTestId("palette-intro") as HTMLTextAreaElement).disabled).toBe(false));
    expect((screen.getByTestId("palette-intro") as HTMLTextAreaElement).value).toBe(DEFAULT_PALETTE_INTRO);
    fireEvent.change(screen.getByTestId("palette-intro"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save introduction" }));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === "PATCH" && c[2].paletteIntroText === "")).toBe(true));
    await waitFor(() => expect((screen.getByRole("button", { name: "Use default introduction" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Use default introduction" }));
    await waitFor(() => expect(api.mock.calls.some(c => c[0] === "PATCH" && c[2].paletteIntroText === null)).toBe(true));
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["/api/proposal-exhibits", "c", "c:u:office", "p"] });
    for (const c of api.mock.calls.filter(c => c[0] === "PATCH")) expect(c[3].headers["X-Company-Id"]).toBe("c");
  });
  it("keeps explicit empty text, translates loading/error feedback, and does not reuse another identity's preview", async () => {
    const first = mount({ ...proposal, paletteIntroText: "" });
    await screen.findByTestId("estimate-plant-schedule");
    expect((screen.getByTestId("palette-intro") as HTMLTextAreaElement).value).toBe("");
    first.unmount();
    await i18n.changeLanguage("es");
    api.mockRejectedValue(new Error("Denied"));
    mount(proposal, "other-company", "other-company:other-user:office");
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByText("No se pudieron cargar los anexos de plantas.")).toHaveLength(2);
    expect(screen.queryByText("Pinus")).toBeNull();
    expect(api.mock.lastCall?.[3].headers["X-Company-Id"]).toBe("other-company");
  });
});
