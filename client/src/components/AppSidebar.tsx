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
import logoImage from "@assets/generated_images/Landscaping_CRM_company_logo_b2cf0b31.png";

interface AppSidebarProps {
  userRole?: "admin" | "office" | "field_manager" | "field";
  isSuperAdmin?: boolean;
  userName?: string;
  onLogout?: () => void;
}

export default function AppSidebar({
  userRole = "admin",
  isSuperAdmin = false,
  userName = "John Doe",
  onLogout,
}: AppSidebarProps) {
  const [location] = useLocation();

  // Super admins see admin portal navigation
  const superAdminItems = isSuperAdmin
    ? [
        { title: "Admin Home", url: "/admin", icon: Shield },
      ]
    : [];

  // Build CRM items based on role
  const getCrmItems = () => {
    if (isSuperAdmin) return [];
    
    const items: Array<{ title: string; url: string; icon: typeof LayoutDashboard }> = [];
    
    // Dashboard - Admin, Office, Field Manager only (not Field)
    if (userRole === "admin" || userRole === "office" || userRole === "field_manager") {
      items.push({ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard });
    }
    
    // Customers - Admin, Office, Field Manager (Field Manager gets limited view)
    if (userRole === "admin" || userRole === "office" || userRole === "field_manager") {
      items.push({ title: "Customers", url: "/dashboard/customers", icon: Building2 });
    }
    
    // Tickets (all tickets view) - Admin only
    if (userRole === "admin") {
      items.push({ title: "Tickets", url: "/dashboard/tickets", icon: ClipboardList });
    }
    
    // My Tickets - everyone
    items.push({ title: "My Tickets", url: "/dashboard/tickets/my", icon: UserCheck });
    
    // Property Maps - everyone
    items.push({ title: "Property Maps", url: "/dashboard/maps", icon: Map });
    
    // Weekly Schedule - Admin and Office only
    if (userRole === "admin" || userRole === "office") {
      items.push({ title: "Schedule", url: "/dashboard/schedule", icon: CalendarDays });
    }
    
    // Tools - Admin, Office, Field Manager
    if (userRole === "admin" || userRole === "office" || userRole === "field_manager") {
      items.push({ title: "Tools", url: "/dashboard/tools", icon: Wrench });
    }
    
    // Revenue - Admin and Office only
    if (userRole === "admin" || userRole === "office") {
      items.push({ title: "Revenue", url: "/dashboard/revenue", icon: DollarSign });
    }
    
    return items;
  };

  const crmItems = getCrmItems();

  const managementItems = (!isSuperAdmin && userRole === "admin")
    ? [{ title: "Team", url: "/dashboard/users", icon: Users }]
    : [];

  const adminItems = (!isSuperAdmin && userRole === "admin")
    ? [{ title: "Settings", url: "/dashboard/settings", icon: Settings }]
    : [];

  return (
    <Sidebar data-testid="app-sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="Logo" className="w-10 h-10" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">GreenScape</h2>
            <p className="text-xs text-muted-foreground">CRM System</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {superAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Platform Admin</SidebarGroupLabel>
            <SidebarMenu>
              {superAdminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
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
            <SidebarGroupLabel>CRM</SidebarGroupLabel>
            <SidebarMenu>
              {crmItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {managementItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarMenu>
              {managementItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
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
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
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

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs">
              {userName.split(" ").map((n) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <RoleBadge role={userRole} isSuperAdmin={isSuperAdmin} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SidebarMenuButton
            onClick={onLogout}
            className="flex-1"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </SidebarMenuButton>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-help">
                <HelpCircle className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Help & Support</DialogTitle>
                <DialogDescription>
                  Get help with GreenScape CRM
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Contact Support</h4>
                  <div className="space-y-2">
                    <a 
                      href="mailto:support@greenscapecrm.com"
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate transition-colors"
                      data-testid="link-support-email"
                    >
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Email Support</p>
                        <p className="text-xs text-muted-foreground">support@greenscapecrm.com</p>
                      </div>
                    </a>
                    <a 
                      href="tel:+18005551234"
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate transition-colors"
                      data-testid="link-support-phone"
                    >
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Phone Support</p>
                        <p className="text-xs text-muted-foreground">1-800-555-1234</p>
                      </div>
                    </a>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Quick Tips</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>Use the search bar on the Customers page to quickly find clients</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>Create tickets from customer profiles for faster workflow</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>Check your notifications for task assignments and due dates</p>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
