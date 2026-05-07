import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BreadcrumbsProvider } from "@/hooks/use-breadcrumbs";
import { ProtectedRoute } from "@/lib/protected-route";
import { AlertTriangle } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import "@/i18n";
import AppSidebar from "@/components/AppSidebar";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import FieldAppLayout from "@/components/FieldAppLayout";
import { LoadingScreen } from "@/components/LoadingScreen";
import AppBreadcrumb from "@/components/AppBreadcrumb";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";

const AccessDenied = lazy(() => import("@/pages/AccessDenied"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NotFound = lazy(() => import("@/pages/not-found"));
const SuperAdminHome = lazy(() => import("@/pages/SuperAdminHome"));

const CustomersList = lazy(() => import("@/pages/CustomersList"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const RevenueOverview = lazy(() => import("@/pages/RevenueOverview"));
const ToolsPage = lazy(() => import("@/pages/ToolsPage"));
const ContractBuilderPage = lazy(() => import("@/pages/ContractBuilderPage"));
const TicketsList = lazy(() => import("@/pages/TicketsList"));
const TicketDetail = lazy(() => import("@/pages/TicketDetail"));
const NewTicket = lazy(() => import("@/pages/NewTicket"));
const MyTickets = lazy(() => import("@/pages/MyTickets"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PropertyMapsPage = lazy(() => import("@/pages/PropertyMapsPage"));
const SchedulePage = lazy(() => import("@/pages/SchedulePage"));
const EquipmentList = lazy(() => import("@/pages/EquipmentList"));
const EquipmentDetail = lazy(() => import("@/pages/EquipmentDetail"));
const NewEquipment = lazy(() => import("@/pages/NewEquipment"));
const EquipmentTicketDetail = lazy(() => import("@/pages/EquipmentTicketDetail"));
const ContractsOverview = lazy(() => import("@/pages/ContractsOverview"));
const SnowEventsList = lazy(() => import("@/pages/SnowEventsList"));
const SnowEventDetail = lazy(() => import("@/pages/SnowEventDetail"));
const NewSnowEvent = lazy(() => import("@/pages/NewSnowEvent"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const ProposalMaker = lazy(() => import("@/pages/ProposalMaker"));
const ProposalDraft = lazy(() => import("@/pages/ProposalDraft"));
const ProposalVersion = lazy(() => import("@/pages/ProposalVersion"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const VisualScopeList = lazy(() => import("@/pages/VisualScopeList"));
const VisualScopeDraft = lazy(() => import("@/pages/VisualScopeDraft"));
const CustomerRouteMap = lazy(() => import("@/pages/CustomerRouteMap"));
const FieldCustomerList = lazy(() => import("@/pages/FieldCustomerList"));
const CampaignsList = lazy(() => import("@/pages/CampaignsList"));
const MyBatchesPage = lazy(() => import("@/pages/MyBatchesPage"));
const CampaignDetail = lazy(() => import("@/pages/CampaignDetail"));
const CampaignItemDetail = lazy(() => import("@/pages/CampaignItemDetail"));
const SeasonsPage = lazy(() => import("@/pages/SeasonsPage"));
const SeasonDetail = lazy(() => import("@/pages/SeasonDetail"));
const CommunicationsCenter = lazy(() => import("@/pages/CommunicationsCenter"));
const GlobalOperationsPage = lazy(() => import("@/pages/GlobalOperationsPage"));
const PropertyDetail = lazy(() => import("@/pages/PropertyDetail"));
const UnsortedInboxPage = lazy(() => import("@/pages/UnsortedInboxPage"));
const MailboxAccountsSettingsPage = lazy(() => import("@/pages/MailboxAccountsSettingsPage"));
const MyMailboxPage = lazy(() => import("@/pages/MyMailboxPage"));
const SharedMailboxesAndOversightPage = lazy(() => import("@/pages/SharedMailboxesAndOversightPage"));
const ChemicalNotificationTemplates = lazy(() => import("@/pages/ChemicalNotificationTemplates"));

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-6">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center text-center py-10 gap-4">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try reloading the page.
              </p>
              <Button
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.reload();
                }}
                data-testid="button-error-reload"
              >
                Reload Page
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  const { user, isLoading, logoutMutation } = useAuth();
  const { i18n } = useTranslation();
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [location] = useLocation();
  const isVisualScopeDraft = /^\/dashboard\/tools\/visual-scope\/[^/]+/.test(location);
  const isCustomerDetail =
    /^\/dashboard\/customers\/[^/]+(\/|$)/.test(location) &&
    !/^\/dashboard\/customers\/map(\/|$)/.test(location);

  const prefersReducedMotion = usePrefersReducedMotion();
  const prevIsCustomerDetailRef = useRef(isCustomerDetail);
  const [phantomRailVisible, setPhantomRailVisible] = useState(false);
  const [phantomRailCollapsed, setPhantomRailCollapsed] = useState(false);

  useEffect(() => {
    const wasCustomerDetail = prevIsCustomerDetailRef.current;
    prevIsCustomerDetailRef.current = isCustomerDetail;
    if (wasCustomerDetail && !isCustomerDetail) {
      if (prefersReducedMotion) return;
      setPhantomRailCollapsed(false);
      setPhantomRailVisible(true);
      const collapseFrame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhantomRailCollapsed(true));
      });
      const hideTimer = setTimeout(() => setPhantomRailVisible(false), 280);
      return () => {
        cancelAnimationFrame(collapseFrame);
        clearTimeout(hideTimer);
      };
    }
  }, [isCustomerDetail, prefersReducedMotion]);

  useEffect(() => {
    if (user?.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n]);
  
  const { data: setupStatus, isLoading: setupLoading } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/setup/status"],
    enabled: !user && !isLoading,
    staleTime: 1000 * 60 * 5,
  });

  const isAppLoading = isLoading || (!user && setupLoading);

  useEffect(() => {
    if (!isAppLoading && showLoadingScreen) {
      const timer = setTimeout(() => setShowLoadingScreen(false), 700);
      return () => clearTimeout(timer);
    }
  }, [isAppLoading, showLoadingScreen]);

  const FIELD_APP_ROLES = ["field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor"] as const;
  type FieldAppRole = typeof FIELD_APP_ROLES[number];

  function isFieldAppRole(role: string): role is FieldAppRole {
    return FIELD_APP_ROLES.includes(role as FieldAppRole);
  }

  const allFieldRoles = ["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"] as const;

  function getDefaultRedirect() {
    if (!user) return "/login";
    if (user.isSuperAdminBool) return "/admin";
    if (user.activeRole === "mapping") return "/dashboard/maps";
    if (user.activeRole === "field") return "/dashboard";
    return "/dashboard";
  }

  function renderRouteSwitch() {
    if (!user) return null;

    return (
      <Switch>
        <ProtectedRoute path="/admin" component={SuperAdminHome} superAdminOnly />
        <ProtectedRoute
          path="/dashboard"
          component={Dashboard}
          allowedRoles={["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor"]}
        />
        <ProtectedRoute
          path="/dashboard/field-customers"
          component={FieldCustomerList}
          allowedRoles={["admin", "office", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"]}
        />
        <ProtectedRoute
          path="/dashboard/customers/map"
          component={CustomerRouteMap}
          allowedRoles={["admin", "field_manager", "landscape_supervisor", "chemical_manager", "irrigation_manager", "shop_manager"]}
        />
        <ProtectedRoute
          path="/dashboard/customers/:id"
          component={CustomerDetail}
          allowedRoles={["admin", "office", "field_manager", "chemical_manager"]}
        />
        <ProtectedRoute
          path="/dashboard/customers"
          component={CustomersList}
          allowedRoles={["admin", "office", "field_manager", "chemical_manager"]}
        />
        <ProtectedRoute path="/dashboard/tickets/new" component={NewTicket} allowedRoles={["admin"]} />
        <ProtectedRoute
          path="/dashboard/tickets/my"
          component={MyTickets}
          allowedRoles={["admin", "office", ...allFieldRoles]}
        />
        <ProtectedRoute
          path="/dashboard/tickets/:id"
          component={TicketDetail}
          allowedRoles={["admin", "office", ...allFieldRoles]}
        />
        <ProtectedRoute path="/dashboard/tickets" component={TicketsList} allowedRoles={["admin"]} />
        <ProtectedRoute
          path="/dashboard/maps"
          component={PropertyMapsPage}
          allowedRoles={["admin", "office", "mapping", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"]}
        />
        <Route path="/dashboard/scheduler">
          <Redirect to="/dashboard/schedule" />
        </Route>
        <ProtectedRoute
          path="/dashboard/schedule"
          component={SchedulePage}
          allowedRoles={["admin", "office", "irrigation_manager"]}
        />
        <ProtectedRoute path="/dashboard/equipment/new" component={NewEquipment} allowedRoles={["admin", "office", "shop_manager"]} />
        <ProtectedRoute
          path="/dashboard/equipment/:id"
          component={EquipmentDetail}
          allowedRoles={["admin", "office", "shop_manager"]}
        />
        <ProtectedRoute
          path="/dashboard/equipment"
          component={EquipmentList}
          allowedRoles={["admin", "office", "shop_manager"]}
        />
        <ProtectedRoute path="/dashboard/equipment-tickets/:id" component={EquipmentTicketDetail} allowedRoles={["admin", "office", "shop_manager"]} />
        <ProtectedRoute path="/dashboard/tools/contract-builder" component={ContractBuilderPage} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/tools/proposals/:id/versions/:versionId" component={ProposalVersion} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/tools/proposals/:id" component={ProposalDraft} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/tools/proposals" component={ProposalMaker} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/tools/visual-scope/:id" component={VisualScopeDraft} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/tools/visual-scope" component={VisualScopeList} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/tools" component={ToolsPage} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/snow/new" component={NewSnowEvent} allowedRoles={["admin", "office"]} />
        <ProtectedRoute
          path="/dashboard/snow/:id"
          component={SnowEventDetail}
          allowedRoles={["admin", "office", "field_manager"]}
        />
        <ProtectedRoute
          path="/dashboard/snow"
          component={SnowEventsList}
          allowedRoles={["admin", "office", "field_manager"]}
        />
        <ProtectedRoute path="/dashboard/contracts" component={ContractsOverview} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/revenue" component={RevenueOverview} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/notifications" component={NotificationsPage} allowedRoles={["admin", "office", ...allFieldRoles]} />
        <ProtectedRoute
          path="/dashboard/campaigns/:id/items/:itemId"
          component={CampaignItemDetail}
          allowedRoles={["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"]}
        />
        <ProtectedRoute
          path="/dashboard/campaigns/:id"
          component={CampaignDetail}
          allowedRoles={["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"]}
        />
        <ProtectedRoute
          path="/dashboard/campaigns"
          component={CampaignsList}
          allowedRoles={["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"]}
        />
        <ProtectedRoute
          path="/dashboard/my-batches"
          component={MyBatchesPage}
          allowedRoles={["admin", "office", "field", "field_manager", "landscape_supervisor"]}
        />
        <ProtectedRoute
          path="/dashboard/seasons/:id"
          component={SeasonDetail}
          allowedRoles={["admin", "office"]}
        />
        <ProtectedRoute
          path="/dashboard/seasons"
          component={SeasonsPage}
          allowedRoles={["admin", "office"]}
        />
        <ProtectedRoute
          path="/dashboard/operations"
          component={GlobalOperationsPage}
          allowedRoles={["admin", "office", "field_manager", "chemical_manager"]}
        />
        <ProtectedRoute
          path="/dashboard/properties/:id"
          component={PropertyDetail}
          allowedRoles={["admin", "office", "field_manager", "field", "chemical_manager"]}
        />
        <ProtectedRoute path="/dashboard/communications" component={CommunicationsCenter} allowedRoles={["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"]} />
        <ProtectedRoute path="/dashboard/communications/unsorted" component={UnsortedInboxPage} allowedRoles={["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"]} />
        <ProtectedRoute path="/dashboard/settings/shared-mailboxes" component={SharedMailboxesAndOversightPage} allowedRoles={["admin", "office"]} />
        <Route path="/dashboard/settings/mailbox-accounts">
          <Redirect to="/dashboard/settings/shared-mailboxes" />
        </Route>
        <ProtectedRoute path="/dashboard/settings/my-mailbox" component={MyMailboxPage} />
        <ProtectedRoute path="/dashboard/settings/notification-templates" component={ChemicalNotificationTemplates} allowedRoles={["admin"]} />
        <ProtectedRoute path="/dashboard/reports" component={ReportsPage} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/users" component={UsersPage} allowedRoles={["admin"]} />
        <ProtectedRoute path="/dashboard/settings" component={SettingsPage} allowedRoles={["admin", "office"]} />
        <ProtectedRoute path="/dashboard/settings/:tab" component={SettingsPage} allowedRoles={["admin", "office"]} />
        <Route path="/access-denied" component={AccessDenied} />
        <Route path="/">
          <Redirect to={getDefaultRedirect()} />
        </Route>
        <Route>
          <Redirect to={getDefaultRedirect()} />
        </Route>
      </Switch>
    );
  }

  function renderAuthenticatedApp() {
    if (!user) return null;

    if (!user.isSuperAdminBool && isFieldAppRole(user.activeRole)) {
      return (
        <FieldAppLayout
          user={user}
          onLogout={() => logoutMutation.mutate()}
        >
          <Suspense fallback={<LoadingScreen visible={true} />}>
            {renderRouteSwitch()}
          </Suspense>
        </FieldAppLayout>
      );
    }

    const sidebarStyle = { "--sidebar-width": "16rem" };
    return (
      <BreadcrumbsProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar
              userRole={user.activeRole}
              isSuperAdmin={user.isSuperAdminBool}
              userName={user.name}
              onLogout={() => logoutMutation.mutate()}
              isCustomerDetail={isCustomerDetail}
            />
            <div className="flex flex-col flex-1 overflow-hidden">
              <header className="flex items-center justify-between p-4 border-b bg-background">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="flex items-center gap-1">
                  <NotificationsDropdown />
                </div>
              </header>
              <AppBreadcrumb />
              <main className={`flex-1 overflow-y-auto relative ${isVisualScopeDraft || isCustomerDetail ? "" : "p-6 md:p-8"}`}>
                {phantomRailVisible && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-sidebar border-r border-sidebar-border z-10 pointer-events-none"
                    style={{
                      width: phantomRailCollapsed ? 0 : 200,
                      opacity: phantomRailCollapsed ? 0 : 1,
                      transition: "width 220ms ease-in, opacity 180ms ease-in",
                    }}
                  />
                )}
                <Suspense fallback={<LoadingScreen visible={true} />}>
                  {renderRouteSwitch()}
                </Suspense>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </BreadcrumbsProvider>
    );
  }

  if (isAppLoading || showLoadingScreen) {
    let content: React.ReactNode = null;
    if (!isAppLoading) {
      if (!user) {
        if (setupStatus?.needsSetup) {
          content = (
            <Switch>
              <Route path="/setup" component={SetupPage} />
              <Route>
                <Redirect to="/setup" />
              </Route>
            </Switch>
          );
        } else {
          content = (
            <Switch>
              <Route path="/login" component={LoginPage} />
              <Route>
                <Redirect to="/login" />
              </Route>
            </Switch>
          );
        }
      } else {
        content = renderAuthenticatedApp();
      }
    }
    return (
      <>
        {content}
        <LoadingScreen visible={isAppLoading} />
      </>
    );
  }

  if (!user) {
    if (setupStatus?.needsSetup) {
      return (
        <Switch>
          <Route path="/setup" component={SetupPage} />
          <Route>
            <Redirect to="/setup" />
          </Route>
        </Switch>
      );
    }
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  return renderAuthenticatedApp();
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
              <Toaster />
            </AuthProvider>
          </WouterRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
