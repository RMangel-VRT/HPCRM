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
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  LogOut,
  Shield,
  DollarSign,
  Wrench,
  ClipboardList,
  UserCheck,
  Map,
  CalendarDays,
  HelpCircle,
  Mail,
  Phone,
  MessageSquare,
  FileText,
  FileBarChart,
  MapPin,
  Leaf,
  MessagesSquare,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import RoleBadge from "./RoleBadge";
import ThemeToggle from "./ThemeToggle";
import { Link, useLocation } from "wouter";
import logoImage from "@assets/LOGO_-_SPREAD-06_1773353516653.png";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  resolveCustomersRouteAsync,
  resolveCustomersRouteSync,
} from "@/lib/last-viewed-customer";

const CUSTOMERS_LIST_PATH = "/dashboard/customers";

interface AppSidebarProps {
  userRole?: "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor";
  isSuperAdmin?: boolean;
  userName?: string;
  onLogout?: () => void;
  isCustomerDetail?: boolean;
}

export default function AppSidebar({
  userRole = "admin",
  isSuperAdmin = false,
  userName = "John Doe",
  onLogout,
  isCustomerDetail = false,
}: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const { state: sidebarState } = useSidebar();
  const sidebarExpanded = sidebarState === "expanded";

  const canSeeRegularCustomers =
    !isSuperAdmin &&
    (userRole === "admin" || userRole === "office" || userRole === "field_manager");

  // Prefetch the customers list so the sync resolver can use the cache for
  // the link's href. We don't read the data here; it just warms the cache.
  useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: canSeeRegularCustomers,
  });

  const customersHref = canSeeRegularCustomers
    ? resolveCustomersRouteSync(queryClient)
    : CUSTOMERS_LIST_PATH;

  const handleCustomersClick = async (
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {
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

  const superAdminItems = isSuperAdmin
    ? [
        { title: t("nav.adminHome"), url: "/admin", icon: Shield },
      ]
    : [];

  type NavItem = { title: string; url: string; icon: typeof LayoutDashboard };

  const getDashboardItems = (): NavItem[] => {
    if (isSuperAdmin) return [];
    const items: NavItem[] = [];

    if (userRole === "landscape_supervisor") {
      items.push({ title: "My Work", url: "/dashboard/tickets/my", icon: UserCheck });
      return items;
    }

    if (userRole === "shop_manager") {
      items.push({ title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard });
      items.push({ title: t("nav.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck });
      return items;
    }

    if (userRole === "mapping") return [];

    if (userRole === "admin" || userRole === "office" || userRole === "field_manager" || userRole === "chemical_manager") {
      items.push({ title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard });
    }

    if (userRole === "admin") {
      items.push({ title: t("nav.tickets"), url: "/dashboard/tickets", icon: ClipboardList });
    }

    items.push({ title: t("nav.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck });

    return items;
  };

  const getCrmItems = (): NavItem[] => {
    if (isSuperAdmin) return [];
    const items: NavItem[] = [];

    if (userRole === "landscape_supervisor") {
      items.push({ title: t("nav.propertyMaps"), url: "/dashboard/maps", icon: Map });
      items.push({ title: t("nav.routeMap"), url: "/dashboard/customers/map", icon: MapPin });
      return items;
    }

    if (userRole === "shop_manager") return [];

    if (userRole === "mapping") {
      items.push({ title: t("nav.customerMaps"), url: "/dashboard/maps", icon: Map });
      return items;
    }

    if (userRole === "admin" || userRole === "office" || userRole === "field_manager") {
      items.push({ title: t("nav.customers"), url: "/dashboard/customers", icon: Building2 });
    }

    if (userRole === "chemical_manager") {
      items.push({ title: t("nav.customers"), url: "/dashboard/field-customers", icon: Building2 });
    }

    if (userRole === "admin" || userRole === "office") {
      items.push({ title: t("nav.contracts"), url: "/dashboard/contracts", icon: FileText });
    }

    if (userRole === "irrigation_manager") {
      items.push({ title: t("nav.propertyMaps"), url: "/dashboard/maps", icon: Map });
    }

    if (userRole === "irrigation_manager") {
      items.push({ title: t("nav.schedule"), url: "/dashboard/schedule", icon: CalendarDays });
    }

    if (userRole === "admin" || userRole === "office") {
      items.push({ title: t("nav.revenue"), url: "/dashboard/revenue", icon: DollarSign });
    }

    return items;
  };

  const getManagementItems = (): NavItem[] => {
    if (isSuperAdmin) return [];
    const items: NavItem[] = [];

    if (userRole === "admin" || userRole === "office") {
      items.push({ title: "Seasons", url: "/dashboard/seasons", icon: Leaf });
    }

    if (userRole === "admin" || userRole === "office") {
      items.push({ title: t("nav.tools"), url: "/dashboard/tools", icon: Wrench });
    }

    if (userRole === "admin" || userRole === "office") {
      items.push({ title: t("emailTracking.communicationsTitle"), url: "/dashboard/communications", icon: MessagesSquare });
      items.push({ title: t("nav.inbox"), url: "/dashboard/communications/unsorted", icon: Mail });
    }

    if (userRole === "admin" || userRole === "office" || userRole === "field_manager" || userRole === "chemical_manager") {
      items.push({ title: t("nav.operations"), url: "/dashboard/operations", icon: Activity });
    }

    if (userRole === "admin" || userRole === "office") {
      items.push({ title: t("nav.reports"), url: "/dashboard/reports", icon: FileBarChart });
    }

    return items;
  };

  const dashboardItems = getDashboardItems();
  const crmItems = getCrmItems();
  const managementItems = getManagementItems();

  const getAdminItems = (): NavItem[] => {
    if (isSuperAdmin) return [];
    const items: NavItem[] = [];
    if (userRole === "admin" || userRole === "office") {
      items.push({ title: t("nav.settings"), url: "/dashboard/settings", icon: Settings });
    }
    if (userRole === "admin") {
      items.push({ title: t("nav.mailboxAccounts"), url: "/dashboard/settings/mailbox-accounts", icon: Mail });
    }
    if (userRole === "admin") {
      items.push({ title: t("nav.team"), url: "/dashboard/users", icon: Users });
    }
    return items;
  };

  const adminItems = getAdminItems();

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    return location === url || location.startsWith(url + "/");
  };

  return (
    <Sidebar
      variant="floating"
      data-testid="app-sidebar"
      className={
        isCustomerDetail && sidebarExpanded
          ? "md:pr-0 [&_[data-slot=sidebar-inner]]:rounded-r-none [&_[data-slot=sidebar-inner]]:border-r-0 [&_[data-slot=sidebar-inner]]:shadow-none"
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

      <SidebarContent>
        {superAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.platformAdmin")}</SidebarGroupLabel>
            <SidebarMenu>
              {superAdminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {dashboardItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.dashboard")}</SidebarGroupLabel>
            <SidebarMenu>
              {dashboardItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {crmItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("sidebar.highPlainsCRM")}</SidebarGroupLabel>
            <SidebarMenu>
              {crmItems.map((item) => {
                const isCustomers = item.url === CUSTOMERS_LIST_PATH;
                const isCustomersAnchor = isCustomerDetail && isCustomers;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      className={
                        isCustomersAnchor
                          ? "relative data-[active=true]:after:absolute data-[active=true]:after:right-0 data-[active=true]:after:top-0 data-[active=true]:after:bottom-0 data-[active=true]:after:w-[3px] data-[active=true]:after:bg-sidebar-primary"
                          : undefined
                      }
                    >
                      <Link
                        href={isCustomers ? customersHref : item.url}
                        onClick={isCustomers ? handleCustomersClick : undefined}
                        data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {managementItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.management")}</SidebarGroupLabel>
            <SidebarMenu>
              {managementItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("roles.admin")}</SidebarGroupLabel>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9">
            <AvatarFallback className="text-xs">
              {userName.split(" ").map((n) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <RoleBadge role={userRole} isSuperAdmin={isSuperAdmin} />
          </div>
        </div>
        <SidebarMenuButton
          onClick={onLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>{t("nav.logOut")}</span>
        </SidebarMenuButton>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-sidebar-border">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-help">
                <HelpCircle className="w-4 h-4" />
              </Button>
            </DialogTrigger>
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              data-testid="button-language-toggle"
              className="gap-1 px-2 text-xs font-medium"
            >
              <span className={i18n.language === "en" ? "font-bold" : "text-sidebar-foreground/50"}>EN</span>
              <span className="text-sidebar-foreground/50">/</span>
              <span className={i18n.language === "es" ? "font-bold" : "text-sidebar-foreground/50"}>ES</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
