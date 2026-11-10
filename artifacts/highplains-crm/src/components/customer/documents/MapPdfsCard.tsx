import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FileType2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerDates } from "@/components/customer/page";
import { customerPageHref } from "@/components/customer/customerPages";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { sortDocuments } from "./documentModel";
import { useCustomerDocuments } from "./useCustomerDocuments";

/** Property side card: up to five category=map documents, newest first. */
export function MapPdfsCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const dates = useCustomerDates();
  const q = useCustomerDocuments(customerId, "map");
  const docs = sortDocuments(q.data ?? [], "map").slice(0, 5);
  return (
    <Card data-testid="card-map-pdfs">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[13.5px] font-semibold flex items-center gap-2">
          <FileType2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t("cp5.property.mapPdfs")}
        </CardTitle>
        <Link href={customerPageHref(customerId, "documents")} className="text-xs text-primary hover:underline" data-testid="link-all-documents">
          {t("cp5.property.allDocuments")} {"\u2192"}
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {q.isLoading ? <Skeleton className="h-16 w-full" /> : q.error ? (
          <p className="text-xs text-muted-foreground" role="alert" data-testid="text-map-pdfs-error">
            {t("cp5.documents.loadError")}{" "}
            <button type="button" className="text-primary underline" onClick={() => void q.refetch()} data-testid="button-retry-map-pdfs">{t("cp5.documents.retry")}</button>
          </p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="text-no-map-pdfs">{t("cp5.property.noMaps")}</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {docs.map(d => (
              <li key={d.id}>
                <a href={d.openUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  data-testid={`link-map-pdf-${d.id}`}>
                  <DocumentTypeIcon doc={d} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{dates.day(d.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
