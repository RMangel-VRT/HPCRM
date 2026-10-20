import { guardLinkClick } from "@/lib/unsavedGuard";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { LogOut, HelpCircle, Mail, Phone, MessageSquare, Bell, Languages, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import RoleBadge from "./RoleBadge";
import ThemeToggle from "./ThemeToggle";
import { Link, useLocation } from "wouter";
import logoImage from "@assets/LOGO_-_SPREAD-06_1773353516653.png";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSchedulingQueue } from "@/hooks/use-scheduling";
import { Badge } from "@/components/ui/badge";
import type { Customer } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { pendingInvoicesKey, showBillingSidebar, type PendingInvoice } from "@/lib/billing";
import { resolveCustomersRouteAsync, resolveCustomersRouteSync } from "@/lib/last-viewed-customer";
import { getLastCommsTab, isValidCommsTab, type CommsTab } from "@/lib/last-comms-tab";
import { useEffect, useMemo, useState } from "react";
import { getNavForUser, navItemIsActive, type NavUser } from "@/components/nav/navConfig";

const CUSTOMERS_LIST_PATH = "/dashboard/customers";
// Mirrors the notifications route allowedRoles in App.tsx (crew_supervisor and mapping excluded).
const NOTIFICATION_ROLES = ["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"];

interface AppSidebarProps {
  userRole?: "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor" | "crew_supervisor";
  isSuperAdmin?: boolean;
  userName?: string;
  onLogout?: () => void;
  isCustomerDetail?: boolean;
  activeTags?: string[];
  companyId?: string | null;
  userId?: string | null;
}

export default function AppSidebar({
  userRole = "admin",
  isSuperAdmin = false,
  userName = "John Doe",
  onLogout,
  isCustomerDetail = false,
  activeTags = [],
  companyId = null,
  userId = null,
}: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const { state: sidebarState } = useSidebar();
  const sidebarExpanded = sidebarState === "expanded";
  const [helpOpen, setHelpOpen] = useState(false);

  const canSeeRegularCustomers =
    !isSuperAdmin && (userRole === "admin" || userRole === "office" || userRole === "field_manager");

  useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers?page=1&limit=200"],
    enabled: canSeeRegularCustomers,
  });

  const customersHref = canSeeRegularCustomers ? resolveCustomersRouteSync(queryClient) : CUSTOMERS_LIST_PATH;

  const handleCustomersClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const target = await resolveCustomersRouteAsync(queryClient);
    navigate(target);
  };

  const toggleLanguage = async () => {
    const newLang = i18n.language === "es" ? "en" : "es";
    try {
      await apiRequest("PATCH", "/api/auth/language", { language: newLang });
      i18n.changeLanguage(newLang);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (e) {
      console.error("Failed to update language", e);
    }
  };

  const showBillingEntry = showBillingSidebar({ activeRole: userRole, activeTags });
  const { data: billingBadgeRows } = useQuery<PendingInvoice[]>({
    queryKey: pendingInvoicesKey(companyId, userId, "all", "waiting"),
    queryFn: async () => (await apiRequest("GET", "/api/pending-invoices?scope=all&view=waiting")).json(),
    enabled: showBillingEntry,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const billingBadgeCount = Array.isArray(billingBadgeRows) ? billingBadgeRows.length : 0;

  const canSchedule = !isSuperAdmin && (userRole === "admin" || userRole === "office" || userRole === "field_manager");
  const { data: schedulingQueue } = useSchedulingQueue(companyId, canSchedule, { badge: true });
  const schedulingBadgeCount = schedulingQueue ? schedulingQueue.needsScheduling.length + schedulingQueue.slipped.length : 0;

  const [lastCommsTab, setLastCommsTabState] = useState<CommsTab>(() => getLastCommsTab());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (isValidCommsTab(detail)) setLastCommsTabState(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "communications:lastTab" && isValidCommsTab(e.newValue)) setLastCommsTabState(e.newValue);
    };
    window.addEventListener("communications:lastTab-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("communications:lastTab-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const navUser: NavUser = useMemo(
    () => ({ activeRole: userRole, activeTags, isSuperAdminBool: isSuperAdmin, lastCommsTab }),
    [userRole, activeTags, isSuperAdmin, lastCommsTab],
  );
  const groups = getNavForUser(navUser);

  const isAdminOrOffice = userRole === "admin" || userRole === "office";

  const { data: flagUnreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/flags/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/flags/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: isAdminOrOffice,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  const flagUnreadCount = flagUnreadData?.count ?? 0;

  const { data: pendingUnsortedData } = useQuery<{ length: number } | unknown[]>({
    queryKey: ["/api/unsorted-emails", "sidebar-badge"],
    queryFn: async () => {
      const res = await fetch("/api/unsorted-emails?status=pending&limit=100", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdminOrOffice,
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
  const pendingUnsortedCount = Array.isArray(pendingUnsortedData) ? pendingUnsortedData.length : 0;

  const badgeNode = (kind: string | undefined) => {
    const cap = (n: number) => (n > 99 ? "99+" : n);
    const cls = "ml-auto text-xs py-0 px-1.5 min-w-0 no-default-active-elevate";
    if (kind === "scheduling" && schedulingBadgeCount > 0)
      return <Badge className={cls} data-testid="badge-scheduling-sidebar">{cap(schedulingBadgeCount)}</Badge>;
    if (kind === "billing" && billingBadgeCount > 0)
      return <Badge className={cls} data-testid="badge-billing-sidebar">{cap(billingBadgeCount)}</Badge>;
    if (kind === "unsorted" && pendingUnsortedCount > 0)
      return <Badge className={cls} data-testid="badge-pending-unsorted-sidebar">{cap(pendingUnsortedCount)}</Badge>;
    if (kind === "flags" && flagUnreadCount > 0)
      return <Badge variant="destructive" className={cls} data-testid="badge-flags-unread-sidebar">{cap(flagUnreadCount)}</Badge>;
    return null;
  };

  const canSeeNotifications = isSuperAdmin || NOTIFICATION_ROLES.includes(userRole);

  return (
    <Sidebar
      variant="floating"
      data-testid="app-sidebar"
      className={
        isCustomerDetail && sidebarExpanded
          ? "md:pr-0 [&_[data-slot=sidebar-inner]]:rounded-r-none [&_[data-slot=sidebar-inner]]:shadow-none"
          : undefined
      }
    >
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="High Plains Logo" className="h-12 w-12 object-cover rounded-full" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("sidebar.highPlains")}</h2>
            <p className="text-xs text-sidebar-foreground/60">{t("sidebar.propertyMaintenance")}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent onClickCapture={guardLinkClick as never}>
        {groups.map((group) => (
          <SidebarGroup key={group.key} className={group.key === "footer" ? "mt-auto" : undefined}>
            {group.labelKey && <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const isCustomers = item.key === "customers" && item.href === CUSTOMERS_LIST_PATH;
                const isCustomersAnchor = isCustomerDetail && isCustomers;
                const label = t(item.labelKey);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={navItemIsActive(item, location)}
                      className={
                        isCustomersAnchor
                          ? "relative data-[active=true]:after:absolute data-[active=true]:after:right-0 data-[active=true]:after:top-0 data-[active=true]:after:bottom-0 data-[active=true]:after:w-[3px] data-[active=true]:after:bg-sidebar-primary"
                          : undefined
                      }
                    >
                      <Link
                        href={isCustomers ? customersHref : item.href}
                        onClick={isCustomers ? handleCustomersClick : undefined}
                        data-testid={`nav-${item.key}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{label}</span>
                        {badgeNode(item.badge)}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="h-auto py-2" data-testid="button-profile-menu">
              <Avatar className="w-9 h-9">
                <AvatarFallback className="text-xs">
                  {userName.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{userName}</p>
                <RoleBadge role={userRole} isSuperAdmin={isSuperAdmin} />
              </div>
              <ChevronsUpDown className="w-4 h-4 opacity-60 shrink-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64" onClickCapture={guardLinkClick as never}>
            <DropdownMenuItem asChild data-testid="menu-profile-mailbox">
              <Link href="/dashboard/settings/my-mailbox" className="cursor-pointer">
                <Mail className="w-4 h-4 mr-2" />
                {t("profile.myMailbox")}
              </Link>
            </DropdownMenuItem>
            {canSeeNotifications && (
              <DropdownMenuItem asChild data-testid="menu-profile-notifications">
                <Link href="/dashboard/notifications" className="cursor-pointer">
                  <Bell className="w-4 h-4 mr-2" />
                  {t("profile.notifications")}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); toggleLanguage(); }}
              data-testid="button-language-toggle"
              className="cursor-pointer justify-between"
            >
              <span className="flex items-center"><Languages className="w-4 h-4 mr-2" />{t("profile.language")}</span>
              <span className="text-xs font-medium">
                <span className={i18n.language === "en" ? "font-bold" : "text-muted-foreground"}>EN</span>
                <span className="text-muted-foreground"> / </span>
                <span className={i18n.language === "es" ? "font-bold" : "text-muted-foreground"}>ES</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between" data-testid="menu-profile-theme">
              <span>{t("profile.theme")}</span>
              <ThemeToggle />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setHelpOpen(true)} className="cursor-pointer" data-testid="button-help">
              <HelpCircle className="w-4 h-4 mr-2" />
              {t("profile.help")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onLogout?.()} className="cursor-pointer" data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              {t("profile.logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sidebar.helpSupport")}</DialogTitle>
            <DialogDescription>
              {t("sidebar.helpDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t("sidebar.contactSupport")}</h4>
              <div className="space-y-2">
                <a
                  href="mailto:support@highplainsprop.com"
                  className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate transition-colors"
                  data-testid="link-support-email"
                >
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t("sidebar.emailSupport")}</p>
                    <p className="text-xs text-muted-foreground">support@highplainsprop.com</p>
                  </div>
                </a>
                <a
                  href="tel:+18005551234"
                  className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate transition-colors"
                  data-testid="link-support-phone"
                >
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t("sidebar.phoneSupport")}</p>
                    <p className="text-xs text-muted-foreground">1-800-555-1234</p>
                  </div>
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t("sidebar.quickTips")}</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{t("sidebar.tipSearch")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{t("sidebar.tipTickets")}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{t("sidebar.tipNotifications")}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
        </Dialog>
      </SidebarFooter>
    </Sidebar>
  );
}
