import { useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ClipboardList,
  Map,
  MapPin,
  LogOut,
  UserCheck,
  ClipboardCheck,
  Wrench,
  CalendarDays,
  Home,
  HelpCircle,
  Mail,
  Phone,
  MessageSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import logoImage from "@assets/LOGO_-_SPREAD-06_1773353516653.png";
import ThemeToggle from "./ThemeToggle";
import NotificationsDropdown from "./NotificationsDropdown";
import RoleBadge from "./RoleBadge";
import { ProtectedRoute } from "@/lib/protected-route";

import FieldCrewDashboard from "@/pages/FieldCrewDashboard";
import ShopManagerDashboard from "@/pages/ShopManagerDashboard";
import MyTickets from "@/pages/MyTickets";
import TicketDetail from "@/pages/TicketDetail";
import PropertyMapsPage from "@/pages/PropertyMapsPage";
import CustomerRouteMap from "@/pages/CustomerRouteMap";
import CustomersList from "@/pages/CustomersList";
import CustomerDetail from "@/pages/CustomerDetail";
import CampaignsList from "@/pages/CampaignsList";
import CampaignDetail from "@/pages/CampaignDetail";
import CampaignItemDetail from "@/pages/CampaignItemDetail";
import SchedulePage from "@/pages/SchedulePage";
import EquipmentList from "@/pages/EquipmentList";
import EquipmentDetail from "@/pages/EquipmentDetail";
import EquipmentTicketDetail from "@/pages/EquipmentTicketDetail";
import NewEquipment from "@/pages/NewEquipment";
import SnowEventDetail from "@/pages/SnowEventDetail";
import NotificationsPage from "@/pages/NotificationsPage";
import AccessDenied from "@/pages/AccessDenied";

import type { UserWithCompanyContext } from "@/hooks/use-auth";

interface FieldLayoutProps {
  user: UserWithCompanyContext;
  onLogout: () => void;
}

type FieldRole =
  | "field_manager"
  | "chemical_manager"
  | "field"
  | "irrigation_manager"
  | "shop_manager"
  | "landscape_supervisor";

interface NavItem {
  title: string;
  url: string;
  icon: typeof ClipboardList;
}

function getNavItems(role: FieldRole, t: (key: string) => string): NavItem[] {
  const items: NavItem[] = [];

  if (
    role === "field_manager" ||
    role === "chemical_manager" ||
    role === "field" ||
    role === "irrigation_manager" ||
    role === "landscape_supervisor"
  ) {
    items.push({ title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck });
  }

  if (role === "shop_manager") {
    items.push({ title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck });
    items.push({ title: t("fieldLayout.equipment"), url: "/dashboard/equipment", icon: Wrench });
  }

  if (
    role === "field_manager" ||
    role === "chemical_manager" ||
    role === "field" ||
    role === "irrigation_manager" ||
    role === "landscape_supervisor"
  ) {
    items.push({ title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map });
  }

  if (
    role === "field_manager" ||
    role === "chemical_manager" ||
    role === "field" ||
    role === "landscape_supervisor"
  ) {
    items.push({ title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck });
  }

  if (role === "irrigation_manager") {
    items.push({ title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck });
    items.push({ title: t("fieldLayout.schedule"), url: "/dashboard/schedule", icon: CalendarDays });
  }

  if (
    role === "field_manager" ||
    role === "chemical_manager" ||
    role === "landscape_supervisor"
  ) {
    items.push({ title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin });
  }

  return items;
}

export default function FieldLayout({ user, onLogout }: FieldLayoutProps) {
  const { t, i18n } = useTranslation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [location, navigate] = useLocation();

  const role = user.activeRole as FieldRole;
  const navItems = getNavItems(role, t);

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

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    return location === url || location.startsWith(url + "/");
  };

  const showHomeButton = location !== "/dashboard" && location !== "/dashboard/tickets/my";

  const homeUrl =
    role === "shop_manager" ? "/dashboard" : "/dashboard/tickets/my";

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <header className="flex items-center justify-between px-3 py-2 border-b bg-background z-50 sticky top-0">
        <div className="flex items-center gap-2">
          {showHomeButton ? (
            <Link href={homeUrl}>
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-home"
                aria-label={t("fieldLayout.home")}
              >
                <Home className="w-5 h-5" />
              </Button>
            </Link>
          ) : (
            <Link href={homeUrl}>
              <img
                src={logoImage}
                alt="High Plains Logo"
                className="h-8 w-8 object-cover rounded-full cursor-pointer"
                data-testid="img-logo-home"
              />
            </Link>
          )}
          <span className="font-semibold text-sm hidden sm:inline">
            {t("sidebar.highPlains")}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <NotificationsDropdown />
          <ThemeToggle />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAccountOpen(true)}
            data-testid="button-account-panel"
            aria-label={t("fieldLayout.account")}
          >
            <Avatar className="w-7 h-7">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {user.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4 pb-0 max-w-2xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {navItems.map((item) => (
              <Link key={item.url} href={item.url}>
                <Button
                  variant={isActive(item.url) ? "default" : "outline"}
                  className="w-full h-auto py-4 flex-col gap-2"
                  data-testid={`button-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-xs leading-tight text-center">{item.title}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>

        <div className="px-4 pb-6 max-w-2xl mx-auto">
          <Switch>
            <ProtectedRoute
              path="/dashboard"
              component={role === "shop_manager" ? ShopManagerDashboard : FieldCrewDashboard}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/tickets/my"
              component={MyTickets}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/tickets/:id"
              component={TicketDetail}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/maps"
              component={PropertyMapsPage}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/customers/map"
              component={CustomerRouteMap}
              allowedRoles={["field_manager", "chemical_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/customers/:id"
              component={CustomerDetail}
              allowedRoles={["field_manager", "chemical_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/customers"
              component={CustomersList}
              allowedRoles={["field_manager", "chemical_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/campaigns/:id/items/:itemId"
              component={CampaignItemDetail}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/campaigns/:id"
              component={CampaignDetail}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/campaigns"
              component={CampaignsList}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor"]}
            />
            <ProtectedRoute
              path="/dashboard/schedule"
              component={SchedulePage}
              allowedRoles={["irrigation_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/equipment/new"
              component={NewEquipment}
              allowedRoles={["shop_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/equipment/:id"
              component={EquipmentDetail}
              allowedRoles={["shop_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/equipment"
              component={EquipmentList}
              allowedRoles={["shop_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/equipment-tickets/:id"
              component={EquipmentTicketDetail}
              allowedRoles={["shop_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/snow/:id"
              component={SnowEventDetail}
              allowedRoles={["field_manager", "chemical_manager"]}
            />
            <ProtectedRoute
              path="/dashboard/notifications"
              component={NotificationsPage}
              allowedRoles={["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"]}
            />
            <Route path="/access-denied" component={AccessDenied} />
            <Route>
              {role === "shop_manager" ? (
                <Redirect to="/dashboard" />
              ) : (
                <Redirect to="/dashboard/tickets/my" />
              )}
            </Route>
          </Switch>
        </div>
      </main>

      <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
        <SheetContent side="right" className="w-80 sm:w-96">
          <SheetHeader className="pb-4">
            <SheetTitle>{t("fieldLayout.account")}</SheetTitle>
          </SheetHeader>

          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <Avatar className="w-14 h-14">
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {user.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate">{user.name}</p>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <div className="mt-1">
                  <RoleBadge role={user.activeRole} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                {t("fieldLayout.preferences")}
              </p>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">{t("fieldLayout.theme")}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">{t("fieldLayout.language")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleLanguage}
                  data-testid="button-language-toggle-account"
                  className="gap-1 px-2 text-xs font-medium"
                >
                  <span className={i18n.language === "en" ? "font-bold" : "text-muted-foreground"}>EN</span>
                  <span className="text-muted-foreground">/</span>
                  <span className={i18n.language === "es" ? "font-bold" : "text-muted-foreground"}>ES</span>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                {t("fieldLayout.support")}
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    data-testid="button-help-account"
                  >
                    <HelpCircle className="w-4 h-4" />
                    {t("sidebar.helpSupport")}
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
                          className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate"
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
                          className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate"
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
            </div>

            <div className="pt-2 border-t">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                onClick={() => {
                  setAccountOpen(false);
                  onLogout();
                }}
                data-testid="button-logout-account"
              >
                <LogOut className="w-4 h-4" />
                {t("nav.logOut")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
