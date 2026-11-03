import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer } from "@shared/schema";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Search, Eye, MapPin, Archive, ArchiveRestore, ArrowUpDown, ArrowUp, ArrowDown, Trash2, ChevronRight, ChevronDown, Building2, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { CustomersViewSwitcher } from "@/components/customer/CustomersViewSwitcher";
import emptyCustomersImage from "@assets/generated_images/Empty_customers_state_illustration_84171f59.png";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SortColumn = "name" | "city" | "status" | "acres" | "complexity" | null;
type SortDirection = "asc" | "desc";

function SortableHeader({ 
  column, 
  label, 
  currentSort, 
  currentDirection, 
  onSort 
}: { 
  column: SortColumn; 
  label: string; 
  currentSort: SortColumn; 
  currentDirection: SortDirection; 
  onSort: (col: SortColumn) => void;
}) {
  const isActive = currentSort === column;
  return (
    <TableHead 
      className="cursor-pointer select-none hover-elevate" 
      onClick={() => onSort(column)}
      data-testid={`sort-header-${column}`}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentDirection === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
}

export default function CustomersList() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [, navigate] = useLocation();
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const { toast } = useToast();

  useSetBreadcrumbs([
    { label: t("customers.title") },
  ], []);

  const { data: customersResult, isLoading } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers?page=1&limit=200"],
  });
  const customers = customersResult?.customers ?? [];

  const archiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/customers/${id}`, { active: active ? "true" : "false" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return (
            typeof key === "string" &&
            (key === "/api/customers" ||
              key.startsWith("/api/customers?") ||
              key.startsWith("/api/customers/"))
          );
        },
      });
      toast({
        title: t("common.success"),
        description: t("customers.updated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("customers.updateFailed"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return (
            typeof key === "string" &&
            (key === "/api/customers" ||
              key.startsWith("/api/customers?") ||
              key.startsWith("/api/customers/"))
          );
        },
      });
      toast({
        title: t("common.success"),
        description: t("customers.deleted"),
      });
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("customers.deleteFailed"),
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteMutation.mutate(customerToDelete.id);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const customersById = useMemo(() => customers.reduce<Record<string, Customer>>((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {}), [customers]);

  const childrenByParent = useMemo(() => customers.reduce<Record<string, Customer[]>>((acc, c) => {
    if (c.parentCustomerId) {
      if (!acc[c.parentCustomerId]) acc[c.parentCustomerId] = [];
      acc[c.parentCustomerId].push(c);
    }
    return acc;
  }, {}), [customers]);

  const parentIdsWithChildren = useMemo(() => {
    const ids = new Set<string>();
    for (const [parentId, children] of Object.entries(childrenByParent)) {
      if (children.length > 0) ids.add(parentId);
    }
    return ids;
  }, [childrenByParent]);

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [hasInitializedExpand, setHasInitializedExpand] = useState(false);

  useEffect(() => {
    if (!hasInitializedExpand && parentIdsWithChildren.size > 0) {
      setExpandedParents(new Set(parentIdsWithChildren));
      setHasInitializedExpand(true);
    }
  }, [parentIdsWithChildren, hasInitializedExpand]);

  const toggleParentExpand = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const topLevelCustomers = customers.filter(c => !c.parentCustomerId);

  const applyFilter = (customer: Customer) => {
    const matchesSearch = customer.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    const matchesArchived = showArchived || customer.active === "true";
    return matchesSearch && matchesStatus && matchesArchived;
  };

  const filteredTopLevel = topLevelCustomers.filter(c => {
    const selfMatch = applyFilter(c);
    if (selfMatch) return true;
    const children = childrenByParent[c.id] || [];
    return children.some(child => applyFilter(child));
  });

  const sortCustomers = (list: Customer[]) => {
    return [...list].sort((a, b) => {
      if (!sortColumn) return 0;
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortColumn) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "city":
          aVal = `${a.city}, ${a.state}`.toLowerCase();
          bVal = `${b.city}, ${b.state}`.toLowerCase();
          break;
        case "status":
          aVal = a.status.toLowerCase();
          bVal = b.status.toLowerCase();
          break;
        case "acres":
          aVal = parseFloat(a.acres || "0") || 0;
          bVal = parseFloat(b.acres || "0") || 0;
          break;
        case "complexity":
          aVal = parseInt(a.complexityScore || "0") || 0;
          bVal = parseInt(b.complexityScore || "0") || 0;
          break;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  const sortedTopLevel = sortCustomers(filteredTopLevel);

  const buildDisplayRows = () => {
    const rows: { customer: Customer; isChild: boolean; isParent: boolean; childCount: number }[] = [];
    for (const c of sortedTopLevel) {
      const children = childrenByParent[c.id] || [];
      const isParent = c.isParent === "true" || children.length > 0;
      rows.push({ customer: c, isChild: false, isParent, childCount: children.length });
      if (isParent && expandedParents.has(c.id)) {
        const filteredChildren = children.filter(applyFilter);
        const sortedChildren = sortCustomers(filteredChildren);
        for (const child of sortedChildren) {
          rows.push({ customer: child, isChild: true, isParent: false, childCount: 0 });
        }
      }
    }
    return rows;
  };

  const displayRows = buildDisplayRows();
  const totalFiltered = filteredTopLevel.length;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CustomersViewSwitcher active="list" />
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("customers.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("customers.manage")}
          </p>
        </div>
        <Button onClick={() => navigate("/dashboard/customers/new")} data-testid="button-add-customer">
          <Plus className="w-4 h-4 mr-2" />
          {t("customers.addCustomer")}
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("customers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")} {t("common.status")}</SelectItem>
            <SelectItem value="active">{t("statuses.active")}</SelectItem>
            <SelectItem value="prospect">{t("statuses.prospect")}</SelectItem>
            <SelectItem value="inactive">{t("statuses.inactive")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
            data-testid="toggle-show-archived"
          />
          <Label htmlFor="show-archived" className="text-sm cursor-pointer">
            {t("customers.showArchived")}
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : totalFiltered === 0 ? (
        <EmptyState
          image={emptyCustomersImage}
          title={t("customers.noCustomersFound")}
          description={t("customers.tryAdjusting")}
          actionLabel={t("customers.addCustomer")}
          onAction={() => navigate("/dashboard/customers/new")}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader column="name" label={t("customers.customerName")} currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                <SortableHeader column="city" label={t("common.address")} currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                <SortableHeader column="status" label={t("common.status")} currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                <TableHead>Ranking</TableHead>
                <SortableHeader column="acres" label={t("customers.acres")} currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                <SortableHeader column="complexity" label={t("customers.complexity")} currentSort={sortColumn} currentDirection={sortDirection} onSort={handleSort} />
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map(({ customer, isChild, isParent, childCount }) => (
                <TableRow 
                  key={customer.id} 
                  data-testid={`row-customer-${customer.id}`}
                  className={isChild ? "bg-muted/30" : ""}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {isParent ? (
                        <button
                          onClick={() => toggleParentExpand(customer.id)}
                          className="p-0.5 rounded hover-elevate"
                          data-testid={`button-expand-${customer.id}`}
                        >
                          {expandedParents.has(customer.id) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      ) : isChild ? (
                        <span className="w-5 flex justify-center text-muted-foreground">
                          <GitBranch className="w-3.5 h-3.5" />
                        </span>
                      ) : null}
                      {isParent && (
                        <Building2 className="w-4 h-4 text-primary" />
                      )}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span>{customer.name}</span>
                          {customer.customerType === "hoa" && (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-hoa-${customer.id}`}>
                              HOA
                            </Badge>
                          )}
                          {isParent && childCount > 0 && (
                            <Badge variant="secondary" className="text-xs ml-1">
                              {childCount} {childCount === 1 ? "branch" : "branches"}
                            </Badge>
                          )}
                        </div>
                        {isChild && customer.parentCustomerId && customersById[customer.parentCustomerId] && (
                          <Link
                            href={`/dashboard/customers/${customer.parentCustomerId}`}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            data-testid={`link-parent-group-${customer.id}`}
                          >
                            Part of {customersById[customer.parentCustomerId].name}
                          </Link>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{customer.city}, {customer.state}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={customer.status} />
                  </TableCell>
                  <TableCell>
                    {(!customer.ranking || customer.ranking === "standard") ? (
                      <Badge variant="outline" className="text-xs" data-testid={`badge-ranking-${customer.id}`}>Standard</Badge>
                    ) : customer.ranking === "preferred" ? (
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-ranking-${customer.id}`}>Preferred</Badge>
                    ) : (
                      <Badge variant="default" className="text-xs" data-testid={`badge-ranking-${customer.id}`}>Key Account</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.acres || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.complexityScore ? `Level ${customer.complexityScore}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" asChild data-testid={`button-view-${customer.id}`}>
                        <Link href={`/dashboard/customers/${customer.id}`}>
                          <Eye className="w-4 h-4 mr-2" />
                          {t("common.view")}
                        </Link>
                      </Button>
                      {!isParent && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => archiveMutation.mutate({
                              id: customer.id,
                              active: customer.active === "false"
                            })}
                            disabled={archiveMutation.isPending}
                            data-testid={`button-archive-${customer.id}`}
                          >
                            {customer.active === "false" ? (
                              <>
                                <ArchiveRestore className="w-4 h-4 mr-2" />
                                {t("customers.unarchive")}
                              </>
                            ) : (
                              <>
                                <Archive className="w-4 h-4 mr-2" />
                                {t("customers.archive")}
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(customer)}
                            data-testid={`button-delete-${customer.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.deleteCustomer")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("customers.deleteConfirm", { name: customerToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
