import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface CompanyUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const MY_MAILBOXES_VALUE = "__mine__";
const ALL_MAILBOXES_VALUE = "__all__";

export default function MailboxViewAsPicker({ value, onChange }: Props) {
  const { user } = useAuth();
  const role = user?.activeRole;

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["/api/company-users"],
    enabled: role === "admin" || role === "office",
  });

  if (role !== "admin" && role !== "office") return null;

  const currentValue = !value ? ALL_MAILBOXES_VALUE : value;

  return (
    <Select
      value={currentValue}
      onValueChange={v => {
        if (v === ALL_MAILBOXES_VALUE) onChange("");
        else if (v === MY_MAILBOXES_VALUE) onChange(user?.id ?? "");
        else onChange(v);
      }}
    >
      <SelectTrigger className="w-44" data-testid="select-view-as">
        <SelectValue placeholder="All mailboxes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_MAILBOXES_VALUE}>All mailboxes</SelectItem>
        <SelectItem value={MY_MAILBOXES_VALUE} data-testid="view-as-my-mailboxes">My mailboxes</SelectItem>
        {companyUsers.map(u => (
          <SelectItem key={u.id} value={u.id} data-testid={`view-as-user-${u.id}`}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
