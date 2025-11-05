import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export function RevenueChart() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short' });
  
  const { data: revenueData, isLoading } = useQuery<{ month: string; revenue: number }[]>({
    queryKey: [`/api/dashboard/monthly-revenue?year=${currentYear}`],
  });

  if (isLoading) {
    return (
      <Card data-testid="card-revenue-chart">
        <CardHeader>
          <CardTitle>Monthly Revenue</CardTitle>
          <CardDescription>Revenue breakdown for {currentYear}</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Loading chart data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!revenueData || revenueData.length === 0) {
    return (
      <Card data-testid="card-revenue-chart">
        <CardHeader>
          <CardTitle>Monthly Revenue</CardTitle>
          <CardDescription>Revenue breakdown for {currentYear}</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">No revenue data available</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card data-testid="card-revenue-chart">
      <CardHeader>
        <CardTitle>Monthly Revenue</CardTitle>
        <CardDescription>Revenue breakdown for {currentYear}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={formatCurrency}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number) => [formatCurrency(value), 'Revenue']}
            />
            <ReferenceLine 
              x={currentMonth} 
              stroke="hsl(var(--primary))" 
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{ 
                value: 'Current Month', 
                position: 'top',
                fill: 'hsl(var(--primary))',
                fontSize: 12,
              }}
            />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
