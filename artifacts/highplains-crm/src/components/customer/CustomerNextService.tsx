import { useTranslation } from "react-i18next";
import { useCustomerServices } from "@/hooks/useCustomerServices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerNextService({ customerId, onTabChange }: { customerId: string; onTabChange: (tab: string) => void }) {
  const { t } = useTranslation();
  const { next, overdueCount, isLoading, error } = useCustomerServices(customerId);
  return <Card data-testid="card-next-service" className="cursor-pointer hover-elevate" onClick={() => onTabChange("checklist")}>
    <CardHeader><CardTitle>{t("cp1.nextService")}</CardTitle></CardHeader>
    <CardContent>
      {isLoading ? t("common.loading") : error ? <p role="alert">{t("cp1.loadFailed")}</p> :
        next ? <><p>{next.title}</p><p>{next.start} – {next.end}</p></> : <p>{t("cp1.noUpcomingServices")}</p>}
      <p data-testid="customer-services-overdue">{t("cp1.overdueCount", { count: overdueCount })}</p>
    </CardContent>
  </Card>;
}
