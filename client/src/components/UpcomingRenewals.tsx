import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { CalendarClock } from "lucide-react";
import { format } from "date-fns";

interface UpcomingRenewal {
  contractId: string;
  customerId: string;
  customerName: string;
  serviceType: string;
  endDate: string;
  daysUntilExpiry: number;
}

export default function UpcomingRenewals() {
  const { data: renewals, isLoading } = useQuery<UpcomingRenewal[]>({
    queryKey: ["/api/dashboard/upcoming-renewals"],
  });

  const getUrgencyColor = (days: number) => {
    if (days <= 30) return "destructive";
    if (days <= 60) return "default";
    return "secondary";
  };

  return (
    <Card data-testid="card-upcoming-renewals">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Upcoming Renewals</CardTitle>
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-5 w-12 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : !renewals || renewals.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-renewals">
            No contracts expiring soon
          </p>
        ) : (
          <div className="space-y-2">
            {renewals.slice(0, 3).map((renewal) => (
              <Link
                key={renewal.contractId}
                href={`/dashboard/customers/${renewal.customerId}`}
                data-testid={`link-renewal-${renewal.contractId}`}
              >
                <div className="flex items-center justify-between gap-2 hover-elevate active-elevate-2 rounded-md p-1.5 -mx-1.5 cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none truncate" data-testid={`text-customer-name-${renewal.contractId}`}>
                      {renewal.customerName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate" data-testid={`text-service-type-${renewal.contractId}`}>
                      {format(new Date(renewal.endDate), "MMM d")}
                    </p>
                  </div>
                  <Badge 
                    variant={getUrgencyColor(renewal.daysUntilExpiry)}
                    className="shrink-0"
                    data-testid={`badge-days-${renewal.contractId}`}
                  >
                    {renewal.daysUntilExpiry}d
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
