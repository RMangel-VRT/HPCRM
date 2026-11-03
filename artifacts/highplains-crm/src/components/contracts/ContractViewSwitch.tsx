import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export function ContractViewSwitch({ active }: { active: "contracts" | "customers" }) {
  const { t } = useTranslation();
  const cls = (on: boolean) => `rounded px-3 py-1 text-sm font-medium transition-colors ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <nav className="inline-flex rounded-md border p-0.5" aria-label={t("activeCustomers.views")}>
      <Link href="/dashboard/contracts" className={cls(active === "contracts")} aria-current={active === "contracts" ? "page" : undefined} data-testid="link-contracts-view">{t("activeCustomers.contractsView")}</Link>
      <Link href="/dashboard/contracts/customers" className={cls(active === "customers")} aria-current={active === "customers" ? "page" : undefined} data-testid="link-active-customers-view">{t("activeCustomers.title")}</Link>
    </nav>
  );
}
