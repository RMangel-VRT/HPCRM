import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  CheckSquare,
  Square,
  AlertCircle,
  Camera,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type WorkItem = {
  id: string;
  ticketId: string;
  label: string;
  instruction: string | null;
  photoRequired: boolean;
  sortOrder: number;
  isRequired: boolean;
  isComplete: boolean;
  completedAt: string | null;
  completedById: string | null;
  skipReason: string | null;
  skipNote: string | null;
};

type TemplateItem = {
  id: string;
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
};

interface Props {
  ticketId: string;
  serviceType?: string | null;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  out_of_supplies: "Out of supplies",
  inaccessible: "Inaccessible",
  weather: "Weather",
  customer_request: "Customer request",
  other: "Other",
  // Legacy codes kept for back-compat in case older rows still use them.
  access_denied: "No access",
  equipment_issue: "Equipment broken",
  not_applicable: "Not applicable",
};

export function TicketWorkItemsCard({ ticketId, serviceType }: Props) {
  const { toast } = useToast();
  const itemsKey = ["/api/tickets", ticketId, "work-items"] as const;

  const { data: items = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: itemsKey,
    queryFn: async () =>
      apiRequest("GET", `/api/tickets/${ticketId}/work-items`).then((r) => r.json()),
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/service-type-templates"],
    queryFn: async () =>
      apiRequest("GET", "/api/service-type-templates").then((r) => r.json()),
  });

  const matchingTemplates = useMemo(
    () => (serviceType ? templates.filter((t) => t.serviceType === serviceType) : templates),
    [templates, serviceType],
  );

  const [newLabel, setNewLabel] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [newPhotoRequired, setNewPhotoRequired] = useState(false);
  const [newRequired, setNewRequired] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: itemsKey });

  const addMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/tickets/${ticketId}/work-items`, {
        label: newLabel.trim(),
        instruction: newInstruction.trim() || null,
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
    mutationFn: async (vars: { id: string } & Partial<WorkItem>) => {
      const { id, ...body } = vars;
      return apiRequest("PATCH", `/api/tickets/${ticketId}/work-items/${id}`, body);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/tickets/${ticketId}/work-items/${id}`),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: async (next: WorkItem[]) =>
      apiRequest("POST", `/api/tickets/${ticketId}/work-items/reorder`, {
        items: next.map((it, i) => ({ id: it.id, sortOrder: i })),
      }),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      toast({
        title: "Reorder failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const loadMutation = useMutation({
    mutationFn: async (vars: { templateId: string; replace: boolean }) =>
      apiRequest("POST", `/api/tickets/${ticketId}/work-items/load-template`, vars),
    onSuccess: () => {
      setTemplateId("");
      invalidate();
      toast({ title: "Template loaded" });
    },
    onError: (e: unknown) =>
      toast({
        title: "Load failed",
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
    <Card data-testid="card-work-items">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckSquare className="w-4 h-4" />
          Work items
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No work items yet. Add items below or load from a template.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => (
              <WorkItemRow
                key={it.id}
                item={it}
                idx={idx}
                total={items.length}
                reorderPending={reorderMutation.isPending}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
                onPatch={(body) => patchMutation.mutate({ id: it.id, ...body })}
                onDelete={() => {
                  if (confirm("Delete this work item?")) deleteMutation.mutate(it.id);
                }}
              />
            ))}
          </ul>
        )}

        <div className="space-y-2 pt-3 border-t">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Add work item
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
            placeholder="Instruction shown to crew (optional)"
            className="min-h-[50px] text-xs"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Switch checked={newRequired} onCheckedChange={setNewRequired} />
              <span>Required</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Switch checked={newPhotoRequired} onCheckedChange={setNewPhotoRequired} />
              <Camera className="h-3 w-3" />
              <span>Photo</span>
            </label>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => addMutation.mutate()}
              disabled={!newLabel.trim() || addMutation.isPending}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {matchingTemplates.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Load from template..." />
              </SelectTrigger>
              <SelectContent>
                {matchingTemplates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.serviceType.replace(/_/g, " ")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!templateId || loadMutation.isPending}
              onClick={() => loadMutation.mutate({ templateId, replace: false })}
            >
              Append
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!templateId || loadMutation.isPending}
              onClick={() => {
                if (confirm("Replace existing items with template?"))
                  loadMutation.mutate({ templateId, replace: true });
              }}
            >
              Replace
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Row uses local state for label/instruction so editing doesn't fight
// the query refetch (otherwise every keystroke fires a PATCH and the
// server response snaps the input back mid-type).
function WorkItemRow({
  item,
  idx,
  total,
  reorderPending,
  onMoveUp,
  onMoveDown,
  onPatch,
  onDelete,
}: {
  item: WorkItem;
  idx: number;
  total: number;
  reorderPending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (body: Partial<WorkItem>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [instruction, setInstruction] = useState(item.instruction ?? "");

  useEffect(() => {
    setLabel(item.label);
  }, [item.id, item.label]);
  useEffect(() => {
    setInstruction(item.instruction ?? "");
  }, [item.id, item.instruction]);

  return (
    <li
      className="rounded-md border p-2 space-y-1.5"
      data-testid={`row-work-item-${item.id}`}
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
        {item.isComplete ? (
          <CheckSquare className="w-4 h-4 mt-1 text-green-600 shrink-0" />
        ) : (
          <Square className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              const next = label.trim();
              if (next && next !== item.label) onPatch({ label: next });
              else if (!next) setLabel(item.label);
            }}
            className="h-7 text-sm"
          />
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onBlur={() => {
              const current = item.instruction ?? "";
              if (instruction !== current)
                onPatch({ instruction: instruction.trim() ? instruction : null });
            }}
            placeholder="Instruction shown to crew (optional)"
            className="min-h-[50px] text-xs"
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
              <span>Photo</span>
            </label>
            {item.isRequired && (
              <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                Required
              </Badge>
            )}
            {item.skipReason && !item.isComplete && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                <AlertCircle className="w-3 h-3 mr-1" />
                {SKIP_REASON_LABELS[item.skipReason] ?? "Skipped"}
              </Badge>
            )}
          </div>
          {item.skipNote && !item.isComplete && (
            <p className="text-xs text-muted-foreground italic">"{item.skipNote}"</p>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </li>
  );
}
