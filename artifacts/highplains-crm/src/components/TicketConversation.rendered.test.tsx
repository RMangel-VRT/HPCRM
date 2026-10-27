// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { TicketConversation, type ConversationComment } from "./TicketConversation";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { name: "Test Author" } }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => ({
    "ticketDetail.commentAdded": "Comment added",
    "ticketDetail.sendComment": "Send",
    "tickets.noTicketsFound": "No tickets found",
  }[key] ?? key) }),
}));

const comment = (id: string, day: number, parentCommentId: string | null = null, body = `Body ${id}`): ConversationComment =>
  ({ id, parentCommentId, authorName: `Author ${id}`, body, createdAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z` });
let rows: ConversationComment[];
let fail: boolean;
let posts: { body: string; parentCommentId: string | null }[];
let qc: QueryClient;
beforeEach(() => {
  rows = [];
  posts = [];
  fail = false;
  toast.mockClear();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(["/api/team-members"], [{ id: "bb", name: "Team Mate", email: "team@example.test", role: "office" }]);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      if (fail) return new Response("Could not save", { status: 400 });
      const added = comment(`posted-${posts.length}`, 27, body.parentCommentId, body.body);
      rows.push(added);
      return new Response(JSON.stringify(added));
    }
    if (url === "/api/team-members") return new Response(JSON.stringify(qc.getQueryData(["/api/team-members"])));
    return new Response(JSON.stringify({ comments: rows }));
  }));
});
afterEach(() => { cleanup(); qc.clear(); vi.unstubAllGlobals(); });

function mount(comments: ConversationComment[], compact = false, onViewAll = vi.fn()) {
  return render(<QueryClientProvider client={qc}>
    <TicketConversation ticketId="ticket" comments={comments} compact={compact} onViewAll={onViewAll} />
  </QueryClientProvider>);
}
const messageIds = () => screen.getAllByTestId(/^comment-/).map(el => el.getAttribute("data-testid"));

describe("Shared ticket conversation", () => {
  it("sorts full threads and replies oldest first, promotes orphans, and retains author IDs and mention highlighting", () => {
    mount([
      comment("r2", 8, "b"), comment("c", 10), comment("b", 3),
      comment("orphan", 6, "deleted"), comment("r1", 4, "b", "Hi @[bb:Team Mate]\nComplete reply body"),
      { ...comment("a", 1), authorName: null },
    ]);
    expect(messageIds()).toEqual(["comment-a", "comment-b", "comment-r1", "comment-r2", "comment-orphan", "comment-c"]);
    for (const id of ["a", "b", "r1", "r2", "orphan", "c"]) {
      expect(screen.getByTestId(`text-comment-author-${id}`)).toBeTruthy();
    }
    expect(screen.getByText("?")).toBeTruthy();
    expect(screen.getByText("@Team Mate").getAttribute("data-user-id")).toBe("bb");
    expect(screen.getByText(/Complete reply body/)).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "2 replies" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("comment-r1")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId("comment-r1")).toBeTruthy();
  });
  it("shows the latest three roots with complete replies and full bodies, counting all comments", () => {
    const viewAll = vi.fn();
    const body = "Long untruncated body ".repeat(40);
    mount([comment("d", 9, null, body), comment("a", 1), comment("c", 7), comment("b", 4), comment("r", 5, "b")], true, viewAll);
    expect(messageIds()).toEqual(["comment-b", "comment-r", "comment-c", "comment-d"]);
    expect(screen.getByTestId("comment-d").textContent).toContain(body);
    expect(screen.getByTestId("comment-d").innerHTML).not.toContain("line-clamp");
    fireEvent.click(screen.getByTestId("button-view-all-comments"));
    expect(screen.getByTestId("button-view-all-comments").textContent).toBe("View all 5");
    expect(viewAll).toHaveBeenCalledOnce();
  });
  it("preserves the empty state and always offers the main composer and compact navigation", () => {
    mount([], true);
    expect(screen.getByText("No tickets found")).toBeTruthy();
    expect(screen.getByTestId("input-comment")).toBeTruthy();
    expect(screen.getByTestId("button-view-all-comments").textContent).toBe("View all 0");
    expect((screen.getByTestId("button-add-comment") as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps legacy multi-hop and cyclic comments visible without third-level nesting", () => {
    mount([comment("root", 1), comment("child", 2, "root"), comment("deep", 3, "child"),
      comment("cycle-a", 4, "cycle-b"), comment("cycle-b", 5, "cycle-a")]);
    expect(messageIds()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "2 replies" })).toBeTruthy();
    expect(screen.getByTestId("comment-deep").closest("[id^=replies-]")?.id).toBe("replies-root");
  });
  it("uses the existing mention picker and sends main/reply payloads, invalidating details and clearing only the submitted composer", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    mount([comment("root", 1)]);
    fireEvent.change(screen.getByTestId("input-comment"), { target: { value: "Unsent main" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const reply = screen.getByTestId("input-reply-root");
    await userEvent.type(reply, "@Tea");
    fireEvent.click(await screen.findByTestId("mention-option-bb"));
    expect((reply as HTMLTextAreaElement).value).toBe("@[bb:Team Mate] ");
    fireEvent.click(screen.getByTestId("button-send-reply-root"));
    await waitFor(() => expect(posts).toEqual([{ body: "@[bb:Team Mate]", parentCommentId: "root" }]));
    await waitFor(() => expect(screen.queryByTestId("input-reply-root")).toBeNull());
    expect((screen.getByTestId("input-comment") as HTMLTextAreaElement).value).toBe("Unsent main");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/tickets", "ticket", "details"] });
    fireEvent.click(screen.getByTestId("button-add-comment"));
    await waitFor(() => expect((screen.getByTestId("input-comment") as HTMLTextAreaElement).value).toBe(""));
    expect(posts[1]).toEqual({ body: "Unsent main", parentCommentId: null });
    expect(toast).toHaveBeenCalledWith({ title: "Comment added" });
  });
  it.each(["main", "reply"])("retains the %s draft and displays an error toast on failure", async kind => {
    fail = true;
    mount([comment("root", 1)]);
    if (kind === "reply") fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const input = screen.getByTestId(kind === "main" ? "input-comment" : "input-reply-root");
    fireEvent.change(input, { target: { value: "Keep @[bb:Team Mate]" } });
    fireEvent.click(screen.getByTestId(kind === "main" ? "button-add-comment" : "button-send-reply-root"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed to add comment", description: expect.stringContaining("Could not save"), variant: "destructive",
    })));
    expect((input as HTMLTextAreaElement).value).toBe("Keep @[bb:Team Mate]");
  });
  it("renders new replies after invalidation and retains nesting after remount from persisted data", async () => {
    rows = [comment("root", 1)];
    function LiveConversation() {
      const { data } = useQuery<{ comments: ConversationComment[] }>({
        queryKey: ["/api/tickets", "ticket", "details"],
        queryFn: async () => (await fetch("/api/tickets/ticket/details")).json(),
      });
      return data ? <TicketConversation ticketId="ticket" comments={data.comments} /> : null;
    }
    const first = render(<QueryClientProvider client={qc}><LiveConversation /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByTestId("input-reply-root"), { target: { value: "Persisted reply" } });
    fireEvent.click(screen.getByTestId("button-send-reply-root"));
    await screen.findByTestId("comment-posted-1");
    expect(screen.getByTestId("comment-posted-1").closest("[id^=replies-]")?.id).toBe("replies-root");
    first.unmount();
    qc.removeQueries({ queryKey: ["/api/tickets", "ticket", "details"] });
    render(<QueryClientProvider client={qc}><LiveConversation /></QueryClientProvider>);
    const persisted = await screen.findByTestId("comment-posted-1");
    expect(within(persisted).getByText("Persisted reply")).toBeTruthy();
    expect(persisted.closest("[id^=replies-]")?.id).toBe("replies-root");
  });
});
