import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Leaf,
  ChevronRight,
  Pencil,
  Trash2,
  CalendarDays,
} from "lucide-react";
import type { Season } from "@shared/schema";

export default function SeasonsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: seasons, isLoading } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
  });

  const canManage = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || null, startDate: startDate || null, endDate: endDate || null };
      if (editingSeason) {
        const res = await apiRequest("PATCH", `/api/seasons/${editingSeason.id}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/seasons", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seasons"] });
      toast({ title: editingSeason ? "Season updated" : "Season created" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to save season", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/seasons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seasons"] });
      toast({ title: "Season deleted" });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete season", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSeason(null);
    setName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
  };

  const openEdit = (season: Season) => {
    setEditingSeason(season);
    setName(season.name);
    setDescription(season.description || "");
    setStartDate(season.startDate || "");
    setEndDate(season.endDate || "");
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-seasons-title">
            <Leaf className="w-6 h-6" />
            Seasons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize campaigns into named seasons for aggregated reporting
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)} data-testid="button-create-season">
            <Plus className="w-4 h-4 mr-1" />
            New Season
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {seasons?.map(season => (
          <Card
            key={season.id}
            className="hover-elevate cursor-pointer"
            onClick={() => navigate(`/dashboard/seasons/${season.id}`)}
            data-testid={`card-season-${season.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Leaf className="w-5 h-5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium" data-testid={`text-season-name-${season.id}`}>{season.name}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {season.description && <span>{season.description}</span>}
                    {(season.startDate || season.endDate) && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {season.startDate || "?"} – {season.endDate || "?"}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); openEdit(season); }}
                      data-testid={`button-edit-season-${season.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(season.id); }}
                      data-testid={`button-delete-season-${season.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
        {(!seasons || seasons.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No seasons created yet. Create one to start organizing campaigns.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSeason ? "Edit Season" : "New Season"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring 2026"
                data-testid="input-season-name"
              />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                data-testid="input-season-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-season-start"
                />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-season-end"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !name.trim()}
              data-testid="button-save-season"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editingSeason ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Season</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? Campaigns assigned to this season will be unlinked.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-season"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
