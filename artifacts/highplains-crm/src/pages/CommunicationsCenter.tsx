import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useAuth } from "@/hooks/use-auth";
import { setLastCommsTab } from "@/lib/last-comms-tab";
import { CommunicationsPageShell, useCommunicationsShell } from "./communications/CommunicationsPageShell";
import { CommunicationsToolbar } from "./communications/CommunicationsToolbar";
import { CommunicationsSecondaryNav } from "./communications/CommunicationsSecondaryNav";
import AllCommunicationsTab from "./communications/AllCommunicationsTab";
import UnsortedTab from "@/components/customer/communications/UnsortedTab";
import InboxTab from "./communications/InboxTab";
import SentTab from "./communications/SentTab";
import { QueryPreservingRedirect } from "@/components/nav/QueryPreservingRedirect";

const VALID_TABS = ["inbox", "sent", "unsorted", "all"] as const;
type Tab = typeof VALID_TABS[number];

function isValidTab(t: string | undefined): t is Tab {
  return VALID_TABS.includes(t as Tab);
}

function UnsortedTabShellWrapper() {
  const { viewAs, setViewAs } = useCommunicationsShell();
  return <UnsortedTab viewAs={viewAs} onViewAsChange={setViewAs} />;
}

interface PaginatedCountResponse {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
}

function CommunicationsCenterInner({ rawTab }: { rawTab: Tab }) {
  const { search, fromDate, toDate, viewAs } = useCommunicationsShell();
  const { user } = useAuth();

  function buildCountUrl(direction: "inbound" | "outbound") {
    const p = new URLSearchParams({ page: "1", limit: "1", direction });
    if (search) p.set("search", search);
    if (fromDate) p.set("fromDate", fromDate);
    if (toDate) p.set("toDate", toDate);
    if (viewAs) p.set("viewAs", viewAs);
    return `/api/communications?${p.toString()}`;
  }

  const { data: inboxResponse } = useQuery<PaginatedCountResponse>({
    queryKey: ["/api/communications", "count", "inbound", search, fromDate, toDate, viewAs],
    queryFn: async () => {
      const res = await fetch(buildCountUrl("inbound"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inbox count");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: sentResponse } = useQuery<PaginatedCountResponse>({
    queryKey: ["/api/communications", "count", "outbound", search, fromDate, toDate, viewAs],
    queryFn: async () => {
      const res = await fetch(buildCountUrl("outbound"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sent count");
      return res.json();
    },
    staleTime: 30_000,
  });

  const inboxCount = inboxResponse?.total;
  const sentCount = sentResponse?.total;
  const { data: unsorted } = useQuery<unknown[]>({
    queryKey: ["/api/unsorted-emails", "sidebar-badge"],
    queryFn: async () => {
      const res = await fetch("/api/unsorted-emails?status=pending&limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unsorted count");
      return res.json();
    },
    staleTime: 50_000,
    enabled: ["admin", "office"].includes(user?.activeRole ?? ""),
  });

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 overflow-hidden">
      <CommunicationsSecondaryNav counts={{
        inbox: inboxCount,
        sent: sentCount,
        unsorted: Array.isArray(unsorted) ? unsorted.length : undefined,
        all: undefined,
      }} />
      <div className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden">
      <CommunicationsToolbar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {rawTab === "inbox" && <InboxTab />}
        {rawTab === "sent" && <SentTab />}
        {rawTab === "unsorted" && <UnsortedTabShellWrapper />}
        {rawTab === "all" && <AllCommunicationsTab />}
      </div>
      </div>
    </div>
  );
}

export default function CommunicationsCenter() {
  const params = useParams<{ tab?: string }>();
  const { user } = useAuth();

  useSetBreadcrumbs([{ label: "Communications" }], []);

  const rawTab = params.tab;

  if (!rawTab) {
    return <QueryPreservingRedirect to="/dashboard/communications/inbox" />;
  }

  if (!isValidTab(rawTab)) {
    return <QueryPreservingRedirect to="/dashboard/communications/inbox" />;
  }

  const isAdminOrOffice = user?.activeRole === "admin" || user?.activeRole === "office";

  if (rawTab === "all" && !isAdminOrOffice) {
    return <QueryPreservingRedirect to="/dashboard/communications/inbox" />;
  }

  return (
    <CommunicationsPageShell>
      <CommunicationsCenterRemember tab={rawTab} />
      <CommunicationsCenterInner rawTab={rawTab} />
    </CommunicationsPageShell>
  );
}

function CommunicationsCenterRemember({ tab }: { tab: Tab }) {
  useEffect(() => {
    setLastCommsTab(tab);
  }, [tab]);
  return null;
}
