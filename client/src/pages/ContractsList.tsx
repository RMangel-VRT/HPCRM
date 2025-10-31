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
import { FileText } from "lucide-react";
import { Link } from "wouter";

const mockContracts = [
  {
    id: "1",
    property: "Main Entrance - Riverside HOA",
    serviceType: "Maintenance",
    billingSchedule: "Monthly",
    status: "active" as const,
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    annualValue: "$29,400",
  },
  {
    id: "2",
    property: "Corporate Campus - Greenfield Corp",
    serviceType: "Chemical Application",
    billingSchedule: "Seasonal",
    status: "active" as const,
    startDate: "2024-04-01",
    endDate: "2024-10-31",
    annualValue: "$3,150",
  },
  {
    id: "3",
    property: "Community Park - Riverside HOA",
    serviceType: "Irrigation",
    billingSchedule: "12 of 12",
    status: "paused" as const,
    startDate: "2023-01-01",
    endDate: "2023-12-31",
    annualValue: "$12,000",
  },
];

export default function ContractsList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contracts] = useState(mockContracts);

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch = contract.property.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || contract.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Contracts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage service contracts and billing
          </p>
        </div>
        <Button data-testid="button-add-contract">
          <Plus className="w-4 h-4 mr-2" />
          New Contract
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contracts..."
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
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredContracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No contracts found"
          description="Try adjusting your search or filters, or create a new contract."
          actionLabel="New Contract"
          onAction={() => console.log("New contract")}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Annual Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContracts.map((contract) => (
                <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                  <TableCell className="font-medium">{contract.property}</TableCell>
                  <TableCell>{contract.serviceType}</TableCell>
                  <TableCell className="text-muted-foreground">{contract.billingSchedule}</TableCell>
                  <TableCell>
                    <StatusBadge status={contract.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(contract.startDate).toLocaleDateString()} -{" "}
                    {new Date(contract.endDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium">{contract.annualValue}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild data-testid={`button-view-${contract.id}`}>
                        <Link href={`/contracts/${contract.id}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" data-testid={`button-edit-${contract.id}`}>
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
