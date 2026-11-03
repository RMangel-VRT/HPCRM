import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MissingFieldsNotice } from "@/components/customerWizard/FinishSetupBanner";
import { activationError, type MissingField } from "@/components/customerWizard/wizardModel";
import { AlertTriangle, Download, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { coloradoToday, addDays } from "@/components/contracts/contractFormat";
import { ContractViewSwitch } from "@/components/contracts/ContractViewSwitch";
import {
  CARD_ORDER, activeCustomerDate, buildCsv, cardTestId, downloadCsv, lastEnded, lineHref, lineText, lineTone, visibleRows,
} from "@/components/contracts/activeCustomers";
import type { ActiveCard, LineFilter, Tone } from "@/components/contracts/activeCustomers";
import type { ActiveCustomerRow, ActiveCustomersResponse, LineState } from "../../../../lib/db/src/activeCustomers";

export const ACTIVE_CUSTOMERS_URL = "/api/contract-center/active-customers";
export const activeCustomersUrl = (asOf: string) => `${ACTIVE_CUSTOMERS_URL}?asOf=${encodeURIComponent(asOf)}`;
/** Company-scoped key: a company switch never reuses another company's rows. */
export const activeCustomersKey = (companyId: string | null | undefined, userId: string | number | null | undefined, asOf: string) =>
  [ACTIVE_CUSTOMERS_URL, companyId ?? null, userId ?? null, asOf] as const;

const TONE: Record<Tone, string> = {
  green: "bg-emerald-600", amber: "bg-amber-500", blue: "bg-sky-600", muted: "bg-muted-foreground/40", none: "",
};
const CARD_TONE: Partial<Record<ActiveCard, string>> = {
  lapsed: "border-amber-500/50 text-amber-800 dark:text-amber-300",
  should_fall_off: "border-destructive/50 text-destructive",
  mismatch: "border-destructive/50 text-destructive",
  noContract: "text-muted-foreground",
};

type StatusTarget = { row: ActiveCustomerRow; status: "inactive" | "active"; companyId?: string };

function LineCell({ line, row, asOf }: { line: LineState; row: ActiveCustomerRow; asOf: string }) {
  const { t } = useTranslation();
  const text = lineText(line, t, row);
  const tone = lineTone(line, row.flags, asOf);
  const href = lineHref(line);
  const body = <span className="inline-flex items-start gap-1.5">
    {tone !== "none" && <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[tone]}`} />}
    <span className={tone === "muted" || tone === "none" ? "text-muted-foreground" : undefined}>{text}</span>
  </span>;
  return href
    ? <Link href={href} className="hover:underline underline-offset-2" data-testid={`link-season-${line.seasonId}`}>{body}</Link>
    : body;
}

export function ActiveCustomersView({ data, asOf, onAsOf, today, onStatus }: {
  data: ActiveCustomersResponse; asOf: string; onAsOf: (d: string) => void; today: string; onStatus: (target: StatusTarget) => void;
}) {
  const { t } = useTranslation();
  const [card, setCard] = useState<ActiveCard | null>("responsible");
  const [line, setLine] = useState<LineFilter>("all");
  const [q, setQ] = useState("");
  const rows = visibleRows(data.rows, card, line, q);
  const counts = data.counts as unknown as Record<string, number>;
  const cards = CARD_ORDER.filter(c => !((c === "mismatch" || c === "noContract") && !counts[c]));
  const exportCsv = () => downloadCsv(`active-customers-${data.asOf}.csv`, buildCsv(rows, t));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight mr-auto">{t("activeCustomers.title")}</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("activeCustomers.asOf")}</span>
          <Input type="date" className="w-40" min={addDays(today, -400)} max={addDays(today, 400)} value={asOf} onChange={e => e.target.value && onAsOf(e.target.value)} data-testid="input-as-of" />
        </label>
        {asOf !== today && <Button size="sm" variant="ghost" onClick={() => onAsOf(today)} data-testid="button-as-of-today">{t("activeCustomers.today")}</Button>}
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t("activeCustomers.line")}>
          {(["all", "landscape", "snow"] as const).map(l => (
            <Button key={l} size="sm" variant={line === l ? "default" : "ghost"} aria-pressed={line === l} onClick={() => setLine(l)} data-testid={`toggle-active-line-${l}`}>
              {t(`activeCustomers.lines.${l}`)}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 w-full sm:w-56" placeholder={t("activeCustomers.search")} aria-label={t("activeCustomers.search")} value={q}
            onChange={e => setQ(e.target.value)} data-testid="input-search-active-customers" />
        </div>
        <Button variant="outline" onClick={exportCsv} data-testid="button-export-active-customers"><Download className="w-4 h-4 mr-1" />{t("activeCustomers.export")}</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map(c => (
          <button key={c} type="button" aria-pressed={card === c} onClick={() => setCard(card === c ? null : c)} data-testid={cardTestId(c)}
            className={`rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30 ${CARD_TONE[c] ?? ""} ${card === c ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}>
            <div className="text-xs font-medium">{t(`activeCustomers.cards.${c}`)}</div>
            <div className="text-2xl font-semibold tabular-nums text-foreground" data-testid={`count-${cardTestId(c)}`}>{counts[c] ?? 0}</div>
            {c === "responsible" && <div className="text-xs text-muted-foreground">{t("activeCustomers.split", { landscape: counts.landscape ?? 0, snow: counts.snow ?? 0 })}</div>}
          </button>
        ))}
      </div>

      <div className="w-full max-w-full overflow-x-auto rounded-md border" data-testid="scroll-active-customers">
        <table className="w-full min-w-[860px] text-sm" data-testid="table-active-customers">
          <thead>
            <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
              {["customer", "agent", "landscape", "snow", "flags", "action"].map(h => <th key={h} className="p-2 font-medium">{t(`activeCustomers.cols.${h}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground" data-testid="empty-active-customers">{t("activeCustomers.empty")}</td></tr>}
            {rows.map(r => (
              <tr key={r.customerId} className="border-t align-top" data-testid={`row-active-${r.customerId}`}>
                <td className="p-2 font-medium">
                  <Link href={`/dashboard/customers/${r.customerId}`} className="hover:underline underline-offset-2" data-testid={`link-customer-${r.customerId}`}>{r.customerName}</Link>
                  {r.customerStatus !== "active" && <span className="ml-2 rounded border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground" data-testid={`badge-status-${r.customerId}`}>{t(`activeCustomers.status.${r.customerStatus}`)}</span>}
                </td>
                <td className="p-2">{r.managingAgentName || "\u2014"}</td>
                <td className="p-2"><LineCell line={r.landscape} row={r} asOf={data.asOf} /></td>
                <td className="p-2"><LineCell line={r.snow} row={r} asOf={data.asOf} /></td>
                <td className="p-2">
                  <span className="flex flex-wrap gap-1">
                    {r.flags.map(f => <span key={f} className={`rounded-full border px-2 py-0.5 text-[11px] ${CARD_TONE[f] ?? ""}`}>{t(`activeCustomers.flag.${f}`)}</span>)}
                    {r.noContract && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{t("activeCustomers.flag.noContract")}</span>}
                  </span>
                </td>
                <td className="p-2 whitespace-nowrap">
                  {r.flags.includes("should_fall_off") && r.customerStatus === "active" &&
                    <Button size="sm" variant="outline" onClick={() => onStatus({ row: r, status: "inactive" })} data-testid={`button-set-inactive-${r.customerId}`}>{t("activeCustomers.setInactive")}</Button>}
                  {r.flags.includes("mismatch") &&
                    <Button size="sm" variant="outline" onClick={() => onStatus({ row: r, status: "active" })} data-testid={`button-set-active-${r.customerId}`}>{t("activeCustomers.setActive")}</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="text-showing">{t("activeCustomers.showing", { count: rows.length, date: activeCustomerDate(data.asOf, t) })}</p>
    </div>
  );
}

export default function ActiveCustomersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const today = coloradoToday();
  const [asOf, setAsOf] = useState(today);
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const [activationMissing, setActivationMissing] = useState<MissingField[]>([]);
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ? String(user.activeCompanyId) : null;
  const { data, isLoading, isError, refetch } = useQuery<ActiveCustomersResponse>({
    queryKey: activeCustomersKey(companyId, user?.id, asOf),
    queryFn: async ({ signal }) => (await apiRequest("GET", activeCustomersUrl(asOf), undefined, { headers: companyHeaders(companyId!), signal })).json(),
    enabled: !!companyId, retry: false, staleTime: 30_000, refetchOnMount: true, refetchOnWindowFocus: true,
  });
  // A company switch drops any pending confirmation so no write lands in the wrong company.
  useEffect(() => { setTarget(null); setActivationMissing([]); }, [companyId]);
  const setStatus = useMutation({
    mutationFn: async (v: StatusTarget) => {
      if (!v.companyId || v.companyId !== companyId) throw new Error("COMPANY_CHANGED");
      return (await apiRequest("PATCH", `/api/customers/${encodeURIComponent(v.row.customerId)}`, { status: v.status }, { headers: companyHeaders(v.companyId) })).json();
    },
    onSuccess: (_d, v) => {
      toast({ title: t(v.status === "inactive" ? "activeCustomers.doneInactive" : "activeCustomers.doneActive", { name: v.row.customerName }) });
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: [ACTIVE_CUSTOMERS_URL, v.companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", v.row.customerId] });
      queryClient.invalidateQueries({ predicate: query => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/customers?") });
    },
    onError: (err) => {
      const activation = activationError(err);
      if (activation) setActivationMissing(activation.missingFields);
      else toast({ title: t("activeCustomers.statusFailed"), variant: "destructive" });
    },
  });
  const openStatus = (v: StatusTarget) => { setActivationMissing([]); setTarget({ ...v, companyId: companyId ?? undefined }); };
  const ended = target ? lastEnded(target.row) : null;

  return (
    <div className="space-y-6 min-w-0" data-testid="page-active-customers">
      <ContractViewSwitch active="customers" />
      {isLoading ? (
        <div className="space-y-3" data-testid="loading-active-customers"><Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64" /></div>
      ) : isError || !data ? (
        <div className="rounded-md border p-8 text-center space-y-3" data-testid="error-active-customers">
          <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
          <p className="text-sm">{t("activeCustomers.error")}</p>
          <label className="flex justify-center items-center gap-2 text-sm">
            {t("activeCustomers.asOf")}
            <Input type="date" className="w-40" value={asOf} min={addDays(today, -400)} max={addDays(today, 400)}
              onChange={e => e.target.value && setAsOf(e.target.value)} data-testid="input-as-of" />
          </label>
          {asOf !== today && <Button variant="ghost" onClick={() => setAsOf(today)} data-testid="button-as-of-today">{t("activeCustomers.today")}</Button>}
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-active-customers">{t("activeCustomers.retry")}</Button>
        </div>
      ) : !data.rows.length ? (
        <div className="space-y-4">
          <ActiveCustomersView data={data} asOf={asOf} onAsOf={setAsOf} today={today} onStatus={openStatus} />
          <div className="rounded-md border p-10 text-center space-y-2" data-testid="empty-all-active-customers">
            <Users className="w-6 h-6 mx-auto text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("activeCustomers.empty")}</p>
          </div>
        </div>
      ) : (
        <ActiveCustomersView data={data} asOf={asOf} onAsOf={setAsOf} today={today} onStatus={openStatus} />
      )}
      <AlertDialog open={!!target} onOpenChange={o => { if (!o && !setStatus.isPending) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{target && t(target.status === "inactive" ? "activeCustomers.confirmInactive" : "activeCustomers.confirmActive", { name: target.row.customerName })}</AlertDialogTitle>
            <AlertDialogDescription>{target?.status === "inactive" ? (ended ? t("activeCustomers.lastEnded", { date: activeCustomerDate(ended, t) }) : t("activeCustomers.noEndedSeason")) : t("activeCustomers.inEffectNote")}</AlertDialogDescription>
          </AlertDialogHeader>
          {target && activationMissing.length > 0 &&
            <MissingFieldsNotice customerId={target.row.customerId} fields={activationMissing} variant="inline" />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatus.isPending}>{t("activeCustomers.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={setStatus.isPending} data-testid="button-confirm-status"
              onClick={e => { e.preventDefault(); if (target) setStatus.mutate(target); }}>
              {t(target?.status === "active" ? "activeCustomers.setActive" : "activeCustomers.setInactive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
