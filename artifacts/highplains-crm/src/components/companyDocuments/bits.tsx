import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { accessRole } from "../../../../../lib/db/src/accessRole";
import { fileKind, type CompanyDocumentDto } from "./companyDocumentsApi";

/** Canonical manage gate: accessRole projection (account managers resolve to admin). */
export function useCompanyDocumentAccess() {
  const { user } = useAuth();
  const role = (user as { accessRole?: string } | null)?.accessRole ?? (user?.activeRole ? accessRole(user.activeRole) : "");
  return { canManage: role === "admin" || role === "office", companyId: user?.activeCompanyId ?? null };
}

const tone = {
  expired: "border-destructive/30 bg-destructive/5 text-destructive",
  expiring: "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]",
  current: "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.07)] text-[hsl(var(--success))]",
  none: "border-border bg-card text-muted-foreground",
} as const;

export function StatusChip({ doc, className }: { doc: Pick<CompanyDocumentDto, "id" | "status" | "daysUntilExpiry">; className?: string }) {
  const { t } = useTranslation();
  const label = doc.status === "none" ? t("companyDocuments.status.none")
    : doc.status === "expired" ? t("companyDocuments.status.expired")
    : doc.status === "expiring" ? t("companyDocuments.status.expiring", { count: doc.daysUntilExpiry ?? 0 })
    : t("companyDocuments.status.current");
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-px text-[11.5px] font-medium", tone[doc.status], className)}
      data-testid={`status-company-document-${doc.id}`}>
      {doc.status !== "none" && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}

export function Chip({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return <span className="inline-flex items-center whitespace-nowrap rounded-full border bg-card px-2 py-px text-[11.5px] font-medium text-muted-foreground" data-testid={testId}>{children}</span>;
}

export function FileTile({ fileName, fileType, size = "md" }: { fileName?: string | null; fileType?: string | null; size?: "md" | "lg" }) {
  const kind = fileKind(fileName, fileType);
  const pdf = kind === "PDF";
  return (
    <span aria-hidden className={cn("grid flex-none place-items-end justify-center rounded border pb-1 font-bold",
      size === "lg" ? "h-24 w-20 text-xs" : "h-9 w-[30px] text-[9px]",
      pdf ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-[hsl(var(--table-border))] bg-[hsl(var(--table-header))] text-[hsl(var(--rail-heading))]")}>
      {kind}
    </span>
  );
}
