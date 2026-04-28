import { useState } from "react";
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
import { MoreHorizontal, Plus, Mail, Pencil, Trash2, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MailboxAccount } from "@shared/schema";

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
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

function SyncStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "connected") return <Badge className="text-xs bg-green-600/90 text-white">{t("emailTracking.syncConnected")}</Badge>;
  if (status === "error") return <Badge variant="destructive" className="text-xs">{t("emailTracking.syncError")}</Badge>;
  return <Badge variant="secondary" className="text-xs">{t("emailTracking.syncNotConnected")}</Badge>;
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
            variant="outline"
            size="sm"
            disabled
            data-testid="button-connect-gmail"
            className="gap-1"
          >
            <Mail className="w-4 h-4" />
            {t("emailTracking.connectGmail")}
          </Button>
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
                        <div className="flex flex-col gap-1">
                          <SyncStatusBadge status={account.syncStatus ?? "not_connected"} />
                          {(!account.syncStatus || account.syncStatus === "not_connected") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              data-testid={`button-connect-gmail-${account.id}`}
                              className="gap-1 text-xs h-7"
                            >
                              <Mail className="w-3 h-3" />
                              {t("emailTracking.connectGmail")}
                            </Button>
                          )}
                        </div>
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
