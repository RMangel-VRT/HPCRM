// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlagsInboxPage from "./FlagsInboxPage";
import { FLAG_STATUSES } from "@shared/schema";
import { flagStatusFromSearch } from "@/lib/flag-navigation";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/useFlagTaxonomy", () => ({
  useFlagTaxonomy: () => ({ tags: [{ value: "other", label: "Other", color: "gray" }], statuses: FLAG_STATUSES }),
  tagMetaFromList: () => ({ label: "Other", color: "gray" }),
}));
afterEach(cleanup);

function setup(path: string) {
  const requested: string[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => {
    const url = String(queryKey[0]); requested.push(url);
    if (url === "/api/flags/unread-count") return { count: 7 };
    if (url.startsWith("/api/flags?")) return { items: [], total: 0, limit: 100, offset: 0 };
    return [];
  } } } });
  const loc = memoryLocation({ path, record: true });
  render(<QueryClientProvider client={client}><Router hook={loc.hook} searchHook={loc.searchHook}><FlagsInboxPage /></Router></QueryClientProvider>);
  return { requested, loc };
}

describe("Flags status URL", () => {
  it.each([
    ["/dashboard/flags", "new"], ["/dashboard/flags?status=resolved", "resolved"],
    ["/dashboard/flags?status=acknowledged", "acknowledged"],
    ["/dashboard/flags?status=in_progress", "in_progress"],
    ["/dashboard/flags?status=dismissed", "dismissed"],
    ["/dashboard/flags?status=all", "all"], ["/dashboard/flags?status=invalid", "new"],
  ])("%s requests %s", async (path, status) => {
    const { requested } = setup(path);
    await screen.findByText("No flags match these filters");
    const url = requested.find(url => url.startsWith("/api/flags?"))!;
    expect(new URLSearchParams(url.split("?")[1]).get("status")).toBe(status === "all" ? null : status);
    expect(screen.getByTestId(`rail-flags-${status}`).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link").filter(link => link.getAttribute("data-testid")?.startsWith("rail-flags-"))).toHaveLength(6);
    expect(screen.queryByTestId("select-flag-status-filter")).toBeNull();
  });
  it("status links preserve unrelated query values and New uses unread count regardless of active filter", async () => {
    const { requested, loc } = setup("/dashboard/flags?status=resolved&keep=a%26b");
    await screen.findByText("No flags match these filters");
    expect(screen.getByTestId("rail-flags-new").textContent).toBe("flags.status.new7");
    fireEvent.click(screen.getByTestId("rail-flags-all"));
    expect(loc.history.at(-1)).toContain("status=all&keep=a%26b");
    await screen.findByText("No flags match these filters");
    expect(requested.some(url => url === "/api/flags?limit=100")).toBe(true);
    fireEvent.click(screen.getByTestId("button-clear-flag-filters"));
    expect(screen.getByTestId("rail-flags-new").getAttribute("aria-current")).toBe("page");
    expect(flagStatusFromSearch("")).toBe("new");
  });
});
