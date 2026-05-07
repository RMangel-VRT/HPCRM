import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock wouter before importing the hook so the hook picks up the mock
const mockSetLocation = vi.fn();
let mockSearch = "";

vi.mock("wouter", () => ({
  useLocation: () => ["/customers/1", mockSetLocation],
  useSearch: () => mockSearch,
}));

// Dynamic import after mock is set up
const { useTabParam } = await import("./useTabParam");

describe("useTabParam", () => {
  beforeEach(() => {
    mockSetLocation.mockClear();
    mockSearch = "";
  });

  it("returns the default tab when no tab param exists in the URL", () => {
    mockSearch = "";
    const { result } = renderHook(() => useTabParam("overview"));
    expect(result.current[0]).toBe("overview");
  });

  it("reads the active tab from the URL search string", () => {
    mockSearch = "?tab=billing";
    const { result } = renderHook(() => useTabParam("overview"));
    expect(result.current[0]).toBe("billing");
  });

  it("preserves all non-tab query params when switching tabs", () => {
    // Start with id, modal, and tab already in the URL
    mockSearch = "?id=123&modal=edit&tab=overview";
    const { result } = renderHook(() => useTabParam("overview"));

    act(() => {
      result.current[1]("billing");
    });

    // setLocation should have been called with ALL params preserved
    expect(mockSetLocation).toHaveBeenCalledTimes(1);
    const calledWith: string = mockSetLocation.mock.calls[0][0];
    const newSearch = new URLSearchParams(calledWith.split("?")[1]);

    expect(newSearch.get("tab")).toBe("billing");
    expect(newSearch.get("id")).toBe("123");
    expect(newSearch.get("modal")).toBe("edit");
  });

  it("only updates the tab key and leaves every other param untouched", () => {
    mockSearch = "?id=456&filter=active&sort=asc&tab=overview";
    const { result } = renderHook(() => useTabParam("overview"));

    act(() => {
      result.current[1]("revenue");
    });

    const calledWith: string = mockSetLocation.mock.calls[0][0];
    const newSearch = new URLSearchParams(calledWith.split("?")[1]);

    expect(newSearch.get("tab")).toBe("revenue");
    expect(newSearch.get("id")).toBe("456");
    expect(newSearch.get("filter")).toBe("active");
    expect(newSearch.get("sort")).toBe("asc");
    // Exactly 4 params — no extras added, none dropped
    expect([...newSearch.keys()]).toHaveLength(4);
  });

  it("adds the tab param without disturbing existing params when no tab was present", () => {
    mockSearch = "?id=789&modal=new";
    const { result } = renderHook(() => useTabParam("overview"));

    act(() => {
      result.current[1]("contacts");
    });

    const calledWith: string = mockSetLocation.mock.calls[0][0];
    const newSearch = new URLSearchParams(calledWith.split("?")[1]);

    expect(newSearch.get("tab")).toBe("contacts");
    expect(newSearch.get("id")).toBe("789");
    expect(newSearch.get("modal")).toBe("new");
    expect([...newSearch.keys()]).toHaveLength(3);
  });
});
