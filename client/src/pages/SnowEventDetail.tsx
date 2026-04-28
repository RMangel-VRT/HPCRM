import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Snowflake,
  ArrowLeft,
  Lock,
  Trash2,
  Ticket,
  Plus,
  Search,
  Building2,
  Check,
  X,
  Edit,
  Clock,
  CloudSnow,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SnowEvent, SnowEventPropertyImpactWithCustomer, Customer } from "@shared/schema";
import { SNOW_RANGES, SNOW_SERVICE_TYPES } from "@shared/schema";

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "draft": return "secondary";
    case "ready": return "default";
    case "locked": return "outline";
    default: return "secondary";
  }
}

function getBillingStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "not_created": return "secondary";
    case "ticket_created": return "default";
    case "invoiced": return "outline";
    case "paid": return "default";
    default: return "secondary";
  }
}

export default function SnowEventDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/dashboard/snow/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const eventId = params?.id;

  const [showAddProperties, setShowAddProperties] = useState(false);
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [bulkServiceTypes, setBulkServiceTypes] = useState<string[]>([]);

  const [editName, setEditName] = useState("");
  const [editRange, setEditRange] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editTotalInches, setEditTotalInches] = useState("");
  const [editMeasurementNotes, setEditMeasurementNotes] = useState("");
  const [editEventNotes, setEditEventNotes] = useState("");

  const { data: event, isLoading: eventLoading } = useQuery<SnowEvent>({
    queryKey: ["/api/snow-events", eventId],
    enabled: !!eventId,
  });

  const { data: impacts, isLoading: impactsLoading } = useQuery<SnowEventPropertyImpactWithCustomer[]>({
    queryKey: ["/api/snow-events", eventId, "impacts"],
    enabled: !!eventId,
  });

  const { data: allCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const updateEventMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/snow-events/${eventId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      setShowEditEvent(false);
      toast({ title: t("snow.eventUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/snow-events/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      navigate("/dashboard/snow");
      toast({ title: t("snow.eventDeleted") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const lockEventMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/snow-events/${eventId}/lock`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      setShowLockConfirm(false);
      toast({ title: t("snow.eventLocked") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addPropertiesMutation = useMutation({
    mutationFn: async (data: { customerIds: string[]; serviceTypes: string[] }) => {
      const res = await apiRequest("POST", `/api/snow-events/${eventId}/impacts/bulk`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events", eventId, "impacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      setShowAddProperties(false);
      setSelectedCustomerIds([]);
      setBulkServiceTypes([]);
      setPropertySearch("");
      toast({ title: t("snow.propertiesAdded") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeImpactMutation = useMutation({
    mutationFn: async (impactId: string) => {
      await apiRequest("DELETE", `/api/snow-events/${eventId}/impacts/${impactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events", eventId, "impacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      toast({ title: t("snow.propertyRemoved") });
    },
  });

  const updateImpactMutation = useMutation({
    mutationFn: async ({ impactId, data }: { impactId: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/snow-events/${eventId}/impacts/${impactId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events", eventId, "impacts"] });
    },
  });

  const generateTicketsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/snow-events/${eventId}/generate-tickets`);
      return res.json();
    },
    onSuccess: (data: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events", eventId, "impacts"] });
      toast({ title: t("snow.ticketsGenerated", { count: data.created }) });
    },
    onError: (err: Error) => {
      toast({ title: t("snow.errorGenerating"), description: err.message, variant: "destructive" });
    },
  });

  const openEditDialog = () => {
    if (!event) return;
    setEditName(event.eventName || "");
    setEditRange(event.snowRange);
    setEditStartDate(event.eventStartDateTime ? new Date(event.eventStartDateTime).toISOString().slice(0, 16) : "");
    setEditEndDate(event.eventEndDateTime ? new Date(event.eventEndDateTime).toISOString().slice(0, 16) : "");
    setEditTotalInches(event.reportedTotalInches || "");
    setEditMeasurementNotes(event.measurementNotes || "");
    setEditEventNotes(event.eventNotes || "");
    setShowEditEvent(true);
  };

  const handleUpdateEvent = () => {
    updateEventMutation.mutate({
      eventName: editName || undefined,
      snowRange: editRange,
      eventStartDateTime: editStartDate ? new Date(editStartDate).toISOString() : undefined,
      eventEndDateTime: editEndDate ? new Date(editEndDate).toISOString() : undefined,
      reportedTotalInches: editTotalInches || null,
      measurementNotes: editMeasurementNotes || null,
      eventNotes: editEventNotes || null,
    });
  };

  const snowEnabledCustomers = allCustomers?.filter(c => c.snowEnabled && c.active === "true") || [];
  const existingCustomerIds = new Set(impacts?.map(i => i.customerId) || []);
  const availableCustomers = snowEnabledCustomers.filter(c => !existingCustomerIds.has(c.id));

  const filteredAvailable = propertySearch
    ? availableCustomers.filter(c => c.name.toLowerCase().includes(propertySearch.toLowerCase()) || c.city.toLowerCase().includes(propertySearch.toLowerCase()))
    : availableCustomers;

  const pendingCount = impacts?.filter(i => i.billingStatus === "not_created").length || 0;
  const isLocked = event?.status === "locked";

  if (eventLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("snow.noEventsFound")}</p>
        <Link href="/dashboard/snow">
          <Button variant="outline" className="mt-4">{t("snow.backToEvents")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="snow-event-detail-page">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/snow">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Snowflake className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-event-name">
              {event.eventName || t("snow.untitledStorm")}
            </h1>
            <Badge variant={getStatusVariant(event.status)} data-testid="badge-event-status">
              {event.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && (
            <>
              <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit-event">
                <Edit className="h-4 w-4 mr-1" /> {t("common.edit")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowLockConfirm(true)} data-testid="button-lock-event">
                <Lock className="h-4 w-4 mr-1" /> {t("snow.lockEvent")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} data-testid="button-delete-event">
                <Trash2 className="h-4 w-4 mr-1" /> {t("common.delete")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t("common.date")}</div>
            <div className="text-lg font-semibold" data-testid="text-event-date">
              {new Date(event.eventStartDateTime).toLocaleDateString()}
            </div>
            {event.eventEndDateTime && (
              <div className="text-xs text-muted-foreground">
                to {new Date(event.eventEndDateTime).toLocaleDateString()}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t("snow.accumulation")}</div>
            <div className="text-lg font-semibold" data-testid="text-event-range">
              {event.snowRange}
            </div>
            {event.reportedTotalInches && (
              <div className="text-xs text-muted-foreground">
                Reported: {event.reportedTotalInches}"
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t("common.properties")}</div>
            <div className="text-lg font-semibold" data-testid="text-property-count">
              {impacts?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t("snow.ticketsCreated")}</div>
            <div className="text-lg font-semibold" data-testid="text-ticket-count">
              {impacts?.filter(i => i.ticketId).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {(event.eventNotes || event.measurementNotes) && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            {event.eventNotes && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t("snow.eventNotes")}</span>
                <p className="text-sm mt-1" data-testid="text-event-notes">{event.eventNotes}</p>
              </div>
            )}
            {event.measurementNotes && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">{t("snow.measurementNotes")}</span>
                <p className="text-sm mt-1">{event.measurementNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t("snow.affectedProperties")}
            </CardTitle>
            <div className="flex items-center gap-2">
              {!isLocked && pendingCount > 0 && (
                <Button
                  onClick={() => generateTicketsMutation.mutate()}
                  disabled={generateTicketsMutation.isPending}
                  data-testid="button-generate-tickets"
                >
                  <Ticket className="h-4 w-4 mr-1" />
                  {generateTicketsMutation.isPending ? t("snow.generating") : t("snow.generateTickets", { count: pendingCount })}
                </Button>
              )}
              {!isLocked && (
                <Button variant="outline" onClick={() => setShowAddProperties(true)} data-testid="button-add-properties">
                  <Plus className="h-4 w-4 mr-1" />
                  {t("snow.addPropertiesBtn")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {impactsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : !impacts || impacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CloudSnow className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{t("snow.noPropertiesAssigned")}</p>
              {!isLocked && (
                <Button variant="outline" className="mt-3" onClick={() => setShowAddProperties(true)}>
                  <Plus className="h-4 w-4 mr-1" /> {t("snow.addPropertiesBtn")}
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.property")}</TableHead>
                    <TableHead>{t("serviceTypes.other")}</TableHead>
                    <TableHead>{t("snow.siteNotes")}</TableHead>
                    <TableHead>{t("snow.billingStatus")}</TableHead>
                    <TableHead>{t("snow.ticket")}</TableHead>
                    {!isLocked && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {impacts.map(impact => (
                    <TableRow key={impact.id} data-testid={`row-impact-${impact.id}`}>
                      <TableCell className="font-medium">
                        <Link href={`/dashboard/customers/${impact.customerId}`} className="text-primary hover:underline">
                          {impact.customerName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(impact.serviceTypes || []).length > 0 ? (
                            (impact.serviceTypes as string[]).map(st => (
                              <Badge key={st} variant="outline" className="text-xs">{st}</Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {impact.siteNotes || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getBillingStatusVariant(impact.billingStatus)}>
                          {impact.billingStatus.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {impact.ticketId ? (
                          <Link href={`/dashboard/tickets/${impact.ticketId}`}>
                            <Button variant="ghost" size="sm" className="gap-1" data-testid={`link-ticket-${impact.ticketId}`}>
                              <Ticket className="h-3 w-3" /> {t("common.view")}
                            </Button>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      {!isLocked && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeImpactMutation.mutate(impact.id)}
                            disabled={impact.billingStatus !== "not_created"}
                            data-testid={`button-remove-impact-${impact.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Properties Dialog */}
      <Dialog open={showAddProperties} onOpenChange={setShowAddProperties}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("snow.addProperties")}</DialogTitle>
            <DialogDescription>
              {t("snow.selectSnowProperties")}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <div>
              <Label>{t("snow.applyServicesToAll")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {SNOW_SERVICE_TYPES.map(st => (
                  <Badge
                    key={st}
                    variant={bulkServiceTypes.includes(st) ? "default" : "outline"}
                    className="cursor-pointer toggle-elevate"
                    onClick={() => {
                      setBulkServiceTypes(prev =>
                        prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
                      );
                    }}
                    data-testid={`badge-service-${st}`}
                  >
                    {bulkServiceTypes.includes(st) && <Check className="h-3 w-3 mr-1" />}
                    {st}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("schedule.searchProperties")}
                className="pl-8"
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                data-testid="input-search-properties"
              />
            </div>

            {availableCustomers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {t("snow.enableSnow")}
              </div>
            ) : (
              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                {filteredAvailable.map(customer => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-3 p-3 border-b last:border-b-0 hover-elevate"
                  >
                    <Checkbox
                      checked={selectedCustomerIds.includes(customer.id)}
                      onCheckedChange={(checked) => {
                        setSelectedCustomerIds(prev =>
                          checked ? [...prev, customer.id] : prev.filter(id => id !== customer.id)
                        );
                      }}
                      data-testid={`checkbox-customer-${customer.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.city}, {customer.state}</p>
                    </div>
                  </div>
                ))}
                {filteredAvailable.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {t("snow.noMatchingProperties")}
                  </div>
                )}
              </div>
            )}

            {selectedCustomerIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedCustomerIds.length} property(ies) selected
              </p>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowAddProperties(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => addPropertiesMutation.mutate({
                customerIds: selectedCustomerIds,
                serviceTypes: bulkServiceTypes,
              })}
              disabled={selectedCustomerIds.length === 0 || addPropertiesMutation.isPending}
              data-testid="button-confirm-add-properties"
            >
              {addPropertiesMutation.isPending ? t("common.loading") : `${t("common.add")} ${selectedCustomerIds.length} ${t("common.properties")}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditEvent} onOpenChange={setShowEditEvent}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("snow.editEvent")}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <div>
              <Label>{t("snow.eventName")}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-name" />
            </div>
            <div>
              <Label>{t("snow.accumulationRange")} *</Label>
              <Select value={editRange} onValueChange={setEditRange}>
                <SelectTrigger data-testid="select-edit-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SNOW_RANGES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("snow.startDateTime")} *</Label>
                <Input type="datetime-local" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} data-testid="input-edit-start" />
              </div>
              <div>
                <Label>{t("snow.endDateTime")}</Label>
                <Input type="datetime-local" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} data-testid="input-edit-end" />
              </div>
            </div>
            <div>
              <Label>{t("snow.reportedTotalInches")}</Label>
              <Input value={editTotalInches} onChange={(e) => setEditTotalInches(e.target.value)} placeholder="e.g. 3.5" data-testid="input-edit-inches" />
            </div>
            <div>
              <Label>{t("snow.measurementNotes")}</Label>
              <Textarea value={editMeasurementNotes} onChange={(e) => setEditMeasurementNotes(e.target.value)} data-testid="input-edit-measurement-notes" />
            </div>
            <div>
              <Label>{t("snow.eventNotes")}</Label>
              <Textarea value={editEventNotes} onChange={(e) => setEditEventNotes(e.target.value)} data-testid="input-edit-event-notes" />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowEditEvent(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleUpdateEvent} disabled={updateEventMutation.isPending} data-testid="button-save-edit">
              {updateEventMutation.isPending ? t("common.saving") : t("settings.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("snow.deleteEvent")}?</DialogTitle>
            <DialogDescription>
              {t("snow.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteEventMutation.mutate()} disabled={deleteEventMutation.isPending} data-testid="button-confirm-delete">
              {deleteEventMutation.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Confirmation */}
      <Dialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("snow.lockEvent")}?</DialogTitle>
            <DialogDescription>
              {t("snow.lockConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLockConfirm(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => lockEventMutation.mutate()} disabled={lockEventMutation.isPending} data-testid="button-confirm-lock">
              <Lock className="h-4 w-4 mr-1" />
              {lockEventMutation.isPending ? t("common.loading") : t("snow.lockEvent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
