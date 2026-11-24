import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import type { RevenueRefresh } from "./revenueQueries";

export function RevenueQuickBooksResults({ refresh }: { refresh: RevenueRefresh }) {
  const { t } = useTranslation();
  if (!refresh.results.length) return null;
  return (
    <ul aria-label={t("revenueV2.qbo.results")} aria-live="polite" className="space-y-1 text-sm">
      {refresh.results.map(({ year, state }) => (
        <li key={year} data-testid={`revenue-refresh-result-${year}`} className="flex gap-2">
          <span className="font-medium tabular-nums">{year}</span>
          <span className={["failed", "companyChanged", "permissionChanged", "disconnected"].includes(state) ? "text-destructive" : "text-muted-foreground"}>
            {t(`revenueV2.qbo.${state}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RevenueQuickBooksBanner(props: {
  year: number; missing: boolean; fetchedAt: string | null;
  unmapped: number; connected?: boolean; admin: boolean; accountsHref: string;
  refresh: RevenueRefresh;
}) {
  const { t, i18n } = useTranslation();
  const { year, missing, fetchedAt, unmapped, connected, admin, accountsHref, refresh } = props;
  const action = (kind: "load" | "refresh") => admin && connected && (
    <Button type="button" variant={kind === "load" ? "outline" : "ghost"} size="sm"
      className={kind === "refresh" ? "h-auto p-0 text-primary hover:underline" : undefined}
      data-testid={`button-revenue-qbo-${kind}`} disabled={refresh.busy} onClick={() => void refresh.load([year])}>
      {t(`revenueV2.qbo.${kind}`)}
    </Button>
  );
  const date = fetchedAt && new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium", timeZone: "America/Denver",
  }).format(new Date(fetchedAt));
  if (!missing && !unmapped && !date && !refresh.results.length) return null;
  return (
    <div className="space-y-2" data-testid="revenue-qbo-banner">
      {(missing || unmapped > 0) && (
        <div className="space-y-2 rounded-lg border border-amber-600/35 bg-amber-500/10 px-3.5 py-2.5 text-sm">
          {missing && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="revenue-qbo-missing">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span className="flex-1 basis-40 font-medium">{t("revenueV2.qbo.missing", { year })}</span>
              {action("load")}
              {admin && connected === false && <Link href="/dashboard/settings/features" className="text-primary underline" data-testid="link-revenue-qbo-connect">{t("revenueV2.qbo.connectHint")}</Link>}
            </div>
          )}
          {unmapped > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="revenue-qbo-unmapped">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span className="flex-1 basis-40">{t("revenueV2.qbo.unmapped", { count: unmapped })}</span>
              {admin && <Link href={accountsHref} className="text-primary underline" data-testid="link-revenue-qbo-assign">{t("revenueV2.qbo.assign")}</Link>}
            </div>
          )}
        </div>
      )}
      {date && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="revenue-qbo-fresh">
        <span>{t("revenueV2.qbo.asOf", { date })}</span>
        {admin && connected && <><span aria-hidden="true">·</span>{action("refresh")}</>}
      </div>}
      <RevenueQuickBooksResults refresh={refresh} />
    </div>
  );
}
