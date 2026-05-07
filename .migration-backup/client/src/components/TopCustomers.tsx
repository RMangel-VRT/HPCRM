import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { TrendingUp, ArrowRight } from "lucide-react";

interface TopCustomer {
  id: string;
  name: string;
  totalRevenue: number;
  activeContracts: number;
}

export default function TopCustomers() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: customers, isLoading } = useQuery<TopCustomer[]>({
    queryKey: ["/api/dashboard/top-customers"],
  });

  const CustomerItem = ({ customer, showDetails = false }: { customer: TopCustomer; showDetails?: boolean }) => (
    <Link
      href={`/dashboard/customers/${customer.id}`}
      data-testid={`link-customer-${customer.id}`}
      onClick={() => setIsModalOpen(false)}
    >
      <div className="flex items-center justify-between hover-elevate active-elevate-2 rounded-md p-2 -mx-2 cursor-pointer">
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-sm font-medium leading-none truncate" data-testid={`text-customer-name-${customer.id}`}>
            {customer.name}
          </p>
          {showDetails && (
            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-contracts-count-${customer.id}`}>
              {customer.activeContracts} active {customer.activeContracts === 1 ? "contract" : "contracts"}
            </p>
          )}
        </div>
        <div className="text-sm font-semibold shrink-0" data-testid={`text-revenue-${customer.id}`}>
          ${customer.totalRevenue.toLocaleString()}
        </div>
      </div>
    </Link>
  );

  return (
    <>
      <Card data-testid="card-top-customers">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Top Customers</CardTitle>
          {customers && customers.length > 4 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsModalOpen(true)}
              data-testid="button-view-all-customers"
            >
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {(!customers || customers.length <= 4) && (
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : !customers || customers.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-customers">
              No customer data available
            </p>
          ) : (
            <div className="space-y-1">
              {customers.slice(0, 4).map((customer) => (
                <CustomerItem key={customer.id} customer={customer} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top Customers by Revenue
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {customers && customers.length > 0 ? (
              <div className="space-y-1">
                {customers.map((customer, index) => (
                  <div key={customer.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <CustomerItem customer={customer} showDetails />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No customer data available
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
