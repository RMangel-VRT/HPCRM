import { useTranslation } from "react-i18next";
import { Download, ExternalLink, FolderInput, MoreHorizontal, NotebookPen, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROW_CLASS, fromNestedControl, rowKeyOpen, useCustomerDates } from "@/components/customer/page";
import { cn } from "@/lib/utils";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { formatBytes, type CustomerDocumentDto } from "./documentModel";
import type { EditMode } from "./DocumentEditDialog";

export function DocumentRow({ doc, privileged, onOpen, onEdit, onDelete }: {
  doc: CustomerDocumentDto; privileged: boolean;
  onOpen: (d: CustomerDocumentDto) => void; onEdit: (d: CustomerDocumentDto, mode: EditMode) => void; onDelete: (d: CustomerDocumentDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const dates = useCustomerDates();
  const size = formatBytes(doc.fileSize, i18n?.language ?? "en");
  return (
    <li role="row" tabIndex={0} aria-label={t("cp5.documents.openNamed", { name: doc.name })}
      className={cn(ROW_CLASS, "flex items-center gap-3 border-b px-3 last:border-b-0 min-h-11 h-auto py-1.5")}
      onClick={e => { if (!fromNestedControl(e)) onOpen(doc); }} onKeyDown={rowKeyOpen(() => onOpen(doc))}
      data-testid={`row-document-${doc.id}`} data-category={doc.category}>
      <DocumentTypeIcon doc={doc} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium" data-testid={`text-document-name-${doc.id}`}>{doc.name}</span>
          <Badge variant="secondary" className="shrink-0 rounded-full px-2 py-0 text-[11px] font-normal" data-testid={`badge-document-category-${doc.id}`}>
            {t(`cp5.documents.categories.${doc.category}`)}
          </Badge>
        </div>
        {doc.note && <p className="truncate text-xs text-muted-foreground" title={doc.note} data-testid={`text-document-note-${doc.id}`}>{doc.note}</p>}
      </div>
      <span className="hidden md:block w-36 truncate text-xs text-muted-foreground" data-testid={`text-document-uploader-${doc.id}`}>
        {doc.uploadedByName ?? <span aria-label={t("cp5.documents.unknownUploader")}>{"\u2014"}</span>}
      </span>
      <span className="hidden sm:block w-24 text-xs tabular-nums text-muted-foreground" data-testid={`text-document-date-${doc.id}`}>{dates.day(doc.createdAt)}</span>
      <span className="hidden sm:block w-16 text-right text-xs tabular-nums text-muted-foreground" data-testid={`text-document-size-${doc.id}`}>
        {size ?? <span aria-label={t("cp5.documents.unknownSize")}>{"\u2014"}</span>}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("cp5.documents.actions.more", { name: doc.name })} data-testid={`button-document-menu-${doc.id}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onOpen(doc)} data-testid={`menu-open-${doc.id}`}><ExternalLink className="mr-2 h-4 w-4" />{t("cp5.documents.actions.open")}</DropdownMenuItem>
          <DropdownMenuItem asChild data-testid={`menu-download-${doc.id}`}>
            <a href={doc.downloadUrl} download><Download className="mr-2 h-4 w-4" />{t("cp5.documents.actions.download")}</a>
          </DropdownMenuItem>
          {privileged && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onEdit(doc, "rename")} data-testid={`menu-rename-${doc.id}`}><Pencil className="mr-2 h-4 w-4" />{t("cp5.documents.actions.rename")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(doc, "category")} data-testid={`menu-category-${doc.id}`}><FolderInput className="mr-2 h-4 w-4" />{t("cp5.documents.actions.changeCategory")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(doc, "note")} data-testid={`menu-note-${doc.id}`}><NotebookPen className="mr-2 h-4 w-4" />{t("cp5.documents.actions.editNote")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(doc)} data-testid={`menu-delete-${doc.id}`}>
                <Trash2 className="mr-2 h-4 w-4" />{t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
