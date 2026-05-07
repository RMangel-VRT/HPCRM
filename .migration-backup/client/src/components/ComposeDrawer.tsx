import { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommunicationTemplate, Customer, CommunicationWithDetails } from "@shared/schema";

const composeSchema = z.object({
  customerId: z.string().optional(),
  contactId: z.string().optional(),
  type: z.enum(["email", "sms", "note", "letter"]),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  recipientEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  internalNotes: z.string().optional(),
  templateId: z.string().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
  replyTo?: CommunicationWithDetails;
  threadId?: string;
}

function resolveTokens(text: string, context: { customerName?: string; contactName?: string }): { resolved: string; unresolvedTokens: string[] } {
  const tokenMap: Record<string, string | undefined> = {
    customerName: context.customerName,
    contactName: context.contactName,
  };
  const unresolvedTokens: string[] = [];
  const resolved = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (tokenMap[key]) return tokenMap[key]!;
    unresolvedTokens.push(key);
    return match;
  });
  return { resolved, unresolvedTokens };
}

export default function ComposeDrawer({ open, onClose, defaultCustomerId, replyTo, threadId }: ComposeDrawerProps) {
  const { toast } = useToast();
  const [unresolvedTokens, setUnresolvedTokens] = useState<string[]>([]);

  const { data: templates = [] } = useQuery<CommunicationTemplate[]>({
    queryKey: ["/api/communication-templates"],
  });

  const { data: customersData } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers?page=1&limit=500"],
  });
  const customers = customersData?.customers ?? [];

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      customerId: defaultCustomerId ?? "",
      type: "email",
      subject: replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}` : "",
      body: "",
      recipientEmail: "",
      internalNotes: "",
      inReplyTo: replyTo?.id,
      threadId: replyTo?.threadId ?? threadId,
    },
  });

  const watchedType = useWatch({ control: form.control, name: "type" });

  useEffect(() => {
    if (open) {
      form.reset({
        customerId: defaultCustomerId ?? "",
        type: "email",
        subject: replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}` : "",
        body: "",
        recipientEmail: "",
        internalNotes: "",
        inReplyTo: replyTo?.id,
        threadId: replyTo?.threadId ?? threadId,
      });
      setUnresolvedTokens([]);
    }
  }, [open]);

  const selectedCustomerId = form.watch("customerId");
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    const context = { customerName: selectedCustomer?.name };
    const subjectResolved = resolveTokens(template.subject ?? "", context);
    const bodyResolved = resolveTokens(template.body ?? "", context);
    form.setValue("subject", subjectResolved.resolved);
    form.setValue("body", bodyResolved.resolved);
    const allUnresolved = Array.from(new Set([...subjectResolved.unresolvedTokens, ...bodyResolved.unresolvedTokens]));
    setUnresolvedTokens(allUnresolved);
  };

  const mutation = useMutation({
    mutationFn: async (data: ComposeFormValues & { status: "draft" | "sent" }) => {
      const created: CommunicationWithDetails = await apiRequest("POST", "/api/communications", {
        ...data,
        customerId: data.customerId || undefined,
        contactId: data.contactId || undefined,
        templateId: data.templateId || undefined,
        threadId: data.threadId || undefined,
        inReplyTo: data.inReplyTo || undefined,
        recipientEmail: data.recipientEmail || undefined,
        status: "draft",
      }).then(r => r.json());

      if (data.status === "sent" && data.type === "email") {
        const result: CommunicationWithDetails = await apiRequest("POST", `/api/communications/${created.id}/send`, {
          recipientEmail: data.recipientEmail || undefined,
        }).then(r => r.json());
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
            title: "Email delivery failed",
            description: result.failureReason ?? "The email could not be delivered.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Email sent successfully", description: result?.recipientEmail ? `Delivered to ${result.recipientEmail}` : undefined });
        }
      } else if (variables.status === "sent") {
        toast({ title: "Message sent" });
      } else {
        toast({ title: "Draft saved" });
      }
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to send", description: "An error occurred.", variant: "destructive" });
    },
  });

  const handleSubmit = (status: "draft" | "sent") => {
    form.handleSubmit((data) => {
      mutation.mutate({ ...data, status });
    })();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{replyTo ? "Reply to Message" : "New Message"}</SheetTitle>
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
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
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
                  <Select onValueChange={field.onChange} value={field.value}>
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

            {templates.length > 0 && (
              <FormItem>
                <FormLabel>Template</FormLabel>
                <Select onValueChange={handleTemplateSelect}>
                  <SelectTrigger data-testid="select-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
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
                  <Badge key={t} variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-400">{`{{${t}}}`}</Badge>
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
                    <Input {...field} data-testid="input-subject" placeholder="Message subject" />
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
