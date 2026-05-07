import { useQuery } from "@tanstack/react-query";
import type { ContractService } from "@shared/schema";
import { SERVICE_CATALOG, MONTH_ABBREV, type ServiceType } from "@shared/serviceCatalog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ScheduleSummaryProps {
  contractId: string;
}

export default function ScheduleSummary({ contractId }: ScheduleSummaryProps) {
  const { data: services = [], isLoading } = useQuery<ContractService[]>({
    queryKey: ["/api/contracts", contractId, "services"],
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (services.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No services configured yet. Add services to see the schedule.
          </p>
        </CardContent>
      </Card>
    );
  }

  const monthlyTotals = Array(12).fill(0);
  
  services.forEach((service) => {
    service.monthlyDistribution.forEach((count, index) => {
      monthlyTotals[index] += count;
    });
  });

  const grandTotal = monthlyTotals.reduce((sum, count) => sum + count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Service</TableHead>
                {MONTH_ABBREV.map((month, index) => (
                  <TableHead key={index} className="text-center text-xs">
                    {month}
                  </TableHead>
                ))}
                <TableHead className="text-center font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => {
                const catalog = SERVICE_CATALOG[service.serviceType as ServiceType];
                const rowTotal = service.monthlyDistribution.reduce((sum, count) => sum + count, 0);
                
                return (
                  <TableRow key={service.id} data-testid={`schedule-row-${service.id}`}>
                    <TableCell className="font-medium text-sm">{catalog.name}</TableCell>
                    {service.monthlyDistribution.map((count, index) => (
                      <TableCell
                        key={index}
                        className={`text-center text-sm ${count > 0 ? "font-medium" : "text-muted-foreground"}`}
                        data-testid={`schedule-cell-${service.id}-${index + 1}`}
                      >
                        {count || "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-semibold" data-testid={`schedule-total-${service.id}`}>
                      {rowTotal}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total Visits</TableCell>
                {monthlyTotals.map((count, index) => (
                  <TableCell
                    key={index}
                    className={`text-center font-semibold ${count > 0 ? "" : "text-muted-foreground"}`}
                    data-testid={`schedule-month-total-${index + 1}`}
                  >
                    {count || "—"}
                  </TableCell>
                ))}
                <TableCell className="text-center font-bold" data-testid="schedule-grand-total">
                  {grandTotal}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
