import EmptyState from "../EmptyState";
import { Users } from "lucide-react";

export default function EmptyStateExample() {
  return (
    <EmptyState
      icon={Users}
      title="No customers yet"
      description="Get started by adding your first customer to the system."
      actionLabel="Add Customer"
      onAction={() => console.log("Add customer clicked")}
    />
  );
}
