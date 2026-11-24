import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  getListRevenueQboAccountsQueryKey,
  useListRevenueQboAccounts,
  type RevenueQboAccount,
  type RevenueQboStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { INCOME_ACCOUNT_STREAMS, type IncomeAccountStream } from "../../../../../lib/db/src/revenueStreams";
import { RevenueQuickBooksResults } from "./RevenueQuickBooks";
import {
  revenueKey, revenuePrefix, revenueQuery, responseStatus, useRevenueMappingSave,
  type RevenueRefresh, type RevenueScope,
} from "./revenueQueries";

const UNASSIGNED = "unassigned";

function AccountMappings({ accounts, connected, loaded, year, scope }: {
  accounts: RevenueQboAccount[]; connected: boolean; loaded: boolean; year: number; scope: RevenueScope;
}) {
  const { t, i18n } = useTranslation();
  const cache = useQueryClient();
  const mutation = useRevenueMappingSave(scope);
  const form = useForm<{ mappings: Record<string, IncomeAccountStream | null> }>({ defaultValues: { mappings: {} } });
  const mappings = useWatch({ control: form.control, name: "mappings" });
  const [notice, setNotice] = useState<"saved" | "saveError" | "companyChanged" | "permissionChanged" | null>(null);
  const ordered = [...accounts].sort((a, b) => Number(a.stream !== null) - Number(b.stream !== null) || a.name.localeCompare(b.name, i18n.language));
  const changes = ordered.flatMap(({ qboAccountId, stream }) => {
    const next = Object.hasOwn(mappings, qboAccountId) ? mappings[qboAccountId] : stream;
    return next === stream ? [] : [{ qboAccountId, stream: next }];
  });
  const money = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" });
  const saving = form.formState.isSubmitting || mutation.isPending;

  async function save() {
    if (!changes.length || saving) return;
    setNotice(null);
    try {
      await mutation.save(changes);
      const updated = new Map(changes.map(change => [change.qboAccountId, change.stream]));
      cache.setQueryData<RevenueQboAccount[]>(revenueKey(scope, getListRevenueQboAccountsQueryKey()), existing =>
        existing?.map(account => updated.has(account.qboAccountId) ? { ...account, stream: updated.get(account.qboAccountId)! } : account));
      form.reset();
      setNotice("saved");
      void cache.invalidateQueries({ queryKey: revenuePrefix(scope) });
    } catch (error) {
      const status = responseStatus(error);
      setNotice(status === 409 ? "companyChanged" : status === 401 || status === 403 ? "permissionChanged" : "saveError");
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(save)}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("revenueV2.accounts.description")}</p>
              {!loaded && <p className="text-xs text-muted-foreground">{t("revenueV2.accounts.previousNotLoaded", { year })}</p>}
            </div>
            <Button type="submit" size="sm" disabled={!changes.length || saving} data-testid="button-revenue-save-mappings">
              {t(saving ? "revenueV2.accounts.saving" : "revenueV2.accounts.save")}
            </Button>
            {notice && <p className={`w-full text-sm ${notice === "saved" ? "text-muted-foreground" : "text-destructive"}`}
              role={notice === "saved" ? "status" : "alert"} data-testid="revenue-mapping-notice">
              {t(`revenueV2.${notice === "companyChanged" || notice === "permissionChanged" ? "qbo" : "accounts"}.${notice}`)}
            </p>}
          </div>
          {ordered.length > 0 ? (
            <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={t("revenueV2.tabs.accounts")}>
              <table className="w-full min-w-[540px] text-left text-sm" data-testid="revenue-account-table">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">{t("revenueV2.accounts.name")}</th>
                    <th scope="col" className="px-4 py-3">{t("revenueV2.accounts.status")}</th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 text-right">{t("revenueV2.accounts.previousAmount", { year })}</th>
                    <th scope="col" className="px-4 py-3">{t("revenueV2.accounts.stream")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(account => {
                    const id = account.qboAccountId;
                    const stream = Object.hasOwn(mappings, id) ? mappings[id] : account.stream;
                    return (
                      <tr key={id} className="border-t" data-testid={`revenue-account-${id}`}>
                        <th scope="row" className="px-4 py-3 font-medium">
                          <span className="mr-2">{account.name}</span>
                          {account.stream === null && <Badge variant="outline" className="border-amber-600/50 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                            {t("revenueV2.accounts.unassigned")}
                          </Badge>}
                        </th>
                        <td className="px-4 py-3 text-muted-foreground">{t(`revenueV2.accounts.${connected ? account.active ? "active" : "inactive" : "unavailable"}`)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {loaded ? money.format(account.lastYearCents / 100) : <span title={t("revenueV2.accounts.unavailable")}>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                            aria-label={t("revenueV2.accounts.streamFor", { name: account.name })}
                            data-testid={`select-revenue-account-${id}`} value={stream ?? UNASSIGNED} disabled={saving}
                            onChange={event => {
                              const value = event.currentTarget.value;
                              const next = value === UNASSIGNED ? null : INCOME_ACCOUNT_STREAMS.find(key => key === value);
                              if (next === undefined) return;
                              form.setValue("mappings", { ...form.getValues("mappings"), [id]: next }, { shouldDirty: true });
                              setNotice(null);
                            }}>
                            <option value={UNASSIGNED}>{t("revenueV2.accounts.unassigned")}</option>
                            {INCOME_ACCOUNT_STREAMS.map(key => <option key={key} value={key}>{t(key === "exclude" ? "revenueV2.accounts.exclude" : `revenueV2.views.streams.${key}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="p-4 text-sm text-muted-foreground">{t("revenueV2.accounts.empty")}</p>}
        </form>
      </Form>
    </Card>
  );
}

export function RevenueAccounts({ status, scope, currentYear, refresh }: {
  status: RevenueQboStatus; scope: RevenueScope; currentYear: number; refresh: RevenueRefresh;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState(5);
  const accounts = useListRevenueQboAccounts(revenueQuery(scope, getListRevenueQboAccountsQueryKey(), scope.admin));
  const previousYear = currentYear - 1;
  const years = Array.from({ length: 5 }, (_, index) => currentYear - index).filter(year => year >= 2015);
  const selected = years.slice(0, count);

  return (
    <div className="space-y-4">
      {!status.connected ? (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">{t("revenueV2.qbo.disconnected")}</h2>
          <p className="text-sm text-muted-foreground">{t("revenueV2.qbo.connectHint")}</p>
          <Link href="/dashboard/settings/features" className="inline-block text-sm text-primary underline" data-testid="link-revenue-setup-connect">
            {t("revenueV2.qbo.openSettings")}
          </Link>
          <RevenueQuickBooksResults refresh={refresh} />
        </Card>
      ) : <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-semibold">{t("revenueV2.qbo.loadHistory")}</h2>
            <p className="text-sm text-muted-foreground">{selected.length === 1
              ? t("revenueV2.qbo.historyHelpSingle", { year: currentYear })
              : t("revenueV2.qbo.historyHelp", { from: selected.at(-1), to: currentYear })}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("revenueV2.qbo.historyYears")}
              <select className="h-9 rounded-md border bg-background px-2 text-sm"
                value={Math.min(count, years.length)} disabled={refresh.busy}
                data-testid="select-revenue-history-years" onChange={event => setCount(Number(event.currentTarget.value))}>
                {years.map((year, index) => <option key={year} value={index + 1}>{index + 1}</option>)}
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" disabled={refresh.busy}
              data-testid="button-revenue-load-history" onClick={() => void refresh.load(selected)}>
              {t("revenueV2.qbo.loadHistory")}
            </Button>
          </div>
        </div>
        <RevenueQuickBooksResults refresh={refresh} />
      </Card>}
      {accounts.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{t("revenueV2.accounts.loadError")}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void accounts.refetch()} data-testid="button-revenue-retry-accounts">{t("revenueV2.retry")}</Button>
      </div>}
      {accounts.data ? <AccountMappings accounts={accounts.data} scope={scope} year={previousYear} connected={status.connected}
        loaded={status.years.some(entry => entry.year === previousYear)} />
        : accounts.isPending && <p role="status" className="text-sm text-muted-foreground">{t("revenueV2.loading")}</p>}
    </div>
  );
}
