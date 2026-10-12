import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import BillingView from "@/components/BillingView";

export default function BillingPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <div className="space-y-4" data-testid="page-billing">
      <h1 className="text-2xl font-semibold" data-testid="text-billing-title">{t("nav.billing")}</h1>
      <BillingView
        key={`${user.activeCompanyId}:${user.id}`}
        scope="all"
        showAssignee
        role={user.activeRole}
        activeTags={user.activeTags}
        userId={user.id}
        companyId={user.activeCompanyId}
        users={new Map()}
      />
    </div>
  );
}
