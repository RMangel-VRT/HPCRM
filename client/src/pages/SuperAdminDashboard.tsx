import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, FileText, TrendingUp, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import type { Company } from "@shared/schema";

interface PlatformStats {
  totalCompanies: number;
  totalUsers: number;
  totalCustomers: number;
  totalContracts: number;
}

export default function SuperAdminDashboard() {
  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/admin/companies"],
  });

  const platformStats: PlatformStats = {
    totalCompanies: companies.length,
    totalUsers: 0,
    totalCustomers: 0,
    totalContracts: 0,
  };

  const statCards = [
    {
      title: "Total Companies",
      value: platformStats.totalCompanies.toString(),
      icon: Building2,
      description: "Active companies on platform",
    },
    {
      title: "Total Users",
      value: platformStats.totalUsers.toString(),
      icon: Users,
      description: "Users across all companies",
    },
    {
      title: "Total Customers",
      value: platformStats.totalCustomers.toString(),
      icon: FileText,
      description: "Customers being managed",
    },
    {
      title: "Active Contracts",
      value: platformStats.totalContracts.toString(),
      icon: TrendingUp,
      description: "Contracts across platform",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
          System Administration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform overview and company management
        </p>
      </div>

      {companiesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Card key={card.title} data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <card.icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Companies</CardTitle>
            <CardDescription>All companies on the platform</CardDescription>
          </div>
          <Link href="/admin">
            <Button variant="outline" size="sm" data-testid="button-view-all-companies">
              Manage Companies
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {companiesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No companies registered yet
            </p>
          ) : (
            <div className="space-y-3">
              {companies.slice(0, 5).map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                  data-testid={`card-company-${company.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{company.name}</p>
                      <p className="text-xs text-muted-foreground">{company.billingEmail || "No email"}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    Active
                  </Badge>
                </div>
              ))}
              {companies.length > 5 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{companies.length - 5} more companies
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
