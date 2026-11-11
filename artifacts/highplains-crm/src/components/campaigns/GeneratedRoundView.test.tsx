// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import GeneratedRoundView from "./GeneratedRoundView";
import { RoundProjectionsView } from "@/components/scheduling/RoundProjections";
import type { RoundListsResponse } from "@/lib/roundLists";
import "@/i18n";

const state = vi.hoisted(() => ({ data: null as RoundListsResponse | null, move: vi.fn(), start: vi.fn(), dates: vi.fn(), copy: vi.fn(), add: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-round-lists", () => ({
  useRoundLists: () => ({ data: state.data }),
  useStandingCrews: () => ({ data: [{ id: "a", name: "Crew A", isActive: true }, { id: "b", name: "Crew B", isActive: true }] }),
  useRoundCalendar: () => ({ data: { rounds: [], chemicalItems: [] } }),
  useRoundActions: () => ({
    move: { mutate: state.move }, start: { mutate: state.start }, dates: { mutate: state.dates },
    copySplit: { mutate: state.copy }, addCrew: { mutate: state.add },
  }),
}));
function mount() {
  return render(<Router hook={memoryLocation({ path: "/" }).hook}><GeneratedRoundView campaignId="r" /></Router>);
}
beforeEach(() => {
  vi.clearAllMocks();
  state.data = {
    campaign: { id: "r", title: "June round", category: "general", source: "contract", windowStart: "2027-06-01", windowEnd: "2027-06-30", startedAt: null, status: "active" },
    canManage: true, today: "2027-06-01",
    teams: [{ id: "ta", crewId: "a", name: "Crew A", color: "#123456" }, { id: "tb", crewId: "b", name: "Crew B", color: "#654321" }],
    items: [
      { id: "p1", customerName: "First property", status: "pending", assignedCampaignCrewId: "ta", crewPosition: 0 },
      { id: "p2", customerName: "Second property", status: "pending", assignedCampaignCrewId: "ta", crewPosition: 1 },
      { id: "p3", customerName: "Unassigned property", status: "pending", assignedCampaignCrewId: null, crewPosition: 0 },
      { id: "done", customerName: "Finished property", status: "completed", assignedCampaignCrewId: "ta", crewPosition: null },
    ],
  };
});
afterEach(cleanup);
describe("generated crew list interactions", () => {
  it("separates history from priority and reorders with the exact insertion contract", () => {
    mount();
    expect(screen.getByTestId("closed-ta").textContent).toContain("Finished property");
    expect(screen.queryByTestId("row-round-item-done")).toBeNull();
    fireEvent.click(screen.getByTestId("button-round-up-p2"));
    expect(state.move).toHaveBeenCalledWith({ itemIds: ["p2"], assignedCampaignCrewId: "ta", beforeItemId: "p1" }, expect.any(Object));
  });
  it("moves a multi-selection across crews in visible order", () => {
    mount();
    fireEvent.click(screen.getByTestId("checkbox-round-item-p2"));
    fireEvent.click(screen.getByTestId("checkbox-round-item-p1"));
    fireEvent.change(screen.getByTestId("select-move-target"), { target: { value: "tb" } });
    fireEvent.click(screen.getByTestId("button-move-selected"));
    expect(state.move).toHaveBeenCalledWith({ itemIds: ["p1", "p2"], assignedCampaignCrewId: "tb" }, expect.any(Object));
  });
  it("uses the native drag payload to insert before a row or append after its lower half", () => {
    mount();
    const transfer = { effectAllowed: "", setData: vi.fn() };
    const first = screen.getByTestId("row-round-item-p1"), second = screen.getByTestId("row-round-item-p2");
    fireEvent.dragStart(second, { dataTransfer: transfer });
    fireEvent.drop(first, { clientY: 0 });
    expect(state.move).toHaveBeenLastCalledWith({ itemIds: ["p2"], assignedCampaignCrewId: "ta", beforeItemId: "p1" }, expect.any(Object));
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue({ top: 10, height: 20 } as DOMRect);
    fireEvent.dragStart(first, { dataTransfer: transfer });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "clientY", { value: 25 });
    fireEvent(second, drop);
    expect(state.move).toHaveBeenLastCalledWith({ itemIds: ["p1"], assignedCampaignCrewId: "ta", beforeItemId: null }, expect.any(Object));
  });
  it("prepends when dropped on a lane heading and preserves a self-dropped selection", () => {
    mount();
    const transfer = { effectAllowed: "", setData: vi.fn() };
    const lane = screen.getByTestId("lane-round-ta"), second = screen.getByTestId("row-round-item-p2");
    vi.spyOn(lane.querySelector("ol")!, "getBoundingClientRect").mockReturnValue({ top: 50 } as DOMRect);
    fireEvent.dragStart(second, { dataTransfer: transfer });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "clientY", { value: 20 });
    fireEvent(lane, drop);
    expect(state.move).toHaveBeenLastCalledWith({ itemIds: ["p2"], assignedCampaignCrewId: "ta", beforeItemId: "p1" }, expect.any(Object));
    state.move.mockClear();
    fireEvent.click(screen.getByTestId("checkbox-round-item-p1"));
    fireEvent.click(screen.getByTestId("checkbox-round-item-p2"));
    fireEvent.dragStart(second, { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId("row-round-item-p1"));
    expect(state.move).not.toHaveBeenCalled();
  });
  it("requires a start confirmation with unassigned warning and sends no notices", () => {
    mount(); fireEvent.click(screen.getByTestId("button-start-round"));
    expect(state.start).not.toHaveBeenCalled();
    expect(screen.getByTestId("text-start-warnings").textContent).toContain("1 unassigned property");
    fireEvent.click(screen.getByTestId("button-confirm-start-round"));
    expect(state.start).toHaveBeenCalledTimes(1);
  });
  it("keeps field users read-only while allowing property-detail navigation", () => {
    state.data!.canManage = false;
    mount();
    expect(screen.queryByTestId("round-manage-bar")).toBeNull();
    expect(screen.queryByTestId("checkbox-round-item-p1")).toBeNull();
    expect(screen.getByTestId("link-round-item-p1").getAttribute("href")).toBe("/dashboard/campaigns/r/items/p1");
  });
  it("projects windows and chemical target dates as non-draggable links without capacity controls", () => {
    render(<Router hook={memoryLocation({ path: "/" }).hook}>
      <RoundProjectionsView days={["2027-06-01", "2027-06-02"]} today="2027-06-01"
        crews={[{ id: "a", name: "Crew A", color: "#123456" }]} data={{
          rounds: [{ ...state.data!.campaign, teams: state.data!.teams, remaining: 3, unassigned: 1 }],
          chemicalItems: [{ id: "chem", campaignId: "r", customerName: "Chemical property", targetDate: "2027-06-02", backupDate: "2027-06-03", crewId: "a", assignedCampaignCrewId: "ta", status: "pending" }],
        }} />
    </Router>);
    expect(screen.getByTestId("link-unassigned-round-r")).toBeTruthy();
    const chemical = screen.getByTestId("card-chem-target-chem");
    expect(chemical.getAttribute("href")).toBe("/dashboard/campaigns/r/items/chem");
    expect(chemical.closest('[draggable="true"]')).toBeNull();
    expect(screen.getByTestId("bar-round-r-a")).toBeTruthy();
  });
});
