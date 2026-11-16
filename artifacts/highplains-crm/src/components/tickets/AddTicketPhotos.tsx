import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Reference photos use the same upload/storage path as ticket creation. */
export function AddTicketPhotos({ ticketId, companyId }: { ticketId: string; companyId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);

  async function upload(files: File[]) {
    if (busy.current || !files.length) return;
    busy.current = true;
    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
          throw new Error(t("ticketDetail.photoFileRequirements"));
        }
        const headers = { "X-Company-Id": companyId };
        const grant = await apiRequest("POST", "/api/tickets/photo-upload-url", undefined, { headers });
        const { uploadURL, objectPath, uploadToken } = await grant.json();
        const stored = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!stored.ok) throw new Error(t("ticketDetail.photoUploadFailed"));
        // Append under the server's existing ticket lock, never replace a stale array.
        await apiRequest("PATCH", `/api/tickets/${encodeURIComponent(ticketId)}`, { appendPhotos: [{ path: objectPath, uploadToken }] }, { headers });
        await qc.invalidateQueries({ queryKey: ["/api/tickets", ticketId] });
      }
      toast({ title: t("newTicket.photoAdded") });
    } catch (error) {
      toast({ title: t("ticketDetail.photoUploadFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      busy.current = false;
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple className="hidden"
        aria-label={t("ticketDetail.addPhotos")} data-testid="input-ticket-photos" disabled={uploading}
        onChange={event => { const files = Array.from(event.target.files ?? []); void upload(files); }} />
      <Button type="button" size="sm" variant="outline" disabled={uploading}
        onClick={() => input.current?.click()} data-testid="button-add-ticket-photos">
        {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
        {t(uploading ? "ticketDetail.uploadingPhotos" : "ticketDetail.addPhotos")}
      </Button>
    </>
  );
}
