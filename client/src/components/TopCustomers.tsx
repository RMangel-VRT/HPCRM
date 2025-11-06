import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { TrendingUp } from "lucide-react";

interface TopCustomer {
  id: string;
  name: string;
  totalRevenue: number;
  activeContracts: number;
}

export default function TopCustomers() {
  const { data: customers, isLoading } = useQuery<TopCustomer[]>({
    queryKey: ["/api/dashboard/top-customers"],
  });

  return (
    <Card data-testid="card-top-customers">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Top Customers</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-5 w-20 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : !customers || customers.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-customers">
            No customer data available
          </p>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/dashboard/customers/${customer.id}`}
                data-testid={`link-customer-${customer.id}`}
              >
                <div className="flex items-center justify-between hover-elevate active-elevate-2 rounded-md p-2 -mx-2 cursor-pointer">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none" data-testid={`text-customer-name-${customer.id}`}>
                      {customer.name}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-contracts-count-${customer.id}`}>
                      {customer.activeContracts} active {customer.activeContracts === 1 ? "contract" : "contracts"}
                    </p>
                  </div>
                  <div className="text-sm font-semibold" data-testid={`text-revenue-${customer.id}`}>
                    ${customer.totalRevenue.toLocaleString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
