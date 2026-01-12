import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { RevenueChart } from "@/components/RevenueChart";

interface RevenueOverviewData {
  selectedMonthTotal: number;
  yearToDateTotal: number;
  fullYearTotal: number;
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
  
  // Generate year options (current year and 3 years before/after)
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentDate.getFullYear() - 3 + i);
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-[350px] w-full" />
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
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">Revenue Overview</h1>
          <p className="text-muted-foreground mt-1">
            Projected revenue across all customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select 
            value={selectedMonth.toString()} 
            onValueChange={(value) => setSelectedMonth(parseInt(value))}
          >
            <SelectTrigger className="w-[140px]" data-testid="select-month">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((month, index) => (
                <SelectItem key={index + 1} value={(index + 1).toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={selectedYear.toString()} 
            onValueChange={(value) => setSelectedYear(parseInt(value))}
          >
            <SelectTrigger className="w-[100px]" data-testid="select-year">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <RevenueChart />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selected Month Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-selected-month-total">
              ${(overviewData?.selectedMonthTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              ${(overviewData?.yearToDateTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              January - {monthNames[selectedMonth - 1]} {selectedYear}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Full Year Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-full-year-total">
              ${(overviewData?.fullYearTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              January - December {selectedYear}
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
