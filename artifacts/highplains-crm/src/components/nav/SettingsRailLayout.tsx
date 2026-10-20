import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { SectionRail, SectionRailLayout } from "./SectionRail";
import { settingsRailFor } from "./settingsNav";

export function SettingsRailLayout({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  return (
    <SectionRailLayout rail={
      <SectionRail title={t("settings.title")} ariaLabel={t("settings.rail.ariaLabel")}
        sections={settingsRailFor(user)} activeKey={activeKey} />
    }>
      {children}
    </SectionRailLayout>
  );
}
