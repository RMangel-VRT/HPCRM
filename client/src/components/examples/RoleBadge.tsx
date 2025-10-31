import RoleBadge from "../RoleBadge";

export default function RoleBadgeExample() {
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <RoleBadge role="admin" />
      <RoleBadge role="office" />
      <RoleBadge role="ops" />
      <RoleBadge role="viewer" />
    </div>
  );
}
