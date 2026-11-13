import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useCustomerContractSummary } from "@/hooks/useCustomerContractSummary";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, FileText } from "lucide-react";
import { contractTermHref } from "@/components/customer/CustomerContractPanels";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/hooks/use-auth";
import { CardListSkeleton, CustomerCardHeader, DisplayStatusBadge, PageEmptyState, displayStatus, useCustomerDates } from "@/components/customer/page";
import { MissingDocChip, StateChip } from "@/components/contracts/ContractBadges";
import { contractNeedsAction, itemState } from "@/components/contracts/contractAttention";
import { accessRole } from "../../../../../lib/db/src/accessRole";

/** Customer pages no longer mount the frozen old-system contract children. */
export function CustomerContracts({ customerId }: { customerId: string; children?: ReactNode }) {
  const { data, isLoading, error } = useCustomerContractSummary(customerId);
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const dates = useCustomerDates();
  const permitted = !!user && ["admin", "office"].includes(accessRole(user.activeRole));
  const groups = [
    { label: "current", terms: data?.current ?? [] },
    { label: "upcoming", terms: data?.upcoming ?? [] },
    { label: "previous", terms: data?.previous ?? [] },
  ];
  if (!permitted) return null;
  return <section className="space-y-4" data-testid="customer-contract-center">
    {/* Heading + New contract live in the CustomerDetail SectionTitle (rail title hierarchy). */}
    {isLoading ? <CardListSkeleton count={2} testId="contracts-skeleton" /> : error ? <div role="alert"><PageEmptyState icon={AlertCircle} message={t("cp1.loadFailed")} testId="contracts-error" /></div> : groups.map(group =>
      <div key={group.label} className="space-y-3">
        <h3 className="text-[13.5px] font-semibold">{t(`cp1.${group.label}`)}</h3>
        {!group.terms.length ? group.label === "current" && <PageEmptyState icon={FileText} message={t("cp1.noContract")} testId="contracts-empty" /> : group.terms.map((term, i) =>
          <Card key={term.termId ?? i} data-testid={`center-contract-${term.agreementId}`}>
            <CustomerCardHeader icon={FileText} title={`${term.label} \u00b7 ${t(`cp1.${term.line}`)}`} testId={`contract-card-header-${term.termId ?? i}`}
              action={<DisplayStatusBadge status={displayStatus("contract", group.label)} testId={`status-contract-${term.termId ?? i}`} />} />
            <CardContent className="px-4 pt-2 pb-3.5 space-y-1.5 text-sm">
              {(term.state !== undefined && contractNeedsAction(itemState(term)) || term.flags?.includes("missing_document")) && <p className="flex flex-wrap gap-1.5" data-testid={`contract-attention-${term.termId ?? i}`}>
                {term.state !== undefined && contractNeedsAction(itemState(term)) && <StateChip state={itemState(term)} title={term.stateReason} />}
                {term.flags?.includes("missing_document") && <MissingDocChip />}
              </p>}
              <p className="text-sm text-muted-foreground">{dates.day(term.startDate)} – {dates.day(term.endDate)}</p>
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
