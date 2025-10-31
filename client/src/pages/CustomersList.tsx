import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Eye, Edit } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import emptyCustomersImage from "@assets/generated_images/Empty_customers_state_illustration_84171f59.png";
import { Link } from "wouter";

const mockCustomers = [
  {
    id: "1",
    name: "Riverside Homeowners Association",
    status: "active" as const,
    properties: 12,
    lastActivity: "2024-03-10",
  },
  {
    id: "2",
    name: "Greenfield Corporate Park",
    status: "active" as const,
    properties: 3,
    lastActivity: "2024-03-09",
  },
  {
    id: "3",
    name: "Sunset Gardens LLC",
    status: "prospect" as const,
    properties: 1,
    lastActivity: "2024-03-08",
  },
  {
    id: "4",
    name: "Oak Valley Estates",
    status: "active" as const,
    properties: 8,
    lastActivity: "2024-03-05",
  },
  {
    id: "5",
    name: "Mountain View Retail Center",
    status: "inactive" as const,
    properties: 2,
    lastActivity: "2024-02-15",
  },
];

export default function CustomersList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customers] = useState(mockCustomers);

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = customer.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your customer accounts
          </p>
        </div>
        <Button data-testid="button-add-customer">
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredCustomers.length === 0 ? (
        <EmptyState
          image={emptyCustomersImage}
          title="No customers found"
          description="Try adjusting your search or filters, or add a new customer to get started."
          actionLabel="Add Customer"
          onAction={() => console.log("Add customer")}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Properties</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={customer.status} />
                  </TableCell>
                  <TableCell>{customer.properties}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(customer.lastActivity).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild data-testid={`button-view-${customer.id}`}>
                        <Link href={`/customers/${customer.id}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" data-testid={`button-edit-${customer.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
