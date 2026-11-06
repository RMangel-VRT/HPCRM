import { Fragment, useRef, useCallback, useContext, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { SidebarContext } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CUSTOMER_PAGES, GROUP_LABEL_KEYS, type CustomerPageGroup, type CustomerPageKey,
} from "./customerPages";

export interface CustomerPageBadge { count: number; warning?: boolean }

interface CustomerSubNavProps {
  pages: CustomerPageKey[];
  activeTab: string;
  onTabChange: (tab: CustomerPageKey) => void;
  badges?: Partial<Record<CustomerPageKey, CustomerPageBadge>>;
}

const GROUP_ORDER: CustomerPageGroup[] = ["main", "work", "money"];

function badgeClass(warning?: boolean) {
  return warning
    ? "bg-[hsl(var(--est-warn-bg))] text-[hsl(var(--est-warn))]"
    : "bg-rail-hover text-rail-foreground";
}

function useSections(pages: CustomerPageKey[]) {
  return GROUP_ORDER.map(group => ({
    group,
    items: pages.filter(key => CUSTOMER_PAGES[key].group === group),
  })).filter(s => s.items.length > 0);
}

/** Desktop section rail (light green). Hidden below ~900px where CustomerPageChips take over. */
export function CustomerSubNav({ pages, activeTab, onTabChange, badges = {} }: CustomerSubNavProps) {
  const { t } = useTranslation();
  const navRef = useRef<HTMLElement>(null);
  const sidebarCtx = useContext(SidebarContext);
  const isCollapsed = sidebarCtx?.state === "collapsed";
  const [isMounted, setIsMounted] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const sections = useSections(pages);

  useEffect(() => {
    if (prefersReducedMotion) { setIsMounted(true); return; }
    const frame = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = navRef.current ? Array.from(navRef.current.querySelectorAll<HTMLButtonElement>("[data-nav-item]")) : [];
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown"
      ? (current < buttons.length - 1 ? current + 1 : 0)
      : (current > 0 ? current - 1 : buttons.length - 1);
    buttons[next].focus();
    buttons[next].click();
  }, []);

  return (
    <div
      className={`flex-shrink-0 bg-rail text-rail-foreground border border-rail-border flex-col overflow-hidden hidden min-[901px]:flex ${
        isCollapsed ? "rounded-lg border-l" : "border-l-0 rounded-r-lg"
      }`}
      style={{
        width: isCollapsed ? "3rem" : (isMounted ? 200 : 0),
        opacity: isMounted ? 1 : 0,
        transition: prefersReducedMotion ? undefined : "width 220ms ease-out, opacity 180ms ease-out, border-radius 200ms",
      }}
      data-testid="customer-sub-nav"
    >
      <nav ref={navRef} className="flex-1 overflow-y-auto py-2" aria-label={t("customerPages.railLabel")} onKeyDown={handleNavKeyDown}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-0.5 px-1">
            {sections.map((section, i) => (
              <Fragment key={section.group}>
                {i > 0 && <div aria-hidden="true" className="h-px self-stretch bg-rail-border my-1" data-testid="customer-group-divider" />}
                {section.items.map(key => {
                  const page = CUSTOMER_PAGES[key];
                  const Icon = page.icon;
                  const label = t(page.labelKey);
                  const isActive = key === activeTab;
                  const badge = badges[key];
                  return (
                    <Tooltip key={key} delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`text-rail-foreground hover:bg-rail-hover hover:text-rail-active-foreground relative${isActive ? " bg-rail-active text-rail-active-foreground font-medium" : " font-normal"}`}
                          onClick={() => onTabChange(key)}
                          data-testid={`nav-item-${key}`}
                          data-nav-item
                          aria-current={isActive ? "page" : undefined}
                          aria-label={label}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          {badge && badge.count > 0 && (
                            <span className={`absolute top-0.5 right-0.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-semibold flex items-center justify-center px-0.5 ${badgeClass(badge.warning)}`}
                              data-testid={`badge-count-${key}`} data-warning={badge.warning ? "true" : undefined}>
                              {badge.count}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={4}>{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </Fragment>
            ))}
          </div>
        ) : (
          sections.map((section, i) => {
            const headingKey = GROUP_LABEL_KEYS[section.group];
            return (
              <div key={section.group} className={`pb-1.5 ${i > 0 ? "pt-3.5 border-t border-rail-border" : "pt-0.5"}`}
                role="group" aria-label={headingKey ? t(headingKey) : t("customerPages.groups.main")}>
                {headingKey && (
                  <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-rail-heading text-left" aria-hidden="true">
                    {t(headingKey)}
                  </p>
                )}
                {section.items.map(key => {
                  const page = CUSTOMER_PAGES[key];
                  const Icon = page.icon;
                  const isActive = key === activeTab;
                  const badge = badges[key];
                  return (
                    <Button
                      key={key}
                      variant="ghost"
                      className={`w-full justify-start text-left h-8 px-3 text-sm rounded-none text-rail-foreground hover:bg-rail-hover hover:text-rail-active-foreground${
                        isActive ? " bg-rail-active text-rail-active-foreground font-medium border-l-[3px] border-l-rail-active-icon pl-[calc(0.75rem-3px)]" : " font-normal"
                      }`}
                      onClick={() => onTabChange(key)}
                      data-testid={`nav-item-${key}`}
                      data-nav-item
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="w-3.5 h-3.5 mr-2 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate flex-1 text-left">{t(page.labelKey)}</span>
                      {badge && badge.count > 0 && (
                        <span className={`ml-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center px-1 flex-shrink-0 ${badgeClass(badge.warning)}`}
                          data-testid={`badge-count-${key}`} data-warning={badge.warning ? "true" : undefined}>
                          {badge.count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            );
          })
        )}
      </nav>
    </div>
  );
}

/** Below ~900px: the same permitted pages as a horizontal chip row. */
export function CustomerPageChips({ pages, activeTab, onTabChange, badges = {} }: CustomerSubNavProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("customerPages.railLabel")} className="min-[901px]:hidden -mx-1 overflow-x-auto" data-testid="customer-page-chips">
      <div className="flex gap-1.5 px-1 pb-1 w-max">
        {pages.map(key => {
          const page = CUSTOMER_PAGES[key];
          const Icon = page.icon;
          const isActive = key === activeTab;
          const badge = badges[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              aria-current={isActive ? "page" : undefined}
              data-testid={`chip-${key}`}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm whitespace-nowrap transition-colors ${
                isActive ? "bg-rail-active text-rail-active-foreground border-rail-active-icon font-medium" : "bg-rail text-rail-foreground border-rail-border hover:bg-rail-hover"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {t(page.labelKey)}
              {badge && badge.count > 0 && (
                <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center px-1 ${badgeClass(badge.warning)}`}>
                  {badge.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
