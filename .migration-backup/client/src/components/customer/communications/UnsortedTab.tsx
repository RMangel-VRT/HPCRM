import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Archive,
  AlertTriangle,
  Search,
  Inbox,
  UserCheck,
  UserPlus,
  X,
  User,
  Settings,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UnsortedEmail, MailboxAccount } from "@shared/schema";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import { Link } from "wouter";
import MailboxViewAsPicker from "@/components/customer/communications/MailboxViewAsPicker";

export interface UnsortedTabProps {
  viewAs?: string;
  onViewAsChange?: (v: string) => void;
}

type StatusFilter = "all" | "pending" | "routed" | "archived" | "spam";
type DirectionFilter = "all" | "inbound" | "outbound";

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

function useStatusBadge(status: string) {
  const { t } = useTranslation();
  if (status === "pending") return <Badge variant="secondary" className="text-xs">{t("emailTracking.statusPending")}</Badge>;
  if (status === "routed") return <Badge className="text-xs bg-green-600/90 text-white">{t("emailTracking.statusRouted")}</Badge>;
  if (status === "archived") return <Badge variant="outline" className="text-xs">{t("emailTracking.statusArchived")}</Badge>;
  if (status === "spam") return <Badge variant="destructive" className="text-xs">{t("emailTracking.statusSpam")}</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function CandidateCustomerChips({ email, onRoute }: {
  email: UnsortedEmail;
  onRoute?: (emailId: string, customerId: string) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [routingId, setRoutingId] = useState<string | null>(null);

  const ids = (email.candidateCustomerIds ?? []).filter(Boolean);

  const { data: candidateCustomers = [] } = useQuery<{ id: string; name: string; customerNumber?: string }[]>({
    queryKey: ["/api/customers", "candidates-by-ids", ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const results = await Promise.all(
        ids.slice(0, 5).map(id =>
          fetch(`/api/customers/${id}`, { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );
      return results.filter(Boolean);
    },
    staleTime: 60_000,
    enabled: ids.length > 0,
  });

  const searchTerm = ids.length === 0 ? (email.fromAddress.split("@")[0] || email.fromAddress) : "";
  const { data: searchResults = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/customers", "by-email-search", searchTerm],
    queryFn: async () => {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}&limit=3`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 3) : (data?.data ?? []).slice(0, 3);
    },
    staleTime: 60_000,
    enabled: searchTerm.length >= 2,
  });

  const chips: { id: string; name: string }[] = ids.length > 0 ? candidateCustomers : searchResults;
  if (chips.length === 0) return null;

  const handleRoute = async (e: React.MouseEvent, customerId: string) => {
    e.stopPropagation();
    setRoutingId(customerId);
    try {
      const res = await apiRequest("POST", `/api/unsorted-emails/${email.id}/route`, { customerId });
      if (!res.ok) throw new Error("Route failed");
      toast({ title: t("emailTracking.routedSuccessfully") });
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      onRoute?.(email.id, customerId);
    } catch {
      toast({ title: t("emailTracking.routeEmailError"), variant: "destructive" });
    } finally {
      setRoutingId(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(c => (
        <button
          key={c.id}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary text-xs px-1.5 py-0.5 hover-elevate disabled:opacity-50"
          onClick={(e) => handleRoute(e, c.id)}
          disabled={routingId !== null}
          data-testid={`chip-candidate-${c.id}`}
          title={`Route to ${c.name}`}
        >
          <User className="w-2.5 h-2.5" />
          {c.name}
        </button>
      ))}
    </div>
  );
}

interface RouteEmailDialogProps {
  email: UnsortedEmail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preselectedCustomer?: { id: string; name: string } | null;
}

function RouteEmailDialog({ email, open, onOpenChange, preselectedCustomer }: RouteEmailDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(preselectedCustomer ?? null);

  const routeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error("Select a customer");
      return apiRequest("POST", `/api/unsorted-emails/${email.id}/route`, { customerId: selectedCustomer.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: t("emailTracking.routeToCustomer") });
      onOpenChange(false);
      setSelectedCustomer(null);
    },
    onError: () => {
      toast({ title: t("emailTracking.routeEmailError"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-route-email">
        <DialogHeader>
          <DialogTitle>{t("emailTracking.routeEmailTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
            </p>
            <p className="text-sm font-medium line-clamp-2">{email.subject}</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("emailTracking.searchCustomer")}</label>
            <CustomerSearchInput
              onSelect={(c) => setSelectedCustomer(c)}
              selectedId={selectedCustomer?.id}
              placeholder={t("emailTracking.searchCustomer")}
              testId="input-customer-search-route"
              mode="operational"
            />
            {selectedCustomer && (
              <p className="text-xs text-muted-foreground mt-1">{selectedCustomer.name}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-route-cancel">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!selectedCustomer || routeMutation.isPending}
            onClick={() => routeMutation.mutate()}
            data-testid="button-route-confirm"
          >
            {routeMutation.isPending ? `${t("emailTracking.routeToCustomer")}…` : t("emailTracking.confirmRoute")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AssignUserDialogProps {
  email: UnsortedEmail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: CompanyUser[];
}

function AssignUserDialog({ email, open, onOpenChange, users }: AssignUserDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>(email.assignedToUserId ?? "__none__");

  const assignMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/unsorted-emails/${email.id}/assign`, {
        assignedToUserId: selectedUserId === "__none__" ? null : selectedUserId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: t("emailTracking.assign") });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t("emailTracking.assignEmailError"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-assign-email">
        <DialogHeader>
          <DialogTitle>{t("emailTracking.assignToStaff")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-sm font-medium line-clamp-2">{email.subject}</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("emailTracking.assignToUser")}</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger data-testid="select-assign-user">
                <SelectValue placeholder={t("emailTracking.selectUser")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("emailTracking.unassigned")}</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending}
            data-testid="button-assign-confirm"
          >
            {assignMutation.isPending ? `${t("emailTracking.assign")}…` : t("emailTracking.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmailDetailPaneProps {
  email: UnsortedEmail;
  users: CompanyUser[];
  onClose: () => void;
}

function EmailDetailPane({ email, users, onClose }: EmailDetailPaneProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showRouteDialog, setShowRouteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [preselectedCustomer, setPreselectedCustomer] = useState<{ id: string; name: string } | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/unsorted-emails/${email.id}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: t("emailTracking.markArchived") });
      onClose();
    },
  });

  const spamMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/unsorted-emails/${email.id}/spam`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: t("emailTracking.markSpam") });
      onClose();
    },
  });

  const assignedUser = email.assignedToUserId
    ? users.find(u => u.id === email.assignedToUserId)
    : null;

  return (
    <div className="flex flex-col h-full border-l bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadgeDisplay status={email.status} />
          {assignedUser && (
            <Badge variant="outline" className="text-xs" data-testid="badge-assigned-user">
              {t("emailTracking.assignedLabel")}: {assignedUser.name}
            </Badge>
          )}
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-detail">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold" data-testid="text-detail-subject">{email.subject}</h2>
          <div className="mt-2 space-y-1 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{t("emailTracking.fromLabel")}: </span>
              {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
            </p>
            {email.direction === "outbound" && (email.toAddresses ?? []).length > 0 && (
              <p className="text-muted-foreground" data-testid="text-detail-to">
                <span className="font-medium text-foreground">{t("emailTracking.toAddresses")}: </span>
                {(email.toAddresses ?? []).join(", ")}
              </p>
            )}
            {email.receivedAt && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{t("emailTracking.receivedLabel")}: </span>
                {format(new Date(email.receivedAt), "MMM d, yyyy h:mm a")}
              </p>
            )}
          </div>
        </div>

        <Separator />

        {email.routingNotes && (
          <>
            <Separator />
            <div className="text-xs rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
              <p className="font-medium text-muted-foreground">{t("emailTracking.routingNotesLabel")}</p>
              <p className="text-muted-foreground" data-testid="text-detail-routing-notes">{email.routingNotes}</p>
            </div>
          </>
        )}

        {(email.candidateCustomerIds ?? []).length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("emailTracking.candidatesLabel")}</p>
              <CandidateCustomerChips email={email} />
            </div>
          </>
        )}

        <Separator />

        <div className="text-sm whitespace-pre-wrap min-h-[120px]" data-testid="text-detail-body">
          {email.bodyText || t("emailTracking.noMessageBody")}
        </div>
      </div>

      <div className="shrink-0 border-t px-4 py-3 flex items-center gap-2 flex-wrap">
        {email.status === "pending" && (
          <>
            <Button
              size="sm"
              onClick={() => { setPreselectedCustomer(null); setShowRouteDialog(true); }}
              data-testid="button-detail-route"
              className="gap-1"
            >
              <UserCheck className="w-4 h-4" />
              {t("emailTracking.routeToCustomer")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAssignDialog(true)}
              data-testid="button-detail-assign"
              className="gap-1"
            >
              <UserPlus className="w-4 h-4" />
              {t("emailTracking.assignToStaff")}
            </Button>
          </>
        )}
        {email.status !== "archived" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            data-testid="button-detail-archive"
            className="gap-1"
          >
            <Archive className="w-4 h-4" />
            {t("emailTracking.markArchived")}
          </Button>
        )}
        {email.status !== "spam" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => spamMutation.mutate()}
            disabled={spamMutation.isPending}
            data-testid="button-detail-spam"
            className="gap-1 text-destructive"
          >
            <AlertTriangle className="w-4 h-4" />
            {t("emailTracking.markSpam")}
          </Button>
        )}
      </div>

      <RouteEmailDialog
        email={email}
        open={showRouteDialog}
        onOpenChange={setShowRouteDialog}
        preselectedCustomer={preselectedCustomer}
      />
      <AssignUserDialog email={email} open={showAssignDialog} onOpenChange={setShowAssignDialog} users={users} />
    </div>
  );
}

function StatusBadgeDisplay({ status }: { status: string }) {
  const badge = useStatusBadge(status);
  return badge;
}

function EmailListItem({
  email,
  isSelected,
  onClick,
  assignedUserName,
}: {
  email: UnsortedEmail;
  isSelected: boolean;
  onClick: () => void;
  assignedUserName?: string;
}) {
  const { t } = useTranslation();
  const timestamp = email.receivedAt ? new Date(email.receivedAt) : null;
  const badge = useStatusBadge(email.status);
  const isOutbound = email.direction === "outbound";
  const primaryAddress = isOutbound
    ? ((email.toAddresses ?? []).length > 0 ? (email.toAddresses ?? [])[0] : email.fromAddress)
    : (email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress);

  return (
    <div
      className={`px-3 py-3 border-b cursor-pointer hover-elevate transition-colors ${isSelected ? "bg-muted/60" : ""}`}
      onClick={onClick}
      data-testid={`item-email-${email.id}`}
    >
      <div className="flex items-start gap-2">
        {isOutbound
          ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
          : <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate" data-testid={`text-email-subject-${email.id}`}>
              {email.subject}
            </span>
            {badge}
            {assignedUserName && (
              <Badge variant="outline" className="text-xs shrink-0" data-testid={`badge-assigned-${email.id}`}>
                <User className="w-2.5 h-2.5 mr-0.5" />
                {assignedUserName}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate" data-testid={`text-email-from-${email.id}`}>
            <span className="font-medium">{isOutbound ? t("emailTracking.toAddresses") : t("emailTracking.fromLabel")}:</span>{" "}
            {primaryAddress}
            {isOutbound && (email.toAddresses ?? []).length > 1 && (
              <span className="ml-1 text-muted-foreground/70">+{(email.toAddresses ?? []).length - 1}</span>
            )}
          </p>
          {email.bodyText && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{email.bodyText.slice(0, 100)}</p>
          )}
          {email.status === "pending" && (
            <CandidateCustomerChips email={email} />
          )}
        </div>
        {timestamp && (
          <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-email-time-${email.id}`}>
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  );
}

interface SyncSummary {
  totalActive: number;
  connected: number;
  errors: number;
  notConnected: number;
  lastRunAt: string | null;
  hasRunning: boolean;
  messagesRoutedLast24h: number;
  messagesUnsortedLast24h: number;
}

export default function UnsortedTab({ viewAs: viewAsProp, onViewAsChange }: UnsortedTabProps = {}) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [mailboxFilter, setMailboxFilter] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<UnsortedEmail | null>(null);
  const [localViewAs, setLocalViewAs] = useState<string>("");

  const isControlled = viewAsProp !== undefined;
  const viewAs = isControlled ? viewAsProp : localViewAs;
  const setViewAs = isControlled
    ? (v: string) => onViewAsChange?.(v)
    : setLocalViewAs;

  const { data: emails = [], isLoading } = useQuery<UnsortedEmail[]>({
    queryKey: ["/api/unsorted-emails", statusFilter, directionFilter, mailboxFilter, assignedToFilter, viewAs],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (directionFilter !== "all") params.set("direction", directionFilter);
      if (mailboxFilter) params.set("mailboxAccountId", mailboxFilter);
      if (assignedToFilter) params.set("assignedToUserId", assignedToFilter);
      if (viewAs) params.set("viewAs", viewAs);
      const res = await fetch(`/api/unsorted-emails?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
  });

  const { data: syncSummary } = useQuery<SyncSummary>({
    queryKey: ["/api/mailbox-accounts/sync-summary"],
    queryFn: () =>
      fetch("/api/mailbox-accounts/sync-summary", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as SyncSummary | null | undefined;
      return data?.hasRunning ? 3_000 : 30_000;
    },
  });

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["/api/company-users"],
  });

  const filteredEmails = searchQuery
    ? emails.filter(e => {
        const q = searchQuery.toLowerCase();
        return (
          e.subject.toLowerCase().includes(q) ||
          e.fromAddress.toLowerCase().includes(q) ||
          (e.fromName ?? "").toLowerCase().includes(q) ||
          (e.bodyText ?? "").toLowerCase().includes(q) ||
          (e.toAddresses ?? []).some(addr => addr.toLowerCase().includes(q))
        );
      })
    : emails;

  const pendingCount = emails.filter(e => e.status === "pending").length;
  const hasConnectedMailboxes = (syncSummary?.connected ?? 0) > 0;
  const hasAnyMailboxes = (syncSummary?.totalActive ?? 0) > 0 || mailboxAccounts.length > 0;

  const renderEmptyState = () => {
    if (!hasAnyMailboxes) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <Inbox className="w-10 h-10 text-muted-foreground" />
          <p className="font-medium text-sm" data-testid="text-inbox-empty">{t("emailTracking.noMailboxesConnectedTitle")}</p>
          <p className="text-muted-foreground text-sm text-center max-w-sm">
            {t("emailTracking.noMailboxesConnectedDesc")}
          </p>
          <Link href="/settings/mailbox-accounts">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              {t("emailTracking.mailboxSettingsTitle")}
            </Button>
          </Link>
        </div>
      );
    }
    if (!hasConnectedMailboxes && (statusFilter === "all" || statusFilter === "pending")) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <Inbox className="w-10 h-10 text-muted-foreground" />
          <p className="font-medium text-sm" data-testid="text-inbox-empty">{t("emailTracking.unsortedInboxEmpty")}</p>
          <p className="text-muted-foreground text-sm text-center max-w-sm">
            {t("emailTracking.unsortedInboxEmptyDesc")}
          </p>
          <Link href="/settings/mailbox-accounts">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              {t("emailTracking.connectGmail")}
            </Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6">
        <Inbox className="w-10 h-10 text-muted-foreground" />
        <p className="font-medium text-sm" data-testid="text-inbox-empty">
          {statusFilter === "all" || statusFilter === "pending"
            ? t("emailTracking.unsortedInboxEmptyClear")
            : t("emailTracking.noStatusEmails", { status: t(`emailTracking.status${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`) })}
        </p>
        <p className="text-muted-foreground text-sm text-center max-w-sm">
          {statusFilter === "all" || statusFilter === "pending"
            ? (syncSummary?.lastRunAt
                ? t("emailTracking.syncSummaryLastRun", {
                    time: formatDistanceToNow(new Date(syncSummary.lastRunAt), { addSuffix: true }),
                  })
                : t("emailTracking.syncSummaryNeverRun"))
            : t("emailTracking.unsortedInboxFilterDesc")}
        </p>
        {(statusFilter === "all" || statusFilter === "pending") && syncSummary && (
          <p className="text-xs text-muted-foreground" data-testid="text-sync-24h-stats">
            {t("emailTracking.syncStats24h", {
              routed: syncSummary.messagesRoutedLast24h,
              unsorted: syncSummary.messagesUnsortedLast24h,
            })}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold" data-testid="heading-unsorted-inbox">{t("emailTracking.unsortedInboxTitle")}</h1>
            {pendingCount > 0 && (
              <Badge data-testid="badge-pending-count">{pendingCount}</Badge>
            )}
            {syncSummary?.hasRunning && (
              <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-sync-running">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("emailTracking.syncSummaryRunning")}
              </Badge>
            )}
            {syncSummary && syncSummary.connected > 0 && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-sync-connected">
                {t("emailTracking.syncSummaryConnected", { count: syncSummary.connected })}
              </Badge>
            )}
            {syncSummary && syncSummary.errors > 0 && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-sync-errors">
                {t("emailTracking.syncSummaryErrors", { count: syncSummary.errors })}
              </Badge>
            )}
          </div>
          <div className="flex-1" />
          <div className="flex items-center rounded-md border overflow-hidden" data-testid="toggle-direction-filter">
            {(["all", "inbound", "outbound"] as DirectionFilter[]).map((dir) => (
              <button
                key={dir}
                onClick={() => { setDirectionFilter(dir); setSelectedEmail(null); }}
                data-testid={`button-direction-${dir}`}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0 ${
                  directionFilter === dir
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {dir === "inbound" && <ArrowDownLeft className="w-3 h-3 text-blue-500" />}
                {dir === "outbound" && <ArrowUpRight className="w-3 h-3 text-emerald-500" />}
                {dir === "all" ? t("emailTracking.allDirections") : dir === "inbound" ? t("emailTracking.directionInbound") : t("emailTracking.directionOutbound")}
              </button>
            ))}
          </div>
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("emailTracking.searchEmails")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="input-search-emails"
            />
          </div>
          {!isControlled && <MailboxViewAsPicker value={viewAs} onChange={setViewAs} />}
          <Select value={mailboxFilter || "__all__"} onValueChange={v => setMailboxFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-44" data-testid="select-mailbox-filter">
              <SelectValue placeholder={t("emailTracking.allMailboxes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("emailTracking.allMailboxes")}</SelectItem>
              {mailboxAccounts.filter(m => m.isActive).map(m => (
                <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignedToFilter || "__all__"} onValueChange={v => setAssignedToFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-44" data-testid="select-assigned-to-filter">
              <SelectValue placeholder={t("emailTracking.allUsers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("emailTracking.allUsers")}</SelectItem>
              {companyUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-36" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("emailTracking.allStatuses")}</SelectItem>
              <SelectItem value="pending">{t("emailTracking.statusPending")}</SelectItem>
              <SelectItem value="routed">{t("emailTracking.statusRouted")}</SelectItem>
              <SelectItem value="archived">{t("emailTracking.statusArchived")}</SelectItem>
              <SelectItem value="spam">{t("emailTracking.statusSpam")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex flex-col overflow-hidden border-r ${selectedEmail ? "w-2/5" : "w-full"}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            renderEmptyState()
          ) : (
            <div className="overflow-y-auto flex-1">
              {filteredEmails.map(email => {
                const assignedUser = email.assignedToUserId
                  ? companyUsers.find(u => u.id === email.assignedToUserId)
                  : undefined;
                return (
                  <EmailListItem
                    key={email.id}
                    email={email}
                    isSelected={selectedEmail?.id === email.id}
                    onClick={() => setSelectedEmail(email)}
                    assignedUserName={assignedUser?.name}
                  />
                );
              })}
            </div>
          )}
        </div>

        {selectedEmail && (
          <div className="flex-1 overflow-hidden">
            <EmailDetailPane
              email={selectedEmail}
              users={companyUsers}
              onClose={() => setSelectedEmail(null)}
            />
          </div>
        )}

        {!selectedEmail && filteredEmails.length > 0 && (
          <div className="hidden lg:flex flex-1 items-center justify-center text-muted-foreground text-sm border-l">
            {t("emailTracking.selectEmailToView")}
          </div>
        )}
      </div>
    </div>
  );
}
