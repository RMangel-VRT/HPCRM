import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveTokens, highlightUnresolvedTokens } from "@/lib/tokenResolver";
import type { Customer, Contact, EmailTemplate } from "@shared/schema";
import { AlertTriangle } from "lucide-react";

const NONE = "_none";

const composeSchema = z.object({
  customerId: z.string(),
  toContactId: z.string(),
  type: z.enum(["email", "sms", "note", "letter"]),
  templateId: z.string(),
  subject: z.string().optional(),
  body: z.string().min(1, "Body is required"),
  internalNotes: z.string().optional(),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultCustomerId?: string | null;
}

function toApi(v: string): string | null {
  return v === NONE ? null : v;
}

export default function ComposeDrawer({ open, onClose, defaultCustomerId }: ComposeDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [unresolvedTokens, setUnresolvedTokens] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      customerId: defaultCustomerId ?? NONE,
      toContactId: NONE,
      type: "email",
      templateId: NONE,
      subject: "",
      body: "",
      internalNotes: "",
    },
  });

  const watchedCustomerId = form.watch("customerId");
  const watchedBody = form.watch("body");
  const watchedTemplateId = form.watch("templateId");
  const watchedContactId = form.watch("toContactId");

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", watchedCustomerId, "contacts"],
    enabled: watchedCustomerId !== NONE && !!watchedCustomerId,
  });

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  const selectedCustomer = customers.find((c) => c.id === watchedCustomerId) ?? null;
  const selectedContact = contacts.find((c) => c.id === watchedContactId) ?? null;

  useEffect(() => {
    if (!watchedBody) {
      setUnresolvedTokens([]);
      setPreviewHtml("");
      return;
    }
    const ctx = {
      customerName: selectedCustomer?.name,
      customerStreet: selectedCustomer?.street,
      customerCity: selectedCustomer?.city,
      customerState: selectedCustomer?.state,
      customerZip: selectedCustomer?.zip,
      contactName: selectedContact?.name,
      contactEmail: selectedContact?.emails?.[0],
      contactPhone: selectedContact?.phones?.[0],
    };
    const { resolved, unresolvedTokens: unresolved } = resolveTokens(watchedBody, ctx);
    setUnresolvedTokens(unresolved);
    setPreviewHtml(highlightUnresolvedTokens(resolved));
  }, [watchedBody, selectedCustomer, selectedContact]);

  useEffect(() => {
    if (!watchedTemplateId || watchedTemplateId === NONE || !templates.length) return;
    const template = templates.find((t) => t.id === watchedTemplateId);
    if (!template) return;
    form.setValue("subject", template.subject);
    form.setValue("body", template.textBody || template.htmlBody.replace(/<[^>]+>/g, "") || "");
  }, [watchedTemplateId, templates]);

  useEffect(() => {
    if (open) {
      form.reset({
        customerId: defaultCustomerId ?? NONE,
        toContactId: NONE,
        type: "email",
        templateId: NONE,
        subject: "",
        body: "",
        internalNotes: "",
      });
      setUnresolvedTokens([]);
      setPreviewHtml("");
    }
  }, [open, defaultCustomerId]);

  const createMutation = useMutation({
    mutationFn: (data: { values: ComposeFormValues; status: "draft" | "sent" }) =>
      apiRequest("POST", "/api/communications", {
        customerId: toApi(data.values.customerId),
        contactId: toApi(data.values.toContactId),
        templateId: toApi(data.values.templateId),
        type: data.values.type,
        subject: data.values.subject || null,
        body: data.values.body,
        internalNotes: data.values.internalNotes || null,
        status: data.status,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      toast({ title: variables.status === "sent" ? "Communication marked as sent" : "Draft saved" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to save communication", variant: "destructive" });
    },
  });

  const handleSaveDraft = form.handleSubmit((values) => {
    createMutation.mutate({ values, status: "draft" });
  });

  const handleMarkSent = form.handleSubmit((values) => {
    createMutation.mutate({ values, status: "sent" });
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>New Message</SheetTitle>
          <SheetDescription>
            Compose a new outbound communication. No live delivery will occur.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("toContactId", NONE);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-customer">
                          <SelectValue placeholder="Select customer..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id} data-testid={`option-customer-${c.id}`}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="toContactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient Contact</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={watchedCustomerId === NONE}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-contact">
                          <SelectValue placeholder={watchedCustomerId !== NONE ? "Select contact..." : "Select customer first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {contacts.map((c) => (
                          <SelectItem key={c.id} value={c.id} data-testid={`option-contact-${c.id}`}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
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

              <FormField
                control={form.control}
                name="templateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="No template" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No template</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id} data-testid={`option-template-${t.id}`}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Subject line..."
                      data-testid="input-subject"
                      {...field}
                      value={field.value ?? ""}
                    />
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
                    <Textarea
                      placeholder="Write your message here... Use {{customerName}}, {{propertyAddress}}, {{contactName}} as placeholders."
                      className="min-h-[160px] resize-y"
                      data-testid="textarea-body"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {unresolvedTokens.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800" data-testid="unresolved-tokens-warning">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Unresolved placeholders</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    The following tokens could not be resolved from the selected customer/contact:
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {unresolvedTokens.map((token) => (
                      <Badge key={token} variant="outline" className="text-xs border-yellow-400 text-yellow-800 dark:text-yellow-200" data-testid={`unresolved-token-${token}`}>
                        {`{{${token}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {watchedBody && previewHtml && unresolvedTokens.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Body Preview</p>
                <div
                  className="text-sm whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                  data-testid="body-preview"
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Internal notes (not sent to recipient)..."
                      className="min-h-[80px] resize-y"
                      data-testid="textarea-internal-notes"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={createMutation.isPending}
                data-testid="button-save-draft"
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                onClick={handleMarkSent}
                disabled={createMutation.isPending}
                data-testid="button-mark-sent"
              >
                Mark as Sent
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="ml-auto"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
