import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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

type UserRole = "admin" | "office" | "ops" | "viewer";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

function Router({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const [location, setLocation] = useLocation();

  if (!user) {
    return <LoginPage onLogin={(email) => console.log("Login:", email)} />;
  }

  const canAccessSettings = user.role === "admin";

  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          userRole={user.role}
          userName={user.name}
          onLogout={onLogout}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between p-4 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/customers" component={CustomersList} />
              <Route path="/customers/:id" component={CustomerDetail} />
              <Route path="/properties" component={PropertiesList} />
              <Route path="/properties/:id" component={PropertyDetail} />
              <Route path="/contracts" component={ContractsList} />
              <Route path="/contracts/new" component={ContractForm} />
              <Route path="/tickets" component={TicketsList} />
              <Route path="/tickets/:id" component={TicketDetail} />
              <Route path="/settings">
                {canAccessSettings ? <SettingsPage /> : <AccessDenied />}
              </Route>
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
  const [user, setUser] = useState<User | null>({
    id: "1",
    name: "Sarah Johnson",
    email: "sarah@greenscape.com",
    role: "admin",
  });

  const handleLogout = () => {
    console.log("Logout");
    setUser(null);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router user={user} onLogout={handleLogout} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
