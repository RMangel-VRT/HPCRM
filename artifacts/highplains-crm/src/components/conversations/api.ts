import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCustomerScope } from "@/lib/customerScope";
import { queryClient } from "@/lib/queryClient";
import type { UnsortedEmail } from "@shared/schema";

export type ConversationFilter = "all" | "needs_reply" | "sent";
export type WorkspaceFilter = ConversationFilter | "unsorted";
export type ConversationKind = "estimate" | "inquiry" | "message" | "note" | "call" | "letter" | "sms";

export interface Staff { userId: string; name: string; role: string }

export interface ConversationSummary {
  key: string;
  subject: string;
  customer: { id: string; name: string; type?: string | null; managementCompany?: string | null } | null;
  kind: ConversationKind;
  messageCount: number;
  hasAttachments: boolean;
  lastMessage: { direction: "inbound" | "outbound"; snippet: string; at: string; senderFirstName: string | null };
  needsReply: boolean;
  team: Staff[];
}

export interface ConversationListResponse {
  items: ConversationSummary[];
  counts: { all: number; needs_reply: number; sent: number; unsorted: number };
  page: number;
  pageSize: number;
  mailbox: { id: string; displayName: string; emailAddress: string; syncIntervalMinutes: number } | null;
}

export type MessageLabel = "estimate" | "message" | "reply" | "documents" | "note" | "call" | "sms" | "letter";

export interface ConversationMessage {
  id: string;
  at: string;
  direction: "inbound" | "outbound";
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[] | null;
  label: MessageLabel;
  versionNumber: number | null;
  staff: Staff | null;
  outsideCrm: boolean;
  bodyHtml: string | null;
  bodyText: string | null;
  newHtml: string | null;
  earlierHtml: string | null;
  newText: string;
  earlierText: string;
  snippet: string;
  attachments: { name: string }[];
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
  replyTargetId: string | null;
}

export interface ReplyPreview {
  html: string;
  text: string;
  to: string;
  subject: string;
  greeting: string;
  company: { name: string; addressLine: string; phone: string; email: string; website: string; logoUrl: string | null };
  mailbox: { displayName: string; emailAddress: string };
  staff: Staff | null;
}

const ROOT = "/api/conversations";

export function invalidateConversations() {
  void queryClient.invalidateQueries({ queryKey: [ROOT] });
  void queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
}

export function useConversationList(p: { filter: ConversationFilter; customerId?: string; search: string; page: number; enabled?: boolean }) {
  const scope = useCustomerScope();
  const qs = new URLSearchParams({ filter: p.filter, page: String(p.page) });
  if (p.customerId) qs.set("customerId", p.customerId);
  if (p.search) qs.set("search", p.search);
  return useQuery<ConversationListResponse>({
    queryKey: [ROOT, "list", p.filter, p.customerId ?? null, p.search, p.page, ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<ConversationListResponse>(`${ROOT}?${qs.toString()}`, signal),
    enabled: scope.enabled && p.enabled !== false,
    staleTime: 20_000,
  });
}

export function useConversation(key: string | null, customerId?: string) {
  const scope = useCustomerScope();
  const qs = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  return useQuery<ConversationDetail>({
    queryKey: [ROOT, "detail", key, customerId ?? null, ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<ConversationDetail>(`${ROOT}/${encodeURIComponent(key!)}${qs}`, signal),
    enabled: scope.enabled && !!key,
    staleTime: 15_000,
  });
}

export type PendingUnsorted = UnsortedEmail & {
  newHtml: string | null; earlierHtml: string | null; newText: string; earlierText: string; snippet: string;
};
export function usePendingUnsorted(enabled: boolean, page: number, search: string) {
  const scope = useCustomerScope();
  const qs = new URLSearchParams({ status: "pending", limit: "50", page: String(page), search, conversations: "true" });
  return useQuery<PendingUnsorted[]>({
    queryKey: ["/api/unsorted-emails", "conversations-pending", page, search, ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<PendingUnsorted[]>(`/api/unsorted-emails?${qs}`, signal),
    enabled: scope.enabled && enabled,
    staleTime: 20_000,
  });
}

/** Debounced value via ref-held timer. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setV(value), ms);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, ms]);
  return v;
}

export function useReplyPreview(key: string, parentId: string | null, customerId: string | undefined, body: string) {
  const scope = useCustomerScope();
  const debounced = useDebounced(body, 450);
  const query = useQuery<ReplyPreview>({
    queryKey: [ROOT, "reply-preview", key, parentId, customerId ?? null, debounced, ...scope.scope],
    queryFn: async ({ signal }) =>
      (await scope.request("POST", `${ROOT}/${encodeURIComponent(key)}/reply-preview`, { customerId, parentId, body: debounced }, signal)).json(),
    enabled: scope.enabled && !!parentId,
    placeholderData: (prev, previousQuery) => {
      const previous = previousQuery?.queryKey;
      return previous?.[2] === key && previous[3] === parentId && previous[4] === (customerId ?? null)
        && scope.scope.every((value, index) => previous[6 + index] === value) ? prev : undefined;
    },
    staleTime: 60_000,
    retry: false,
  });
  return { ...query, isCurrent: debounced === body && !!query.data && !query.isPlaceholderData && !query.isError };
}

export function useSendReply(key: string, customerId: string | undefined) {
  const scope = useCustomerScope();
  return useMutation({
    retry: false,
    mutationFn: async (v: { parentId: string; body: string }) => {
      const started = scope.companyId;
      const res = await scope.request("POST", `${ROOT}/${encodeURIComponent(key)}/reply`, { customerId, parentId: v.parentId, body: v.body });
      scope.assertSameCompany(started);
      return (await res.json()) as { id: string; deliveryStatus: string };
    },
    onSuccess: () => invalidateConversations(),
  });
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
