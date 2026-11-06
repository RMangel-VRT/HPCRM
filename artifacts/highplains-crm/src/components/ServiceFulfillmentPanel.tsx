import { useTranslation } from "react-i18next";
import { useCustomerServices } from "@/hooks/useCustomerServices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Activity, not owed-versus-done: contract-driven campaign generation is separate. */
export default function ServiceFulfillmentPanel({ customerId }: { customerId: string; canEdit?: boolean }) {
  const { t } = useTranslation();
  const { services, isLoading, error } = useCustomerServices(customerId);
  return <Card><CardHeader><CardTitle>{t("cp1.serviceActivity")}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {isLoading ? <p>{t("common.loading")}</p> : error ? <p role="alert">{t("cp1.loadFailed")}</p> :
        !services.length ? <p>{t("cp1.noUpcomingServices")}</p> : services.map(s => <div key={s.id} className="flex gap-3 justify-between border-b py-2">
          <div><p>{s.title}</p><p className="text-sm text-muted-foreground">{s.start} – {s.end}</p></div>
          <div><Badge variant={s.state === "overdue" ? "destructive" : "outline"}>{t(`cp1.serviceStates.${s.state}`)}</Badge>
            {!s.inContract && <p className="text-xs">{t("cp1.extraBillable")}</p>}</div>
        </div>)}
    </CardContent>
  </Card>;
}
