import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { CalendarClock, ArrowRight } from "lucide-react";
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: renewals, isLoading } = useQuery<UpcomingRenewal[]>({
    queryKey: ["/api/dashboard/upcoming-renewals"],
  });

  const getUrgencyColor = (days: number) => {
    if (days <= 30) return "destructive";
    if (days <= 60) return "default";
    return "secondary";
  };

  const RenewalItem = ({ renewal, showDetails = false }: { renewal: UpcomingRenewal; showDetails?: boolean }) => (
    <Link
      href={`/dashboard/customers/${renewal.customerId}`}
      data-testid={`link-renewal-${renewal.contractId}`}
      onClick={() => setIsModalOpen(false)}
    >
      <div className="flex items-center justify-between gap-2 hover-elevate active-elevate-2 rounded-md p-2 -mx-2 cursor-pointer">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-none truncate" data-testid={`text-customer-name-${renewal.contractId}`}>
            {renewal.customerName}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid={`text-service-type-${renewal.contractId}`}>
            {showDetails ? (
              <>
                {renewal.serviceType.replace(/_/g, " ")} • {format(new Date(renewal.endDate), "MMM d, yyyy")}
              </>
            ) : (
              format(new Date(renewal.endDate), "MMM d")
            )}
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
  );

  return (
    <>
      <Card data-testid="card-upcoming-renewals">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Upcoming Renewals</CardTitle>
          {renewals && renewals.length > 3 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsModalOpen(true)}
              data-testid="button-view-all-renewals"
            >
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {(!renewals || renewals.length <= 3) && (
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          )}
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
            <div className="space-y-1">
              {renewals.slice(0, 3).map((renewal) => (
                <RenewalItem key={renewal.contractId} renewal={renewal} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Upcoming Renewals
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {renewals && renewals.length > 0 ? (
              <div className="space-y-1">
                {renewals.map((renewal) => (
                  <RenewalItem key={renewal.contractId} renewal={renewal} showDetails />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No contracts expiring in the next 90 days
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
