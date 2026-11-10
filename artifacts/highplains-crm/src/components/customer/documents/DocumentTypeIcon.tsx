import { useTranslation } from "react-i18next";
import { File, FileImage, FileSpreadsheet, FileText, FileType2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentKind, type CustomerDocumentDto } from "./documentModel";

const ICONS = { pdf: FileType2, image: FileImage, doc: FileText, sheet: FileSpreadsheet, unknown: File } as const;
const TONE = {
  pdf: "text-[hsl(var(--destructive))]", image: "text-primary", doc: "text-muted-foreground", sheet: "text-muted-foreground", unknown: "text-muted-foreground",
} as const;

export function DocumentTypeIcon({ doc, className }: { doc: Pick<CustomerDocumentDto, "mimeType" | "fileType">; className?: string }) {
  const { t } = useTranslation();
  const kind = documentKind(doc);
  const Icon = ICONS[kind];
  return <Icon className={cn("h-4 w-4 shrink-0", TONE[kind], className)} aria-label={t(`cp5.documents.kinds.${kind}`)} role="img" data-kind={kind} />;
}
