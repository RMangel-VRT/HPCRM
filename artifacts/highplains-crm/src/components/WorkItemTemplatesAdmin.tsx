import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ArrowUp,
  ArrowDown,
  Camera,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type TemplateItem = {
  id: string;
  templateId: string;
  label: string;
  defaultInstruction: string | null;
  photoRequired: boolean;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
};

type Template = {
  id: string;
  serviceType: string;
  name: string;
  items: TemplateItem[];
  createdAt: string;
  updatedAt: string;
};

const SERVICE_TYPES = [
  "mowing",
  "pet_station",
  "chemical",
  "shrub_trimming",
  "ornamental_grass",
  "aeration",
  "cleanups",
  "tree_pruning",
];

export default function WorkItemTemplatesAdmin() {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/service-type-templates"],
    queryFn: async () =>
      apiRequest("GET", "/api/service-type-templates").then((r) => r.json()),
  });

  // Track the editing template by ID and derive the live template object
  // from the query cache. This guarantees the dialog always renders fresh
  // items after add/patch/delete/reorder mutations invalidate the query —
  // a snapshot reference would render stale data.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const editing = useMemo(
    () => (editingId ? templates.find((t) => t.id === editingId) ?? null : null),
    [editingId, templates],
  );

  // Header form state (service type + name only — items are managed
  // inside the dialog via their own sub-resource endpoints).
  const [draftServiceType, setDraftServiceType] = useState("mowing");
  const [draftName, setDraftName] = useState("");

  const grouped = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of templates) {
      const arr = m.get(t.serviceType) ?? [];
      arr.push(t);
      m.set(t.serviceType, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  function openCreate() {
    setEditingId(null);
    setDraftServiceType("mowing");
    setDraftName("");
    setOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setDraftServiceType(t.serviceType);
    setDraftName(t.name);
    setOpen(true);
  }

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const body = { serviceType: draftServiceType, name: draftName.trim() };
      if (editing) {
        const r = await apiRequest(
          "PATCH",
          `/api/service-type-templates/${editing.id}`,
          body,
        );
        return r.json();
      }
      const r = await apiRequest("POST", "/api/service-type-templates", body);
      return r.json();
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-type-templates"] });
      toast({ title: editing ? "Template updated" : "Template created" });
      // Promote a freshly-created template to "editing" so the user can
      // immediately add items without re-opening the dialog. We only need
      // the id — `editing` is derived from the live query data above.
      if (!editing && saved?.id) {
        setEditingId(saved.id);
      }
    },
    onError: (err: unknown) => {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/service-type-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-type-templates"] });
      toast({ title: "Template deleted" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Work Item Templates</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable checklists per service type. Crews see these on tickets in the mobile app.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-template">
          <Plus className="h-4 w-4 mr-1" /> New template
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          grouped.map(([serviceType, list]) => (
            <div key={serviceType} className="space-y-2">
              <h4 className="text-sm font-semibold uppercase text-muted-foreground">
                {serviceType.replace(/_/g, " ")}
              </h4>
              <div className="space-y-2">
                {list.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                    data-testid={`row-template-${t.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{t.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.items.length} item{t.items.length === 1 ? "" : "s"}
                        {t.items.some((i) => i.isRequired)
                          ? ` · ${t.items.filter((i) => i.isRequired).length} required`
                          : ""}
                        {t.items.some((i) => i.photoRequired)
                          ? ` · ${t.items.filter((i) => i.photoRequired).length} need photo`
                          : ""}
                      </p>
                      {t.items.length > 0 && (
                        <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                          {t.items.slice(0, 5).map((i) => (
                            <li key={i.id}>
                              {i.label}
                              {i.isRequired ? " *" : ""}
                              {i.photoRequired ? " 📷" : ""}
                            </li>
                          ))}
                          {t.items.length > 5 && <li>+{t.items.length - 5} more...</li>}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete template "${t.name}"?`)) deleteMutation.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Service type</Label>
                <Select value={draftServiceType} onValueChange={setDraftServiceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Template name</Label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Standard mow"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {editing
                  ? "Items below are saved automatically as you edit them."
                  : "Save the template first, then add checklist items."}
              </p>
              <Button
                size="sm"
                onClick={() => saveTemplateMutation.mutate()}
                disabled={!draftName.trim() || saveTemplateMutation.isPending}
              >
                {saveTemplateMutation.isPending ? "Saving..." : editing ? "Save" : "Create template"}
              </Button>
            </div>

            {editing ? <TemplateItemsEditor template={editing} /> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TemplateItemsEditor({ template }: { template: Template }) {
  const { toast } = useToast();
  const itemsKey = ["/api/service-type-templates"] as const;
  const items = template.items;

  const [newLabel, setNewLabel] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [newPhotoRequired, setNewPhotoRequired] = useState(false);
  const [newRequired, setNewRequired] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: itemsKey });

  const addMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/service-type-templates/${template.id}/items`, {
        label: newLabel.trim(),
        defaultInstruction: newInstruction.trim() || null,
        photoRequired: newPhotoRequired,
        isRequired: newRequired,
      }),
    onSuccess: () => {
      setNewLabel("");
      setNewInstruction("");
      setNewPhotoRequired(false);
      setNewRequired(false);
      invalidate();
    },
    onError: (e: unknown) =>
      toast({
        title: "Add failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const patchMutation = useMutation({
    mutationFn: async (vars: { id: string } & Partial<TemplateItem>) => {
      const { id, ...body } = vars;
      return apiRequest(
        "PATCH",
        `/api/service-type-templates/${template.id}/items/${id}`,
        body,
      );
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/service-type-templates/${template.id}/items/${id}`),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: async (next: TemplateItem[]) =>
      apiRequest(
        "POST",
        `/api/service-type-templates/${template.id}/items/reorder`,
        { items: next.map((it, i) => ({ id: it.id, displayOrder: i })) },
      ),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      toast({
        title: "Reorder failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    reorderMutation.mutate(next);
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Checklist items</Label>
        {reorderMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items yet. Add one below.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <TemplateItemRow
              key={item.id}
              item={item}
              idx={idx}
              total={items.length}
              reorderPending={reorderMutation.isPending}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              onPatch={(body) => patchMutation.mutate({ id: item.id, ...body })}
              onDelete={() => {
                if (confirm("Delete this item?")) deleteMutation.mutate(item.id);
              }}
            />
          ))}
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Add item
        </Label>
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label (e.g. Mow front lawn)"
          className="h-8"
        />
        <Textarea
          value={newInstruction}
          onChange={(e) => setNewInstruction(e.target.value)}
          placeholder="Default instruction (optional)"
          className="min-h-[60px] text-sm"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Switch checked={newRequired} onCheckedChange={setNewRequired} />
            <span>Required</span>
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Switch checked={newPhotoRequired} onCheckedChange={setNewPhotoRequired} />
            <Camera className="h-3 w-3" />
            <span>Photo required</span>
          </label>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!newLabel.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// Per-item row uses local state for the text inputs and only fires a
// PATCH on blur (or toggle change). This avoids "patch-per-keystroke" —
// which fights the user when the query refetches and snaps the input
// back to the server value mid-edit.
function TemplateItemRow({
  item,
  idx,
  total,
  reorderPending,
  onMoveUp,
  onMoveDown,
  onPatch,
  onDelete,
}: {
  item: TemplateItem;
  idx: number;
  total: number;
  reorderPending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (body: Partial<TemplateItem>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [instruction, setInstruction] = useState(item.defaultInstruction ?? "");

  // Re-sync local input state when the underlying server item changes
  // (e.g., after a reorder refetch updates `displayOrder`).
  useEffect(() => {
    setLabel(item.label);
  }, [item.id, item.label]);
  useEffect(() => {
    setInstruction(item.defaultInstruction ?? "");
  }, [item.id, item.defaultInstruction]);

  return (
    <div
      className="rounded-md border p-2 space-y-2"
      data-testid={`row-template-item-${item.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={idx === 0 || reorderPending}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={idx === total - 1 || reorderPending}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              const next = label.trim();
              if (next && next !== item.label) onPatch({ label: next });
              else if (!next) setLabel(item.label);
            }}
            placeholder="Label"
            className="h-8"
          />
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onBlur={() => {
              const next = instruction;
              const current = item.defaultInstruction ?? "";
              if (next !== current) onPatch({ defaultInstruction: next.trim() ? next : null });
            }}
            placeholder="Default instruction (optional, shown to crew)"
            className="min-h-[60px] text-sm"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Switch
                checked={item.isRequired}
                onCheckedChange={(v) => onPatch({ isRequired: v })}
              />
              <span>Required</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Switch
                checked={item.photoRequired}
                onCheckedChange={(v) => onPatch({ photoRequired: v })}
              />
              <Camera className="h-3 w-3" />
              <span>Photo required</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Switch
                checked={item.isActive}
                onCheckedChange={(v) => onPatch({ isActive: v })}
              />
              <span>Active</span>
            </label>
            {!item.isActive ? (
              <Badge variant="outline" className="text-[10px]">
                Hidden
              </Badge>
            ) : null}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={onDelete}
          aria-label="Delete item"
        >
          <X className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
