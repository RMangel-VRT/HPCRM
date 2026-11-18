import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { activeCustomersLocale, reportDate } from "../../../../../lib/db/src/activeCustomersText";

export function ActiveCustomersPdfButton({ asOf }: { asOf: string }) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  if (!user?.activeCompanyId || !(user.isSuperAdminBool || ["admin", "office"].includes(user.accessRole))) return null;
  const locale = activeCustomersLocale(i18n.resolvedLanguage || i18n.language);
  // Remount cancels even a switch away and back to the original context.
  return <ScopedDownload key={`${user.id}|${user.activeCompanyId}|${user.accessRole}|${asOf}|${locale}`}
    companyId={String(user.activeCompanyId)} asOf={asOf} locale={locale} />;
}

function ScopedDownload({ companyId, asOf, locale }: { companyId: string; asOf: string; locale: "en" | "es" }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  async function download() {
    if (pending.current) return;
    const ctrl = new AbortController(); pending.current = ctrl;
    setBusy(true);
    try {
      const response = await apiRequest("GET",
        `/api/contract-center/active-customers.pdf?asOf=${encodeURIComponent(asOf)}&lang=${locale}`,
        undefined, { headers: { "X-Company-Id": companyId }, signal: ctrl.signal });
      const blob = await response.blob();
      if (ctrl.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url; link.download = `High Plains - Active Customers - ${asOf}.pdf`;
        document.body.appendChild(link); link.click(); link.remove();
      } finally {
        // Let the browser begin reading before releasing the URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (ctrl.signal.aborted) return;
      let message = error instanceof Error ? error.message : "";
      // apiRequest preserves the server response body in its Error.
      try { const body = JSON.parse(message.replace(/^\d+:\s*/, "")); message = body.message || body.error || ""; } catch { /* network/plain-text error */ }
      toast({ title: t("activeCustomers.pdf.failed"), description: message || undefined, variant: "destructive" });
    } finally {
      if (!ctrl.signal.aborted) { pending.current = null; setBusy(false); }
    }
  }
  return <Button variant="outline" disabled={busy} aria-busy={busy} onClick={() => void download()}
    title={t("activeCustomers.pdf.tooltip", { date: reportDate(asOf, locale) })} data-testid="button-download-active-customers-pdf">
    {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
    {t(busy ? "activeCustomers.pdf.busy" : "activeCustomers.pdf.download")}
  </Button>;
}
