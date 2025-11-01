import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Role = "admin" | "office" | "ops" | "viewer";

interface RoleBadgeProps {
  role: Role;
  isSuperAdmin?: boolean;
  className?: string;
}

const roleConfig: Record<Role, { label: string; className: string }> = {
  admin: {
    label: "Admin",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  office: {
    label: "Office",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  ops: {
    label: "Operations",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  viewer: {
    label: "Viewer",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400",
  },
};

const superAdminConfig = {
  label: "Super Admin",
  className: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function RoleBadge({ role, isSuperAdmin = false, className }: RoleBadgeProps) {
  const config = isSuperAdmin ? superAdminConfig : roleConfig[role];
  const testId = isSuperAdmin ? "role-badge-super-admin" : `role-badge-${role}`;
  
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-medium",
        config.className,
        className
      )}
      data-testid={testId}
    >
      {config.label}
    </Badge>
  );
}
