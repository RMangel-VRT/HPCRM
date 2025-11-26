import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { Loader2 } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import LoginPage from "@/pages/LoginPage";
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
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import SuperAdminHome from "@/pages/SuperAdminHome";
import NotFound from "@/pages/not-found";

function Router() {
  const { user, isLoading, logoutMutation } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
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
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <Switch>
              <ProtectedRoute path="/admin" component={SuperAdminHome} superAdminOnly />
              <ProtectedRoute path="/dashboard" component={Dashboard} />
              <ProtectedRoute path="/dashboard/customers/:id" component={CustomerDetail} />
              <ProtectedRoute path="/dashboard/customers" component={CustomersList} />
              <ProtectedRoute path="/dashboard/tickets/new" component={NewTicket} allowedRoles={["admin", "office"]} />
              <ProtectedRoute path="/dashboard/tickets/:id" component={TicketDetail} />
              <ProtectedRoute path="/dashboard/tickets" component={TicketsList} />
              <ProtectedRoute path="/dashboard/tools/contract-builder" component={ContractBuilderPage} />
              <ProtectedRoute path="/dashboard/tools" component={ToolsPage} />
              <ProtectedRoute path="/dashboard/revenue" component={RevenueOverview} />
              <ProtectedRoute
                path="/dashboard/users"
                component={UsersPage}
                allowedRoles={["admin"]}
              />
              <ProtectedRoute
                path="/dashboard/settings"
                component={SettingsPage}
                allowedRoles={["admin"]}
              />
              <Route path="/access-denied" component={AccessDenied} />
              <Route path="/">
                {user.isSuperAdminBool ? <Redirect to="/admin" /> : <Redirect to="/dashboard" />}
              </Route>
              <Route>
                {user.isSuperAdminBool ? <Redirect to="/admin" /> : <Redirect to="/dashboard" />}
              </Route>
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
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
