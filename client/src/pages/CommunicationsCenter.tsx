import { useParams, Redirect } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useAuth } from "@/hooks/use-auth";
import { CommunicationsPageShell } from "./communications/CommunicationsPageShell";
import { CommunicationsToolbar } from "./communications/CommunicationsToolbar";
import { CommunicationsSecondaryNav } from "./communications/CommunicationsSecondaryNav";
import AllCommunicationsTab from "./communications/AllCommunicationsTab";
import { Mail } from "lucide-react";

const VALID_TABS = ["inbox", "sent", "unsorted", "all"] as const;
type Tab = typeof VALID_TABS[number];

function isValidTab(t: string | undefined): t is Tab {
  return VALID_TABS.includes(t as Tab);
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
      <div className="flex flex-col h-full overflow-hidden -m-6 md:-m-8">
        <CommunicationsToolbar />
        <CommunicationsSecondaryNav counts={{ inbox: 0, sent: 0, unsorted: 0, all: 0 }} />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {rawTab === "inbox" && <PlaceholderTab label="Inbox" />}
          {rawTab === "sent" && <PlaceholderTab label="Sent" />}
          {rawTab === "unsorted" && <PlaceholderTab label="Unsorted" />}
          {rawTab === "all" && <AllCommunicationsTab />}
        </div>
      </div>
    </CommunicationsPageShell>
  );
}
