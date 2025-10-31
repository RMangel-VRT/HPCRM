import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, FileText, Ticket, DollarSign, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const stats = [
    { title: "Active Customers", value: "124", icon: Users, change: "+12%" },
    { title: "Properties", value: "289", icon: Building2, change: "+8%" },
    { title: "Active Contracts", value: "156", icon: FileText, change: "+5%" },
    { title: "Open Tickets", value: "23", icon: Ticket, change: "-15%" },
    { title: "Monthly Revenue", value: "$48,750", icon: DollarSign, change: "+18%" },
    { title: "YTD Revenue", value: "$425,200", icon: TrendingUp, change: "+22%" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your landscaping business
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid={`text-stat-value-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className={stat.change.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {stat.change}
                </span>
                {' '}from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { text: "New contract signed with Riverside HOA", time: "2 hours ago" },
                { text: "Property inspection completed at Oak Valley", time: "5 hours ago" },
                { text: "Ticket #142 closed - Sprinkler repair", time: "1 day ago" },
                { text: "New customer added - Sunset Gardens LLC", time: "2 days ago" },
              ].map((activity, i) => (
                <div key={i} className="flex justify-between items-start text-sm">
                  <p className="text-foreground">{activity.text}</p>
                  <span className="text-muted-foreground text-xs whitespace-nowrap ml-4">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { text: "Spring cleanup at Maple Ridge", date: "Tomorrow" },
                { text: "Quarterly review with Greenfield Corp", date: "Mar 15" },
                { text: "Chemical application - Zone 3", date: "Mar 18" },
                { text: "Equipment maintenance scheduled", date: "Mar 20" },
              ].map((task, i) => (
                <div key={i} className="flex justify-between items-start text-sm">
                  <p className="text-foreground">{task.text}</p>
                  <span className="text-muted-foreground text-xs whitespace-nowrap ml-4">
                    {task.date}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
