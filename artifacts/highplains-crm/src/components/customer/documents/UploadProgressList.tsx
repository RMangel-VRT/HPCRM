import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadItem } from "./useDocumentUploads";

export function UploadProgressList({ items, onDismiss }: { items: UploadItem[]; onDismiss: (key: string) => void }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5 rounded-[10px] border bg-card p-3" aria-label={t("cp5.documents.upload.listLabel")} data-testid="list-uploads">
      {items.map(i => (
        <li key={i.key} className="space-y-1" data-testid={`upload-item-${i.fileName}`} data-status={i.status}>
          <div className="flex items-center gap-2 text-xs">
            {i.status === "error" ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
              : i.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
            <span className="min-w-0 flex-1 truncate font-medium">{i.fileName}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground" data-testid={`text-upload-status-${i.fileName}`}>
              {i.status === "uploading" ? `${i.progress}%` : t(`cp5.documents.upload.status.${i.status}`)}
            </span>
            {(i.status === "error" || i.status === "done") && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDismiss(i.key)}
                aria-label={t("cp5.documents.upload.dismiss", { name: i.fileName })} data-testid={`button-dismiss-upload-${i.fileName}`}><X className="h-3 w-3" /></Button>
            )}
          </div>
          {i.status !== "error" && i.status !== "done" && (
            <Progress value={i.progress} className="h-1" aria-label={t("cp5.documents.upload.progressLabel", { name: i.fileName })} data-testid={`progress-upload-${i.fileName}`} />
          )}
          {i.error && <p role="alert" className="text-xs text-destructive" data-testid={`text-upload-error-${i.fileName}`}>{i.error}</p>}
        </li>
      ))}
    </ul>
  );
}
