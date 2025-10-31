import StatusBadge from "../StatusBadge";

export default function StatusBadgeExample() {
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <StatusBadge status="active" />
      <StatusBadge status="inactive" />
      <StatusBadge status="prospect" />
      <StatusBadge status="paused" />
      <StatusBadge status="ended" />
      <StatusBadge status="open" />
      <StatusBadge status="in_progress" />
      <StatusBadge status="waiting" />
      <StatusBadge status="closed" />
    </div>
  );
}
