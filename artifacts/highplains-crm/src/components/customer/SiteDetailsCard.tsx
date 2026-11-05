import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Edit, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SiteFactsLike {
  id: string; gateCode?: string | null; accessNotes?: string | null; watchOutNotes?: string | null; petStationCount?: number | null;
  petStationLocations?: string | null; irrigationControllerLocations?: string | null; includeInRoute?: boolean | null;
}

/** Read-only site facts. Editing happens on the customer editor (#site). */
export default function SiteDetailsCard({ customer, canEdit }: { customer: SiteFactsLike; canEdit: boolean }) {
  const { t } = useTranslation();
  const dash = "\u2014";
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? dash : String(x));
  const rows: [string, string, string, boolean?][] = [
    ["gate", t("customerWizard.site.gateCode"), v(customer.gateCode), true],
    ["access", t("customerWizard.site.accessNotes"), v(customer.accessNotes)],
    ["watch", t("customerWizard.site.watchOutNotes"), v(customer.watchOutNotes)],
    ["pet-count", t("customerWizard.site.petStationCount"), v(customer.petStationCount)],
    ["pet-locations", t("customerWizard.site.petStationLocations"), v(customer.petStationLocations)],
    ["controllers", t("customerWizard.site.controllerLocations"), v(customer.irrigationControllerLocations)],
    ["route", t("customerWizard.site.includeInRoute"), customer.includeInRoute == null ? dash : customer.includeInRoute ? t("common.yes") : t("common.no")],
  ];
  return (
    <Card className="mt-4" data-testid="card-site-details">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" />{t("customerEdit.siteDetails")}</CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/customers/${customer.id}/edit#site`} data-testid="button-edit-site"><Edit className="mr-1 h-3.5 w-3.5" />{t("common.edit")}</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, label, value, mono]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={`whitespace-pre-wrap break-words ${mono && value !== dash ? "font-mono" : ""} ${value === dash ? "text-muted-foreground" : ""}`} data-testid={`text-site-${k}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
