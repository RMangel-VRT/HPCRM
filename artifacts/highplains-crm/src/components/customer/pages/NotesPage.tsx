import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Pin, PinOff, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { extractApiErrorMessage } from "@/lib/apiError";
import { useCustomerScope } from "@/lib/customerScope";
import { invalidateCustomerNotes, sortNotes, usePinNote, type CustomerNote } from "@/hooks/useCustomerNotes";
import { CardListSkeleton, PageEmptyState, useCustomerDates } from "@/components/customer/page";

export default function NotesPage({ customerId, notes, isLoading, error, onRetry, canWrite, onEdit }: {
  customerId: string; notes: CustomerNote[] | undefined; isLoading: boolean; error: unknown; onRetry: () => void;
  canWrite: boolean; onEdit: (note: CustomerNote) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const dates = useCustomerDates();
  const scope = useCustomerScope();
  const [confirmDelete, setConfirmDelete] = useState<CustomerNote | null>(null);
  const fail = (e: Error) => toast({ title: t("common.error"), description: extractApiErrorMessage(e) ?? e.message, variant: "destructive" });
  const pin = usePinNote(customerId, { onError: fail });
  const del = useMutation({
    mutationFn: async (noteId: string) => {
      const started = scope.companyId;
      await scope.request("DELETE", `/api/notes/${encodeURIComponent(noteId)}`);
      scope.assertSameCompany(started);
    },
    onSuccess: () => { invalidateCustomerNotes(customerId); toast({ title: t("common.success"), description: t("customerDetail.noteDeleted") }); },
    onError: fail,
  });

  if (isLoading) return <CardListSkeleton count={3} testId="notes-skeleton" />;
  if (error) return (
    <PageEmptyState icon={StickyNote} message={t("cp4.loadFailed")} testId="notes-error"
      action={<Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-notes">{t("cp4.retry")}</Button>} />
  );
  const sorted = sortNotes(notes ?? []);
  if (!sorted.length) return <PageEmptyState icon={StickyNote} message={t("customerDetail.noNotes")} testId="notes-empty" />;

  return (
    <div className="space-y-3" data-testid="notes-list">
      {sorted.map(note => {
        const pinned = !!note.pinnedAt;
        return (
          <article key={note.id} className="rounded-[10px] border bg-card px-4 py-3" data-testid={`card-note-${note.id}`} data-pinned={pinned ? "true" : "false"}>
            <header className="flex items-center gap-2">
              <h3 className="min-w-0 truncate text-[13.5px] font-semibold" data-testid={`text-note-heading-${note.id}`}>
                {note.authorName || t("cp4.notes.unknownAuthor")}
                <span className="font-normal text-muted-foreground"> · <span data-testid={`text-note-date-${note.id}`}>{dates.day(note.createdAt)}</span></span>
              </h3>
              {pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--est-warn-bg))] px-2 py-0.5 text-[11.5px] font-medium text-[hsl(var(--est-warn))]" data-testid={`chip-pinned-${note.id}`}>
                  <Pin className="h-3 w-3" aria-hidden="true" />{t("cp4.notes.pinned")}
                </span>
              )}
              {canWrite && (
                <div className="ml-auto flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("customerDetail.editNote")} onClick={() => onEdit(note)} data-testid={`button-edit-note-${note.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("cp4.notes.more")} data-testid={`button-note-menu-${note.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={pin.isPending} onSelect={() => pin.mutate({ noteId: note.id, pinned: !pinned })} data-testid={`menu-pin-note-${note.id}`}>
                        {pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                        {pinned ? t("cp4.notes.unpin") : t("cp4.notes.pin")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(note)} data-testid={`menu-delete-note-${note.id}`}>
                        <Trash2 className="mr-2 h-4 w-4" />{t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </header>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm" data-testid={`text-note-body-${note.id}`}>{note.body}</p>
          </article>
        );
      })}
      <AlertDialog open={!!confirmDelete} onOpenChange={o => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cp4.notes.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ticketDetail.cannotUndo")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-note">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-note"
              onClick={() => { if (confirmDelete) del.mutate(confirmDelete.id); setConfirmDelete(null); }}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
