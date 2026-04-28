import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { MailboxAccount } from "@shared/schema";

const baseFormSchema = z.object({
  direction: z.enum(["inbound", "outbound"]),
  mailboxAccountId: z.string().optional(),
  dateTime: z.string().optional(),
  fromAddress: z.string().optional(),
  toAddresses: z.array(z.string()).default([]),
  ccAddresses: z.array(z.string()).default([]),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
});

type FormValues = z.infer<typeof baseFormSchema>;

function makeFormSchema(t: (k: string) => string) {
  return baseFormSchema.superRefine((data, ctx) => {
    if (data.direction === "outbound" && !data.mailboxAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: t("emailTracking.mailboxRequiredForOutbound"),
        path: ["mailboxAccountId"],
      });
    }
  });
}

interface LogCommunicationFormProps {
  customerId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function AddressChipsInput({ value, onChange, placeholder, testId }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const addChip = (v: string) => {
    const trimmed = v.trim().replace(/,\s*$/, "");
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInputVal("");
  };
  return (
    <div className="flex flex-wrap gap-1 border rounded-md px-2 py-1 min-h-9 items-center bg-background">
      {value.map((chip) => (
        <span key={chip} className="flex items-center gap-1 bg-muted text-xs rounded px-2 py-0.5">
          {chip}
          <button type="button" onClick={() => onChange(value.filter(c => c !== chip))} className="text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-24 outline-none bg-transparent text-sm"
        placeholder={placeholder}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(inputVal); }
          if (e.key === "Backspace" && !inputVal && value.length > 0) onChange(value.slice(0, -1));
        }}
        onBlur={() => { if (inputVal) addChip(inputVal); }}
        data-testid={testId}
      />
    </div>
  );
}

export default function LogCommunicationForm({ customerId, onSuccess, onCancel }: LogCommunicationFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showCc, setShowCc] = useState(false);

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
  });

  const activeMailboxes = mailboxAccounts.filter(m => m.isActive);

  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const formSchema = makeFormSchema(t);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      direction: "outbound",
      mailboxAccountId: undefined,
      dateTime: localIso,
      fromAddress: "",
      toAddresses: [],
      ccAddresses: [],
      subject: "",
      bodyText: "",
    },
  });

  const direction = form.watch("direction");
  const selectedMailboxId = form.watch("mailboxAccountId");
  const selectedMailbox = activeMailboxes.find(m => m.id === selectedMailboxId);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const dateVal = values.dateTime ? new Date(values.dateTime) : new Date();
      const payload: Record<string, unknown> = {
        direction: values.direction,
        subject: values.subject || "(No subject)",
        bodyText: values.bodyText,
        body: values.bodyText || "",
        toAddresses: values.toAddresses,
        ccAddresses: values.ccAddresses,
        type: "email",
        status: "sent",
        mailboxAccountId: values.mailboxAccountId || undefined,
        fromAddress: values.direction === "outbound"
          ? (selectedMailbox?.emailAddress || values.fromAddress)
          : values.fromAddress,
      };
      if (values.direction === "inbound") {
        payload.receivedAt = dateVal.toISOString();
      } else {
        payload.sentAt = dateVal.toISOString();
      }
      return apiRequest("POST", `/api/customers/${customerId}/communications`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "communications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "communications", "summary"] });
      toast({ title: t("emailTracking.submitLog") });
      onSuccess?.();
    },
    onError: () => {
      toast({ title: t("emailTracking.logError"), variant: "destructive" });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
        <FormField control={form.control} name="direction" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("emailTracking.fieldDirection")}</FormLabel>
            <FormControl>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="outbound" id="log-dir-outbound" data-testid="radio-direction-outbound" />
                  <label htmlFor="log-dir-outbound" className="text-sm cursor-pointer">{t("emailTracking.directionOutbound")}</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="inbound" id="log-dir-inbound" data-testid="radio-direction-inbound" />
                  <label htmlFor="log-dir-inbound" className="text-sm cursor-pointer">{t("emailTracking.directionInbound")}</label>
                </div>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="mailboxAccountId" render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t("emailTracking.selectMailbox")}{" "}
                {direction === "outbound" ? t("emailTracking.mailboxRequired") : t("emailTracking.mailboxOptional")}
              </FormLabel>
              <Select value={field.value ?? "__none__"} onValueChange={v => field.onChange(v === "__none__" ? undefined : v)}>
                <FormControl>
                  <SelectTrigger data-testid="select-mailbox-account">
                    <SelectValue placeholder={t("emailTracking.selectMailbox")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {direction === "inbound" && <SelectItem value="__none__">{t("emailTracking.noOwner")}</SelectItem>}
                  {activeMailboxes.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.displayName} ({m.emailAddress})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="dateTime" render={({ field }) => (
            <FormItem>
              <FormLabel>{direction === "inbound" ? t("emailTracking.receivedLabel") : t("emailTracking.fieldSentAt")}</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} data-testid="input-comm-datetime" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {direction === "inbound" && (
          <FormField control={form.control} name="fromAddress" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("emailTracking.fromLabel")}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t("emailTracking.fromAddressPlaceholder")} data-testid="input-from-address" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <FormField control={form.control} name="toAddresses" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("emailTracking.toAddresses")}</FormLabel>
            <FormControl>
              <AddressChipsInput
                value={field.value}
                onChange={field.onChange}
                placeholder={t("emailTracking.emailPlaceholder")}
                testId="input-to-addresses"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowCc(!showCc)}
            className="text-xs text-muted-foreground px-0"
            data-testid="button-toggle-cc"
          >
            {showCc ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            {showCc ? t("emailTracking.hideCC") : t("emailTracking.addCC")}
          </Button>
          {showCc && (
            <FormField control={form.control} name="ccAddresses" render={({ field }) => (
              <FormItem className="mt-2">
                <FormLabel>{t("emailTracking.ccAddresses")}</FormLabel>
                <FormControl>
                  <AddressChipsInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t("emailTracking.emailPlaceholder")}
                    testId="input-cc-addresses"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          )}
        </div>

        <FormField control={form.control} name="subject" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("emailTracking.subjectLabel")}</FormLabel>
            <FormControl>
              <Input {...field} placeholder={t("emailTracking.subjectPlaceholder")} data-testid="input-comm-subject" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="bodyText" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("emailTracking.bodyLabel")}</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder={t("emailTracking.bodyPlaceholder")} rows={5} data-testid="input-comm-body" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} data-testid="button-log-cancel">
              {t("common.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={mutation.isPending} data-testid="button-log-submit">
            {mutation.isPending ? t("common.saving") : t("emailTracking.submitLog")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
