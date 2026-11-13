import { Link } from "wouter";
import { useTranslation } from "react-i18next";

/** noContract comes from the existing Active customers responsibility count; customers stay on that view. */
export function ContractViewSwitch({ active, noContract }: { active: "contracts" | "customers"; noContract?: number | null }) {
  const { t } = useTranslation();
  const cls = (on: boolean) => `inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <nav className="inline-flex rounded-md border p-0.5" aria-label={t("activeCustomers.views")}>
      <Link href="/dashboard/contracts" className={cls(active === "contracts")} aria-current={active === "contracts" ? "page" : undefined} data-testid="link-contracts-view">{t("activeCustomers.contractsView")}</Link>
      <Link href="/dashboard/contracts/customers" className={cls(active === "customers")} aria-current={active === "customers" ? "page" : undefined} data-testid="link-active-customers-view">
        {t("activeCustomers.title")}
        {!!noContract && noContract > 0 && <span data-testid="badge-no-contract" className="rounded-full border px-1.5 text-[11px] font-semibold text-foreground"
          style={{ backgroundColor: "color-mix(in srgb, var(--ts-waiting) 16%, transparent)", borderColor: "color-mix(in srgb, var(--ts-waiting) 40%, transparent)" }}>
          {t("contractAttention.noContractBadge", { count: noContract })}
        </span>}
      </Link>
    </nav>
  );
}
