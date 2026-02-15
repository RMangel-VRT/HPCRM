import { useQuery, useMutation } from "@tanstack/react-query";
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
      toast({ title: "Event updated" });
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
      toast({ title: "Event deleted" });
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
      toast({ title: "Event locked" });
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
      toast({ title: "Properties added" });
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
      toast({ title: "Property removed" });
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
      toast({ title: `${data.created} ticket(s) created` });
    },
    onError: (err: Error) => {
      toast({ title: "Error generating tickets", description: err.message, variant: "destructive" });
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
        <p>Snow event not found.</p>
        <Link href="/dashboard/snow">
          <Button variant="outline" className="mt-4">Back to Events</Button>
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
              {event.eventName || "Untitled Storm"}
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
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowLockConfirm(true)} data-testid="button-lock-event">
                <Lock className="h-4 w-4 mr-1" /> Lock
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} data-testid="button-delete-event">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Date</div>
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
            <div className="text-sm text-muted-foreground">Accumulation</div>
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
            <div className="text-sm text-muted-foreground">Properties</div>
            <div className="text-lg font-semibold" data-testid="text-property-count">
              {impacts?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Tickets Created</div>
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
                <span className="text-sm font-medium text-muted-foreground">Event Notes:</span>
                <p className="text-sm mt-1" data-testid="text-event-notes">{event.eventNotes}</p>
              </div>
            )}
            {event.measurementNotes && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Measurement Notes:</span>
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
              Affected Properties
            </CardTitle>
            <div className="flex items-center gap-2">
              {!isLocked && pendingCount > 0 && (
                <Button
                  onClick={() => generateTicketsMutation.mutate()}
                  disabled={generateTicketsMutation.isPending}
                  data-testid="button-generate-tickets"
                >
                  <Ticket className="h-4 w-4 mr-1" />
                  {generateTicketsMutation.isPending ? "Generating..." : `Generate Tickets (${pendingCount})`}
                </Button>
              )}
              {!isLocked && (
                <Button variant="outline" onClick={() => setShowAddProperties(true)} data-testid="button-add-properties">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Properties
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
              <p>No properties assigned to this storm event yet.</p>
              {!isLocked && (
                <Button variant="outline" className="mt-3" onClick={() => setShowAddProperties(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Properties
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Services</TableHead>
                    <TableHead>Site Notes</TableHead>
                    <TableHead>Billing Status</TableHead>
                    <TableHead>Ticket</TableHead>
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
                              <Ticket className="h-3 w-3" /> View
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Properties to Storm Event</DialogTitle>
            <DialogDescription>
              Select snow-enabled properties affected by this storm. Only properties with snow enabled are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Apply Services to All Selected</Label>
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
                placeholder="Search properties..."
                className="pl-8"
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                data-testid="input-search-properties"
              />
            </div>

            {availableCustomers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No snow-enabled properties available. Enable snow on customer profiles first.
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
                    No matching properties found.
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProperties(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addPropertiesMutation.mutate({
                customerIds: selectedCustomerIds,
                serviceTypes: bulkServiceTypes,
              })}
              disabled={selectedCustomerIds.length === 0 || addPropertiesMutation.isPending}
              data-testid="button-confirm-add-properties"
            >
              {addPropertiesMutation.isPending ? "Adding..." : `Add ${selectedCustomerIds.length} Properties`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditEvent} onOpenChange={setShowEditEvent}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Storm Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Event Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-name" />
            </div>
            <div>
              <Label>Accumulation Range *</Label>
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
                <Label>Start Date/Time *</Label>
                <Input type="datetime-local" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} data-testid="input-edit-start" />
              </div>
              <div>
                <Label>End Date/Time</Label>
                <Input type="datetime-local" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} data-testid="input-edit-end" />
              </div>
            </div>
            <div>
              <Label>Reported Total Inches</Label>
              <Input value={editTotalInches} onChange={(e) => setEditTotalInches(e.target.value)} placeholder="e.g. 3.5" data-testid="input-edit-inches" />
            </div>
            <div>
              <Label>Measurement Notes</Label>
              <Textarea value={editMeasurementNotes} onChange={(e) => setEditMeasurementNotes(e.target.value)} data-testid="input-edit-measurement-notes" />
            </div>
            <div>
              <Label>Event Notes</Label>
              <Textarea value={editEventNotes} onChange={(e) => setEditEventNotes(e.target.value)} data-testid="input-edit-event-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditEvent(false)}>Cancel</Button>
            <Button onClick={handleUpdateEvent} disabled={updateEventMutation.isPending} data-testid="button-save-edit">
              {updateEventMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Storm Event?</DialogTitle>
            <DialogDescription>
              This will permanently delete this storm event and all associated property impacts. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteEventMutation.mutate()} disabled={deleteEventMutation.isPending} data-testid="button-confirm-delete">
              {deleteEventMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Confirmation */}
      <Dialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock Storm Event?</DialogTitle>
            <DialogDescription>
              Locking prevents any changes to the event details, accumulation range, or property list. This is recommended after invoicing to maintain billing history integrity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLockConfirm(false)}>Cancel</Button>
            <Button onClick={() => lockEventMutation.mutate()} disabled={lockEventMutation.isPending} data-testid="button-confirm-lock">
              <Lock className="h-4 w-4 mr-1" />
              {lockEventMutation.isPending ? "Locking..." : "Lock Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
