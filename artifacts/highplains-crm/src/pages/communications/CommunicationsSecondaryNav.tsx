import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { SectionRail } from "@/components/nav/SectionRail";
import { useCommunicationsShell } from "./CommunicationsPageShell";

export const COMMS_VIEWS = ["inbox", "unsorted", "sent", "all"] as const;
export type CommsView = typeof COMMS_VIEWS[number];

export function communicationsHref(tab: CommsView, filters: {
  search: string; fromDate: string; toDate: string; viewAs: string;
}) {
  const p = new URLSearchParams();
  if (filters.search) p.set("q", filters.search);
  if (filters.fromDate) p.set("from", filters.fromDate);
  if (filters.toDate) p.set("to", filters.toDate);
  if (filters.viewAs) p.set("viewAs", filters.viewAs);
  return `/dashboard/communications/${tab}${p.size ? `?${p}` : ""}`;
}

export function CommunicationsSecondaryNav({ counts = {} }: { counts?: Partial<Record<CommsView, number>> }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const filters = useCommunicationsShell();
  const params = useParams<{ tab?: string }>();
  const activeTab = COMMS_VIEWS.includes(params.tab as CommsView) ? params.tab! : "inbox";
  const items = COMMS_VIEWS.filter(tab => tab !== "all" || ["admin", "office"].includes(user?.activeRole ?? ""))
    .map(tab => ({ key: `comms-${tab}`, label: t(`comms.${tab}`),
      href: communicationsHref(tab, filters), badge: counts[tab] }));
  return <SectionRail title={t("nav.inbox")} ariaLabel={t("nav.inbox")}
    activeKey={`comms-${activeTab}`} sections={[{ items }]} />;
}
