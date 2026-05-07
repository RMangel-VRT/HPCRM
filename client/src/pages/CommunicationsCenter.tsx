import { useParams, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useAuth } from "@/hooks/use-auth";
import { CommunicationsPageShell, useCommunicationsShell } from "./communications/CommunicationsPageShell";
import { CommunicationsToolbar } from "./communications/CommunicationsToolbar";
import { CommunicationsSecondaryNav } from "./communications/CommunicationsSecondaryNav";
import AllCommunicationsTab from "./communications/AllCommunicationsTab";
import UnsortedTab from "@/components/customer/communications/UnsortedTab";
import InboxTab from "./communications/InboxTab";
import SentTab from "./communications/SentTab";
import { Mail } from "lucide-react";

const VALID_TABS = ["inbox", "sent", "unsorted", "all"] as const;
type Tab = typeof VALID_TABS[number];

function isValidTab(t: string | undefined): t is Tab {
  return VALID_TABS.includes(t as Tab);
}

function UnsortedTabShellWrapper() {
  const { viewAs, setViewAs } = useCommunicationsShell();
  return <UnsortedTab viewAs={viewAs} onViewAsChange={setViewAs} />;
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-3 text-center p-8" data-testid={`placeholder-tab-${label.toLowerCase()}`}>
      <Mail className="w-10 h-10 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground max-w-xs">Coming soon</p>
    </div>
  );
}

interface PaginatedCountResponse {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
}

function CommunicationsCenterInner({ rawTab }: { rawTab: Tab }) {
  const { search, fromDate, toDate, viewAs, setViewAs } = useCommunicationsShell();

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

  return (
    <div className="flex flex-col h-full overflow-hidden -m-6 md:-m-8">
      <CommunicationsToolbar />
      <CommunicationsSecondaryNav counts={{
        inbox: inboxCount,
        sent: sentCount,
        unsorted: undefined,
        all: undefined,
      }} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {rawTab === "inbox" && <InboxTab />}
        {rawTab === "sent" && <SentTab />}
        {rawTab === "unsorted" && <UnsortedTabShellWrapper />}
        {rawTab === "all" && <AllCommunicationsTab />}
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
    return <Redirect to="/dashboard/communications/inbox" />;
  }

  if (!isValidTab(rawTab)) {
    return <Redirect to="/dashboard/communications/inbox" />;
  }

  const isAdminOrOffice = user?.activeRole === "admin" || user?.activeRole === "office";

  if (rawTab === "all" && !isAdminOrOffice) {
    return <Redirect to="/dashboard/communications/inbox" />;
  }

  return (
    <CommunicationsPageShell>
      <CommunicationsCenterInner rawTab={rawTab} />
    </CommunicationsPageShell>
  );
}
