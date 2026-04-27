import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, X, Copy, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SERVICE_PLAN_CATEGORIES, SERVICE_PLAN_CATEGORY_LABELS } from "@shared/schema";
import type { ServicePlanTemplateWithItems } from "@shared/schema";

interface TemplateItemInput {
  serviceCategory: string;
  defaultAnnualQuantity: number;
}

export default function ServicePlanTemplatesAdmin() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ServicePlanTemplateWithItems | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateActive, setTemplateActive] = useState(true);
  const [items, setItems] = useState<TemplateItemInput[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<ServicePlanTemplateWithItems[]>({
    queryKey: ["/api/service-plan-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; active: string; items: TemplateItemInput[] }) => {
      return apiRequest("POST", "/api/service-plan-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-plan-templates"] });
      toast({ title: "Success", description: "Template created" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; active: string; items: TemplateItemInput[] } }) => {
      return apiRequest("PATCH", `/api/service-plan-templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-plan-templates"] });
      toast({ title: "Success", description: "Template updated" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/service-plan-templates/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-plan-templates"] });
      toast({ title: "Success", description: "Template deleted" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: ServicePlanTemplateWithItems) => {
      return apiRequest("POST", "/api/service-plan-templates", {
        name: `${template.name} (Copy)`,
        active: template.active,
        items: template.items.map(i => ({
          serviceCategory: i.serviceCategory,
          defaultAnnualQuantity: i.defaultAnnualQuantity,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-plan-templates"] });
      toast({ title: "Success", description: "Template duplicated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to duplicate template", variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateActive(true);
    setItems([]);
    setDialogOpen(true);
  }

  function openEdit(template: ServicePlanTemplateWithItems) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateActive(template.active === "true");
    setItems(template.items.map(i => ({ serviceCategory: i.serviceCategory, defaultAnnualQuantity: i.defaultAnnualQuantity })));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingTemplate(null);
  }

  function addItem() {
    const usedCategories = items.map(i => i.serviceCategory);
    const available = SERVICE_PLAN_CATEGORIES.find(c => !usedCategories.includes(c));
    if (!available) return;
    setItems(prev => [...prev, { serviceCategory: available, defaultAnnualQuantity: 1 }]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof TemplateItemInput, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function handleSubmit() {
    if (!templateName.trim()) {
      toast({ title: "Validation", description: "Template name is required", variant: "destructive" });
      return;
    }
    const data = {
      name: templateName.trim(),
      active: templateActive ? "true" : "false",
      items,
    };
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const usedCategories = items.map(i => i.serviceCategory);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Service Plan Templates</h3>
          <p className="text-sm text-muted-foreground">Create reusable annual service plan templates for customers</p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="py-8 text-center border rounded-md bg-muted/30">
          <p className="text-sm text-muted-foreground">No templates yet</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={openCreate} data-testid="button-create-first-template">
            <Plus className="w-3 h-3 mr-1" />
            Create First Template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(template => (
            <Card key={template.id} data-testid={`card-template-${template.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-template-name-${template.id}`}>{template.name}</span>
                      <Badge variant={template.active === "true" ? "default" : "secondary"} data-testid={`badge-template-active-${template.id}`}>
                        {template.active === "true" ? "Active" : "Inactive"}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-template-customer-count-${template.id}`}>
                        <Users className="w-3 h-3" />
                        {template.customerCount === 1 ? "1 customer" : `${template.customerCount} customers`}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.items.map(item => (
                        <Badge key={item.id} variant="outline" className="text-xs" data-testid={`badge-template-item-${item.id}`}>
                          {SERVICE_PLAN_CATEGORY_LABELS[item.serviceCategory as keyof typeof SERVICE_PLAN_CATEGORY_LABELS] ?? item.serviceCategory} &times; {item.defaultAnnualQuantity}
                        </Badge>
                      ))}
                      {template.items.length === 0 && (
                        <span className="text-xs text-muted-foreground">No services configured</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(template)} data-testid={`button-edit-template-${template.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => duplicateMutation.mutate(template)} disabled={duplicateMutation.isPending} data-testid={`button-duplicate-template-${template.id}`}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(template.id)} data-testid={`button-delete-template-${template.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Service Plan Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g., Full Service Package"
                data-testid="input-template-name"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="template-active"
                checked={templateActive}
                onCheckedChange={setTemplateActive}
                data-testid="switch-template-active"
              />
              <Label htmlFor="template-active">Active</Label>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Service Line Items</Label>
                <Button size="sm" variant="outline" onClick={addItem} disabled={items.length >= SERVICE_PLAN_CATEGORIES.length} data-testid="button-add-item">
                  <Plus className="w-3 h-3 mr-1" />
                  Add Service
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No services added yet</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded-md" data-testid={`item-row-${idx}`}>
                      <div className="flex-1">
                        <Select
                          value={item.serviceCategory}
                          onValueChange={val => updateItem(idx, "serviceCategory", val)}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid={`select-item-category-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SERVICE_PLAN_CATEGORIES.map(cat => (
                              <SelectItem
                                key={cat}
                                value={cat}
                                disabled={usedCategories.includes(cat) && cat !== item.serviceCategory}
                              >
                                {SERVICE_PLAN_CATEGORY_LABELS[cat]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          min="0"
                          value={item.defaultAnnualQuantity}
                          onChange={e => updateItem(idx, "defaultAnnualQuantity", parseInt(e.target.value) || 0)}
                          className="h-8 text-sm text-center"
                          data-testid={`input-item-qty-${idx}`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">/ yr</span>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} data-testid={`button-remove-item-${idx}`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-template">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={open => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this template? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
