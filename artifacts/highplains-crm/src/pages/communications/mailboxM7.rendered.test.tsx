// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import AllCommunicationsTab from "./AllCommunicationsTab";
import { CommunicationsPageShell } from "./CommunicationsPageShell";
import LegacyMailboxCleanup from "@/components/mailboxes/LegacyMailboxCleanup";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "fixture", activeRole: "admin", accessRole: "admin", activeCompanyId: "co" } }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const wrap = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({
  defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } },
})}>{node}</QueryClientProvider>);

it("lists messages without literal All filters and opens the existing Reply action", async () => {
  const message = { id: "m7-message", type: "email", status: "sent", subject: "Fixture reply", body: "Fixture text",
    createdAt: "2026-11-18T00:00:00Z", direction: "inbound", fromAddress: "fixture@example.test",
    mailboxAccountId: "shared", providerThreadId: "thread", providerMessageId: "<fixture@example.test>" };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/communications") {
      return json(url.searchParams.get("type") === "all" || url.searchParams.get("direction") === "all" ? [] : [message]);
    }
    if (url.pathname === `/api/communications/${message.id}`) return json(message);
    if (url.pathname === "/api/communications/send-options") return json({ mailboxes: [
      { id: "shared", accountType: "shared", displayName: "Office", emailAddress: "office@example.test" },
    ], sharedMailboxId: "shared" });
    if (url.pathname === "/api/customers") return json({ customers: [], total: 0 });
    return json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  wrap(<CommunicationsPageShell><AllCommunicationsTab /></CommunicationsPageShell>);
  fireEvent.click(await screen.findByTestId(`comm-row-${message.id}`));
  fireEvent.click(await screen.findByTestId("button-reply-email"));
  expect(await screen.findByText("compose.replyTitle")).toBeTruthy();
  expect(screen.queryByTestId("button-clear-seed-samples")).toBeNull();
  const listUrls = fetcher.mock.calls.map(([url]) => new URL(String(url), "http://localhost"))
    .filter(url => url.pathname === "/api/communications");
  expect(listUrls.length).toBeGreaterThan(0);
  expect(listUrls.every(url => !url.searchParams.has("type") && !url.searchParams.has("direction"))).toBe(true);
});

it("shows reviewed counts before a separate confirmation and reports the committed counts", async () => {
  let key = "first", commits = 0;
  const counts = { imported: 1, retained: 2, threads: 1, unsorted: 1, syncRuns: 0, backfillRuns: 0, mailboxes: 1 };
  const fetcher = vi.fn(async (url: RequestInfo | URL, opts?: RequestInit) => {
    const pathname = String(url);
    expect(new Headers(opts?.headers).get("X-Company-Id")).toBe("co");
    if (opts?.method === "POST") {
      expect(JSON.parse(String(opts.body))).toEqual({ confirm: true, reviewKey: key });
      commits++;
      if (key === "first") { key = "changed"; return json({ error: "Scope changed" }, 409); }
      return json({ reviewKey: key, counts: { ...counts, imported: 3 } });
    }
    if (pathname.endsWith("/legacy")) return json(commits === 2 ? [] : [
      { id: "removed", accountType: "personal", displayName: "Fixture legacy", emailAddress: "legacy@example.test" },
    ]);
    return json({ reviewKey: key, counts: { ...counts, imported: key === "first" ? 1 : 3 } });
  });
  vi.stubGlobal("fetch", fetcher);
  wrap(<LegacyMailboxCleanup companyId="co" />);
  fireEvent.click(await screen.findByTestId("review-legacy-mailbox-removed"));
  const confirm = await screen.findByTestId("confirm-mailbox-cleanup");
  expect(commits).toBe(0);
  expect(screen.getByTestId("mailbox-cleanup-counts").textContent).toContain("sharedMailbox.counts.imported1");
  fireEvent.click(confirm);
  await screen.findByText("sharedMailbox.reviewAgain");
  await waitFor(() => expect(screen.getByTestId("mailbox-cleanup-counts").textContent).toContain("sharedMailbox.counts.imported3"));
  fireEvent.click(screen.getByTestId("confirm-mailbox-cleanup"));
  await screen.findByTestId("mailbox-cleanup-result");
  expect(commits).toBe(2);
  await waitFor(() => expect(screen.queryByTestId("review-legacy-mailbox-removed")).toBeNull());
});
