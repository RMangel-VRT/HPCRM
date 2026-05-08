import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface DeleteCommunicationButtonProps {
  communicationId: string;
  subject?: string | null;
  variant?: "icon" | "text";
  invalidateKeys?: unknown[][];
  onDeleted?: () => void;
}

const UNDO_WINDOW_MS = 10000;

export default function DeleteCommunicationButton({
  communicationId,
  subject,
  variant = "icon",
  invalidateKeys = [],
  onDeleted,
}: DeleteCommunicationButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/communications/${communicationId}`);
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to delete communication");
      }
    },
    onSuccess: () => {
      invalidateAll();
      setOpen(false);
      onDeleted?.();

      let undone = false;
      const handle = toast({
        title: "Communication deleted",
        description: subject ? `"${subject}" was removed.` : "The communication was removed.",
        duration: UNDO_WINDOW_MS,
        action: (
          <ToastAction
            altText="Undo delete"
            data-testid={`button-undo-delete-comm-${communicationId}`}
            onClick={async (e) => {
              e.preventDefault();
              if (undone) return;
              undone = true;
              try {
                const res = await apiRequest(
                  "POST",
                  `/api/communications/${communicationId}/restore`,
                );
                if (!res.ok) {
                  const text = await res.text().catch(() => "");
                  throw new Error(text || "Failed to restore communication");
                }
                handle.dismiss();
                invalidateAll();
                toast({ title: "Communication restored" });
              } catch (err) {
                toast({
                  title: "Failed to undo delete",
                  description: err instanceof Error ? err.message : String(err),
                  variant: "destructive",
                });
              }
            }}
          >
            <Undo2 className="w-3.5 h-3.5 mr-1" />
            Undo
          </ToastAction>
        ),
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete communication",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  };

  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={handleTriggerClick}
          aria-label="Delete communication"
          data-testid={`button-delete-comm-${communicationId}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground hover:text-destructive gap-1"
          onClick={handleTriggerClick}
          data-testid={`button-delete-comm-${communicationId}`}
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this communication?</AlertDialogTitle>
            <AlertDialogDescription>
              {subject
                ? `"${subject}" will be removed. You'll have a few seconds to undo from the toast.`
                : "This communication will be removed. You'll have a few seconds to undo from the toast."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={stop}
              data-testid={`button-cancel-delete-comm-${communicationId}`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              data-testid={`button-confirm-delete-comm-${communicationId}`}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
