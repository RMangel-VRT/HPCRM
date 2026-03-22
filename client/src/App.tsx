import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BreadcrumbsProvider } from "@/hooks/use-breadcrumbs";
import { ProtectedRoute } from "@/lib/protected-route";
import { AlertTriangle } from "lucide-react";
import { Component, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import "@/i18n";
import AppSidebar from "@/components/AppSidebar";
import FieldLayout from "@/components/FieldLayout";
import { LoadingScreen } from "@/components/LoadingScreen";
import AppBreadcrumb from "@/components/AppBreadcrumb";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import AccessDenied from "@/pages/AccessDenied";
import Dashboard from "@/pages/Dashboard";
import CustomersList from "@/pages/CustomersList";
import CustomerDetail from "@/pages/CustomerDetail";
import RevenueOverview from "@/pages/RevenueOverview";
import ToolsPage from "@/pages/ToolsPage";
import ContractBuilderPage from "@/pages/ContractBuilderPage";
import TicketsList from "@/pages/TicketsList";
import TicketDetail from "@/pages/TicketDetail";
import NewTicket from "@/pages/NewTicket";
import MyTickets from "@/pages/MyTickets";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import SuperAdminHome from "@/pages/SuperAdminHome";
import PropertyMapsPage from "@/pages/PropertyMapsPage";
import SchedulePage from "@/pages/SchedulePage";
import EquipmentList from "@/pages/EquipmentList";
import EquipmentDetail from "@/pages/EquipmentDetail";
import NewEquipment from "@/pages/NewEquipment";
import EquipmentTicketDetail from "@/pages/EquipmentTicketDetail";
import ContractsOverview from "@/pages/ContractsOverview";
import SnowEventsList from "@/pages/SnowEventsList";
import SnowEventDetail from "@/pages/SnowEventDetail";
import NewSnowEvent from "@/pages/NewSnowEvent";
import ReportsPage from "@/pages/ReportsPage";
import ProposalMaker from "@/pages/ProposalMaker";
import ProposalDraft from "@/pages/ProposalDraft";
import ProposalVersion from "@/pages/ProposalVersion";
import NotificationsPage from "@/pages/NotificationsPage";
import VisualScopeList from "@/pages/VisualScopeList";
import VisualScopeDraft from "@/pages/VisualScopeDraft";
import CustomerRouteMap from "@/pages/CustomerRouteMap";
import CampaignsList from "@/pages/CampaignsList";
import CampaignDetail from "@/pages/CampaignDetail";
import CampaignItemDetail from "@/pages/CampaignItemDetail";
import SeasonsPage from "@/pages/SeasonsPage";
import SeasonDetail from "@/pages/SeasonDetail";
import NotFound from "@/pages/not-found";

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

  const FIELD_ROLES = ["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"] as const;
  type FieldRole = typeof FIELD_ROLES[number];

  function isFieldRole(role: string): role is FieldRole {
    return FIELD_ROLES.includes(role as FieldRole);
  }

  function renderAuthenticatedApp() {
    if (!user) return null;

    if (!user.isSuperAdminBool && isFieldRole(user.activeRole)) {
      return (
        <FieldLayout
          user={user}
          onLogout={() => logoutMutation.mutate()}
        />
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
            />
            <div className="flex flex-col flex-1 overflow-hidden">
              <header className="flex items-center justify-between p-4 border-b bg-background">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="flex items-center gap-1">
                  <NotificationsDropdown />
                </div>
              </header>
              <AppBreadcrumb />
              <main className="flex-1 overflow-y-auto p-6 md:p-8">
                <Switch>
                  <ProtectedRoute path="/admin" component={SuperAdminHome} superAdminOnly />
                  <ProtectedRoute path="/dashboard" component={Dashboard} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/customers/map" component={CustomerRouteMap} allowedRoles={["admin"]} />
                  <ProtectedRoute path="/dashboard/customers/:id" component={CustomerDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/customers" component={CustomersList} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tickets/new" component={NewTicket} allowedRoles={["admin"]} />
                  <ProtectedRoute path="/dashboard/tickets/my" component={MyTickets} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tickets/:id" component={TicketDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tickets" component={TicketsList} allowedRoles={["admin"]} />
                  <ProtectedRoute path="/dashboard/maps" component={PropertyMapsPage} allowedRoles={["admin", "office", "mapping"]} />
                  <Route path="/dashboard/scheduler">
                    <Redirect to="/dashboard/schedule" />
                  </Route>
                  <ProtectedRoute path="/dashboard/schedule" component={SchedulePage} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/equipment/new" component={NewEquipment} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/equipment/:id" component={EquipmentDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/equipment" component={EquipmentList} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/equipment-tickets/:id" component={EquipmentTicketDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools/contract-builder" component={ContractBuilderPage} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools/proposals/:id/versions/:versionId" component={ProposalVersion} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools/proposals/:id" component={ProposalDraft} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools/proposals" component={ProposalMaker} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools/visual-scope/:id" component={VisualScopeDraft} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools/visual-scope" component={VisualScopeList} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/tools" component={ToolsPage} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/snow/new" component={NewSnowEvent} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/snow/:id" component={SnowEventDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/snow" component={SnowEventsList} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/contracts" component={ContractsOverview} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/revenue" component={RevenueOverview} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/notifications" component={NotificationsPage} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/campaigns/:id/items/:itemId" component={CampaignItemDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/campaigns/:id" component={CampaignDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/campaigns" component={CampaignsList} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/seasons/:id" component={SeasonDetail} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/seasons" component={SeasonsPage} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/reports" component={ReportsPage} allowedRoles={["admin", "office"]} />
                  <ProtectedRoute path="/dashboard/users" component={UsersPage} allowedRoles={["admin"]} />
                  <ProtectedRoute path="/dashboard/settings" component={SettingsPage} allowedRoles={["admin", "office"]} />
                  <Route path="/access-denied" component={AccessDenied} />
                  <Route path="/">
                    {user.isSuperAdminBool ? (
                      <Redirect to="/admin" />
                    ) : user.activeRole === "mapping" ? (
                      <Redirect to="/dashboard/maps" />
                    ) : (
                      <Redirect to="/dashboard" />
                    )}
                  </Route>
                  <Route>
                    {user.isSuperAdminBool ? (
                      <Redirect to="/admin" />
                    ) : user.activeRole === "mapping" ? (
                      <Redirect to="/dashboard/maps" />
                    ) : (
                      <Redirect to="/dashboard" />
                    )}
                  </Route>
                </Switch>
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
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
