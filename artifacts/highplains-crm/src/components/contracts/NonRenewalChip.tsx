import { useTranslation } from "react-i18next";

export function NonRenewalChip() {
  const { t } = useTranslation();
  return <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    data-testid="chip-not-renewing">{t("nonRenewal.notRenewing")}</span>;
}
