import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import BackfillPanel from "@/components/customer/communications/BackfillPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Plus,
  Mail,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link2Off,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldCheck,
  Users,
  Settings2,
  Info,
  ArrowUpDown,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import type { MailboxAccount, MailboxSyncRun } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonalMailboxRow {
  id: string;
  emailAddress: string;
  displayName: string;
  syncStatus: string | null;
  syncEnabled: boolean | null;
  lastSyncedAt: string | null;
  isActive: boolean | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  connectedEmail: string | null;
  pendingUnsortedCount: number;
}

interface MailSettings {
  defaultMailboxVisibility: {
    shared: string[];
    perRole?: Record<string, "own" | "all" | "shared_only">;
  };
  defaultSyncIntervalMinutes: number;
}

interface OAuthStatus {
  syncEnabled: boolean;
  syncStatus: string;
  connectedEmail: string | null;
  connectedAt: string | null;
  hasRefreshToken: boolean;
}

const ALL_ROLES = ["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"] as const;

const makeSharedFormSchema = () => z.object({
  emailAddress: z.string().email("Enter a valid email address"),
  displayName: z.string().min(1, "Display name is required"),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
});

type SharedFormValues = z.infer<ReturnType<typeof makeSharedFormSchema>>;

// ─── Shared sub-components ────────────────────────────────────────────────────

function SyncStatusBadge({ status, connectedEmail }: { status: string; connectedEmail?: string | null }) {
  if (status === "connected") {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
        <Badge className="text-xs bg-green-600/90 text-white">
          {connectedEmail ? `Connected as ${connectedEmail}` : "Connected"}
        </Badge>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
        <Badge variant="destructive" className="text-xs">Error</Badge>
      </div>
    );
  }
  return <Badge variant="secondary" className="text-xs">Not connected</Badge>;
}

function SyncRunStatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="text-xs bg-green-600/90 text-white">Success</Badge>;
  if (status === "partial") return <Badge variant="secondary" className="text-xs">Partial</Badge>;
  if (status === "error") return <Badge variant="destructive" className="text-xs">Error</Badge>;
  if (status === "running") return <Badge variant="secondary" className="text-xs animate-pulse">Running</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function SyncHistoryPanel({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);

  const { data: runs = [], isLoading } = useQuery<MailboxSyncRun[]>({
    queryKey: ["/api/mailbox-accounts", accountId, "sync-runs"],
    queryFn: () => apiRequest("GET", `/api/mailbox-accounts/${accountId}/sync-runs`).then(r => r.json()),
    enabled: open,
    staleTime: 10_000,
    refetchInterval: (query) => {
      if (!open) return false;
      const data = query.state.data as MailboxSyncRun[] | undefined;
      const hasRunning = data?.some(r => r.status === "running");
      return hasRunning ? 3_000 : false;
    },
  });

  const last5 = runs.slice(0, 5);

  return (
    <div>
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover-elevate rounded px-1"
        onClick={() => setOpen(!open)}
        data-testid={`button-sync-history-toggle-${accountId}`}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Sync history
      </button>
      {open && (
        <div className="mt-1.5 rounded-md border bg-muted/30 text-xs p-2 space-y-1 w-72" data-testid={`panel-sync-history-${accountId}`}>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-1">Loading...</p>
          ) : last5.length === 0 ? (
            <p className="text-muted-foreground text-center py-1">No runs yet</p>
          ) : (
            last5.map(run => (
              <div key={run.id} className="flex items-center gap-2 flex-wrap py-0.5 border-b last:border-0">
                <SyncRunStatusBadge status={run.status} />
                <span className="text-muted-foreground shrink-0">
                  {format(new Date(run.startedAt), "MMM d, h:mm a")}
                </span>
                <span className="text-foreground">
                  {run.messagesFetched} <span className="text-muted-foreground">fetched</span>
                  {" · "}{run.messagesRouted} <span className="text-muted-foreground">routed</span>
                  {" · "}{run.messagesUnsorted} <span className="text-muted-foreground">unsorted</span>
                </span>
                {run.errorMessage && (
                  <p className="w-full text-destructive truncate">{run.errorMessage}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SyncIntervalSelect({ account }: { account: MailboxAccount }) {
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: (syncIntervalMinutes: number) =>
      apiRequest("PATCH", `/api/mailbox-accounts/${account.id}`, { syncIntervalMinutes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
    },
    onError: () => toast({ title: "Failed to update sync interval", variant: "destructive" }),
  });

  const currentVal = String(account.syncIntervalMinutes ?? 2);

  return (
    <div className="flex items-center gap-1 mt-1">
      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
      <Select
        value={currentVal}
        onValueChange={(v) => updateMutation.mutate(parseInt(v, 10))}
        disabled={updateMutation.isPending}
      >
        <SelectTrigger className="h-6 text-xs w-40" data-testid={`select-sync-interval-${account.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Every 1 min</SelectItem>
          <SelectItem value="2">Every 2 min</SelectItem>
          <SelectItem value="5">Every 5 min</SelectItem>
          <SelectItem value="10">Every 10 min</SelectItem>
          <SelectItem value="30">Every 30 min</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function GmailConnectButton({ account, autoOpenBackfill = false }: { account: MailboxAccount; autoOpenBackfill?: boolean }) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectDialogOpen, setReconnectDialogOpen] = useState(false);

  const { data: oauthStatus } = useQuery<OAuthStatus>({
    queryKey: ["/api/mailbox-accounts", account.id, "oauth-status"],
    queryFn: () => apiRequest("GET", `/api/mailbox-accounts/${account.id}/oauth/status`).then(r => r.json() as Promise<OAuthStatus>),
    enabled: account.isActive,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mailbox-accounts/${account.id}/oauth/disconnect`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", account.id, "oauth-status"] });
      toast({ title: "Gmail disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect Gmail", variant: "destructive" }),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mailbox-accounts/${account.id}/sync`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", account.id, "sync-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: "Sync started" });
    },
    onError: (err: Error) => {
      const isConflict = err.message?.includes("already in progress") || err.message?.includes("409");
      toast({
        title: isConflict ? "Sync already in progress" : "Sync failed",
        variant: "destructive",
      });
    },
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await apiRequest("GET", `/api/mailbox-accounts/${account.id}/oauth/connect`);
      const result = await res.json() as { authUrl?: string; error?: string };
      if (result?.authUrl) {
        window.location.href = result.authUrl;
      } else {
        toast({ title: result?.error ?? "Failed to start Gmail connection", variant: "destructive" });
        setIsConnecting(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect Gmail";
      toast({ title: msg, variant: "destructive" });
      setIsConnecting(false);
    }
  };

  const status = oauthStatus?.syncStatus ?? account.syncStatus ?? "not_connected";
  const connectedEmail = oauthStatus?.connectedEmail ?? null;
  const connectedAt = oauthStatus?.connectedAt ?? null;
  const isConnected = status === "connected";
  const isError = status === "error";
  const errorCount = account.syncErrorCount ?? 0;

  return (
    <div className="flex flex-col gap-1.5">
      <SyncStatusBadge status={status} connectedEmail={connectedEmail} />

      {connectedAt && isConnected && (
        <p className="text-xs text-muted-foreground">
          Connected {formatDistanceToNow(new Date(connectedAt), { addSuffix: true })}
        </p>
      )}

      {isError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs space-y-1.5"
          data-testid={`callout-sync-error-${account.id}`}
        >
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Sync error
          </div>
          <p className="text-muted-foreground leading-relaxed">
            {errorCount} consecutive errors. Reconnect Gmail to resume sync.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {isConnected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
              data-testid={`button-sync-now-${account.id}`}
              className="gap-1 text-xs"
            >
              {syncNowMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {syncNowMutation.isPending ? "Syncing..." : "Sync now"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              data-testid={`button-disconnect-gmail-${account.id}`}
              disabled={disconnectMutation.isPending}
              onClick={() => {
                if (window.confirm(`Disconnect Gmail for ${connectedEmail ?? account.emailAddress}?`)) {
                  disconnectMutation.mutate();
                }
              }}
            >
              {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
              Disconnect
            </Button>
          </>
        ) : (
          <>
            {isError ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReconnectDialogOpen(true)}
                  disabled={isConnecting}
                  data-testid={`button-reconnect-gmail-${account.id}`}
                  className="gap-1 text-xs"
                >
                  {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Reconnect
                </Button>
                <AlertDialog open={reconnectDialogOpen} onOpenChange={setReconnectDialogOpen}>
                  <AlertDialogContent data-testid={`dialog-reconnect-${account.id}`}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reconnect Gmail</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>Reconnect Gmail to restore email syncing for this mailbox.</p>
                          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                            <span>Your existing email history will be preserved.</span>
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleConnect} data-testid={`button-confirm-reconnect-${account.id}`}>
                        Reconnect Gmail
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting}
                data-testid={`button-connect-gmail-${account.id}`}
                className="gap-1 text-xs"
              >
                {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                Connect Gmail
              </Button>
            )}
          </>
        )}
      </div>

      {isConnected && <SyncIntervalSelect account={account} />}
      {isConnected && <BackfillPanel mailboxAccountId={account.id} autoOpen={autoOpenBackfill} />}
      {isConnected && <SyncHistoryPanel accountId={account.id} />}
    </div>
  );
}

// ─── Shared Mailbox Form Dialog ───────────────────────────────────────────────

function SharedMailboxFormDialog({
  open,
  onOpenChange,
  editAccount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editAccount?: MailboxAccount | null;
}) {
  const { toast } = useToast();
  const isEdit = !!editAccount;
  const formSchema = makeSharedFormSchema();

  const form = useForm<SharedFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      emailAddress: editAccount?.emailAddress ?? "",
      displayName: editAccount?.displayName ?? "",
      isActive: editAccount?.isActive ?? true,
      description: editAccount?.description ?? "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      emailAddress: editAccount?.emailAddress ?? "",
      displayName: editAccount?.displayName ?? "",
      isActive: editAccount?.isActive ?? true,
      description: editAccount?.description ?? "",
    });
  }, [open, editAccount]);

  const createMutation = useMutation({
    mutationFn: (v: SharedFormValues) => apiRequest("POST", "/api/mailbox-accounts", { ...v, accountType: "shared" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: "Shared mailbox created" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => toast({ title: "Failed to create mailbox", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (v: SharedFormValues) => apiRequest("PATCH", `/api/mailbox-accounts/${editAccount?.id}`, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: "Mailbox updated" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to update mailbox", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-shared-mailbox-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Shared Mailbox" : "New Shared Mailbox"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update details for this shared mailbox." : "Create a new shared mailbox accessible by your team."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(v => isEdit ? updateMutation.mutate(v) : createMutation.mutate(v))}
            className="space-y-4"
          >
            <FormField control={form.control} name="emailAddress" render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input {...field} type="email" placeholder="team@company.com" data-testid="input-mailbox-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="displayName" render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. Main Office Inbox" data-testid="input-mailbox-displayname" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem>
                <FormLabel>Active</FormLabel>
                <div className="flex items-center gap-2 h-10">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-mailbox-active"
                    />
                  </FormControl>
                  <span className="text-sm text-muted-foreground">
                    {field.value ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="What is this mailbox used for?" rows={2} data-testid="input-mailbox-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-mailbox-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-mailbox-submit">
                {isPending ? "Saving..." : isEdit ? "Save changes" : "Create Mailbox"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section 1: Shared Mailboxes ──────────────────────────────────────────────

function SharedMailboxesSection() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<MailboxAccount | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<MailboxAccount | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<MailboxAccount | null>(null);
  const [promptBackfillId, setPromptBackfillId] = useState<string | null>(null);

  const { data: allAccounts = [], isLoading } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
  });

  const accounts = allAccounts.filter(a => !a.accountType || a.accountType === "shared");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedId = params.get("connected");
    const shouldPromptBackfill = params.get("promptBackfill") === "1";
    if (connectedId) {
      toast({ title: "Gmail connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", connectedId, "oauth-status"] });
      if (shouldPromptBackfill) setPromptBackfillId(connectedId);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mailbox-accounts/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: "Mailbox deactivated" });
      setDeactivateTarget(null);
    },
    onError: () => toast({ title: "Failed to deactivate mailbox", variant: "destructive" }),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mailbox-accounts/${id}/permanent`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: "Mailbox permanently deleted" });
      setHardDeleteTarget(null);
    },
    onError: (err: Error) => {
      const isConnected = err.message?.toLowerCase().includes("connected") || err.message?.includes("409");
      toast({
        title: isConnected ? "Disconnect the mailbox before deleting" : "Failed to delete mailbox",
        variant: "destructive",
      });
      setHardDeleteTarget(null);
    },
  });

  const handleEdit = (account: MailboxAccount) => {
    setEditAccount(account);
    setShowForm(true);
  };

  const handleClose = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditAccount(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Shared Mailboxes</h2>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditAccount(null); setShowForm(true); }}
          data-testid="button-add-shared-mailbox"
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          New Shared Mailbox
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Shared mailboxes are team-wide inboxes visible to multiple roles. Connect a Gmail account to start syncing emails.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-2">
            <Mail className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium text-sm">No shared mailboxes yet</p>
            <p className="text-muted-foreground text-sm text-center max-w-xs" data-testid="text-no-shared-mailboxes">
              Create a shared mailbox to let your team monitor a single inbox together.
            </p>
            <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-first-shared-mailbox">
              Create first mailbox
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {accounts.length} shared {accounts.length === 1 ? "mailbox" : "mailboxes"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id} data-testid={`row-shared-mailbox-${account.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-mailbox-name-${account.id}`}>{account.displayName}</p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-mailbox-email-${account.id}`}>{account.emailAddress}</p>
                        {account.lastSyncedAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Last synced {formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {account.isActive
                        ? <Badge variant="secondary" className="text-xs">Active</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      <GmailConnectButton account={account} autoOpenBackfill={promptBackfillId === account.id} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-mailbox-actions-${account.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(account)} data-testid={`action-edit-mailbox-${account.id}`}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeactivateTarget(account)}
                            className="text-destructive"
                            data-testid={`action-deactivate-mailbox-${account.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deactivate
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              onClick={() => setHardDeleteTarget(account)}
                              className="text-destructive"
                              data-testid={`action-hard-delete-mailbox-${account.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete permanently
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <SharedMailboxFormDialog open={showForm} onOpenChange={handleClose} editAccount={editAccount} />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent data-testid="dialog-deactivate-mailbox">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Mailbox</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget
                ? `Deactivate "${deactivateTarget.displayName}" (${deactivateTarget.emailAddress})? Syncing will stop but history is preserved.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-deactivate-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && deleteMutation.mutate(deactivateTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-deactivate-confirm"
            >
              {deleteMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hardDeleteTarget} onOpenChange={(open) => { if (!open) setHardDeleteTarget(null); }}>
        <AlertDialogContent data-testid="dialog-hard-delete-mailbox">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              {hardDeleteTarget
                ? `Permanently delete "${hardDeleteTarget.displayName}"? This cannot be undone. Disconnect the mailbox before deleting.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-hard-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => hardDeleteTarget && hardDeleteMutation.mutate(hardDeleteTarget.id)}
              disabled={hardDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-hard-delete-confirm"
            >
              {hardDeleteMutation.isPending ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Section 2: Personal Mailbox Oversight ────────────────────────────────────

function PersonalMailboxOversightTable() {
  const { toast } = useToast();
  const [disconnectTarget, setDisconnectTarget] = useState<PersonalMailboxRow | null>(null);
  const [reason, setReason] = useState("");
  const [sortByStatus, setSortByStatus] = useState(false);

  const { data: rows = [], isLoading } = useQuery<PersonalMailboxRow[]>({
    queryKey: ["/api/mailbox-accounts/personal"],
  });

  const adminDisconnectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/mailbox-accounts/${id}/admin-disconnect`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts/personal"] });
      toast({ title: "Mailbox disconnected by admin" });
      setDisconnectTarget(null);
      setReason("");
    },
    onError: () => toast({ title: "Failed to disconnect mailbox", variant: "destructive" }),
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortByStatus) {
      if (a.syncStatus === "error" && b.syncStatus !== "error") return -1;
      if (b.syncStatus === "error" && a.syncStatus !== "error") return 1;
    }
    return (a.ownerName ?? "").localeCompare(b.ownerName ?? "");
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Personal Mailboxes (Oversight)</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSortByStatus(!sortByStatus)}
          data-testid="button-sort-personal-mailboxes"
          className="gap-1"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortByStatus ? "Sort by owner" : "Sort: errors first"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Read-only view of personal mailboxes connected by team members. Use "Disconnect (admin)" only for security or compliance emergencies.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-2">
            <Users className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium text-sm">No personal mailboxes</p>
            <p className="text-muted-foreground text-sm text-center max-w-xs" data-testid="text-no-personal-mailboxes">
              Team members can connect their own Gmail accounts from the My Mailbox page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner</TableHead>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Connected As</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead>Unsorted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.id} data-testid={`row-personal-mailbox-${row.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-personal-owner-name-${row.id}`}>{row.ownerName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{row.ownerEmail ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{row.displayName}</p>
                        <p className="text-xs text-muted-foreground">{row.emailAddress}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground">{row.connectedEmail ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <SyncStatusBadge status={row.syncStatus ?? "not_connected"} />
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground">
                        {row.lastSyncedAt ? formatDistanceToNow(new Date(row.lastSyncedAt), { addSuffix: true }) : "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {row.pendingUnsortedCount > 0 ? (
                        <Badge variant="secondary" className="text-xs">{row.pendingUnsortedCount}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs text-destructive"
                        onClick={() => { setDisconnectTarget(row); setReason(""); }}
                        data-testid={`button-admin-disconnect-${row.id}`}
                        disabled={!row.syncEnabled && row.syncStatus !== "connected" && row.syncStatus !== "error"}
                      >
                        <Link2Off className="w-3 h-3" />
                        Disconnect (admin)
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => { if (!open) { setDisconnectTarget(null); setReason(""); } }}>
        <AlertDialogContent data-testid="dialog-admin-disconnect">
          <AlertDialogHeader>
            <AlertDialogTitle>Admin Disconnect</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Forcibly disconnect {disconnectTarget?.ownerName ?? "this user"}'s personal mailbox
                  ({disconnectTarget?.connectedEmail ?? disconnectTarget?.emailAddress})?
                  This will stop email syncing. The user will need to reconnect their Gmail account.
                </p>
                <div>
                  <label className="text-xs font-medium text-foreground" htmlFor="admin-disconnect-reason">
                    Reason (optional)
                  </label>
                  <Input
                    id="admin-disconnect-reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Security review, policy enforcement, etc."
                    className="mt-1"
                    data-testid="input-admin-disconnect-reason"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-admin-disconnect-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectTarget && adminDisconnectMutation.mutate({ id: disconnectTarget.id, reason })}
              disabled={adminDisconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-admin-disconnect-confirm"
            >
              {adminDisconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Section 3: Company Mail Settings ─────────────────────────────────────────

const mailSettingsSchema = z.object({
  defaultSyncIntervalMinutes: z.number().int().min(1).max(60),
  sharedRoles: z.array(z.string()),
  perRole: z.record(z.enum(["own", "all", "shared_only"])),
});

type MailSettingsFormValues = z.infer<typeof mailSettingsSchema>;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  office: "Office",
  field_manager: "Field Manager",
  chemical_manager: "Chemical Manager",
  field: "Field",
  irrigation_manager: "Irrigation Manager",
  shop_manager: "Shop Manager",
  mapping: "Mapping",
  landscape_supervisor: "Landscape Supervisor",
};

const VISIBILITY_EXPLAINERS: Record<string, (vis: "own" | "all" | "shared_only" | undefined) => string> = {
  admin: () => "Admins always see all mailboxes.",
  office: (vis) => vis === "all" ? "Office users see all mailboxes (personal + shared)." : vis === "shared_only" ? "Office users see shared mailboxes only." : "Office users see only their own personal mailbox and shared mailboxes they have access to.",
  field_manager: (vis) => vis === "all" ? "Field managers see all mailboxes." : vis === "shared_only" ? "Field managers see shared mailboxes only." : "Field managers see only their own mailbox.",
  chemical_manager: (vis) => vis === "all" ? "Chemical managers see all mailboxes." : vis === "shared_only" ? "Chemical managers see shared mailboxes only." : "Chemical managers see only their own mailbox.",
  field: (vis) => vis === "all" ? "Field users see all mailboxes." : vis === "shared_only" ? "Field users see shared mailboxes only." : "Field users see only their own mailbox.",
  irrigation_manager: (vis) => vis === "all" ? "Irrigation managers see all mailboxes." : vis === "shared_only" ? "Irrigation managers see shared mailboxes only." : "Irrigation managers see only their own mailbox.",
  shop_manager: (vis) => vis === "all" ? "Shop managers see all mailboxes." : vis === "shared_only" ? "Shop managers see shared mailboxes only." : "Shop managers see only their own mailbox.",
  mapping: (vis) => vis === "all" ? "Mapping users see all mailboxes." : vis === "shared_only" ? "Mapping users see shared mailboxes only." : "Mapping users see only their own mailbox.",
  landscape_supervisor: (vis) => vis === "all" ? "Landscape supervisors see all mailboxes." : vis === "shared_only" ? "Landscape supervisors see shared mailboxes only." : "Landscape supervisors see only their own mailbox.",
};

function CompanyMailSettingsForm() {
  const { toast } = useToast();
  const [explainerOpen, setExplainerOpen] = useState(false);

  const { data: mailSettings, isLoading } = useQuery<MailSettings>({
    queryKey: ["/api/settings/mail"],
  });

  const form = useForm<MailSettingsFormValues>({
    resolver: zodResolver(mailSettingsSchema),
    defaultValues: {
      defaultSyncIntervalMinutes: 2,
      sharedRoles: ["admin", "office"],
      perRole: { field: "own" },
    },
  });

  useEffect(() => {
    if (!mailSettings) return;
    form.reset({
      defaultSyncIntervalMinutes: mailSettings.defaultSyncIntervalMinutes ?? 2,
      sharedRoles: mailSettings.defaultMailboxVisibility?.shared ?? ["admin", "office"],
      perRole: (mailSettings.defaultMailboxVisibility?.perRole ?? { field: "own" }) as Record<string, "own" | "all" | "shared_only">,
    });
  }, [mailSettings]);

  const saveMutation = useMutation({
    mutationFn: (v: MailSettingsFormValues) =>
      apiRequest("PATCH", "/api/settings/mail", {
        defaultSyncIntervalMinutes: v.defaultSyncIntervalMinutes,
        defaultMailboxVisibility: {
          shared: v.sharedRoles,
          perRole: v.perRole,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/mail"] });
      toast({ title: "Mail settings saved" });
    },
    onError: () => toast({ title: "Failed to save mail settings", variant: "destructive" }),
  });

  const sharedRoles = form.watch("sharedRoles");
  const perRole = form.watch("perRole");
  const syncInterval = form.watch("defaultSyncIntervalMinutes");

  const toggleSharedRole = (role: string) => {
    const current = form.getValues("sharedRoles");
    if (current.includes(role)) {
      form.setValue("sharedRoles", current.filter(r => r !== role));
    } else {
      form.setValue("sharedRoles", [...current, role]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <p className="text-sm text-muted-foreground">Loading mail settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Company Mail Settings</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure default visibility and sync behavior for new mailboxes. Changes apply to newly connected mailboxes only.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-6">

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Default Mailbox Visibility</CardTitle>
              <CardDescription>
                Which roles can see shared mailboxes by default when a new shared mailbox is created.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Shared mailbox visible to:</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleSharedRole(role)}
                      data-testid={`toggle-shared-role-${role}`}
                      className={`rounded-md px-2.5 py-1 text-xs border transition-colors ${
                        sharedRoles.includes(role)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover-elevate"
                      }`}
                    >
                      {ROLE_LABELS[role] ?? role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Per-role visibility override:</p>
                <div className="space-y-2">
                  {ALL_ROLES.map(role => (
                    <div key={role} className="flex items-center gap-3">
                      <span className="text-sm w-40 shrink-0">{ROLE_LABELS[role] ?? role}</span>
                      <Select
                        value={perRole[role] ?? "own"}
                        onValueChange={(v) => {
                          const current = form.getValues("perRole");
                          form.setValue("perRole", { ...current, [role]: v as "own" | "all" | "shared_only" });
                        }}
                      >
                        <SelectTrigger className="w-40" data-testid={`select-per-role-${role}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="own">Own only</SelectItem>
                          <SelectItem value="all">All mailboxes</SelectItem>
                          <SelectItem value="shared_only">Shared only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setExplainerOpen(!explainerOpen)}
                  data-testid="button-visibility-explainer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover-elevate rounded px-1"
                >
                  <Info className="w-3.5 h-3.5" />
                  What this means
                  {explainerOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {explainerOpen && (
                  <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs" data-testid="panel-visibility-explainer">
                    {ALL_ROLES.map(role => (
                      <p key={role}>
                        <span className="font-medium">{ROLE_LABELS[role] ?? role}:</span>{" "}
                        {VISIBILITY_EXPLAINERS[role]?.(perRole[role] as "own" | "all" | "shared_only" | undefined) ?? ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Default Sync Interval</CardTitle>
              <CardDescription>
                How often new mailboxes will sync by default. Applies to newly connected mailboxes only — existing mailboxes keep their current interval.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="defaultSyncIntervalMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sync interval (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        max={60}
                        onChange={e => field.onChange(parseInt(e.target.value, 10) || 2)}
                        className="w-32"
                        data-testid="input-default-sync-interval"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Between 1 and 60 minutes.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-mail-settings">
              {saveMutation.isPending ? "Saving..." : "Save mail settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SharedMailboxesAndOversightPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="heading-shared-mailboxes">Shared Mailboxes &amp; Oversight</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Manage shared team mailboxes, review personal mailboxes connected by staff, and configure company-wide mail defaults.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-10">
        <SharedMailboxesSection />
        <div className="border-t" />
        <PersonalMailboxOversightTable />
        <div className="border-t" />
        <CompanyMailSettingsForm />
      </div>
    </div>
  );
}
