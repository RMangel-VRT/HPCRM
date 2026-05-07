// @vitest-environment node
import { describe, it, expect } from "vitest";
import { selectReducer, type SelectState } from "./CrewAssignmentBoard";

const empty = (): SelectState => ({ selected: new Set<string>(), lastClicked: null });

const cardCol = ["a", "b", "c", "d", "e"];

describe("CrewAssignmentBoard.selectReducer", () => {
  it("plain click on empty state selects only that card", () => {
    const next = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    expect([...next.selected]).toEqual(["a"]);
    expect(next.lastClicked).toEqual({ id: "a", col: "u" });
  });

  it("plain click again on the only-selected card toggles it off (clears selection)", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "a", col: "u", columnIds: cardCol });
    expect([...s2.selected]).toEqual([]);
  });

  it("plain click on a different card replaces selection", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "c", col: "u", columnIds: cardCol });
    expect([...s2.selected]).toEqual(["c"]);
  });

  it("cmd/ctrl click toggles cards individually (multi-select)", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "c", col: "u", meta: true, columnIds: cardCol });
    expect([...s2.selected].sort()).toEqual(["a", "c"]);
    const s3 = selectReducer(s2, { type: "click", id: "a", col: "u", meta: true, columnIds: cardCol });
    expect([...s3.selected]).toEqual(["c"]);
  });

  it("shift click range-selects within the same column", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "b", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "d", col: "u", shift: true, columnIds: cardCol });
    expect([...s2.selected].sort()).toEqual(["b", "c", "d"]);
  });

  it("shift click in a different column does not range-extend; falls back to add", () => {
    const otherCol = ["x", "y"];
    const s1 = selectReducer(empty(), { type: "click", id: "b", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "y", col: "crew-1", shift: true, columnIds: otherCol });
    expect([...s2.selected].sort()).toEqual(["b", "y"]);
  });

  it("Esc clears selection", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "b", col: "u", meta: true, columnIds: cardCol });
    const s3 = selectReducer(s2, { type: "escape" });
    expect([...s3.selected]).toEqual([]);
    expect(s3.lastClicked).toBeNull();
  });

  it("drag-start on an unselected card replaces selection with just that card", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "drag-start", id: "c" });
    expect([...s2.selected]).toEqual(["c"]);
  });

  it("drag-start on an already-selected card preserves selection", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "b", col: "u", meta: true, columnIds: cardCol });
    const s3 = selectReducer(s2, { type: "drag-start", id: "a" });
    expect([...s3.selected].sort()).toEqual(["a", "b"]);
  });

  it("drag-success clears selection", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "b", col: "u", meta: true, columnIds: cardCol });
    const s3 = selectReducer(s2, { type: "drag-success" });
    expect([...s3.selected]).toEqual([]);
  });

  it("prune removes ids no longer present and clears lastClicked if it was pruned", () => {
    const s1 = selectReducer(empty(), { type: "click", id: "a", col: "u", columnIds: cardCol });
    const s2 = selectReducer(s1, { type: "click", id: "b", col: "u", meta: true, columnIds: cardCol });
    const s3 = selectReducer(s2, { type: "prune", presentIds: new Set(["b"]) });
    expect([...s3.selected]).toEqual(["b"]);
    expect(s3.lastClicked).toBeNull();
  });
});
