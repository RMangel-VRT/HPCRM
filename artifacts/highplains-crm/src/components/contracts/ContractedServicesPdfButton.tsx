import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type Target = { customerId: string; customerName: string; agreementId: string };
export function ContractedServicesPdfButton({ customerId, termId, agreementId }: { customerId: string; termId: string; agreementId: string }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const company = user?.activeCompanyId;
  const scope = `${company}|${customerId}|${termId}`;
  const [state, setState] = useState<{ scope: string; busy?: boolean; message?: string; services?: string[] }>({ scope });
  const [menu, setMenu] = useState<string | null>(null);
  const targets = useQuery<{ parent: boolean; targets: Target[] }>({
    queryKey: ["contracted-services-targets", company, user?.id, user?.accessRole, customerId, termId],
    queryFn: async () => {
      const data = await (await apiRequest("GET", `/api/customers/${encodeURIComponent(customerId)}/contracted-services-targets?termId=${encodeURIComponent(termId)}`,
        undefined, { headers: { "X-Company-Id": company! } })).json();
      if (typeof data?.parent !== "boolean" || !Array.isArray(data.targets) ||
        data.targets.some((target: Target) => !target.customerId || !target.customerName || !target.agreementId))
        throw new Error("Invalid document targets");
      return data;
    },
    enabled: !!company && !!termId, staleTime: 0, retry: false,
  });
  async function open(target: Target) {
    // Reserve the tab synchronously so popup blockers do not swallow an awaited response.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setState({ scope, busy: true });
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(target.customerId)}/contracted-services.pdf?termId=${encodeURIComponent(termId)}`,
        { credentials: "include", headers: { "X-Company-Id": company! } });
      if (!response.ok) {
        const error = await response.json();
        tab?.close();
        setState({ scope, services: error.error === "SCOPE_NEEDS_REVIEW" ? error.services : undefined,
          message: error.message || t("contractedServices.failed") });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.replace(url);
      else {
        const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener"; link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      setState({ scope });
    } catch {
      tab?.close(); setState({ scope, message: t("contractedServices.failed") });
    }
  }
  if (targets.data?.targets.length === 0) return null;
  const current = state.scope === scope ? state : null;
  return <div className="relative text-sm">
    <Button size="sm" variant="outline" data-testid="button-contracted-services-pdf"
      disabled={!targets.data || !!current?.busy} onClick={() => {
        if (targets.data!.parent) setMenu(menu === scope ? null : scope);
        else void open(targets.data!.targets[0]);
      }}>{t("contractedServices.pdf")}</Button>
    {menu === scope && targets.data?.parent && <div className="absolute right-0 z-20 mt-1 min-w-56 rounded border bg-popover p-1 shadow-md" role="menu">
      {targets.data.targets.map(target => <button type="button" key={target.customerId} role="menuitem"
        className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setMenu(null); void open(target); }}>{target.customerName}</button>)}
    </div>}
    {current?.services ? <p role="alert" className="mt-1 text-xs text-destructive">
      <Link href={`/dashboard/contracts/${agreementId}#term-${termId}-scope`} className="underline">{t("contractedServices.fixScope", { services: current.services.join(", ") })}</Link>
    </p> : (current?.message || targets.error) ? <p role="alert" className="mt-1 text-xs text-destructive">{current?.message || t("contractedServices.failed")}</p> : null}
  </div>;
}
