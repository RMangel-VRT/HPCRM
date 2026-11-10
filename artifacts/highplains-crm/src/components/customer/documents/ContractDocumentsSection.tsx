import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROW_CLASS, rowKeyOpen, fromNestedControl, useCustomerDates } from "@/components/customer/page";
import { cn } from "@/lib/utils";
import type { CustomerContractDocumentDto } from "./documentModel";

/** Contract Center term route convention (same as CustomerContractPanels). */
export const contractTermHref = (d: Pick<CustomerContractDocumentDto, "agreementId" | "termId">) =>
  `/dashboard/contracts/${encodeURIComponent(d.agreementId)}#term-${encodeURIComponent(d.termId)}`;

const openInTab = (url: string) => { window.open(url, "_blank", "noopener,noreferrer"); };

/** Read-only projection of term_documents. Upload/delete live only in the Contract Center. */
export function ContractDocumentsSection({ docs, isLoading, error, onRetry }: {
  docs: CustomerContractDocumentDto[]; isLoading: boolean; error: unknown; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const dates = useCustomerDates();
  return (
    <section aria-labelledby="documents-from-contracts" className="space-y-2" data-testid="section-from-contracts">
      <div className="flex items-baseline gap-2">
        <h3 id="documents-from-contracts" className="text-[13.5px] font-semibold">{t("cp5.documents.contracts.title")}</h3>
        <span className="text-xs text-muted-foreground">{t("cp5.documents.contracts.lead")}</span>
      </div>
      {isLoading ? <Skeleton className="h-20 w-full" /> : error ? (
        <div className="flex items-center gap-3 rounded-[10px] border px-3 py-3 text-sm" role="alert" data-testid="error-from-contracts">
          <span className="text-muted-foreground">{t("cp5.documents.contracts.error")}</span>
          <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-from-contracts">{t("cp5.documents.retry")}</Button>
        </div>
      ) : docs.length === 0 ? (
        <p className="rounded-[10px] border border-dashed px-3 py-4 text-center text-sm text-muted-foreground" data-testid="empty-from-contracts">{t("cp5.documents.contracts.empty")}</p>
      ) : (
        <ul role="table" className="rounded-[10px] border bg-card" data-testid="list-from-contracts">
          {docs.map(d => (
            <li key={d.id} role="row" tabIndex={0} aria-label={t("cp5.documents.openNamed", { name: d.filename })}
              className={cn(ROW_CLASS, "flex items-center gap-3 border-b px-3 last:border-b-0")}
              onClick={e => { if (!fromNestedControl(e)) openInTab(d.openUrl); }} onKeyDown={rowKeyOpen(() => openInTab(d.openUrl))}
              data-testid={`row-contract-document-${d.id}`}>
              <FileSignature className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.filename}</span>
              <span className="hidden sm:block w-32 truncate text-xs text-muted-foreground" data-testid={`text-contract-kind-${d.id}`}>
                {t(`cp5.documents.contracts.kinds.${d.kind}`, { defaultValue: t("cp5.documents.contracts.kinds.other") })}
              </span>
              <span className="hidden md:block w-28 truncate text-xs text-muted-foreground">{d.seasonLabel}</span>
              <span className="hidden sm:block w-24 text-xs tabular-nums text-muted-foreground">{dates.day(d.createdAt)}</span>
              <Link href={contractTermHref(d)} className="shrink-0 text-xs text-primary underline-offset-2 hover:underline" data-testid={`link-contract-term-${d.id}`}>
                {t("cp5.documents.contracts.openContract")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
