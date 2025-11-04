import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

interface RevenueOverviewData {
  selectedMonthTotal: number;
  yearToDateTotal: number;
  customers: { customerId: string; customerName: string; monthlyRevenue: number; annualProjection: number }[];
}

export default function RevenueOverview() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  
  const { data: overviewData, isLoading } = useQuery<RevenueOverviewData>({
    queryKey: [`/api/revenue/overview?month=${selectedMonth}&year=${selectedYear}`],
  });
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };
  
  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Revenue Overview</h1>
          <p className="text-muted-foreground mt-1">
            Projected revenue across all customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevMonth}
            data-testid="button-prev-month"
          >
            ←
          </Button>
          <span className="text-sm font-medium px-3 min-w-[140px] text-center" data-testid="text-selected-month">
            {monthNames[selectedMonth - 1]} {selectedYear}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            data-testid="button-next-month"
          >
            →
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selected Month Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-selected-month-total">
              ${overviewData?.selectedMonthTotal.toFixed(2) || "0.00"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {monthNames[selectedMonth - 1]} {selectedYear}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Year-to-Date Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-ytd-total">
              ${overviewData?.yearToDateTotal.toFixed(2) || "0.00"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              January - {monthNames[selectedMonth - 1]} {selectedYear}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customers</CardTitle>
        </CardHeader>
        <CardContent>
          {!overviewData?.customers || overviewData.customers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No customers found</p>
          ) : (
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium">Customer</th>
                    <th className="text-right p-3 text-xs font-medium">
                      {monthNames[selectedMonth - 1]} Revenue
                    </th>
                    <th className="text-right p-3 text-xs font-medium">Annual Projection</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {overviewData.customers.map((customer) => (
                    <tr 
                      key={customer.customerId} 
                      className="border-b last:border-0 hover-elevate"
                      data-testid={`row-customer-${customer.customerId}`}
                    >
                      <td className="p-3 text-sm font-medium">{customer.customerName}</td>
                      <td className="p-3 text-sm text-right" data-testid={`text-customer-${customer.customerId}-monthly`}>
                        ${customer.monthlyRevenue.toFixed(2)}
                      </td>
                      <td className="p-3 text-sm text-right" data-testid={`text-customer-${customer.customerId}-annual`}>
                        ${customer.annualProjection.toFixed(2)}
                      </td>
                      <td className="p-3">
                        <Link href={`/dashboard/customers/${customer.customerId}?tab=revenue`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-customer-${customer.customerId}`}>
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
