import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SERVICE_PLAN_CATEGORIES, SERVICE_PLAN_CATEGORY_LABELS } from "@shared/schema";
import type { ServiceFulfillmentRow, CustomerServicePlan, ServicePlanTemplateWithItems } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  customerId: string;
}

export default function ServiceFulfillmentPanel({ customerId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CustomerServicePlan | null>(null);
  const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [formData, setFormData] = useState({
    serviceCategory: "mowing",
    expectedQuantity: 1,
    notes: "",
  });

  const isAdminOrOffice = user?.activeRole === "admin" || user?.activeRole === "office" || user?.isSuperAdminBool;

  const { data: fulfillment = [], isLoading: fulfillmentLoading } = useQuery<ServiceFulfillmentRow[]>({
    queryKey: ["/api/customers", customerId, "service-fulfillment", selectedYear],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/service-fulfillment?year=${selectedYear}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery<CustomerServicePlan[]>({
    queryKey: ["/api/customers", customerId, "service-plans", selectedYear],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/service-plans?year=${selectedYear}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const { data: templates = [] } = useQuery<ServicePlanTemplateWithItems[]>({
    queryKey: ["/api/service-plan-templates"],
    enabled: isAdminOrOffice,
  });

  const addPlanMutation = useMutation({
    mutationFn: async (data: { serviceCategory: string; expectedQuantity: number; notes: string; year: number }) => {
      return apiRequest("POST", `/api/customers/${customerId}/service-plans`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-fulfillment"] });
      toast({ title: "Success", description: "Service plan entry added" });
      setAddDialogOpen(false);
      setEditingPlan(null);
    },
    onError: (err: any) => {
      const is409 = err?.message?.includes("409");
      toast({
        title: is409 ? "Already exists" : "Error",
        description: is409
          ? "A service plan for this category and year already exists"
          : "Failed to add service plan entry",
        variant: "destructive",
      });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ planId, data }: { planId: string; data: { expectedQuantity: number; notes: string } }) => {
      return apiRequest("PATCH", `/api/customers/${customerId}/service-plans/${planId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-fulfillment"] });
      toast({ title: "Success", description: "Service plan updated" });
      setAddDialogOpen(false);
      setEditingPlan(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update service plan", variant: "destructive" });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      return apiRequest("DELETE", `/api/customers/${customerId}/service-plans/${planId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-fulfillment"] });
      toast({ title: "Success", description: "Service plan entry removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove entry", variant: "destructive" });
    },
  });

  const fromTemplateMutation = useMutation({
    mutationFn: async ({ templateId, year }: { templateId: string; year: number }) => {
      return apiRequest("POST", `/api/customers/${customerId}/service-plans/from-template`, { templateId, year });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "service-fulfillment"] });
      toast({ title: "Success", description: "Service plan populated from template" });
      setFromTemplateOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to populate from template", variant: "destructive" });
    },
  });

  function openAdd() {
    setEditingPlan(null);
    setFormData({ serviceCategory: "mowing", expectedQuantity: 1, notes: "" });
    setAddDialogOpen(true);
  }

  function openEdit(plan: CustomerServicePlan) {
    setEditingPlan(plan);
    setFormData({
      serviceCategory: plan.serviceCategory,
      expectedQuantity: plan.expectedQuantity,
      notes: plan.notes ?? "",
    });
    setAddDialogOpen(true);
  }

  function handleSubmit() {
    if (editingPlan) {
      updatePlanMutation.mutate({
        planId: editingPlan.id,
        data: { expectedQuantity: formData.expectedQuantity, notes: formData.notes },
      });
    } else {
      addPlanMutation.mutate({
        serviceCategory: formData.serviceCategory,
        expectedQuantity: formData.expectedQuantity,
        notes: formData.notes,
        year: selectedYear,
      });
    }
  }

  const activeTemplates = templates.filter(t => t.active === "true");
  const existingCategories = plans.map(p => p.serviceCategory);
  const availableCategories = SERVICE_PLAN_CATEGORIES.filter(c => !existingCategories.includes(c));

  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Year:</span>
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-28" data-testid="select-fulfillment-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isAdminOrOffice && (
          <div className="flex gap-2">
            {activeTemplates.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setFromTemplateOpen(true)} data-testid="button-from-template">
                From Template
              </Button>
            )}
            <Button size="sm" onClick={openAdd} disabled={availableCategories.length === 0} data-testid="button-add-plan-entry">
              <Plus className="w-3 h-3 mr-1" />
              Add Service
            </Button>
          </div>
        )}
      </div>

      {fulfillmentLoading || plansLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading fulfillment data...</div>
      ) : fulfillment.length === 0 ? (
        <div className="py-8 text-center border rounded-md bg-muted/30">
          <p className="text-sm text-muted-foreground">No service plan configured for {selectedYear}</p>
          {isAdminOrOffice && (
            <div className="flex gap-2 justify-center mt-2">
              {activeTemplates.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setFromTemplateOpen(true)} data-testid="button-from-template-empty">
                  From Template
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={openAdd} data-testid="button-add-first-service">
                <Plus className="w-3 h-3 mr-1" />
                Add Service
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {fulfillment.map(row => {
            const plan = plans.find(p => p.serviceCategory === row.serviceCategory);
            const isComplete = row.completedCount >= row.expectedQuantity;
            const isScheduled = row.scheduledCount >= row.expectedQuantity;
            const isUnder = !isComplete && row.completedCount < row.expectedQuantity;
            const gap = row.expectedQuantity - row.completedCount;

            return (
              <Card key={row.planId} data-testid={`card-fulfillment-${row.serviceCategory}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {SERVICE_PLAN_CATEGORY_LABELS[row.serviceCategory] ?? row.serviceCategory}
                        </span>
                        {isComplete ? (
                          <Badge className="bg-green-600 text-white text-xs" data-testid={`badge-status-complete-${row.serviceCategory}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Fulfilled
                          </Badge>
                        ) : isScheduled ? (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-status-scheduled-${row.serviceCategory}`}>
                            <Clock className="w-3 h-3 mr-1" />
                            Scheduled
                          </Badge>
                        ) : isUnder && row.scheduledCount > 0 ? (
                          <Badge variant="secondary" className="text-xs text-amber-700 dark:text-amber-400" data-testid={`badge-status-partial-${row.serviceCategory}`}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Partial
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs" data-testid={`badge-status-gap-${row.serviceCategory}`}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {gap} behind
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                        <span data-testid={`text-expected-${row.serviceCategory}`}>Expected: <strong className="text-foreground">{row.expectedQuantity}</strong></span>
                        <span data-testid={`text-scheduled-${row.serviceCategory}`}>Scheduled: <strong className="text-foreground">{row.scheduledCount}</strong></span>
                        <span data-testid={`text-completed-${row.serviceCategory}`}>Completed: <strong className="text-foreground">{row.completedCount}</strong></span>
                      </div>
                      {row.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{row.notes}</p>
                      )}
                    </div>
                    {isAdminOrOffice && plan && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(plan)} data-testid={`button-edit-plan-${row.serviceCategory}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deletePlanMutation.mutate(plan.id)}
                          disabled={deletePlanMutation.isPending}
                          data-testid={`button-delete-plan-${row.serviceCategory}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Service Plan Entry" : "Add Service to Plan"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {!editingPlan && (
              <div className="space-y-2">
                <Label>Service Category</Label>
                <Select
                  value={formData.serviceCategory}
                  onValueChange={v => setFormData(prev => ({ ...prev, serviceCategory: v }))}
                >
                  <SelectTrigger data-testid="select-plan-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {SERVICE_PLAN_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editingPlan && (
              <div>
                <Label className="text-muted-foreground text-xs">Service Category</Label>
                <p className="text-sm font-medium">
                  {SERVICE_PLAN_CATEGORY_LABELS[editingPlan.serviceCategory as keyof typeof SERVICE_PLAN_CATEGORY_LABELS] ?? editingPlan.serviceCategory}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Expected Quantity (per year)</Label>
              <Input
                type="number"
                min="0"
                value={formData.expectedQuantity}
                onChange={e => setFormData(prev => ({ ...prev, expectedQuantity: parseInt(e.target.value) || 0 }))}
                data-testid="input-plan-qty"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes..."
                rows={2}
                data-testid="textarea-plan-notes"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-plan">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={addPlanMutation.isPending || updatePlanMutation.isPending}
              data-testid="button-save-plan"
            >
              {addPlanMutation.isPending || updatePlanMutation.isPending ? "Saving..." : editingPlan ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fromTemplateOpen} onOpenChange={setFromTemplateOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Populate from Template</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <p className="text-sm text-muted-foreground">
              Select a service plan template to populate the {selectedYear} plan for this customer. Each template line will be added as an expected quantity.
            </p>
            {plans.length > 0 && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                Services already configured for this customer will be skipped — only missing categories will be added.
              </p>
            )}
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.items.length} services)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedTemplateId && (
              <div className="border rounded-md p-3 space-y-1">
                {activeTemplates.find(t => t.id === selectedTemplateId)?.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{SERVICE_PLAN_CATEGORY_LABELS[item.serviceCategory as keyof typeof SERVICE_PLAN_CATEGORY_LABELS] ?? item.serviceCategory}</span>
                    <span className="text-muted-foreground">{item.defaultAnnualQuantity}x / year</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setFromTemplateOpen(false)} data-testid="button-cancel-template-populate">Cancel</Button>
            <Button
              disabled={!selectedTemplateId || fromTemplateMutation.isPending}
              onClick={() => fromTemplateMutation.mutate({ templateId: selectedTemplateId, year: selectedYear })}
              data-testid="button-apply-template"
            >
              {fromTemplateMutation.isPending ? "Applying..." : "Apply Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
