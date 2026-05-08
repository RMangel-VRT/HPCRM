import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2, Loader2 } from "lucide-react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface DeleteCommunicationButtonProps {
  communicationId: string;
  subject?: string | null;
  variant?: "icon" | "text";
  invalidateKeys?: unknown[][];
  onDeleted?: () => void;
}

export default function DeleteCommunicationButton({
  communicationId,
  subject,
  variant = "icon",
  invalidateKeys = [],
  onDeleted,
}: DeleteCommunicationButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/communications/${communicationId}`);
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to delete communication");
      }
    },
    onSuccess: () => {
      toast({ title: "Communication deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      setOpen(false);
      onDeleted?.();
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
                ? `"${subject}" will be permanently removed. This action cannot be undone.`
                : "This communication will be permanently removed. This action cannot be undone."}
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
