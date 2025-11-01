import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Settings } from "lucide-react";

export default function SuperAdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Super Admin Portal</h1>
        <p className="text-muted-foreground mt-2">
          Platform administration and management
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Building2 className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Companies</CardTitle>
            <CardDescription>
              Manage all companies on the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming soon: View and manage company accounts, subscriptions, and settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Users className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Cross-company user management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming soon: Manage users across all companies, reset passwords, and control access.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Settings className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Platform Settings</CardTitle>
            <CardDescription>
              System-wide configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming soon: Configure platform settings, feature flags, and system preferences.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Welcome to the Admin Portal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            As a super administrator, you have system-wide access to manage the platform. 
            The full admin portal is currently under development.
          </p>
          <p className="text-sm text-muted-foreground">
            For now, you can use the company switcher to access specific company accounts 
            when needed for support or troubleshooting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
