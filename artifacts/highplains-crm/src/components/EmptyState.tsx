import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  image?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon,
  image,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center" data-testid="empty-state">
      {Icon && (
        <Icon className="w-16 h-16 text-muted-foreground mb-4" data-testid="empty-state-icon" />
      )}
      {image && (
        <img
          src={image}
          alt={title}
          className="w-24 h-24 mb-4 opacity-50"
          data-testid="empty-state-image"
        />
      )}
      <h3 className="text-xl font-semibold mb-2" data-testid="empty-state-title">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6" data-testid="empty-state-description">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} data-testid="empty-state-action">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
