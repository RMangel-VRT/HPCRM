// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CommunicationWithDetails } from "@shared/schema";
import ComposeDrawer from "./ComposeDrawer";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: {
  id: "u", activeCompanyId: "co", activeCompany: { name: "Example Landscapes" },
} }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }), toast: fx.toast }));
vi.mock("@/lib/queryClient", async original => ({ ...await original<object>(), apiRequest: fx.api }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let qc: QueryClient;
const json = (value: unknown) => new Response(JSON.stringify(value));
beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fx.api.mockImplementation(async (_method, url) => {
    if (url === "/api/communication-templates") return json([]);
    if (url.includes("customers?page")) return json({ customers: [], total: 0 });
    if (url.endsWith("send-options")) return json({ sharedMailboxId: "office", mailboxes: [
      { id: "office", emailAddress: "office@example.test", displayName: "Office", accountType: "shared" },
    ] });
    if (url.endsWith("/preview")) return json({ subject: "Message", html: "<p>Branded plan</p>", text: "Branded plan" });
    if (url.endsWith("/send")) return json({ id: "draft", deliveryStatus: "sent" });
    if (url === "/api/communications") return json({ id: "draft" });
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(() => { cleanup(); qc.clear(); });
const open = (replyTo?: CommunicationWithDetails) =>
  render(<QueryClientProvider client={qc}><ComposeDrawer open onClose={fx.close} replyTo={replyTo} /></QueryClientProvider>);

it("opens a sandboxed read-only preview, then sends the saved draft with a company guard", async () => {
  open();
  fireEvent.change(screen.getByTestId("input-recipient-email"), { target: { value: "to@example.test" } });
  fireEvent.change(screen.getByTestId("input-subject"), { target: { value: "Message" } });
  fireEvent.change(screen.getByTestId("input-body"), { target: { value: "Branded plan" } });
  fireEvent.click(screen.getByRole("button", { name: "emailPreview.title" }));
  expect((await screen.findByTitle("emailPreview.title")).getAttribute("sandbox")).toBe("");
  expect(fx.api.mock.calls.some(([, url]) => url === "/api/communications")).toBe(false);
  fireEvent.click(screen.getByTestId("button-send"));
  await waitFor(() => expect(fx.close).toHaveBeenCalled());
  expect(fx.api.mock.calls.find(([, url]) => url === "/api/communications")?.[2]).toMatchObject({
    recipientEmail: "to@example.test", subject: "Message", body: "Branded plan", status: "draft",
  });
  expect(fx.api).toHaveBeenCalledWith("POST", "/api/communications/draft/send", {}, { headers: { "X-Company-Id": "co" } });
  expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "compose.sent" }));
});

it("replies from the parent mailbox without a branded preview and shows recorded failure", async () => {
  open({ id: "parent", mailboxAccountId: "office", threadId: "thread", subject: "Message", fromAddress: "to@example.test",
    direction: "inbound", body: "Original" } as CommunicationWithDetails);
  expect(screen.queryByRole("button", { name: "emailPreview.title" })).toBeNull();
  expect((screen.getByTestId("input-recipient-email") as HTMLInputElement).value).toBe("to@example.test");
  expect((screen.getByTestId("input-subject") as HTMLInputElement).readOnly).toBe(true);
  const previous = fx.api.getMockImplementation()!;
  fx.api.mockImplementation((...args) => args[1].endsWith("/send")
    ? Promise.resolve(json({ deliveryStatus: "failed", failureReason: "Reconnect Gmail" })) : previous(...args));
  fireEvent.change(screen.getByTestId("input-body"), { target: { value: "Reply body" } });
  fireEvent.click(screen.getByTestId("button-send"));
  await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({
    title: "compose.deliveryFailed", description: "Reconnect Gmail", variant: "destructive",
  })));
  expect(fx.api.mock.calls.find(([, url]) => url === "/api/communications")?.[2]).toMatchObject({
    subject: "Re: Message", inReplyTo: "parent", threadId: "thread", mailboxAccountId: "office",
  });
});
