import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import BillingView from "@/components/BillingView";
import QboReviewLink from "@/components/qbo/QboReviewLink";

export default function BillingPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <div className="space-y-4" data-testid="page-billing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" data-testid="text-billing-title">{t("nav.invoicing")}</h1>
        <QboReviewLink key={`${user.activeCompanyId}:${user.id}`} />
      </div>
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
