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
  Archive,
  AlertTriangle,
  Search,
  Inbox,
  UserCheck,
  UserPlus,
  X,
  User,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UnsortedEmail, MailboxAccount } from "@shared/schema";
import CustomerSearchInput from "@/components/CustomerSearchInput";

type StatusFilter = "all" | "pending" | "routed" | "archived" | "spam";

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CandidateCustomer {
  id: string;
  name: string;
}

function useStatusBadge(status: string) {
  const { t } = useTranslation();
  if (status === "pending") return <Badge variant="secondary" className="text-xs">{t("emailTracking.statusPending")}</Badge>;
  if (status === "routed") return <Badge className="text-xs bg-green-600/90 text-white">{t("emailTracking.statusRouted")}</Badge>;
  if (status === "archived") return <Badge variant="outline" className="text-xs">{t("emailTracking.statusArchived")}</Badge>;
  if (status === "spam") return <Badge variant="destructive" className="text-xs">{t("emailTracking.statusSpam")}</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function CandidateCustomerChips({ fromAddress, onSelect }: {
  fromAddress: string;
  onSelect?: (c: CandidateCustomer) => void;
}) {
  const searchTerm = fromAddress.split("@")[0] || fromAddress;
  const { data } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/customers", "by-email", searchTerm],
    queryFn: async () => {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}&limit=3`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 3) : (data?.data ?? []).slice(0, 3);
    },
    staleTime: 60_000,
    enabled: searchTerm.length >= 2,
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {data.map(c => (
        <button
          key={c.id}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary text-xs px-1.5 py-0.5 hover-elevate"
          onClick={e => { e.stopPropagation(); onSelect?.(c); }}
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

  const handleCandidateSelect = (c: CandidateCustomer) => {
    setPreselectedCustomer(c);
    setShowRouteDialog(true);
  };

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
            {email.receivedAt && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{t("emailTracking.receivedLabel")}: </span>
                {format(new Date(email.receivedAt), "MMM d, yyyy h:mm a")}
              </p>
            )}
          </div>
        </div>

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
  onCandidateSelect,
}: {
  email: UnsortedEmail;
  isSelected: boolean;
  onClick: () => void;
  assignedUserName?: string;
  onCandidateSelect?: (c: CandidateCustomer) => void;
}) {
  const timestamp = email.receivedAt ? new Date(email.receivedAt) : null;
  const badge = useStatusBadge(email.status);

  return (
    <div
      className={`px-3 py-3 border-b cursor-pointer hover-elevate transition-colors ${isSelected ? "bg-muted/60" : ""}`}
      onClick={onClick}
      data-testid={`item-email-${email.id}`}
    >
      <div className="flex items-start gap-2">
        <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
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
            {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
          </p>
          {email.bodyText && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{email.bodyText.slice(0, 100)}</p>
          )}
          {email.status === "pending" && (
            <CandidateCustomerChips fromAddress={email.fromAddress} onSelect={onCandidateSelect} />
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

export default function UnsortedInboxPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [mailboxFilter, setMailboxFilter] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<UnsortedEmail | null>(null);
  const [pendingRouteData, setPendingRouteData] = useState<{ email: UnsortedEmail; customer: CandidateCustomer } | null>(null);

  const { data: emails = [], isLoading } = useQuery<UnsortedEmail[]>({
    queryKey: ["/api/unsorted-emails", statusFilter, mailboxFilter, assignedToFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (mailboxFilter) params.set("mailboxAccountId", mailboxFilter);
      if (assignedToFilter) params.set("assignedToUserId", assignedToFilter);
      const res = await fetch(`/api/unsorted-emails?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
  });

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["/api/company-users"],
  });

  const filteredEmails = searchQuery
    ? emails.filter(e =>
        e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.fromName ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.bodyText ?? "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emails;

  const pendingCount = emails.filter(e => e.status === "pending").length;

  const handleCandidateSelect = (email: UnsortedEmail, customer: CandidateCustomer) => {
    setSelectedEmail(email);
    setPendingRouteData({ email, customer });
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
          </div>
          <div className="flex-1" />
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
            <div className="flex flex-col items-center justify-center h-full gap-2 p-6">
              <Inbox className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium text-sm" data-testid="text-inbox-empty">
                {statusFilter === "all"
                  ? t("emailTracking.unsortedInboxEmpty")
                  : statusFilter === "pending"
                    ? t("emailTracking.unsortedInboxEmptyClear")
                    : t("emailTracking.noStatusEmails", { status: t(`emailTracking.status${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`) })}
              </p>
              <p className="text-muted-foreground text-sm text-center max-w-sm">
                {statusFilter === "all" || statusFilter === "pending"
                  ? t("emailTracking.unsortedInboxEmptyDesc")
                  : t("emailTracking.unsortedInboxFilterDesc")}
              </p>
            </div>
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
                    onCandidateSelect={(c) => handleCandidateSelect(email, c)}
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

      {pendingRouteData && (
        <RouteEmailDialog
          email={pendingRouteData.email}
          open={!!pendingRouteData}
          onOpenChange={(v) => { if (!v) setPendingRouteData(null); }}
          preselectedCustomer={pendingRouteData.customer}
        />
      )}
    </div>
  );
}
