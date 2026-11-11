import { useTranslation } from "react-i18next";
import { useContractCustomerServices } from "@/hooks/useContractCustomerServices";
import { serviceNextLabel, summarizeContractServices } from "@/lib/contractCustomerServices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerNextService({ customerId, onTabChange }: { customerId: string; onTabChange: (tab: string) => void }) {
  const { t, i18n } = useTranslation();
  const demand = useContractCustomerServices(customerId);
  const { next, overdue } = summarizeContractServices(demand.data?.rows ?? []);
  return <Card data-testid="card-next-service" role="button" tabIndex={0} className="cursor-pointer hover-elevate"
    onClick={() => onTabChange("services")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onTabChange("services"); } }}>
    <CardHeader><CardTitle>{t("cp1.nextService")}</CardTitle></CardHeader>
    <CardContent>
      {demand.isLoading ? t("common.loading") : demand.unavailable ? <p>{t("customerPages.notAvailable.title")}</p>
        : demand.error ? <p role="alert">{t("cp1.loadFailed")} <button onClick={event => { event.stopPropagation(); void demand.refetch(); }}>{t("common.retry")}</button></p> :
        next ? <><p>{next.label}</p><p>{serviceNextLabel(next.next!, i18n.language)}</p></> : <p>{t("cp1.noUpcomingServices")}</p>}
      {!demand.isLoading && !demand.error && <p data-testid="customer-services-overdue">{t("cp1.overdueCount", { count: overdue })}</p>}
    </CardContent>
  </Card>;
}
