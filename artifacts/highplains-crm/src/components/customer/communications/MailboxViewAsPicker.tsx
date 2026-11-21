import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

const all = "__all__";

export default function MailboxViewAsPicker({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const canChoose = user?.accessRole === "admin" || user?.accessRole === "office" || user?.isSuperAdminBool;
  const { data: mailboxes = [] } = useQuery<{ id: string; displayName: string }[]>({
    queryKey: ["/api/mailbox-accounts"],
    enabled: Boolean(canChoose),
  });
  if (!canChoose || !mailboxes.length) return null;

  return <Select value={value || all} onValueChange={id => onChange(id === all ? "" : id)}>
    <SelectTrigger className="w-44" data-testid="select-view-as">
      <SelectValue placeholder={t("sharedMailbox.all")} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={all}>{t("sharedMailbox.all")}</SelectItem>
      {mailboxes.map(box => <SelectItem key={box.id} value={box.id} data-testid={`view-as-mailbox-${box.id}`}>
        {box.displayName}
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
