import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ChevronRight, AlertCircle } from "lucide-react";
import type { Ticket, Customer } from "@shared/schema";

interface PendingInvoice extends Ticket {
  customer: Customer | null;
  sourceTicket: Ticket | null;
  ticketTypeName: string;
}

export default function PendingInvoices() {
  const { data: invoices, isLoading, error } = useQuery<PendingInvoice[]>({
    queryKey: ["/api/pending-invoices"],
  });

  if (error) {
    return (
      <Card data-testid="card-pending-invoices">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Pending Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            Unable to load pending invoices
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card data-testid="card-pending-invoices">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Pending Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const pendingCount = invoices?.length || 0;

  return (
    <Card data-testid="card-pending-invoices">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Pending Invoices
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {pendingCount}
            </Badge>
          )}
        </CardTitle>
        <Link href="/dashboard/tickets">
          <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer">
            View All
            <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {pendingCount === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No pending invoices
          </p>
        ) : (
          <div className="space-y-2">
            {invoices?.slice(0, 5).map((invoice) => (
              <Link key={invoice.id} href={`/dashboard/tickets/${invoice.id}`}>
                <div 
                  className="flex items-center justify-between p-2 rounded-md border hover-elevate cursor-pointer"
                  data-testid={`pending-invoice-${invoice.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{invoice.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {invoice.customer?.name || "Unknown Customer"}
                      {invoice.sourceTicket && (
                        <span> - From: {invoice.sourceTicket.title}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className="ml-2 shrink-0 border-amber-500 text-amber-500">
                    {invoice.ticketTypeName === "Invoice" ? "Pending" : "Ready to Bill"}
                  </Badge>
                </div>
              </Link>
            ))}
            {pendingCount > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                +{pendingCount - 5} more pending invoices
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
