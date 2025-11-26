import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Send, 
  Check, 
  ChevronRight, 
  Clock, 
  MapPin, 
  User, 
  CalendarDays,
  MessageSquare,
  History,
  Loader2,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Ticket, TicketType, TicketTypeStatus, TicketTypeField, TicketFieldValue, TicketComment, TicketStatusHistory, Customer, Contract, ContractService } from "@shared/schema";
import { SERVICE_CATALOG } from "@shared/serviceCatalog";
import { format } from "date-fns";

interface TicketDetails {
  ticket: Ticket;
  ticketType: TicketType;
  statuses: (TicketTypeStatus & { fields: TicketTypeField[] })[];
  fieldValues: TicketFieldValue[];
  statusHistory: TicketStatusHistory[];
  comments: TicketComment[];
  customer: Customer;
  contract: Contract | null;
  contractServices: ContractService[];
  assignedUser: { id: string; email: string } | null;
}

const getServiceDisplayName = (serviceType: string) => {
  const service = SERVICE_CATALOG[serviceType as keyof typeof SERVICE_CATALOG];
  return service?.name || serviceType;
};

const priorityConfig = {
  urgent: { color: "bg-red-500", textColor: "text-red-700 dark:text-red-400", label: "Urgent" },
  high: { color: "bg-orange-500", textColor: "text-orange-700 dark:text-orange-400", label: "High" },
  normal: { color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400", label: "Normal" },
  low: { color: "bg-gray-400", textColor: "text-gray-600 dark:text-gray-400", label: "Low" },
};

export default function TicketDetail() {
  const [, params] = useRoute("/dashboard/tickets/:id");
  const ticketId = params?.id;
  const { toast } = useToast();
  
  const [newComment, setNewComment] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});
  const [statusNotes, setStatusNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"workflow" | "comments" | "history">("workflow");

  const { data: details, isLoading } = useQuery<TicketDetails>({
    queryKey: ["/api/tickets", ticketId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticket");
      return res.json();
    },
    enabled: !!ticketId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ statusId, notes }: { statusId: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/tickets/${ticketId}`, {
        currentStatusId: statusId,
        statusChangeNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setShowStatusDialog(false);
      setPendingStatusId(null);
      setFieldInputs({});
      setStatusNotes("");
      toast({ title: "Status updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const saveFieldValueMutation = useMutation({
    mutationFn: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      return apiRequest("PUT", `/api/tickets/${ticketId}/field-values/${fieldId}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", `/api/tickets/${ticketId}/comments`, { body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
  });

  if (isLoading || !details) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { ticket, ticketType, statuses, fieldValues, statusHistory, comments, customer, contract, contractServices = [], assignedUser } = details;
  const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);
  const currentStatusIndex = statuses.findIndex(s => s.id === ticket.currentStatusId);
  const sortedStatuses = [...statuses].sort((a, b) => a.displayOrder - b.displayOrder);
  const nextStatus = sortedStatuses[currentStatusIndex + 1];

  const handleAdvanceStatus = () => {
    if (!nextStatus) return;
    
    const nextStatusFields = nextStatus.fields || [];
    if (nextStatusFields.length > 0) {
      setPendingStatusId(nextStatus.id);
      setShowStatusDialog(true);
    } else {
      updateStatusMutation.mutate({ statusId: nextStatus.id });
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatusId) return;
    
    const targetStatus = statuses.find(s => s.id === pendingStatusId);
    const requiredFields = targetStatus?.fields?.filter(f => f.isRequired === "true") || [];
    
    for (const field of requiredFields) {
      if (!fieldInputs[field.id]) {
        toast({ title: `Please fill in ${field.fieldLabel}`, variant: "destructive" });
        return;
      }
    }

    for (const [fieldId, value] of Object.entries(fieldInputs)) {
      if (value) {
        await saveFieldValueMutation.mutateAsync({ fieldId, value });
      }
    }

    updateStatusMutation.mutate({ statusId: pendingStatusId, notes: statusNotes });
  };

  const getFieldValue = (fieldId: string) => {
    return fieldValues.find(fv => fv.fieldId === fieldId)?.value || "";
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <Badge variant="secondary" className="mb-1 text-xs">
            {ticketType.name}
          </Badge>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight line-clamp-2" data-testid="text-ticket-title">
            {ticket.title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <div className={`flex items-center gap-1.5 ${priority.textColor}`}>
          <div className={`w-2 h-2 rounded-full ${priority.color}`} />
          {priority.label}
        </div>
        {customer && (
          <Link href={`/dashboard/customers/${customer.id}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <MapPin className="w-3.5 h-3.5" />
            {customer.name}
          </Link>
        )}
        {contract && (
          <Link href={`/dashboard/customers/${customer?.id}/contracts/${contract.id}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <FileText className="w-3.5 h-3.5" />
            {contract.serviceType}
          </Link>
        )}
        {ticket.serviceType && (
          <Badge variant="outline" className="text-xs" data-testid="badge-service-type">
            {getServiceDisplayName(ticket.serviceType)}
          </Badge>
        )}
        {ticket.dueDate && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />
            {new Date(ticket.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="flex border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "workflow"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("workflow")}
          data-testid="tab-workflow"
        >
          Workflow
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "comments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("comments")}
          data-testid="tab-comments"
        >
          <MessageSquare className="w-4 h-4" />
          {comments.length > 0 && <span className="text-xs">({comments.length})</span>}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("history")}
          data-testid="tab-history"
        >
          <History className="w-4 h-4" />
        </button>
      </div>

      {activeTab === "workflow" && (
        <div className="space-y-3">
          {sortedStatuses.map((status, index) => {
            const isCompleted = status.displayOrder < (currentStatus?.displayOrder || 0);
            const isCurrent = status.id === ticket.currentStatusId;
            const isPending = status.displayOrder > (currentStatus?.displayOrder || 0);
            const statusFields = status.fields || [];
            
            return (
              <Card 
                key={status.id}
                className={`transition-all ${
                  isCurrent ? "ring-2 ring-primary" : isCompleted ? "opacity-75" : "opacity-50"
                }`}
                data-testid={`card-status-${status.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" 
                        : isCurrent 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">{status.name}</h3>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-xs">Current</Badge>
                        )}
                      </div>
                      
                      {status.description && (
                        <p className="text-sm text-muted-foreground mt-1">{status.description}</p>
                      )}

                      {(isCompleted || isCurrent) && statusFields.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {statusFields.map(field => {
                            const value = getFieldValue(field.id);
                            return (
                              <div key={field.id} className="text-sm">
                                <span className="text-muted-foreground">{field.fieldLabel}: </span>
                                <span className="font-medium">{value || "—"}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "comments" && (
        <div className="space-y-4">
          {comments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No comments yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <Card key={comment.id} data-testid={`comment-${comment.id}`}>
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarFallback className="text-xs">
                          <User className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()} at{" "}
                            {new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-3">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                className="resize-none border-0 focus-visible:ring-0 p-0"
                data-testid="input-comment"
              />
              <div className="flex justify-end mt-2">
                <Button 
                  size="sm" 
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  data-testid="button-add-comment"
                >
                  {addCommentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-2">
          {statusHistory.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <History className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No history yet</p>
              </CardContent>
            </Card>
          ) : (
            statusHistory.map((entry, index) => {
              const toStatus = statuses.find(s => s.id === entry.toStatusId);
              const fromStatus = entry.fromStatusId ? statuses.find(s => s.id === entry.fromStatusId) : null;
              
              return (
                <Card key={entry.id} data-testid={`history-${entry.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground mt-2 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm">
                          {fromStatus ? (
                            <>
                              Changed from <span className="font-medium">{fromStatus.name}</span> to{" "}
                              <span className="font-medium">{toStatus?.name}</span>
                            </>
                          ) : (
                            <>Ticket created with status <span className="font-medium">{toStatus?.name}</span></>
                          )}
                        </p>
                        {entry.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(entry.createdAt).toLocaleDateString()} at{" "}
                          {new Date(entry.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {nextStatus && !ticket.completedAt && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          <Button 
            className="w-full h-12 text-base gap-2" 
            onClick={handleAdvanceStatus}
            disabled={updateStatusMutation.isPending}
            data-testid="button-advance-status"
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Move to: {nextStatus.name}
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      )}

      {ticket.completedAt && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <Check className="w-5 h-5" />
            <span className="font-medium">Ticket Completed</span>
          </div>
        </div>
      )}

      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Move to: {statuses.find(s => s.id === pendingStatusId)?.name}
            </DialogTitle>
            <DialogDescription>
              Fill in the required information to proceed.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {statuses.find(s => s.id === pendingStatusId)?.fields?.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={field.id}>
                  {field.fieldLabel}
                  {field.isRequired === "true" && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {field.fieldType === "textarea" ? (
                  <Textarea
                    id={field.id}
                    value={fieldInputs[field.id] || ""}
                    onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={`Enter ${field.fieldLabel.toLowerCase()}`}
                    data-testid={`input-field-${field.fieldKey}`}
                  />
                ) : field.fieldType === "select" && field.options ? (
                  <select
                    id={field.id}
                    value={fieldInputs[field.id] || ""}
                    onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    data-testid={`select-field-${field.fieldKey}`}
                  >
                    <option value="">Select...</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.id}
                    type={field.fieldType === "number" ? "number" : "text"}
                    value={fieldInputs[field.id] || ""}
                    onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={`Enter ${field.fieldLabel.toLowerCase()}`}
                    data-testid={`input-field-${field.fieldKey}`}
                  />
                )}
              </div>
            ))}
            
            <div className="space-y-2">
              <Label htmlFor="statusNotes">Notes (optional)</Label>
              <Textarea
                id="statusNotes"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Add any notes about this status change..."
                rows={2}
                data-testid="input-status-notes"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmStatusChange}
              disabled={updateStatusMutation.isPending || saveFieldValueMutation.isPending}
              data-testid="button-confirm-status"
            >
              {(updateStatusMutation.isPending || saveFieldValueMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
