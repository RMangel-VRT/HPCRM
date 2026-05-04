import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Users, FileText, TicketIcon, DollarSign, MessageSquare, CheckSquare, ArrowRight, Activity, Settings, Edit2, UserMinus, UserPlus, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import type { Customer } from "@shared/schema";

interface ParentRollupData {
  parent: Customer;
  children: {
    id: string;
    name: string;
    activeContracts: number;
    openTickets: number;
    annualRevenue: number;
    lastCommunication: string | null;
  }[];
  totals: {
    activeContracts: number;
    openTickets: number;
    annualRevenue: number;
    recentCommunications: number;
    completedWorkOrdersYtd: number;
  };
  recentActivity: {
    type: "communication" | "completion" | "status_change";
    id: string;
    date: string | null;
    title: string;
    subtitle: string;
    childId: string;
    childName: string;
  }[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatLastComm(date: string | null) {
  if (!date) return "—";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "—";
  }
}

interface Props {
  customer: Customer & { childCustomers?: Customer[] };
}

export default function ParentCustomerDashboard({ customer }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("children");
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(customer.name);
  const [linkCandidate, setLinkCandidate] = useState<{ id: string; name: string } | null>(null);
  const [unlinkTargetId, setUnlinkTargetId] = useState<string | null>(null);

  const { data: rollup, isLoading } = useQuery<ParentRollupData>({
    queryKey: ["/api/customers", customer.id, "parent-rollup"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customer.id}/parent-rollup`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load rollup data");
      return res.json();
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("PATCH", `/api/customers/${customer.id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setIsRenameOpen(false);
      toast({ title: "Name updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update name", variant: "destructive" });
    },
  });

  const linkChildMutation = useMutation({
    mutationFn: (childId: string) =>
      apiRequest("PATCH", `/api/customers/${childId}`, { parentCustomerId: customer.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id, "parent-rollup"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setLinkCandidate(null);
      toast({ title: "Child property linked successfully" });
    },
    onError: () => {
      toast({ title: "Failed to link child property", variant: "destructive" });
    },
  });

  const unlinkChildMutation = useMutation({
    mutationFn: (childId: string) =>
      apiRequest("PATCH", `/api/customers/${childId}`, { parentCustomerId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id, "parent-rollup"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setUnlinkTargetId(null);
      toast({ title: "Child property unlinked" });
    },
    onError: () => {
      toast({ title: "Failed to unlink child property", variant: "destructive" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/customers/${customer.id}`, { isParent: "false" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id] });
      navigate(`/dashboard/customers/${customer.id}`);
      toast({ title: "Converted to regular customer" });
    },
    onError: () => {
      toast({ title: "Failed to convert customer", variant: "destructive" });
    },
  });

  const childCount = rollup?.children.length ?? customer.childCustomers?.length ?? 0;
  const currentChildIds = rollup?.children.map(c => c.id) ?? [];

  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary flex-shrink-0" />
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-parent-customer-name">
              {customer.name}
            </h1>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { setRenameValue(customer.name); setIsRenameOpen(true); }}
              data-testid="button-rename-parent"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" data-testid="badge-parent-account">
              Parent Group
            </Badge>
            <span className="text-sm text-muted-foreground" data-testid="text-child-count">
              {childCount} {childCount === 1 ? "property" : "properties"}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : rollup ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card data-testid="card-stat-active-contracts">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-medium">Active Contracts</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-stat-active-contracts">
                    {rollup.totals.activeContracts}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-open-tickets">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <TicketIcon className="w-4 h-4" />
                    <span className="text-xs font-medium">Open Tickets</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-stat-open-tickets">
                    {rollup.totals.openTickets}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-annual-revenue">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium">Annual Revenue</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-stat-annual-revenue">
                    {formatCurrency(rollup.totals.annualRevenue)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-recent-comms">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-xs font-medium">Comms (30 days)</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-stat-recent-comms">
                    {rollup.totals.recentCommunications}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-work-orders-ytd">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckSquare className="w-4 h-4" />
                    <span className="text-xs font-medium">Work Orders YTD</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-stat-work-orders-ytd">
                    {rollup.totals.completedWorkOrdersYtd}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList data-testid="tabs-parent-dashboard">
              <TabsTrigger value="children" data-testid="tab-children">
                <Users className="w-4 h-4 mr-1.5" />
                Children ({rollup.children.length})
              </TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">
                <Activity className="w-4 h-4 mr-1.5" />
                Recent Activity
              </TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">
                <Settings className="w-4 h-4 mr-1.5" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="children" className="mt-4">
              {rollup.children.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                    <Users className="w-10 h-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">No child properties linked to this group</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-center">Active Contracts</TableHead>
                        <TableHead className="text-center">Open Tickets</TableHead>
                        <TableHead className="text-right">Annual Revenue</TableHead>
                        <TableHead>Last Communication</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rollup.children.map(child => (
                        <TableRow key={child.id} data-testid={`row-child-${child.id}`}>
                          <TableCell className="font-medium" data-testid={`text-child-name-${child.id}`}>
                            {child.name}
                          </TableCell>
                          <TableCell className="text-center" data-testid={`text-child-contracts-${child.id}`}>
                            {child.activeContracts}
                          </TableCell>
                          <TableCell className="text-center" data-testid={`text-child-tickets-${child.id}`}>
                            {child.openTickets}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-child-revenue-${child.id}`}>
                            {formatCurrency(child.annualRevenue)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm" data-testid={`text-child-last-comm-${child.id}`}>
                            {formatLastComm(child.lastCommunication)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/dashboard/customers/${child.id}`}>
                              <Button size="icon" variant="ghost" data-testid={`button-view-child-${child.id}`}>
                                <ArrowRight className="w-4 h-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Activity (Last 10 Events)</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {rollup.recentActivity.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Activity className="w-10 h-10 text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">No recent activity across child properties</p>
                    </div>
                  ) : (
                    <div className="space-y-3" data-testid="list-recent-activity">
                      {rollup.recentActivity.map((item, idx) => (
                        <div
                          key={`${item.type}-${item.id}-${idx}`}
                          className="flex items-start gap-3 py-2 border-b last:border-0"
                          data-testid={`activity-item-${item.type}-${item.id}`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {item.type === "communication" ? (
                              <MessageSquare className="w-4 h-4 text-muted-foreground" />
                            ) : item.type === "completion" ? (
                              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <RefreshCw className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate" data-testid={`text-activity-title-${item.id}`}>
                                {item.title}
                              </span>
                              <Badge variant="outline" className="text-xs flex-shrink-0" data-testid={`badge-activity-child-${item.id}`}>
                                {item.childName}
                              </Badge>
                            </div>
                            {item.date && (
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                          <Link href={`/dashboard/customers/${item.childId}`}>
                            <Button size="icon" variant="ghost" className="flex-shrink-0" data-testid={`button-activity-view-${item.id}`}>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
              <div className="space-y-4 max-w-lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Group Name</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 flex items-center gap-2">
                    <span className="text-sm flex-1" data-testid="text-settings-name">{customer.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setRenameValue(customer.name); setIsRenameOpen(true); }}
                      data-testid="button-settings-rename"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                      Rename
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Child Properties</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {rollup.children.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No child properties linked.</p>
                    ) : (
                      rollup.children.map(child => (
                        <div key={child.id} className="flex items-center justify-between gap-2" data-testid={`row-settings-child-${child.id}`}>
                          <span className="text-sm">{child.name}</span>
                          <div className="flex items-center gap-1">
                            <Link href={`/dashboard/customers/${child.id}`}>
                              <Button size="sm" variant="ghost" data-testid={`button-settings-view-child-${child.id}`}>
                                View
                              </Button>
                            </Link>
                            <AlertDialog
                              open={unlinkTargetId === child.id}
                              onOpenChange={open => setUnlinkTargetId(open ? child.id : null)}
                            >
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  data-testid={`button-unlink-child-${child.id}`}
                                >
                                  <UserMinus className="w-3.5 h-3.5 mr-1" />
                                  Unlink
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Unlink "{child.name}"?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove "{child.name}" from the "{customer.name}" group. The property will become a standalone customer.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => unlinkChildMutation.mutate(child.id)}
                                    data-testid={`button-confirm-unlink-${child.id}`}
                                  >
                                    {unlinkChildMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : "Unlink"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))
                    )}

                    <div className="pt-2 border-t space-y-2">
                      <p className="text-sm font-medium">Link a property to this group</p>
                      <CustomerSearchInput
                        mode="any"
                        placeholder="Search for a customer to add..."
                        testId="input-link-child-search"
                        excludeIds={[customer.id, ...currentChildIds]}
                        selectedId={linkCandidate?.id}
                        selectedCustomerName={linkCandidate?.name ?? ""}
                        onSelect={c => setLinkCandidate(c.id ? c : null)}
                      />
                      {linkCandidate && (
                        <div className="flex items-center gap-2" data-testid="row-link-candidate">
                          <span className="text-sm flex-1">{linkCandidate.name}</span>
                          <Button
                            size="sm"
                            onClick={() => linkChildMutation.mutate(linkCandidate.id)}
                            disabled={linkChildMutation.isPending}
                            data-testid="button-confirm-link-child"
                          >
                            {linkChildMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Link
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {rollup.children.length === 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Convert to Regular Customer</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground mb-3">
                        This group has no child properties. You can convert it to a regular customer account.
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-convert-to-customer">
                            Convert to Regular Customer
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Convert to Regular Customer?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the parent group designation from "{customer.name}" and convert it to a regular customer account.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => convertMutation.mutate()}
                              data-testid="button-confirm-convert"
                            >
                              Convert
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Parent Group</DialogTitle>
            <DialogDescription>
              Update the name of this parent customer group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              data-testid="input-rename-parent"
              onKeyDown={e => {
                if (e.key === "Enter" && renameValue.trim()) {
                  renameMutation.mutate(renameValue.trim());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)} data-testid="button-rename-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => renameValue.trim() && renameMutation.mutate(renameValue.trim())}
              disabled={!renameValue.trim() || renameMutation.isPending}
              data-testid="button-rename-save"
            >
              {renameMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
