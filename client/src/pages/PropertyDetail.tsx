import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit, Plus, FileText, Ticket as TicketIcon } from "lucide-react";
import { Link } from "wouter";

export default function PropertyDetail() {
  const property = {
    id: "1",
    name: "Main Entrance",
    customer: "Riverside Homeowners Association",
    customerId: "1",
    address: "1234 River Road, Riverside, CA 92501",
    acres: 2.5,
    complexity: 3,
    active: true,
    notes: "Irrigation system installed 2022. Seasonal flower rotation required.",
  };

  const contracts = [
    {
      id: "1",
      serviceType: "Maintenance",
      status: "active" as const,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      monthlyAmount: "$2,450",
    },
    {
      id: "2",
      serviceType: "Chemical Application",
      status: "active" as const,
      startDate: "2024-04-01",
      endDate: "2024-10-31",
      monthlyAmount: "$450",
    },
  ];

  const tickets = [
    {
      id: "1",
      title: "Sprinkler head replacement needed",
      priority: "normal",
      status: "open" as const,
      dueDate: "2024-03-15",
    },
    {
      id: "2",
      title: "Spring mulch application",
      priority: "low",
      status: "in_progress" as const,
      dueDate: "2024-03-20",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-property-name">
              {property.name}
            </h1>
            {property.active && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Customer:{" "}
            <Link href={`/customers/${property.customerId}`} className="text-primary hover:underline">
              {property.customer}
            </Link>
          </p>
        </div>
        <Button data-testid="button-edit-property">
          <Edit className="w-4 h-4 mr-2" />
          Edit Property
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Property Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Address</p>
              <p className="text-sm">{property.address}</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Size</p>
              <p className="text-sm">{property.acres} acres</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Complexity Score</p>
              <Badge
                variant="secondary"
                className={
                  property.complexity <= 2
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : property.complexity <= 3
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                }
              >
                {property.complexity}/5
              </Badge>
            </div>
            {property.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{property.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">Active Contracts</CardTitle>
            <Button variant="ghost" size="icon" data-testid="button-add-contract">
              <Plus className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {contracts.map((contract) => (
              <div key={contract.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{contract.serviceType}</p>
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    Active
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(contract.startDate).toLocaleDateString()} -{" "}
                  {new Date(contract.endDate).toLocaleDateString()}
                </p>
                <p className="text-sm font-medium">{contract.monthlyAmount}/month</p>
                {contract.id !== contracts[contracts.length - 1].id && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">Recent Tickets</CardTitle>
            <Button variant="ghost" size="icon" data-testid="button-add-ticket">
              <Plus className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="space-y-1">
                <p className="text-sm font-medium">{ticket.title}</p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      ticket.status === "open"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                    }
                  >
                    {ticket.status.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Due: {new Date(ticket.dueDate).toLocaleDateString()}
                  </span>
                </div>
                {ticket.id !== tickets[tickets.length - 1].id && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
