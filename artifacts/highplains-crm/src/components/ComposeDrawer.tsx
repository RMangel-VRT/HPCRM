import { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { extractApiErrorMessage } from "@/lib/apiError";
import { BrandedEmailPreview, useBrandedEmailPreview } from "@/components/BrandedEmailPreview";
import type { CommunicationTemplate, Contact, Customer, CommunicationWithDetails } from "@shared/schema";

const composeSchema = z.object({
  customerId: z.string().optional(),
  contactId: z.string().optional(),
  type: z.enum(["email", "sms", "note", "letter"]),
  subject: z.string().max(998).refine(v => !!v.trim() && !/[\u0000-\u001f\u007f]/u.test(v), "Enter a valid subject"),
  body: z.string().max(100_000).refine(v => !!v.trim(), "Body is required"),
  recipientEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  internalNotes: z.string().optional(),
  templateId: z.string().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
  mailboxAccountId: z.string().optional(),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
  replyTo?: CommunicationWithDetails;
  threadId?: string;
}

function resolveTokens(text: string, tokenMap: Record<string, string | undefined>): { resolved: string; unresolvedTokens: string[] } {
  const unresolvedTokens: string[] = [];
  const resolved = text.replace(/(?<!\{)\{([a-zA-Z]+)\}(?!\})/g, (match, key: string) => {
    if (Object.hasOwn(tokenMap, key) && tokenMap[key]) return tokenMap[key]!;
    unresolvedTokens.push(key);
    return match;
  });
  return { resolved, unresolvedTokens };
}

type SendOptions = { mailboxes: { id: string; accountType: string; displayName: string; emailAddress: string }[]; sharedMailboxId: string | null };
const replyRecipient = (reply?: CommunicationWithDetails) =>
  (reply?.direction === "inbound" ? reply.fromAddress : reply?.toAddresses?.[0] ?? reply?.recipientEmail) ?? "";

export default function ComposeDrawer({ open, onClose, defaultCustomerId, replyTo, threadId }: ComposeDrawerProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const [showPreview, setShowPreview] = useState(false);
  const [unresolvedTokens, setUnresolvedTokens] = useState<string[]>([]);
  const saved = useRef<{ companyId: string; key: string; draft: CommunicationWithDetails } | undefined>(undefined);

  const { data: templates = [] } = useQuery<CommunicationTemplate[]>({
    queryKey: ["/api/communication-templates", companyId, "compose"],
    queryFn: async () => (await apiRequest("GET", "/api/communication-templates")).json(),
    enabled: open && !!companyId,
  });

  const { data: customersData } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers", companyId, "compose"],
    queryFn: async () => (await apiRequest("GET", "/api/customers?page=1&limit=500")).json(),
    enabled: open && !!companyId,
  });
  const customers = customersData?.customers ?? [];

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      customerId: replyTo?.customerId ?? defaultCustomerId ?? "",
      type: "email",
      subject: replyTo ? `Re: ${replyTo.subject.replace(/^(?:Re:\s*)+/i, "")}` : "",
      body: "",
      recipientEmail: replyRecipient(replyTo),
      internalNotes: "",
      inReplyTo: replyTo?.id,
      threadId: replyTo?.threadId ?? threadId,
      mailboxAccountId: replyTo?.mailboxAccountId ?? undefined,
    },
  });

  const [watchedType, customerId, subject, body, mailboxId, recipientEmail] = useWatch({
    control: form.control, name: ["type", "customerId", "subject", "body", "mailboxAccountId", "recipientEmail"],
  });
  const isReply = !!(replyTo || threadId);
  const isEmail = watchedType === "email";
  const options = useQuery<SendOptions>({
    queryKey: ["/api/communications/send-options", companyId],
    enabled: open && isEmail && !!companyId,
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/communications/send-options", undefined,
      { signal, headers: { "X-Company-Id": companyId! } })).json(),
  });
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", companyId, "compose-contacts", customerId],
    enabled: open && !!companyId && !!customerId && !isReply,
    queryFn: async () => (await apiRequest("GET", `/api/customers/${encodeURIComponent(customerId!)}/contacts`)).json(),
  });
  const canPreview = !!subject?.trim() && !!body?.trim() && isEmail && !isReply;
  const preview = useBrandedEmailPreview(companyId, "/api/communications/preview",
    open && showPreview && canPreview ? { customerId: customerId || undefined, subject, body } : undefined);

  useEffect(() => {
    if (open) {
      form.reset({
        customerId: replyTo?.customerId ?? defaultCustomerId ?? "",
        type: "email",
        subject: replyTo ? `Re: ${replyTo.subject.replace(/^(?:Re:\s*)+/i, "")}` : "",
        body: "",
        recipientEmail: replyRecipient(replyTo),
        internalNotes: "",
        inReplyTo: replyTo?.id,
        threadId: replyTo?.threadId ?? threadId,
        mailboxAccountId: replyTo?.mailboxAccountId ?? undefined,
      });
      saved.current = undefined;
      setShowPreview(false);
      setUnresolvedTokens([]);
    }
  }, [open, companyId, defaultCustomerId, replyTo, threadId, form]);

  const selectedCustomer = customers.find(c => c.id === customerId);
  const availableTemplates = templates.filter(item => item.isActive && !item.isArchived && item.type === watchedType);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    const email = recipientEmail?.trim().toLowerCase();
    const contact = email ? contacts.find(c => c.emails?.some((value: string) => value.trim().toLowerCase() === email)) : undefined;
    const context = { customerName: selectedCustomer?.name, propertyName: selectedCustomer?.name,
      companyName: user?.activeCompany?.name, contactName: contact?.name };
    const subjectResolved = resolveTokens(template.subject ?? "", context);
    const bodyResolved = resolveTokens(template.body ?? "", context);
    form.setValue("subject", subjectResolved.resolved);
    form.setValue("body", bodyResolved.resolved);
    form.setValue("templateId", templateId);
    const allUnresolved = Array.from(new Set([...subjectResolved.unresolvedTokens, ...bodyResolved.unresolvedTokens]));
    setUnresolvedTokens(allUnresolved);
  };

  const mutation = useMutation({
    mutationFn: async (data: ComposeFormValues & { status: "draft" | "sent" }) => {
      if (!companyId) throw new Error(t("compose.failed"));
      const { status, ...fields } = data;
      const headers = { "X-Company-Id": companyId };
      const draftInput = {
        ...fields,
        customerId: data.customerId || undefined,
        contactId: data.contactId || undefined,
        templateId: data.templateId || undefined,
        threadId: data.threadId || undefined,
        inReplyTo: data.inReplyTo || undefined,
        recipientEmail: data.recipientEmail || undefined,
        mailboxAccountId: data.mailboxAccountId || undefined,
        status: "draft" as const,
      };
      const key = JSON.stringify(draftInput);
      const prior = saved.current;
      const created: CommunicationWithDetails = prior?.companyId === companyId && prior.key === key ? prior.draft
        : await apiRequest("POST", "/api/communications", draftInput, { headers }).then(r => r.json());
      saved.current = { companyId, key, draft: created };

      if (status === "sent" && data.type === "email") {
        const result: CommunicationWithDetails = await apiRequest("POST", `/api/communications/${created.id}/send`, {}, { headers }).then(r => r.json());
        return result;
      }

      return created;
    },
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/communication-threads"] });

      if (variables.status === "sent" && variables.type === "email") {
        if (result?.deliveryStatus === "failed") {
          toast({
            title: t("compose.deliveryFailed"),
            description: result.failureReason ?? t("compose.failed"),
            variant: "destructive",
          });
        } else {
          toast({ title: t("compose.sent"), description: result?.recipientEmail ? t("companyDocuments.email.sentTo", { to: result.recipientEmail }) : undefined });
        }
      } else if (variables.status === "sent") {
        toast({ title: "Message sent" });
      } else {
        toast({ title: "Draft saved" });
      }
      onClose();
    },
    onError: (error) => {
      if (saved.current) void queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      toast({ title: t("compose.failed"), description: extractApiErrorMessage(error), variant: "destructive" });
    },
  });

  const handleSubmit = (status: "draft" | "sent") => {
    form.handleSubmit((data) => {
      if (status === "sent" && data.type === "email" && !data.recipientEmail) {
        form.setError("recipientEmail", { message: t("compose.recipientRequired") }); return;
      }
      mutation.mutate({ ...data, status });
    })();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && !mutation.isPending && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isReply ? t("compose.replyTitle") : "New Message"}</SheetTitle>
        </SheetHeader>

        {replyTo && (
          <div className="mt-4 p-3 rounded-md bg-muted text-sm">
            <p className="font-medium text-muted-foreground mb-1">Replying to:</p>
            <p className="font-semibold">{replyTo.subject}</p>
            <p className="text-muted-foreground mt-1 line-clamp-2">{replyTo.body}</p>
          </div>
        )}

        <Form {...form}>
          <div className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isReply}>
                    <FormControl>
                      <SelectTrigger data-testid="select-customer">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isReply}>
                    <FormControl>
                      <SelectTrigger data-testid="select-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="letter">Letter</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEmail && <FormItem>
              <Label htmlFor="compose-mailbox">{t("companyDocuments.email.from")}</Label>
              <select id="compose-mailbox" value={mailboxId ?? ""}
                disabled={isReply || options.isPending || mutation.isPending}
                onChange={e => form.setValue("mailboxAccountId", e.target.value || undefined)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">{options.data?.mailboxes.find(m => m.id === options.data?.sharedMailboxId)?.emailAddress ?? t("compose.officeMailbox")}</option>
                {mailboxId && !options.data?.mailboxes.some(m => m.id === mailboxId) &&
                  <option value={mailboxId}>{t("compose.mailboxUnavailable")}</option>}
                {options.data?.mailboxes.map(m => <option key={m.id} value={m.id}>{m.displayName} · {m.emailAddress}</option>)}
              </select>
              {options.isError && <p className="text-sm text-destructive">{t("companyDocuments.email.loadError")}</p>}
              {options.isSuccess && !(mailboxId ? options.data.mailboxes.some(m => m.id === mailboxId) : options.data.sharedMailboxId)
                && <p className="text-sm text-muted-foreground">{t("compose.noMailbox")}</p>}
            </FormItem>}

            {watchedType === "email" && (
              <FormField
                control={form.control}
                name="recipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient Email</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-recipient-email" type="email" placeholder="recipient@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isReply && availableTemplates.length > 0 && (
              <FormItem>
                <FormLabel>Template</FormLabel>
                <Select onValueChange={handleTemplateSelect}>
                  <SelectTrigger data-testid="select-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}

            {unresolvedTokens.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md">
                <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">Unresolved tokens:</span>
                {unresolvedTokens.map(t => (
                  <Badge key={t} variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-400">{`{${t}}`}</Badge>
                ))}
              </div>
            )}

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly={!!replyTo} data-testid="input-subject" placeholder="Message subject" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Body</FormLabel>
                  <FormControl>
                    <Textarea {...field} data-testid="input-body" placeholder="Write your message here..." rows={8} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} data-testid="input-internal-notes" placeholder="Internal notes (not visible to customer)" rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Form>

        {isEmail && !isReply && <div className="mt-4 space-y-3">
          <Button type="button" variant="outline" size="sm" aria-expanded={showPreview} onClick={() => setShowPreview(v => !v)}>
            {t(showPreview ? "emailPreview.hide" : "emailPreview.title")}
          </Button>
          {showPreview && <BrandedEmailPreview preview={preview} ready={canPreview} />}
        </div>}

        <SheetFooter className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit("draft")}
            disabled={mutation.isPending}
            data-testid="button-save-draft"
          >
            Save as Draft
          </Button>
          <Button
            onClick={() => handleSubmit("sent")}
            disabled={mutation.isPending}
            data-testid="button-send"
          >
            {watchedType === "email" ? "Send Email" : "Send"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
