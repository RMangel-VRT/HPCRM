import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useCustomerContractSummary } from "@/hooks/useCustomerContractSummary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { contractTermHref } from "@/components/customer/CustomerContractPanels";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/hooks/use-auth";
import { accessRole } from "../../../../../lib/db/src/accessRole";

/** Customer pages no longer mount the frozen old-system contract children. */
export function CustomerContracts({ customerId }: { customerId: string; children?: ReactNode }) {
  const { data, isLoading, error } = useCustomerContractSummary(customerId);
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const permitted = !!user && ["admin", "office"].includes(accessRole(user.activeRole));
  const groups = [
    { label: "current", terms: data?.current ?? [] },
    { label: "upcoming", terms: data?.upcoming ?? [] },
    { label: "previous", terms: data?.previous ?? [] },
  ];
  if (!permitted) return null;
  return <section className="space-y-4" data-testid="customer-contract-center">
    <div className="flex justify-between gap-3">
      <h2 className="font-semibold">{t("cp1.contractCenter")}</h2>
      <Link href={`/dashboard/contracts/new?customerId=${encodeURIComponent(customerId)}`}><Button size="sm">{t("cp1.newContract")}</Button></Link>
    </div>
    {isLoading ? <p>{t("common.loading")}</p> : error ? <p role="alert">{t("cp1.loadFailed")}</p> : groups.map(group =>
      <div key={group.label} className="space-y-3">
        <h3>{t(`cp1.${group.label}`)}</h3>
        {!group.terms.length ? group.label === "current" && <p>{t("cp1.noContract")}</p> : group.terms.map((term, i) =>
          <Card key={term.termId ?? i} data-testid={`center-contract-${term.agreementId}`}>
            <CardContent className="p-4 space-y-2">
              <p className="font-medium">{term.label} · {t(`cp1.${term.line}`)}</p>
              <p>{term.startDate} – {term.endDate}</p>
              {term.parentCustomerId && <p>{t("cp1.parentValue")}</p>}
              <p>{t("cp1.annualValue")}: {formatCurrency(term.annualCents, false, i18n.language)}</p>
              {term.snowPricing === "time_and_materials" && <p>{t("cp1.timeAndMaterials")}</p>}
              {["snow", "both"].includes(term.line) && <p className={!term.snowTriggers?.trim() ? "text-amber-700" : ""}>
                {t("cp1.snowTriggers")}: {term.snowTriggers?.trim() || t("cp1.notStated")}
              </p>}
              {term.termId && <Link className="underline text-primary" href={contractTermHref(term)}>{t("common.open")}</Link>}
            </CardContent>
          </Card>)}
      </div>)}
  </section>;
}
