import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { SectionRail, SectionRailLayout } from "./SectionRail";
import { workPage, workViewsFor } from "./workNav";

/** Route-family shell; details are deliberately excluded by workPage. */
export function WorkPageLayout({ path, children }: { path: string; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const page = workPage(path);
  if (!page) return <>{children}</>;
  const items = workViewsFor(page.family, user?.activeRole).map(item => ({
    ...item, label: t(item.labelKey),
  }));
  const titleKey = { tickets: "nav.tickets", maps: "nav.maps", campaigns: "nav.campaigns", plants: "topbar.plantLibrary" }[page.family];
  const title = t(titleKey);
  return (
    <SectionRailLayout fullHeight={page.family === "maps"} rail={items.length > 1
      ? <SectionRail title={title} ariaLabel={title} activeKey={page.activeKey} sections={[{ items }]} />
      : null}>
      {children}
    </SectionRailLayout>
  );
}
