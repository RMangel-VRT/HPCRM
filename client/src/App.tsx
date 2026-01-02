import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BreadcrumbsProvider } from "@/hooks/use-breadcrumbs";
import { ProtectedRoute } from "@/lib/protected-route";
import { Loader2 } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
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
import NotFound from "@/pages/not-found";

function Router() {
  const { user, isLoading, logoutMutation } = useAuth();
  
  const { data: setupStatus, isLoading: setupLoading } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/setup/status"],
    enabled: !user && !isLoading,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading || (!user && setupLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
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

  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <BreadcrumbsProvider>
      <SidebarProvider style={style as React.CSSProperties}>
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
              <ProtectedRoute path="/dashboard" component={Dashboard} allowedRoles={["admin", "office", "field_manager"]} />
              <ProtectedRoute path="/dashboard/customers/:id" component={CustomerDetail} allowedRoles={["admin", "office", "field_manager"]} />
              <ProtectedRoute path="/dashboard/customers" component={CustomersList} allowedRoles={["admin", "office", "field_manager"]} />
              <ProtectedRoute path="/dashboard/tickets/new" component={NewTicket} allowedRoles={["admin"]} />
              <ProtectedRoute path="/dashboard/tickets/my" component={MyTickets} />
              <ProtectedRoute path="/dashboard/tickets/:id" component={TicketDetail} />
              <ProtectedRoute path="/dashboard/tickets" component={TicketsList} allowedRoles={["admin"]} />
              <ProtectedRoute path="/dashboard/maps" component={PropertyMapsPage} />
              <Route path="/dashboard/scheduler">
                <Redirect to="/dashboard/schedule" />
              </Route>
              <ProtectedRoute path="/dashboard/schedule" component={SchedulePage} allowedRoles={["admin", "office", "irrigation_manager"]} />
              <ProtectedRoute path="/dashboard/tools/contract-builder" component={ContractBuilderPage} allowedRoles={["admin", "office"]} />
              <ProtectedRoute path="/dashboard/tools" component={ToolsPage} allowedRoles={["admin", "office", "field_manager"]} />
              <ProtectedRoute path="/dashboard/revenue" component={RevenueOverview} allowedRoles={["admin", "office"]} />
              <ProtectedRoute
                path="/dashboard/users"
                component={UsersPage}
                allowedRoles={["admin"]}
              />
              <ProtectedRoute
                path="/dashboard/settings"
                component={SettingsPage}
                allowedRoles={["admin", "office"]}
              />
              <Route path="/access-denied" component={AccessDenied} />
              <Route path="/">
                {user.isSuperAdminBool ? (
                  <Redirect to="/admin" />
                ) : user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager" ? (
                  <Redirect to="/dashboard/tickets/my" />
                ) : (
                  <Redirect to="/dashboard" />
                )}
              </Route>
              <Route>
                {user.isSuperAdminBool ? (
                  <Redirect to="/admin" />
                ) : user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager" ? (
                  <Redirect to="/dashboard/tickets/my" />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
