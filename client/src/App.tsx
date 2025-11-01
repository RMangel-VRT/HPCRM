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
import PropertiesList from "@/pages/PropertiesList";
import PropertyDetail from "@/pages/PropertyDetail";
import ContractsList from "@/pages/ContractsList";
import ContractForm from "@/pages/ContractForm";
import TicketsList from "@/pages/TicketsList";
import TicketDetail from "@/pages/TicketDetail";
import SettingsPage from "@/pages/SettingsPage";
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
          userRole={user.role}
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
              <ProtectedRoute path="/" component={Dashboard} />
              <ProtectedRoute path="/dashboard" component={Dashboard} />
              <ProtectedRoute path="/customers" component={CustomersList} />
              <ProtectedRoute path="/customers/:id" component={CustomerDetail} />
              <ProtectedRoute path="/properties" component={PropertiesList} />
              <ProtectedRoute path="/properties/:id" component={PropertyDetail} />
              <ProtectedRoute path="/contracts" component={ContractsList} />
              <ProtectedRoute path="/contracts/new" component={ContractForm} />
              <ProtectedRoute path="/tickets" component={TicketsList} />
              <ProtectedRoute path="/tickets/:id" component={TicketDetail} />
              <ProtectedRoute
                path="/settings"
                component={SettingsPage}
                allowedRoles={["admin"]}
              />
              <Route path="/access-denied" component={AccessDenied} />
              <Route component={NotFound} />
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
