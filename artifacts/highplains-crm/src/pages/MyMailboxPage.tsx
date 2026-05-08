import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Mail, Plus, Loader2, CheckCircle, AlertCircle, Link2Off, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import BackfillPanel from "@/components/customer/communications/BackfillPanel";

interface PersonalMailboxDto {
  id: string;
  displayName: string;
  emailAddress: string;
  accountType: string;
  syncStatus: "not_connected" | "connected" | "error" | null;
  syncEnabled: boolean;
  syncErrorCount: number | null;
  lastSyncedAt: string | null;
  isActive: boolean;
  ownerUserId: string | null;
  connectedEmail: string | null;
  connectedAt: string | null;
}

interface AlreadyExistsResponse {
  alreadyExists: true;
  id: string;
  isOwner: boolean;
  accountType: string;
}

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

const addMailboxSchema = z.object({
  emailAddress: z.string().email("Please enter a valid email address"),
  displayName: z.string().optional(),
});
type AddMailboxValues = z.infer<typeof addMailboxSchema>;

interface AddMailboxModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
  defaultDisplayName?: string;
}

function AddMailboxModal({ open, onOpenChange, defaultEmail = "", defaultDisplayName = "" }: AddMailboxModalProps) {
  const { toast } = useToast();
  const [alreadyExistsInfo, setAlreadyExistsInfo] = useState<AlreadyExistsResponse | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const form = useForm<AddMailboxValues>({
    resolver: zodResolver(addMailboxSchema),
    defaultValues: { emailAddress: defaultEmail, displayName: defaultDisplayName },
  });

  useEffect(() => {
    if (open) {
      form.reset({ emailAddress: defaultEmail, displayName: defaultDisplayName });
      setAlreadyExistsInfo(null);
    }
  }, [open, defaultEmail, defaultDisplayName]);

  const createMutation = useMutation({
    mutationFn: async (values: AddMailboxValues) => {
      const res = await apiRequest("POST", "/api/mailbox-accounts/mine", values);
      return res.json() as Promise<PersonalMailboxDto | AlreadyExistsResponse>;
    },
    onSuccess: (data) => {
      if ("alreadyExists" in data && data.alreadyExists) {
        setAlreadyExistsInfo(data);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts/mine"] });
      toast({ title: "Mailbox added — click Connect to link your Gmail account." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to add mailbox", variant: "destructive" });
    },
  });

  const handleConnectExisting = async (id: string) => {
    setIsConnecting(true);
    try {
      const res = await apiRequest("GET", `/api/mailbox-accounts/${id}/oauth/connect?from=my-mailbox`);
      const result = await res.json() as { authUrl?: string; error?: string };
      if (result?.authUrl) {
        window.location.href = result.authUrl;
      } else {
        toast({ title: result?.error ?? "Could not start OAuth flow", variant: "destructive" });
        setIsConnecting(false);
      }
    } catch {
      toast({ title: "Could not start OAuth flow", variant: "destructive" });
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-add-my-mailbox">
        <DialogHeader>
          <DialogTitle>Add Mailbox</DialogTitle>
        </DialogHeader>

        {alreadyExistsInfo ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium">A mailbox with this address already exists.</p>
              {alreadyExistsInfo.isOwner ? (
                <p className="text-muted-foreground mt-1">This mailbox is already in your list. You can connect it directly.</p>
              ) : (
                <p className="text-muted-foreground mt-1">This address is registered as a {alreadyExistsInfo.accountType} mailbox. Please ask your admin to grant you access.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-add-mailbox-cancel">
                Close
              </Button>
              {alreadyExistsInfo.isOwner && (
                <Button
                  onClick={() => handleConnectExisting(alreadyExistsInfo.id)}
                  disabled={isConnecting}
                  data-testid="button-connect-existing-mailbox"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Connect it now
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField control={form.control} name="emailAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gmail address</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="you@gmail.com" data-testid="input-my-mailbox-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="displayName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="My Work Gmail" data-testid="input-my-mailbox-displayname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-add-mailbox-cancel"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-add-mailbox-submit">
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Add Mailbox
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MailboxRowProps {
  account: PersonalMailboxDto;
}

function MailboxRow({ account }: MailboxRowProps) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mailbox-accounts/${account.id}/oauth/disconnect`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts/mine"] });
      toast({ title: "Mailbox disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect mailbox", variant: "destructive" }),
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await apiRequest("GET", `/api/mailbox-accounts/${account.id}/oauth/connect?from=my-mailbox`);
      const result = await res.json() as { authUrl?: string; error?: string };
      if (result?.authUrl) {
        window.location.href = result.authUrl;
      } else {
        toast({ title: result?.error ?? "Could not start OAuth flow", variant: "destructive" });
        setIsConnecting(false);
      }
    } catch {
      toast({ title: "Could not start OAuth flow", variant: "destructive" });
      setIsConnecting(false);
    }
  };

  const status = account.syncStatus ?? "not_connected";
  const connectedEmail = account.connectedEmail;
  const connectedAt = account.connectedAt;
  const isConnected = status === "connected";
  const isError = status === "error";

  return (
    <div
      className="flex flex-col gap-3 p-4 border-b last:border-0"
      data-testid={`row-my-mailbox-${account.id}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-medium text-sm">{account.displayName}</p>
          <p className="text-xs text-muted-foreground">{account.emailAddress}</p>
          {connectedAt && isConnected && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Connected {formatDistanceToNow(new Date(connectedAt), { addSuffix: true })}
            </p>
          )}
          {account.lastSyncedAt && isConnected && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last synced {formatDistanceToNow(new Date(account.lastSyncedAt), { addSuffix: true })}
            </p>
          )}
        </div>
        <SyncStatusBadge status={status} connectedEmail={connectedEmail} />
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Sync error — reconnect to resume
          </div>
          <p className="text-muted-foreground">
            {account.syncErrorCount ? `${account.syncErrorCount} consecutive errors` : "Authentication expired"}. Reconnect to restore sync.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isConnected ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                disabled={disconnectMutation.isPending}
                data-testid={`button-disconnect-my-mailbox-${account.id}`}
              >
                {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect mailbox?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will stop email sync for {connectedEmail ?? account.emailAddress}. You can reconnect at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => disconnectMutation.mutate()}
                  data-testid={`button-confirm-disconnect-my-mailbox-${account.id}`}
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleConnect}
            disabled={isConnecting}
            className="gap-1 text-xs"
            data-testid={`button-connect-my-mailbox-${account.id}`}
          >
            {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : isError ? <RefreshCw className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
            {isError ? "Reconnect" : "Connect Gmail"}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => setBackfillOpen(v => !v)}
          disabled={!isConnected}
          aria-expanded={backfillOpen}
          title={isConnected ? undefined : "Connect this mailbox to manage backfill"}
          data-testid={`button-manage-backfill-${account.id}`}
        >
          {isConnected && backfillOpen ? "Hide backfill" : "Manage backfill"}
        </Button>
      </div>

      {isConnected && backfillOpen && (
        <BackfillPanel mailboxAccountId={account.id} autoOpen />
      )}
    </div>
  );
}

export default function MyMailboxPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState("");

  const { data: mailboxes = [], isLoading } = useQuery<PersonalMailboxDto[]>({
    queryKey: ["/api/mailbox-accounts/mine"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedId = params.get("connected");
    const wasAutocorrected = params.get("autocorrected") === "1";
    if (connectedId) {
      if (wasAutocorrected) {
        const corrected = mailboxes.find(m => m.id === connectedId);
        toast({
          title: "Gmail connected successfully",
          description: corrected
            ? `Your mailbox address was updated to match the Google account you signed in with (${corrected.emailAddress}).`
            : "Your mailbox email address was automatically updated to match your Google account.",
        });
      } else {
        toast({ title: "Gmail connected successfully!" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts/mine"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleOpenAddModal = (prefill?: string) => {
    setPrefillEmail(prefill ?? "");
    setAddModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold" data-testid="heading-my-mailbox">My Mailbox</h1>
          </div>
          <div className="flex-1" />
          {mailboxes.length > 0 && (
            <Button
              size="sm"
              onClick={() => handleOpenAddModal()}
              data-testid="button-add-my-mailbox"
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Mailbox
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Gmail account to send and receive emails from the CRM. You can add multiple Gmail addresses.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : mailboxes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Mail className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">No mailboxes connected yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Connect your Gmail to receive and send emails directly from the CRM.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleOpenAddModal(user?.email ?? "")}
                data-testid="button-connect-gmail-cta"
              >
                <Mail className="w-4 h-4 mr-2" />
                Connect your Gmail
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your mailboxes ({mailboxes.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {mailboxes.map((account) => (
                <MailboxRow key={account.id} account={account} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <AddMailboxModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        defaultEmail={prefillEmail}
        defaultDisplayName={user?.name ?? ""}
      />
    </div>
  );
}
