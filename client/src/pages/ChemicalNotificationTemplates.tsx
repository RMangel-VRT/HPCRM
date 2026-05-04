import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Eye, Mail, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type ChemicalNotificationTemplate = {
  id: string;
  name: string;
  serviceType: string | null;
  isDefault: boolean;
  preVisitSubject: string;
  preVisitHtml: string;
  postVisitSubject: string;
  postVisitHtml: string;
  createdAt: string;
  updatedAt: string;
};

const SERVICE_TYPE_OPTIONS = [
  { value: "broadleaf_weed_control", label: "Broadleaf Weed Control" },
  { value: "fertilizer_application", label: "Fertilizer Application" },
  { value: "pre_emergent_application", label: "Pre-Emergent Application" },
  { value: "crabgrass_treatment", label: "Crabgrass Treatment" },
  { value: "fungicide_application", label: "Fungicide Application" },
  { value: "insecticide_application", label: "Insecticide Application" },
  { value: "aeration_overseeding", label: "Aeration & Overseeding" },
  { value: "custom", label: "Custom" },
];

const PRE_VISIT_VARIABLES = [
  { token: "{{companyName}}", description: "Your company name" },
  { token: "{{customerName}}", description: "The customer / property name" },
  { token: "{{campaignTitle}}", description: "Campaign title" },
  { token: "{{targetDate}}", description: "Scheduled / target visit date" },
  { token: "{{backupDate}}", description: "Backup / window end date" },
  { token: "{{notes}}", description: "Additional notes entered at send time" },
];

const POST_VISIT_VARIABLES = [
  { token: "{{companyName}}", description: "Your company name" },
  { token: "{{customerName}}", description: "The customer / property name" },
  { token: "{{campaignTitle}}", description: "Campaign title" },
  { token: "{{completionDate}}", description: "Completion date" },
  { token: "{{areasTreated}}", description: "Areas treated (entered at send time)" },
  { token: "{{applicationConditions}}", description: "Weather / application conditions (entered at send time)" },
  { token: "{{nextVisitDate}}", description: "Next scheduled visit date (entered at send time)" },
  { token: "{{notes}}", description: "Technician notes entered at send time" },
];

const SAMPLE_PRE_VARS: Record<string, string> = {
  companyName: "Greenfield Lawn Care",
  customerName: "Smith Residence",
  campaignTitle: "Spring Weed Control 2025",
  targetDate: "May 15, 2025",
  backupDate: "May 22, 2025",
  notes: "Please ensure pets are inside prior to our visit.",
};

const SAMPLE_POST_VARS: Record<string, string> = {
  companyName: "Greenfield Lawn Care",
  customerName: "Smith Residence",
  campaignTitle: "Spring Weed Control 2025",
  completionDate: "May 15, 2025",
  areasTreated: "Front lawn, back lawn",
  applicationConditions: "Temp 68°F, wind calm, partly cloudy",
  nextVisitDate: "June 12, 2025",
  notes: "Crabgrass pressure is moderate — expect full results in 2–3 weeks.",
};

function substituteVars(template: string, vars: Record<string, string>): string {
  let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    return vars[varName]?.trim() ? content : '';
  });
  return result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

function serviceTypeLabel(serviceType: string | null): string {
  if (!serviceType) return "—";
  return SERVICE_TYPE_OPTIONS.find(o => o.value === serviceType)?.label || serviceType;
}

const BLANK_FORM = {
  name: "",
  serviceType: SERVICE_TYPE_OPTIONS[0].value,
  preVisitSubject: "",
  preVisitHtml: "",
  postVisitSubject: "",
  postVisitHtml: "",
};

export default function ChemicalNotificationTemplates() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"pre" | "post" | null>(null);
  const [showVarsPanel, setShowVarsPanel] = useState(false);

  const { data: templates = [], isLoading } = useQuery<ChemicalNotificationTemplate[]>({
    queryKey: ["/api/chemical-notification-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof BLANK_FORM) => {
      const res = await apiRequest("POST", "/api/chemical-notification-templates", {
        ...data,
        serviceType: data.serviceType || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
      toast({ title: "Template created" });
      setShowForm(false);
      setForm(BLANK_FORM);
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof BLANK_FORM }) => {
      const res = await apiRequest("PATCH", `/api/chemical-notification-templates/${id}`, {
        ...data,
        serviceType: data.serviceType || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
      toast({ title: "Template updated" });
      setShowForm(false);
      setEditingId(null);
      setForm(BLANK_FORM);
    },
    onError: () => {
      toast({ title: "Failed to update template", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/chemical-notification-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
      toast({ title: "Template deleted" });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete template", variant: "destructive" });
    },
  });

  const handleEdit = (tpl: ChemicalNotificationTemplate) => {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      serviceType: tpl.serviceType || "",
      preVisitSubject: tpl.preVisitSubject,
      preVisitHtml: tpl.preVisitHtml,
      postVisitSubject: tpl.postVisitSubject,
      postVisitHtml: tpl.postVisitHtml,
    });
    setShowForm(true);
    setPreviewMode(null);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    if (!form.preVisitSubject.trim() || !form.postVisitSubject.trim()) {
      toast({ title: "Pre-visit and post-visit subjects are required", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const previewHtml = previewMode === "pre"
    ? substituteVars(form.preVisitHtml, SAMPLE_PRE_VARS)
    : previewMode === "post"
      ? substituteVars(form.postVisitHtml, SAMPLE_POST_VARS)
      : "";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-notification-templates">Chemical Notification Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage email templates used for chemical campaign pre-visit and post-visit notifications.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(BLANK_FORM); setShowForm(true); setPreviewMode(null); }} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No notification templates yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id} data-testid={`row-template-${tpl.id}`}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell>
                      {tpl.serviceType ? (
                        <Badge variant="secondary" className="text-xs">{serviceTypeLabel(tpl.serviceType)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(tpl.updatedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(tpl)} data-testid={`button-edit-template-${tpl.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(tpl.id)} data-testid={`button-delete-template-${tpl.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); setPreviewMode(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-template-form">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Notification Template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Broadleaf Weed Control"
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Service Type</Label>
                <Select value={form.serviceType} onValueChange={(v) => setForm(f => ({ ...f, serviceType: v }))}>
                  <SelectTrigger data-testid="select-template-service-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Pre-Visit Email</h3>
                <Button variant="outline" size="sm" onClick={() => setPreviewMode(prev => prev === "pre" ? null : "pre")} data-testid="button-preview-pre">
                  <Eye className="w-4 h-4 mr-1" />
                  {previewMode === "pre" ? "Hide Preview" : "Preview"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={form.preVisitSubject}
                  onChange={(e) => setForm(f => ({ ...f, preVisitSubject: e.target.value }))}
                  placeholder="e.g. Upcoming Broadleaf Weed Control — {{customerName}}"
                  data-testid="input-pre-visit-subject"
                />
              </div>
              <div className="space-y-2">
                <Label>HTML Body</Label>
                <Textarea
                  value={form.preVisitHtml}
                  onChange={(e) => setForm(f => ({ ...f, preVisitHtml: e.target.value }))}
                  placeholder="Paste your email HTML here..."
                  rows={10}
                  className="font-mono text-xs"
                  data-testid="textarea-pre-visit-html"
                />
              </div>
              {previewMode === "pre" && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preview (sample data)</Label>
                  <div className="border rounded-md overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      title="Pre-visit email preview"
                      className="w-full min-h-[400px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Post-Visit Email</h3>
                <Button variant="outline" size="sm" onClick={() => setPreviewMode(prev => prev === "post" ? null : "post")} data-testid="button-preview-post">
                  <Eye className="w-4 h-4 mr-1" />
                  {previewMode === "post" ? "Hide Preview" : "Preview"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={form.postVisitSubject}
                  onChange={(e) => setForm(f => ({ ...f, postVisitSubject: e.target.value }))}
                  placeholder="e.g. Broadleaf Weed Control Completed — {{customerName}}"
                  data-testid="input-post-visit-subject"
                />
              </div>
              <div className="space-y-2">
                <Label>HTML Body</Label>
                <Textarea
                  value={form.postVisitHtml}
                  onChange={(e) => setForm(f => ({ ...f, postVisitHtml: e.target.value }))}
                  placeholder="Paste your email HTML here..."
                  rows={10}
                  className="font-mono text-xs"
                  data-testid="textarea-post-visit-html"
                />
              </div>
              {previewMode === "post" && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preview (sample data)</Label>
                  <div className="border rounded-md overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      title="Post-visit email preview"
                      className="w-full min-h-[400px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowVarsPanel(v => !v)}
                data-testid="button-toggle-vars-panel"
              >
                {showVarsPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Variable Reference
              </button>
              {showVarsPanel && (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Pre-Visit Variables</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-1.5">
                      {PRE_VISIT_VARIABLES.map((v) => (
                        <div key={v.token} className="flex items-start gap-2">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{v.token}</code>
                          <span className="text-xs text-muted-foreground">{v.description}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Post-Visit Variables</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-1.5">
                      {POST_VISIT_VARIABLES.map((v) => (
                        <div key={v.token} className="flex items-start gap-2">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{v.token}</code>
                          <span className="text-xs text-muted-foreground">{v.description}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); setPreviewMode(null); }} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-template">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notification template? Campaigns assigned to this template will fall back to the default email system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
