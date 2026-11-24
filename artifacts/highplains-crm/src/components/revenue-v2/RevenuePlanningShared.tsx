import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetRevenueTargetsQueryKey, useSaveRevenueTargetsFromPlan } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { money } from "./revenueFormat";
import { responseStatus, revenueKey, revenuePrefix, revenueRequest, type RevenueScope } from "./revenueQueries";
import "./revenue-planning.css";

export const RV = "revenueV2";
export const dash = "—";
export const amount = (cents: number | null) => cents === null ? dash : money(cents);
export const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
export const contractHref = (agreementId: string) => `/dashboard/contracts/${encodeURIComponent(agreementId)}`;
export const dateLabel = (value: string | null, language: string, monthOnly = false) =>
  value === null ? dash : new Intl.DateTimeFormat(language, {
    year: "numeric", month: "short", ...(monthOnly ? {} : { day: "numeric" }), timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

export function ContractName({ agreementId, children }: { agreementId: string; children: ReactNode }) {
  return <Link className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
    href={contractHref(agreementId)} data-testid={`link-revenue-contract-${agreementId}`}>{children}</Link>;
}

export function RevenueLoadState({ error, retry }: { error: boolean; retry: () => void }) {
  const { t } = useTranslation();
  return error ? <div className="rv-card rv-card-pad flex flex-wrap items-center gap-3 text-sm" role="alert">
    {t(`${RV}.loadError`)} <Button variant="outline" size="sm" onClick={retry} data-testid="button-revenue-planning-retry">{t(`${RV}.retry`)}</Button>
  </div> : <p className="rv-muted text-sm" role="status">{t(`${RV}.loading`)}</p>;
}

export function Stat({ label, value, detail, testId }: { label: string; value: ReactNode; detail?: ReactNode; testId?: string }) {
  return <div className="rv-card rv-card-pad">
    <div className="rv-card-title">{label}</div>
    <div className="rv-plan-stat" data-testid={testId}>{value}</div>
    {detail && <div className="rv-muted text-xs">{detail}</div>}
  </div>;
}

export function useCreateTarget(scope: RevenueScope, year: number, onSaved?: () => void) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const mutation = useSaveRevenueTargetsFromPlan({ request: revenueRequest(scope), mutation: {
    onSuccess: updated => {
      cache.setQueryData(revenueKey(scope, getGetRevenueTargetsQueryKey(year)), updated);
      void cache.invalidateQueries({ queryKey: revenuePrefix(scope) });
      if (mounted.current) {
        toast({ title: t(`${RV}.targets.saved`, { year }) });
        onSaved?.();
      }
    },
  } });
  const create = async () => {
    if (!scope.admin || running.current) return;
    running.current = true;
    try { await mutation.mutateAsync({ year }); }
    catch (error) {
      if (mounted.current) toast({ variant: "destructive", title: t(`${RV}.targets.${responseStatus(error) === 422 ? "rangeError" : "createError"}`) });
    } finally { running.current = false; }
  };
  return { create, pending: mutation.isPending };
}
