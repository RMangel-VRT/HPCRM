import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  AlertDialogTrigger,
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
  User,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link2Off,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import type { MailboxAccount, MailboxSyncRun } from "@shared/schema";

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface OAuthStatus {
  syncEnabled: boolean;
  syncStatus: string;
  connectedEmail: string | null;
  connectedAt: string | null;
  hasRefreshToken: boolean;
}

const makeFormSchema = (t: (key: string) => string) => z.object({
  emailAddress: z.string().email(t("emailTracking.emailAddressValidation")),
  displayName: z.string().min(1, t("emailTracking.displayNameValidation")),
  accountType: z.enum(["personal", "shared"]),
  isActive: z.boolean().default(true),
  ownerUserId: z.string().nullable().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

function SyncStatusBadge({ status, connectedEmail }: { status: string; connectedEmail?: string | null }) {
  const { t } = useTranslation();
  if (status === "connected") {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
        <Badge className="text-xs bg-green-600/90 text-white">
          {connectedEmail ? t("emailTracking.syncConnectedAs", { email: connectedEmail }) : t("emailTracking.syncConnected")}
        </Badge>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
        <Badge variant="destructive" className="text-xs">{t("emailTracking.syncError")}</Badge>
      </div>
    );
  }
  return <Badge variant="secondary" className="text-xs">{t("emailTracking.syncNotConnected")}</Badge>;
}

function SyncRunStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "success") return <Badge className="text-xs bg-green-600/90 text-white">{t("emailTracking.syncRunSuccess")}</Badge>;
  if (status === "partial") return <Badge variant="secondary" className="text-xs">{t("emailTracking.syncRunPartial")}</Badge>;
  if (status === "error") return <Badge variant="destructive" className="text-xs">{t("emailTracking.syncRunError")}</Badge>;
  if (status === "running") return <Badge variant="secondary" className="text-xs animate-pulse">{t("emailTracking.syncRunRunning")}</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function SyncHistoryPanel({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
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
        {t("emailTracking.syncHistory")}
      </button>
      {open && (
        <div className="mt-1.5 rounded-md border bg-muted/30 text-xs p-2 space-y-1 w-72" data-testid={`panel-sync-history-${accountId}`}>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-1">{t("common.loading")}</p>
          ) : last5.length === 0 ? (
            <p className="text-muted-foreground text-center py-1">{t("emailTracking.syncHistoryEmpty")}</p>
          ) : (
            last5.map(run => (
              <div key={run.id} className="flex items-center gap-2 flex-wrap py-0.5 border-b last:border-0">
                <SyncRunStatusBadge status={run.status} />
                <span className="text-muted-foreground shrink-0">
                  {format(new Date(run.startedAt), "MMM d, h:mm a")}
                </span>
                <span className="text-foreground">
                  {run.messagesFetched} <span className="text-muted-foreground">{t("emailTracking.syncRunFetched")}</span>
                  {" · "}{run.messagesRouted} <span className="text-muted-foreground">{t("emailTracking.syncRunRouted")}</span>
                  {" · "}{run.messagesUnsorted} <span className="text-muted-foreground">{t("emailTracking.syncRunUnsorted")}</span>
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
  const { t } = useTranslation();
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: (syncIntervalMinutes: number) =>
      apiRequest("PATCH", `/api/mailbox-accounts/${account.id}`, { syncIntervalMinutes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
    },
    onError: () => toast({ title: t("emailTracking.syncFailedToast"), variant: "destructive" }),
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
          <SelectItem value="1">{t("emailTracking.syncInterval1")}</SelectItem>
          <SelectItem value="2">{t("emailTracking.syncInterval2")}</SelectItem>
          <SelectItem value="5">{t("emailTracking.syncInterval5")}</SelectItem>
          <SelectItem value="10">{t("emailTracking.syncInterval10")}</SelectItem>
          <SelectItem value="30">{t("emailTracking.syncInterval30")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function MailboxFormDialog({
  open,
  onOpenChange,
  editAccount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editAccount?: MailboxAccount | null;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!editAccount;
  const formSchema = makeFormSchema(t);

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["/api/company-users"],
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      emailAddress: editAccount?.emailAddress ?? "",
      displayName: editAccount?.displayName ?? "",
      accountType: (editAccount?.accountType as "personal" | "shared") ?? "shared",
      isActive: editAccount?.isActive ?? true,
      ownerUserId: editAccount?.ownerUserId ?? null,
      description: editAccount?.description ?? "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      emailAddress: editAccount?.emailAddress ?? "",
      displayName: editAccount?.displayName ?? "",
      accountType: (editAccount?.accountType as "personal" | "shared") ?? "shared",
      isActive: editAccount?.isActive ?? true,
      ownerUserId: editAccount?.ownerUserId ?? null,
      description: editAccount?.description ?? "",
    });
  }, [open, editAccount]);

  const watchAccountType = form.watch("accountType");

  const createMutation = useMutation({
    mutationFn: (v: FormValues) => apiRequest("POST", "/api/mailbox-accounts", v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: t("emailTracking.addMailboxTitle") });
      onOpenChange(false);
      form.reset();
    },
    onError: () => toast({ title: t("emailTracking.mailboxCreateError"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (v: FormValues) => apiRequest("PATCH", `/api/mailbox-accounts/${editAccount?.id}`, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: t("emailTracking.editMailbox") });
      onOpenChange(false);
    },
    onError: () => toast({ title: t("emailTracking.mailboxUpdateError"), variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-mailbox-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("emailTracking.editMailbox") : t("emailTracking.addMailboxTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(v => isEdit ? updateMutation.mutate(v) : createMutation.mutate(v))}
            className="space-y-4"
          >
            <FormField control={form.control} name="emailAddress" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("emailTracking.emailAddress")}</FormLabel>
                <FormControl>
                  <Input {...field} type="email" placeholder={t("emailTracking.emailAddressPlaceholder")} data-testid="input-mailbox-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="displayName" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("emailTracking.displayName")}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t("emailTracking.displayNamePlaceholder")} data-testid="input-mailbox-displayname" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="accountType" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("emailTracking.accountType")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mailbox-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="shared">{t("emailTracking.accountTypeShared")}</SelectItem>
                      <SelectItem value="personal">{t("emailTracking.accountTypePersonal")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("emailTracking.activeLabel")}</FormLabel>
                  <div className="flex items-center gap-2 h-10">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-mailbox-active"
                      />
                    </FormControl>
                    <span className="text-sm text-muted-foreground">
                      {field.value ? t("emailTracking.activeEnabled") : t("emailTracking.activeDisabled")}
                    </span>
                  </div>
                </FormItem>
              )} />
            </div>
            {watchAccountType === "personal" && (
              <FormField control={form.control} name="ownerUserId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {t("emailTracking.ownerUser")}
                  </FormLabel>
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-mailbox-owner">
                        <SelectValue placeholder={t("emailTracking.selectOwner")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">{t("emailTracking.noOwner")}</SelectItem>
                      {companyUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("emailTracking.descriptionOptional")}</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder={t("emailTracking.descriptionPlaceholder")} rows={2} data-testid="input-mailbox-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-mailbox-cancel">
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-mailbox-submit">
                {isPending ? t("common.saving") : isEdit ? t("emailTracking.saveChanges") : t("emailTracking.addMailbox")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function GmailConnectButton({ account }: { account: MailboxAccount }) {
  const { t } = useTranslation();
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
      toast({ title: t("emailTracking.gmailDisconnected") });
    },
    onError: () => toast({ title: t("emailTracking.gmailDisconnectError"), variant: "destructive" }),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mailbox-accounts/${account.id}/sync`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", account.id, "sync-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: t("emailTracking.syncSuccess") });
    },
    onError: (err: Error) => {
      const isConflict = err.message?.includes("already in progress") || err.message?.includes("409");
      toast({
        title: isConflict ? t("emailTracking.syncConflict") : t("emailTracking.syncFailedToast"),
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
        toast({ title: result?.error ?? t("emailTracking.gmailConnectError"), variant: "destructive" });
        setIsConnecting(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("emailTracking.gmailConnectError");
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
          {t("emailTracking.connectedAgo", { time: formatDistanceToNow(new Date(connectedAt), { addSuffix: true }) })}
        </p>
      )}

      {isError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs space-y-1.5"
          data-testid={`callout-sync-error-${account.id}`}
        >
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {t("emailTracking.syncErrorCalloutTitle")}
          </div>
          <p className="text-muted-foreground leading-relaxed">
            {t("emailTracking.syncErrorCalloutDesc", { count: errorCount })}
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
              {syncNowMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {syncNowMutation.isPending ? t("emailTracking.syncing") : t("emailTracking.syncNowShort")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  data-testid={`button-disconnect-gmail-${account.id}`}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Link2Off className="w-3 h-3" />
                  )}
                  {t("emailTracking.disconnect")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("emailTracking.disconnectTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("emailTracking.disconnectDesc", { email: connectedEmail ?? account.emailAddress })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => disconnectMutation.mutate()}
                    data-testid={`button-confirm-disconnect-${account.id}`}
                  >
                    {t("emailTracking.disconnect")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                  {isConnecting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {t("emailTracking.reconnect")}
                </Button>
                <AlertDialog open={reconnectDialogOpen} onOpenChange={setReconnectDialogOpen}>
                  <AlertDialogContent data-testid={`dialog-reconnect-${account.id}`}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("emailTracking.reconnectTitle")}</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>{t("emailTracking.reconnectDesc")}</p>
                          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                            <span>{t("emailTracking.reconnectHistoryNote")}</span>
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleConnect}
                        data-testid={`button-confirm-reconnect-${account.id}`}
                      >
                        {t("emailTracking.reconnectConfirm")}
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
                {isConnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                {t("emailTracking.connectGmail")}
              </Button>
            )}
          </>
        )}
      </div>

      {isConnected && (
        <SyncIntervalSelect account={account} />
      )}

      {isConnected && (
        <SyncHistoryPanel accountId={account.id} />
      )}
    </div>
  );
}

export default function MailboxAccountsSettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<MailboxAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
  });

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["/api/company-users"],
  });

  const userMap = new Map(companyUsers.map(u => [u.id, u]));

  // Handle ?connected=<id> return from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedId = params.get("connected");
    if (connectedId) {
      toast({ title: t("emailTracking.gmailConnectedSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", connectedId, "oauth-status"] });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mailbox-accounts/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: t("emailTracking.deactivate") });
    },
    onError: () => toast({ title: t("emailTracking.mailboxDeactivateError"), variant: "destructive" }),
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
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold" data-testid="heading-mailbox-settings">{t("emailTracking.mailboxSettingsTitle")}</h1>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => { setEditAccount(null); setShowForm(true); }}
            data-testid="button-add-mailbox"
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            {t("emailTracking.addMailbox")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {t("emailTracking.mailboxSettingsDesc")}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
              <Mail className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium text-sm">{t("emailTracking.noMailboxes")}</p>
              <p className="text-muted-foreground text-sm text-center max-w-sm" data-testid="text-no-mailboxes">
                {t("emailTracking.noMailboxesDesc")}
              </p>
              <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-first-mailbox">
                {t("emailTracking.addFirstMailbox")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("emailTracking.configuredMailboxes")} ({accounts.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("emailTracking.columnEmailName")}</TableHead>
                    <TableHead>{t("emailTracking.columnType")} / {t("emailTracking.ownerUser")}</TableHead>
                    <TableHead>{t("emailTracking.columnStatus")}</TableHead>
                    <TableHead>{t("emailTracking.columnSync")}</TableHead>
                    <TableHead className="text-right">{t("emailTracking.columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id} data-testid={`row-mailbox-${account.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-mailbox-name-${account.id}`}>{account.displayName}</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-mailbox-email-${account.id}`}>{account.emailAddress}</p>
                          {account.lastSyncedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("emailTracking.syncSummaryLastRun", {
                                time: formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true }),
                              })}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Badge variant="outline" className="text-xs capitalize">{account.accountType}</Badge>
                          {account.accountType === "personal" && account.ownerUserId && (
                            <p className="text-xs text-muted-foreground">
                              {userMap.get(account.ownerUserId)?.name ?? t("emailTracking.unknownUser")}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.isActive
                          ? <Badge variant="secondary" className="text-xs">{t("emailTracking.activeEnabled")}</Badge>
                          : <Badge variant="outline" className="text-xs text-muted-foreground">{t("emailTracking.activeDisabled")}</Badge>
                        }
                      </TableCell>
                      <TableCell>
                        <GmailConnectButton account={account} />
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
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteMutation.mutate(account.id)}
                              className="text-destructive"
                              data-testid={`action-deactivate-mailbox-${account.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t("emailTracking.deactivate")}
                            </DropdownMenuItem>
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
      </div>
      <MailboxFormDialog
        open={showForm}
        onOpenChange={handleClose}
        editAccount={editAccount}
      />
    </div>
  );
}
