import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { getNavForUser, type NavUser } from "@/components/nav/navConfig";
import "./SectionRouter.css";

export type SectionKey = "estimates" | "bids" | "scheduling" | "invoicing" | "inbox" | "flags" | "contracts" | "mine";
export interface SectionSummary {
  key: SectionKey;
  href: string;
  total: number;
  overdue: number;
  oldest: { label: string; detail: string; href: string } | null;
  flow: null;
}
export interface SectionsResponse { sections: SectionSummary[] }

/** Fixed slot order; never reordered by urgency. */
export const SECTION_ORDER: SectionKey[] = ["estimates", "bids", "scheduling", "invoicing", "inbox", "flags", "contracts", "mine"];
const NAV_KEY: Record<SectionKey, string> = {
  estimates: "estimates", bids: "bids", scheduling: "scheduling", invoicing: "billing", inbox: "inbox",
  flags: "flags", contracts: "contracts", mine: "tickets",
};
const LABEL_KEY: Record<SectionKey, string> = {
  estimates: "nav.estimates", bids: "nav.bids", scheduling: "nav.scheduling", invoicing: "nav.invoicing", inbox: "nav.inbox",
  flags: "nav.flags", contracts: "nav.contracts", mine: "nav.myTickets",
};

export const sectionsQueryKey = (companyId: string | null | undefined, userId: string | null | undefined) =>
  ["/api/dashboard/sections", companyId ?? null, userId ?? null] as const;

export async function fetchSections(): Promise<SectionsResponse> {
  const res = await fetch("/api/dashboard/sections", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
  return res.json();
}

export function permittedSectionKeys(user: NavUser): Set<SectionKey> {
  const navKeys = new Set(getNavForUser(user).flatMap(g => g.items.map(i => i.key)));
  return new Set(SECTION_ORDER.filter(k => navKeys.has(k === "mine" && user.isSuperAdminBool ? "myTickets" : NAV_KEY[k])));
}

export default function SectionRouter() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const enabled = !!user?.activeCompanyId && !!user?.id;
  const { data, isLoading, error, refetch, isFetching } = useQuery<SectionsResponse>({
    queryKey: [...sectionsQueryKey(user?.activeCompanyId, user?.id), user?.activeRole, [...(user?.activeTags ?? [])].sort().join(","), !!user?.isSuperAdminBool, user?.language],
    queryFn: fetchSections,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  if (!user) return null;
  const permitted = permittedSectionKeys({ activeRole: user.activeRole as NavUser["activeRole"], activeTags: user.activeTags, isSuperAdminBool: user.isSuperAdminBool });
  const byKey = new Map((data?.sections ?? []).map(s => [s.key, s]));

  return (
    <section className="section-router" aria-label={t("sectionRouter.title")} data-testid="section-router">
      {error && (
        <div className="section-router__error" role="alert" data-testid="status-sections-error">
          <span>{t("sectionRouter.loadError")}</span>
          <button type="button" onClick={() => refetch()} disabled={isFetching} data-testid="button-retry-sections">
            {t("sectionRouter.retry")}
          </button>
        </div>
      )}
      <div className="section-router__grid">
        {SECTION_ORDER.map(key => {
          if (!permitted.has(key)) {
            return <div key={key} className="sr-tile sr-tile--hidden" aria-hidden="true" data-testid={`slot-hidden-${key}`} />;
          }
          const name = t(LABEL_KEY[key]);
          const s = byKey.get(key);
          if (isLoading || !enabled || error || !s) {
            const state = error ? "error" : isLoading || !enabled ? "loading" : "unavailable";
            return (
              <div key={key} className={`sr-tile sr-tile--${state}`} data-testid={`tile-section-${key}`} data-state={state} aria-busy={state === "loading"}>
                <span className="sr-tile__name">{name}</span>
                <span className="sr-tile__count sr-tile__count--placeholder">{state === "loading" ? <span className="sr-skel" /> : "\u2014"}</span>
                <span className="sr-tile__overdue">&nbsp;</span>
                <span className="sr-tile__flow" />
                <span className="sr-tile__oldest" />
                {key === "estimates" && <span className="sr-tile__value" />}
              </div>
            );
          }
          const empty = s.total === 0;
          const hot = s.overdue > 0;
          const overdueText = hot ? t("sectionRouter.overdue", { count: s.overdue }) : t("sectionRouter.noneOverdue");
          return (
            <Link key={key} href={s.href}
              className={`sr-tile${empty ? " sr-tile--empty" : ""}${hot ? " sr-tile--overdue" : ""}`}
              aria-label={t("sectionRouter.open", { name, total: s.total, overdue: overdueText })}
              data-testid={`tile-section-${key}`} data-state={empty ? "empty" : hot ? "overdue" : "ok"}>
              <span className="sr-tile__name">{name}</span>
              <span className="sr-tile__count" data-testid={`text-section-total-${key}`}>{s.total}</span>
              <span className="sr-tile__overdue" data-testid={`text-section-overdue-${key}`}>{overdueText}</span>
              <span className="sr-tile__flow" data-testid={`slot-section-flow-${key}`} />
              <span className="sr-tile__oldest" data-testid={`text-section-oldest-${key}`}>
                {s.oldest ? (
                  <>
                    <span className="sr-tile__oldest-label">{t("sectionRouter.oldest")}: {s.oldest.label}</span>
                    <span className="sr-tile__oldest-detail">{s.oldest.detail}</span>
                  </>
                ) : t("sectionRouter.nothingWaiting")}
              </span>
              {key === "estimates" && <span className="sr-tile__value" data-testid="slot-estimates-value" />}
            </Link>
          );
        })}
        <div className="sr-tile sr-tile--reserved" aria-disabled="true" data-testid="tile-section-campaigns">
          <span className="sr-tile__name">{t("nav.campaigns")}</span>
          <span className="sr-tile__count sr-tile__count--placeholder" />
          <span className="sr-tile__overdue">{t("sectionRouter.reserved")}</span>
          <span className="sr-tile__flow" />
          <span className="sr-tile__oldest" />
        </div>
      </div>
    </section>
  );
}
