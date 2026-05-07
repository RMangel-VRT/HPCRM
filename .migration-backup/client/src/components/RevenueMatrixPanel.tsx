import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RevenueChart } from "@/components/RevenueChart";

interface ServiceTypeRevenue {
  month: number;
  ytd: number;
  annual: number;
}

interface CustomerRevenue {
  customerId: string;
  customerName: string;
  monthlyRevenue: number;
  annualProjection: number;
  maintenanceMonth: number;
  maintenanceYtd: number;
  maintenanceAnnual: number;
  chemicalMonth: number;
  chemicalYtd: number;
  chemicalAnnual: number;
}

interface RevenueOverviewData {
  selectedMonthTotal: number;
  yearToDateTotal: number;
  fullYearTotal: number;
  maintenanceRevenue: ServiceTypeRevenue;
  chemicalRevenue: ServiceTypeRevenue;
  customers: CustomerRevenue[];
}

type BreakdownType = 'maintenanceMonth' | 'maintenanceYtd' | 'maintenanceAnnual' | 'chemicalMonth' | 'chemicalYtd' | 'chemicalAnnual';

interface RevenueMatrixPanelProps {
  year: number;
  month: number;
  searchQuery: string;
  serviceType?: string;
  activeOnly?: boolean;
  showIssuesOnly?: boolean;
}

export function RevenueMatrixPanel({ year, month, searchQuery }: RevenueMatrixPanelProps) {
  const { t } = useTranslation();
  const [breakdownDialog, setBreakdownDialog] = useState<{ open: boolean; type: BreakdownType | null; title: string }>({
    open: false,
    type: null,
    title: '',
  });

  const { data: overviewData, isLoading } = useQuery<RevenueOverviewData>({
    queryKey: [`/api/revenue/overview?month=${month}&year=${year}`],
  });

  const monthNames = [
    t("months.january"), t("months.february"), t("months.march"), t("months.april"),
    t("months.mayFull"), t("months.june"), t("months.july"), t("months.august"),
    t("months.september"), t("months.october"), t("months.november"), t("months.december"),
  ];

  const openBreakdownDialog = (type: BreakdownType, title: string) => {
    setBreakdownDialog({ open: true, type, title });
  };

  const getCustomerBreakdown = () => {
    if (!overviewData?.customers || !breakdownDialog.type) return [];
    return overviewData.customers
      .map(c => ({
        customerId: c.customerId,
        customerName: c.customerName,
        amount: c[breakdownDialog.type as keyof CustomerRevenue] as number,
      }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  };

  const filteredCustomers = overviewData?.customers?.filter(c =>
    !searchQuery || c.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[350px] w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
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
      <RevenueChart year={year} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("revenue.selectedMonthTotal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-selected-month-total">
              ${(overviewData?.selectedMonthTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {monthNames[month - 1]} {year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("revenue.ytdTotal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-ytd-total">
              ${(overviewData?.yearToDateTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("revenue.janToMonth", { month: monthNames[month - 1] })} {year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("revenue.fullYearTotal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold" data-testid="text-full-year-total">
              ${(overviewData?.fullYearTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("revenue.janToDec", { year })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("revenue.maintenanceRevenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{monthNames[month - 1]}</span>
                <button
                  onClick={() => openBreakdownDialog('maintenanceMonth', t("revenue.maintenanceMonth", { month: `${monthNames[month - 1]} ${year}` }))}
                  className="font-semibold text-primary hover:underline cursor-pointer"
                  data-testid="button-maintenance-month"
                >
                  ${(overviewData?.maintenanceRevenue?.month ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t("revenue.ytdTotal")}</span>
                <button
                  onClick={() => openBreakdownDialog('maintenanceYtd', t("revenue.maintenanceYtd", { year }))}
                  className="font-semibold text-primary hover:underline cursor-pointer"
                  data-testid="button-maintenance-ytd"
                >
                  ${(overviewData?.maintenanceRevenue?.ytd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
              <div className="flex justify-between items-center border-t pt-2">
                <span className="text-sm text-muted-foreground">{t("revenue.fullYearTotal")}</span>
                <button
                  onClick={() => openBreakdownDialog('maintenanceAnnual', t("revenue.maintenanceFullYear", { year }))}
                  className="font-bold text-lg text-primary hover:underline cursor-pointer"
                  data-testid="button-maintenance-annual"
                >
                  ${(overviewData?.maintenanceRevenue?.annual ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("revenue.chemicalRevenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{monthNames[month - 1]}</span>
                <button
                  onClick={() => openBreakdownDialog('chemicalMonth', `${t("revenue.chemicalRevenue")} - ${monthNames[month - 1]} ${year}`)}
                  className="font-semibold text-primary hover:underline cursor-pointer"
                  data-testid="button-chemical-month"
                >
                  ${(overviewData?.chemicalRevenue?.month ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t("revenue.ytdTotal")}</span>
                <button
                  onClick={() => openBreakdownDialog('chemicalYtd', `${t("revenue.chemicalRevenue")} - YTD ${year}`)}
                  className="font-semibold text-primary hover:underline cursor-pointer"
                  data-testid="button-chemical-ytd"
                >
                  ${(overviewData?.chemicalRevenue?.ytd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
              <div className="flex justify-between items-center border-t pt-2">
                <span className="text-sm text-muted-foreground">{t("revenue.fullYearTotal")}</span>
                <button
                  onClick={() => openBreakdownDialog('chemicalAnnual', `${t("revenue.chemicalRevenue")} - ${t("revenue.fullYearTotal")} ${year}`)}
                  className="font-bold text-lg text-primary hover:underline cursor-pointer"
                  data-testid="button-chemical-annual"
                >
                  ${(overviewData?.chemicalRevenue?.annual ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("customers.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("revenue.noCustomersFound")}</p>
          ) : (
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium">{t("customers.title")}</th>
                    <th className="text-right p-3 text-xs font-medium">
                      {t("revenue.monthRevenue", { month: monthNames[month - 1] })}
                    </th>
                    <th className="text-right p-3 text-xs font-medium">{t("revenue.annualProjection")}</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
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

      <Dialog
        open={breakdownDialog.open}
        onOpenChange={(open) => setBreakdownDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-breakdown-title">{breakdownDialog.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {getCustomerBreakdown().length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("revenue.noCustomersContribute")}
              </p>
            ) : (
              <div className="space-y-2">
                {getCustomerBreakdown().map((customer, index) => (
                  <div
                    key={customer.customerId}
                    className="flex justify-between items-center py-2 px-3 rounded-md hover-elevate"
                    data-testid={`row-breakdown-${customer.customerId}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                      <Link href={`/dashboard/customers/${customer.customerId}?tab=revenue`}>
                        <span
                          className="text-sm font-medium text-primary hover:underline cursor-pointer"
                          data-testid={`link-breakdown-customer-${customer.customerId}`}
                        >
                          {customer.customerName}
                        </span>
                      </Link>
                    </div>
                    <span className="text-sm font-semibold" data-testid={`text-breakdown-amount-${customer.customerId}`}>
                      ${customer.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-3 mt-3 flex justify-between items-center px-3">
                  <span className="text-sm font-medium">Total</span>
                  <span className="font-bold" data-testid="text-breakdown-total">
                    ${getCustomerBreakdown().reduce((sum, c) => sum + c.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
