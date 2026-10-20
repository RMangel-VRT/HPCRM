// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { CommunicationsPageShell, useCommunicationsShell } from "./CommunicationsPageShell";
import { CommunicationsSecondaryNav, communicationsHref } from "./CommunicationsSecondaryNav";
import { getLastCommsTab, setLastCommsTab, commsTabHref } from "@/lib/last-comms-tab";

let role = "admin";
let tab = "inbox";
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: role } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", async original => ({
  ...await original<typeof import("wouter")>(),
  useParams: () => ({ tab }),
}));
afterEach(() => { cleanup(); localStorage.clear(); });
function State() {
  const [path] = useLocation();
  const filters = useCommunicationsShell();
  return <p data-testid="state">{path}|{JSON.stringify(filters)}</p>;
}
describe("communications rail", () => {
  it.each(["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"])("%s sees authorized views", viewer => {
    role = viewer;
    render(<Router><CommunicationsPageShell><CommunicationsSecondaryNav counts={{ inbox: 5, sent: 0 }} /></CommunicationsPageShell></Router>);
    expect(screen.getAllByRole("link")).toHaveLength(["admin", "office"].includes(role) ? 4 : 3);
    expect(screen.getByTestId("rail-comms-inbox").textContent).toBe("comms.inbox5");
    expect(screen.getByTestId("rail-comms-sent").textContent).toBe("comms.sent0");
  });
  it.each(["inbox", "unsorted", "sent", "all"])("marks %s active", active => {
    role = "admin"; tab = active;
    render(<Router><CommunicationsPageShell><CommunicationsSecondaryNav /></CommunicationsPageShell></Router>);
    expect(screen.getByTestId(`rail-comms-${active}`).getAttribute("aria-current")).toBe("page");
  });
  it("Inbox → Sent preserves search, dates and viewAs in href and shell after click", () => {
    role = "admin"; tab = "inbox";
    const loc = memoryLocation({ path: "/dashboard/communications/inbox?q=a%26b&from=2026-10-01&to=2026-10-20&viewAs=user-1", record: true });
    render(<Router hook={loc.hook} searchHook={loc.searchHook}><CommunicationsPageShell><CommunicationsSecondaryNav /><State /></CommunicationsPageShell></Router>);
    const link = screen.getByTestId("rail-comms-sent");
    expect(link.getAttribute("href")).toBe("/dashboard/communications/sent?q=a%26b&from=2026-10-01&to=2026-10-20&viewAs=user-1");
    fireEvent.click(link);
    expect(screen.getByTestId("state").textContent).toContain('/dashboard/communications/sent|{"search":"a&b","fromDate":"2026-10-01","toDate":"2026-10-20","viewAs":"user-1"}');
  });
  it("does not append empty filters and keeps last-section sidebar destination", () => {
    expect(communicationsHref("sent", { search: "", fromDate: "", toDate: "", viewAs: "" })).toBe("/dashboard/communications/sent");
    setLastCommsTab("unsorted");
    expect(commsTabHref(getLastCommsTab())).toBe("/dashboard/communications/unsorted");
  });
});
