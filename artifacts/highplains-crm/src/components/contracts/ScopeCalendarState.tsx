import { useTranslation } from "react-i18next";
export function ScopeCalendarState({ loading, error, empty, retry }: {
  loading: boolean; error: boolean; empty: boolean; retry: () => void;
}) {
  const { t } = useTranslation();
  if (error) return <div role="alert" className="text-sm text-destructive">
    {t("sc22.calendarError")} <button type="button" onClick={retry} className="underline">{t("sc22.retry")}</button>
  </div>;
  if (loading) return <p role="status" className="text-sm text-muted-foreground">{t("sc22.calendarLoading")}</p>;
  if (empty) return <p role="status" className="text-sm text-muted-foreground">{t("sc22.calendarEmpty")}</p>;
  return null;
}
