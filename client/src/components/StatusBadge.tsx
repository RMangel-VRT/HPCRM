import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status =
  | "active"
  | "inactive"
  | "prospect"
  | "paused"
  | "ended"
  | "open"
  | "in_progress"
  | "waiting"
  | "closed";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  inactive: {
    label: "Inactive",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400",
  },
  prospect: {
    label: "Prospect",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  ended: {
    label: "Ended",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  open: {
    label: "Open",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  waiting: {
    label: "Waiting",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  closed: {
    label: "Closed",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400",
  },
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge
      variant="secondary"
      className={cn(
        "uppercase text-xs font-medium tracking-wide",
        config.className,
        className
      )}
      data-testid={`status-badge-${status}`}
    >
      {config.label}
    </Badge>
  );
}
