import { Button } from "@/components/ui/button";
import { SectionRail, SectionRailLayout, type RailSection } from "@/components/nav/SectionRail";
import { RevenueAccounts } from "@/components/revenue-v2/RevenueAccounts";
import { RevenueGlance } from "@/components/revenue-v2/RevenueGlance";
import { RevenueMonthly } from "@/components/revenue-v2/RevenueMonthly";
import { RevenueQuickBooksBanner } from "@/components/revenue-v2/RevenueQuickBooks";
import { RevenueYearOverYear } from "@/components/revenue-v2/RevenueYearOverYear";
import { revenueQuery, useRevenueRefresh, type RevenueScope } from "@/components/revenue-v2/revenueQueries";
import { useAuth } from "@/hooks/use-auth";
import { useTabParam } from "@/hooks/useTabParam";
import { companyToday } from "@/lib/schedulingStatus";
import {
  getGetRevenueIncomeQueryKey, getGetRevenueIncomeYearsQueryKey, getGetRevenuePlanQueryKey,
  getGetRevenueQboStatusQueryKey, getGetRevenueTargetsQueryKey,
  useGetRevenueIncome, useGetRevenueIncomeYears, useGetRevenuePlan, useGetRevenueQboStatus, useGetRevenueTargets,
} from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";

const incomeTabs = ["glance", "monthly", "yoy"] as const;
type IncomeTab = typeof incomeTabs[number];
type RevenueTab = IncomeTab | "accounts";

function RevenueRetry({ label, retry, id }: { label: string; retry: () => void; id: string }) {
  const { t } = useTranslation();
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm" role="alert">
    <span>{label}</span>
    <Button size="sm" variant="outline" onClick={retry} data-testid={`button-revenue-retry-${id}`}>{t("revenueV2.retry")}</Button>
  </div>;
}

function RevenueWorkspace({ scope }: { scope: RevenueScope }) {
  const { t } = useTranslation();
  const [today, setToday] = useState(companyToday);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(companyToday()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentYear = Number(today.slice(0, 4));
  const [location, navigate] = useLocation();
  const search = useSearch();
  const [requestedTab] = useTabParam("glance");
  const tab: RevenueTab = requestedTab === "accounts" && scope.admin ? "accounts" :
    incomeTabs.find(key => key === requestedTab) ?? "glance";
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const requestedYear = new URLSearchParams(search).get("year") ?? "";
  const year = years.find(value => String(value) === requestedYear) ?? currentYear;
  const yearView = tab === "glance" || tab === "monthly";
  const href = (key: "tab" | "year", value: string) => {
    const params = new URLSearchParams(search);
    params.set(key, value);
    return `${location}?${params.toString()}`;
  };
  const railItem = (key: RevenueTab) => ({ key, label: t(`revenueV2.tabs.${key}`), href: href("tab", key) });
  const sections: RailSection[] = [
    { label: t("revenueV2.income"), items: incomeTabs.map(railItem) },
    ...(scope.admin ? [{ label: t("revenueV2.setup"), items: [railItem("accounts")] }] : []),
  ];

  const refresh = useRevenueRefresh(scope, currentYear);
  const status = useGetRevenueQboStatus(revenueQuery(scope, getGetRevenueQboStatusQueryKey()));
  const incomeParams = { year };
  const trendsParams = { from: currentYear - 4, to: currentYear };
  const income = useGetRevenueIncome(incomeParams, revenueQuery(scope, getGetRevenueIncomeQueryKey(incomeParams), yearView));
  const trends = useGetRevenueIncomeYears(trendsParams, revenueQuery(scope, getGetRevenueIncomeYearsQueryKey(trendsParams), tab === "yoy"));
  const plan = useGetRevenuePlan(year, revenueQuery(scope, getGetRevenuePlanQueryKey(year), tab === "glance" && year === currentYear + 1));
  const hasTargets = tab === "monthly" && income.data?.targetMonths != null;
  const targets = useGetRevenueTargets(year, revenueQuery(scope, getGetRevenueTargetsQueryKey(year), hasTargets));
  const loadedYears = new Set(status.data?.years.map(entry => entry.year));
  const bannerYear = yearView ? year : currentYear;
  const trendsCurrent = trends.data?.years.find(entry => entry.year === currentYear);
  const showBanner = tab !== "accounts";
  const missing = yearView ? income.data?.qboMissing === true :
    !!trendsCurrent?.closedThrough && !!status.data && !loadedYears.has(currentYear);
  const fetchedAt = yearView ? income.data?.qbo.fetchedAt :
    status.data?.years.find(entry => entry.year === currentYear)?.fetchedAt;
  const isLoading = tab === "accounts" ? status.isPending : tab === "yoy" ? trends.isPending || status.isPending :
    income.isPending || (hasTargets && targets.isPending) ||
    (tab === "glance" && year === currentYear + 1 && plan.isPending);
  const error = yearView ? income.isError || (hasTargets && targets.isError) :
    tab === "yoy" && trends.isError;
  const retry = () => {
    if (tab === "yoy") void trends.refetch();
    else {
      if (income.isError) void income.refetch();
      if (hasTargets && targets.isError) void targets.refetch();
    }
  };

  return (
    <SectionRailLayout rail={<SectionRail title={t("revenueV2.title")} sections={sections} activeKey={tab} ariaLabel={t("revenueV2.sections")} />}>
      <div className="revenue-workspace mx-auto w-full min-w-0 max-w-[1500px] space-y-5"
        style={{ containerType: "inline-size", containerName: "revenue" }} data-testid="revenue-page">
        <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="revenue-view-heading">{t(`revenueV2.tabs.${tab}`)}</h1>
          {yearView && <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label={t("revenueV2.year")}>
            {years.map(value => <Button key={value} type="button" size="sm" variant={year === value ? "secondary" : "ghost"}
              className="h-8 px-2.5 tabular-nums" aria-pressed={year === value} data-testid={`button-revenue-year-${value}`}
              onClick={() => { if (year !== value) navigate(href("year", String(value))); }}>{value}</Button>)}
          </div>}
        </header>
        {status.isError && <RevenueRetry label={t("revenueV2.statusError")} retry={() => { void status.refetch(); }} id="status" />}
        {showBanner && <RevenueQuickBooksBanner year={bannerYear} missing={missing} fetchedAt={fetchedAt ?? null}
          unmapped={Math.max(status.data?.unmappedCount ?? 0, yearView ? income.data?.qbo.unmappedCount ?? 0 : 0)}
          connected={status.data?.connected} admin={scope.admin} accountsHref={href("tab", "accounts")} refresh={refresh} />}
        {isLoading && <p role="status" className="text-sm text-muted-foreground">{t("revenueV2.loading")}</p>}
        {error && <RevenueRetry label={t("revenueV2.loadError")} retry={retry} id="income" />}
        {tab === "glance" && year === currentYear + 1 && plan.isError &&
          <RevenueRetry label={t("revenueV2.planError")} retry={() => { void plan.refetch(); }} id="plan" />}
        {!isLoading && !error && (
          <>
            {tab === "glance" && income.data && <RevenueGlance key={year} income={income.data} currentYear={currentYear}
              goalCents={plan.data?.goalCents ?? null} goalUnavailable={plan.isError} priorYearLoaded={loadedYears.has(year - 1)} />}
            {tab === "monthly" && income.data && <RevenueMonthly income={income.data} targets={targets.data ?? null} today={today} />}
            {tab === "yoy" && trends.data && status.data && <RevenueYearOverYear trends={trends.data} currentYear={currentYear} loadedYears={loadedYears} />}
            {tab === "accounts" && scope.admin && status.data && <RevenueAccounts scope={scope} currentYear={currentYear}
              status={status.data} refresh={refresh} />}
          </>
        )}
      </div>
    </SectionRailLayout>
  );
}

export default function RevenuePage() {
  const { user } = useAuth();
  if (!user?.activeCompanyId || (user.accessRole !== "admin" && user.accessRole !== "office")) return null;
  const scope = { companyId: user.activeCompanyId, userId: user.id, admin: user.accessRole === "admin" };
  return <RevenueWorkspace key={JSON.stringify([scope.companyId, scope.userId, scope.admin])} scope={scope} />;
}
