import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, Archive, History, Eye, Download } from "lucide-react";
import type { Contract, ContractDocument } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCustomerScope } from "@/lib/customerScope";

const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "\u2014";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "\u2014"; }
};
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/**
 * CP2: old-system contracts, read-only. Loaded only when opened. Shows identity, dates
 * and documents only — no commercial values, and nothing here feeds the contract summary.
 */
export default function PreviousContractsSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="previous-contracts">
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full flex items-center gap-2 text-left text-sm font-medium py-2 hover:text-foreground text-muted-foreground"
          data-testid="button-previous-contracts" aria-expanded={open}>
          <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
          <Archive className="w-4 h-4" />{t("customerPages.contracts.previous")}
        </button>
      </CollapsibleTrigger>
      <p className="text-xs text-muted-foreground pl-6" data-testid="text-previous-contracts-note">{t("customerPages.contracts.previousNote")}</p>
      <CollapsibleContent className="pt-3 space-y-2">
        {open && <PreviousContractsList customerId={customerId} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Mounted only when the disclosure is open, so no legacy query exists before that. */
function PreviousContractsList({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const scope = useCustomerScope();
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const contracts = useQuery<Contract[]>({
    queryKey: ["/api/customers", customerId, "contracts", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<Contract[]>(`/api/customers/${customerId}/contracts`, signal),
    enabled: scope.enabled,
  });
  return (
    <>
        {contracts.isLoading ? <Skeleton className="h-16 w-full" />
          : contracts.error ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">{t("customerPages.contracts.loadFailed")}
              <Button size="sm" variant="outline" onClick={() => contracts.refetch()} data-testid="button-retry-previous">{t("customerPages.contracts.retry")}</Button></div>
          ) : (contracts.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-previous-contracts">{t("customerPages.contracts.none")}</p>
          ) : (contracts.data ?? []).map(c => (
            <Card key={c.id} className="bg-muted/30" data-testid={`card-previous-contract-${c.id}`}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.serviceType}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(c.startDate)} {"\u2013"} {fmtDate(c.endDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{c.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setVersionsFor(c.id)} data-testid={`button-previous-versions-${c.id}`}>
                    <History className="w-3.5 h-3.5 mr-1" />{t("customerPages.contracts.documents")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      {versionsFor && <DocumentsDialog contractId={versionsFor} onClose={() => setVersionsFor(null)} />}
    </>
  );
}

function DocumentsDialog({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const scope = useCustomerScope();
  const docs = useQuery<ContractDocument[]>({
    queryKey: ["/api/contracts", contractId, "documents", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<ContractDocument[]>(`/api/contracts/${contractId}/documents`, signal),
    enabled: scope.enabled,
  });
  return (
      <Dialog open onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("customerPages.contracts.documents")}</DialogTitle>
            <DialogDescription>{t("customerPages.contracts.previousNote")}</DialogDescription>
          </DialogHeader>
          {docs.isLoading ? <Skeleton className="h-12 w-full" /> : (docs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("customerPages.contracts.noDocuments")}</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("customerPages.contracts.version")}</TableHead><TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.date")}</TableHead><TableHead>{t("customerPages.contracts.size")}</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {(docs.data ?? []).map(d => (
                  <TableRow key={d.id}>
                    <TableCell>v{d.version}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{d.filename}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(d.uploadedAt)}</TableCell>
                    <TableCell className="text-xs">{fmtSize(d.fileSize)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" aria-label={t("customerPages.contracts.view")} onClick={() => window.open(d.storageObjectPath, "_blank", "noopener")}><Eye className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" asChild aria-label={t("customerPages.contracts.download")}>
                        <a href={d.storageObjectPath} download={d.filename}><Download className="w-3.5 h-3.5" /></a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
  );
}
