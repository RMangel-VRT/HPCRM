import { useState, useRef, useMemo, useEffect } from "react";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { useTabParam } from "@/hooks/useTabParam";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer, Contact, Note, Contract, ContractDocument, ContractMonthlyAmount, CustomerRateSheet, InsertNote, CustomerMapLayer, PropertyManagementCompany, PropertyManager, Ticket, SnowEvent, SnowEventPropertyImpact, ProposalWithDetails, CustomerServicePlan } from "@shared/schema";
import { insertNoteSchema } from "@shared/schema";
import { CustomerContracts } from "@/components/contracts/CustomerContracts";
import { CustomerContractPanel } from "@/components/customer/CustomerContractPanels";
import { useCustomerContractSummary } from "@/hooks/useCustomerContractSummary";
import { useCustomerServices, classifyCustomerService } from "@/hooks/useCustomerServices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Edit, Plus, Users, FileText, MessageSquare, MapPin, BarChart3, Upload, Download, Eye, Paperclip, History, RefreshCw, DollarSign, Map, Layers, Trash2, X, Ticket as TicketIcon, Building, Building2, Check, Loader2, Copy, Mail, Clock, AlertCircle, CheckCircle2, GitBranch, Snowflake, ChevronDown, Settings, Wrench } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { DatePickerField } from "@/components/DatePickerField";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";
import { useAuth } from "@/hooks/use-auth";
import { useAccountManagers } from "@/hooks/use-account-managers";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContractServices from "@/components/ContractServices";
import ScheduleSummary from "@/components/ScheduleSummary";
import { CustomerSubNav as CustomerRailSidebar } from "@/components/customer/CustomerSubNav";
import LayerMapViewer from "@/components/LayerMapViewer";
import CustomerSchedulingSection from "@/components/CustomerSchedulingSection";
import ServiceFulfillmentPanel from "@/components/ServiceFulfillmentPanel";
import TicketListView from "@/components/TicketListView";
import CustomerLocationEditor from "@/components/CustomerLocationEditor";
import CommunicationListTab from "@/components/CommunicationListTab";
import CustomerServiceChecklist from "@/components/CustomerServiceChecklist";
import AnnualServiceRollup from "@/components/AnnualServiceRollup";
import CustomerDashboard from "@/components/customer/dashboard/CustomerDashboard";
import ParentCustomerDashboard from "@/pages/ParentCustomerDashboard";
import QboCustomerCard from "@/components/qbo/QboCustomerCard";
import SiteDetailsCard from "@/components/customer/SiteDetailsCard";
import { FinishSetupBanner } from "@/components/customerWizard/FinishSetupBanner";
import {
  recordRecentCustomer,
  removeRecentCustomer,
} from "@/lib/last-viewed-customer";

interface ContractCardProps {
  contract: Contract;
  customerId: string;
  formatFileSize: (bytes: number) => string;
  setShowVersionHistory: (contractId: string | null) => void;
  highlight?: boolean;
}

export function ContractCard({ contract, customerId, formatFileSize, setShowVersionHistory, highlight }: ContractCardProps) {
  const { t } = useTranslation();
  const { data: currentDocument, isLoading } = useQuery<ContractDocument>({
    queryKey: ["/api/contracts", contract.id, "documents", "current"],
  });
  
  const { data: rateSheet } = useQuery<CustomerRateSheet | null>({
    queryKey: ["/api/customers", customerId, "rate-sheet"],
  });
  
  const { data: monthlyAmounts = [], isLoading: isLoadingAmounts } = useQuery<ContractMonthlyAmount[]>({
    queryKey: ["/api/contracts", contract.id, "monthly-amounts"],
  });
  
  const monthNames = [t("months.jan"), t("months.feb"), t("months.mar"), t("months.apr"), t("months.may"), t("months.jun"), t("months.jul"), t("months.aug"), t("months.sep"), t("months.oct"), t("months.nov"), t("months.dec")];
  const nonZeroAmounts = monthlyAmounts.filter(a => a.amount > 0);
  const billingMode = nonZeroAmounts.length === 12 && nonZeroAmounts.every(a => a.amount === nonZeroAmounts[0].amount) ? "even" : "variable";
  const evenMonthlyAmount = ((nonZeroAmounts[0]?.amount ?? 0) / 100).toFixed(2);
  
  const initializedAmounts = useMemo(() => {
    const amounts: Record<number, string> = {};
    for (let i = 1; i <= 12; i++) {
      const existing = monthlyAmounts.find(a => a.month === i);
      amounts[i] = existing ? (existing.amount / 100).toFixed(2) : "0.00";
    }
    return amounts;
  }, [monthlyAmounts]);
  
  const annualTotal = useMemo(() => {
    if (billingMode === "even") {
      const monthlyVal = parseFloat(evenMonthlyAmount) || 0;
      return monthlyVal * 12;
    }
    const amounts = initializedAmounts;
    return Object.values(amounts).reduce((sum, val) => {
      const num = parseFloat(val) || 0;
      return sum + num;
    }, 0);
  }, [initializedAmounts, billingMode, evenMonthlyAmount]);

  return (
    <Card
      data-testid={`card-contract-${contract.id}`}
      className={highlight ? "ring-2 ring-primary transition-shadow" : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div>
              <p className="font-medium" data-testid={`text-contract-service-${contract.id}`}>
                {contract.serviceType}
              </p>
              <p className="text-sm text-muted-foreground" data-testid={`text-contract-billing-${contract.id}`}>
                {contract.billingPattern}
              </p>
            </div>
            {currentDocument && (
              <Paperclip className="w-4 h-4 text-muted-foreground" data-testid={`icon-has-document-${contract.id}`} />
            )}
          </div>
          <StatusBadge status={contract.status} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div>
            <p className="text-muted-foreground">{t("contracts.startDate")}</p>
            <p data-testid={`text-contract-start-${contract.id}`}>
              {format(new Date(contract.startDate), "MMM d, yyyy")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("contracts.endDate")}</p>
            <p data-testid={`text-contract-end-${contract.id}`}>
              {contract.endDate ? format(new Date(contract.endDate), "MMM d, yyyy") : t("statuses.active")}
            </p>
          </div>
        </div>
        {contract.po && (
          <div className="mb-3 text-sm">
            <p className="text-muted-foreground">{t("contracts.poNumber")}</p>
            <p data-testid={`text-contract-po-${contract.id}`}>{contract.po}</p>
          </div>
        )}

        <Separator className="my-3" />

        <div>
          <p className="text-sm font-medium mb-2">{t("customerDetail.signedAgreement")}</p>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : currentDocument ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-document-filename-${currentDocument.id}`}>
                    {currentDocument.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    v{currentDocument.version} • {formatFileSize(currentDocument.fileSize)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(currentDocument.uploadedAt), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => window.open(currentDocument.storageObjectPath, '_blank')}
                  data-testid={`button-view-document-${currentDocument.id}`}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  {t("common.view")}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = currentDocument.storageObjectPath;
                    link.download = currentDocument.filename;
                    link.click();
                  }}
                  data-testid={`button-download-document-${currentDocument.id}`}
                >
                  <Download className="w-3 h-3 mr-1" />
                  {t("common.download")}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowVersionHistory(contract.id)}
                  data-testid="link-version-history"
                >
                  <History className="w-3 h-3 mr-1" />
                  {t("contracts.history")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 border rounded-md">
              <p className="text-sm text-muted-foreground">{t("customerDetail.noAgreement")}</p>
            </div>
          )}
        </div>

        <Separator className="my-3" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{t("customerDetail.billingTabs.monthlySummary")}</p>
          </div>
          
          {isLoadingAmounts ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {monthNames.map((monthName, index) => {
                    const month = index + 1;
                    const amounts = initializedAmounts;
                    const value = amounts[month] || "0.00";
                    
                    return (
                      <div key={month}>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {monthName}
                        </label>
                          <p className="text-sm font-medium" data-testid={`text-month-${month}`}>
                            ${value}
                          </p>
                      </div>
                    );
                  })}
                </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-sm font-medium">{t("customerDetail.annualTotal")}</p>
                <p className="text-lg font-semibold" data-testid="text-annual-total">
                  ${annualTotal.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-3" />

        <ContractServices contractId={contract.id} canEdit={false} />

        <Separator className="my-3" />

        <ScheduleSummary contractId={contract.id} />

        {rateSheet && (
          <>
            <Separator className="my-3" />
            <div>
              <p className="text-sm font-medium mb-2">{t("customerDetail.appliedRates")}</p>
              <div className="text-xs space-y-1.5 bg-muted/30 p-2 rounded-md">
                {contract.serviceType.toLowerCase().includes('snow') || contract.serviceType.toLowerCase().includes('ice') ? (
                  <>
                    {rateSheet.handShovelLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.handShovel")}:</span>
                        <span className="font-medium">${(rateSheet.handShovelLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.plowTruck !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.plowTruck")}:</span>
                        <span className="font-medium">${(rateSheet.plowTruck / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.atv !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.atv")}:</span>
                        <span className="font-medium">${(rateSheet.atv / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.skidSteer !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.skidSteer")}:</span>
                        <span className="font-medium">${(rateSheet.skidSteer / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.snowBlower !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.snowBlower")}:</span>
                        <span className="font-medium">${(rateSheet.snowBlower / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.iceMeltMaterial !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.iceMeltMaterial")}:</span>
                        <span className="font-medium">${(rateSheet.iceMeltMaterial / 100).toFixed(2)}/lb</span>
                      </div>
                    )}
                    {rateSheet.iceMeltApplicationLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.iceMeltApplication")}:</span>
                        <span className="font-medium">${(rateSheet.iceMeltApplicationLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {rateSheet.generalLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.generalLabor")}:</span>
                        <span className="font-medium">${(rateSheet.generalLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.operatorLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.operatorLabor")}:</span>
                        <span className="font-medium">${(rateSheet.operatorLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.irrigationLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.irrigationLabor")}:</span>
                        <span className="font-medium">${(rateSheet.irrigationLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.emergencyGeneralLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.emergencyGeneral")}:</span>
                        <span className="font-medium">${(rateSheet.emergencyGeneralLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.emergencyIrrigationLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("customerDetail.emergencyIrrigation")}:</span>
                        <span className="font-medium">${(rateSheet.emergencyIrrigationLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

      </CardContent>
    </Card>
  );
}

interface VersionHistoryDialogProps {
  contractId: string | null;
  onClose: () => void;
  formatFileSize: (bytes: number) => string;
}

export function VersionHistoryDialog({ contractId, onClose, formatFileSize }: VersionHistoryDialogProps) {
  const { t } = useTranslation();
  const { data: documents = [], isLoading } = useQuery<ContractDocument[]>({
    queryKey: ["/api/contracts", contractId, "documents"],
    enabled: !!contractId,
  });

  return (
    <Dialog open={!!contractId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("contracts.versionHistory")}</DialogTitle>
          <DialogDescription>
            {t("customerDetail.signedAgreement")}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t("customerDetail.noDocumentsFound")}</p>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customerDetail.version")}</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("customerDetail.size")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">v{doc.version}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{doc.filename}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{formatFileSize(doc.fileSize)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => window.open(doc.storageObjectPath, '_blank')}
                          data-testid={`button-view-document-${doc.id}`}
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = doc.storageObjectPath;
                            link.download = doc.filename;
                            link.click();
                          }}
                          data-testid={`button-download-document-${doc.id}`}
                        >
                          <Download className="w-3 h-3" />
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
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerDetail() {
  const accountManagers = useAccountManagers();
  const { t } = useTranslation();
  const [, params] = useRoute("/dashboard/customers/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const [activeTab, setActiveTab] = useTabParam("overview");
  const [highlightContractId, setHighlightContractId] = useState<string | null>(null);

  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);
  const [showEndedContracts, setShowEndedContracts] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer & { childCustomers?: Customer[]; parentCustomer?: Customer | null }>({
    queryKey: ["/api/customers", id, user?.activeCompanyId, user?.id],
    enabled: !!id && !!user?.activeCompanyId,
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/customers/${id}`, undefined,
      { headers: { "X-Company-Id": user!.activeCompanyId }, signal })).json(),
  });

  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/customers", id, "contacts"],
    enabled: !!id && (activeTab === "contacts" || activeTab === "overview"),
  });

  const { data: notes = [], isLoading: isLoadingNotes } = useQuery<Note[]>({
    queryKey: ["/api/customers", id, "notes"],
    enabled: !!id && (activeTab === "notes" || activeTab === "overview"),
  });

  const summary = useCustomerContractSummary(id);
  const services = useCustomerServices(id);
  // Old contract cards below remain export-compatible for legacy non-customer
  // consumers, but this page never loads or renders legacy commercial records.
  const contracts: Contract[] = [];
  const isLoadingContracts = false;

  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery<Ticket[]>({
    queryKey: ["/api/customers", id, "tickets"],
    enabled: !!id,
  });

  const isPrivilegedUser = user?.accessRole === "admin" || user?.accessRole === "office";

  const { data: customerProposals = [] } = useQuery<ProposalWithDetails[]>({
    queryKey: ["/api/customers", id, "proposals"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}/proposals`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch proposals");
      return res.json();
    },
    enabled: !!id && isPrivilegedUser,
  });

  const openTicketCount = tickets.filter((t) => !t.completedAt).length;
  const pendingProposalCount = customerProposals.filter(
    (p) => p.status !== "accepted" && p.status !== "rejected"
  ).length;
  const activeContractCount = summary.data?.current.length ?? 0;
  const servicePlanItemCount = services.services.filter(s => !["done", "skipped"].includes(s.state)).length;

  // Property Management queries
  const { data: pmCompanies = [] } = useQuery<PropertyManagementCompany[]>({
    queryKey: ["/api/property-management-companies"],
    enabled: activeTab === "settings",
  });
  
  const { data: pmManagers = [] } = useQuery<PropertyManager[]>({
    queryKey: ["/api/property-managers"],
    enabled: activeTab === "settings",
  });

  const { data: customersResult } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers?page=1&limit=200"],
  });
  const allCustomers = customersResult?.customers ?? [];
  const activeCustomersForSwitcher = allCustomers
    .filter((c) => c.active === "true")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));



  const TAB_LABELS: Record<string, string> = {
    overview: t("customerDetail.tabs.overview"),
    contacts: t("customerDetail.tabs.contacts"),
    notes: t("customerDetail.tabs.notes"),
    tickets: t("customerDetail.tabs.tickets"),
    proposals: t("customerDetail.tabs.proposals"),
    "visual-scopes": t("customerDetail.tabs.visualScopes"),
    snow: t("customerDetail.tabs.snow"),
    maps: t("customerDetail.tabs.maps"),
    settings: t("customerDetail.tabs.settings"),
    contracts: t("customerDetail.billingTabs.contracts"),
    "rate-sheet": t("customerDetail.billingTabs.rateSheet"),
    revenue: t("customerDetail.billingTabs.revenue"),
    "monthly-summary": t("customerDetail.billingTabs.monthlySummary"),
    "annual-rollup": t("customerDetail.annualTotal"),
    "service-checklist": t("customerDetail.tabs.scheduling"),
    communications: t("customerDetail.tabs.operations"),
    fulfillment: t("customerDetail.tabs.operations"),
  };

  const activeTabLabel = TAB_LABELS[activeTab] ?? activeTab;
  const isOverview = activeTab === "overview";

  useEffect(() => {
    const customerName = customer?.name;
    if (!customerName) return;
    if (isOverview) {
      document.title = `${customerName} | High Plains Property Maintenance`;
    } else {
      document.title = `${customerName} \u2014 ${activeTabLabel} | High Plains Property Maintenance`;
    }
    return () => {
      document.title = "High Plains Property Maintenance";
    };
  }, [customer?.name, activeTab, activeTabLabel, isOverview]);

  const breadcrumbParent = customer?.parentCustomer ?? null;
  const breadcrumbIsChild = !!customer?.parentCustomerId;

  const breadcrumbItems: { label: string; href?: string }[] = [
    { label: t("customers.title"), href: "/dashboard/customers" },
    ...(breadcrumbIsChild && breadcrumbParent
      ? [{ label: breadcrumbParent.name, href: `/dashboard/customers/${breadcrumbParent.id}?tab=overview` }]
      : []),
    { label: customer?.name || t("common.loading"), href: customer ? `/dashboard/customers/${customer.id}?tab=overview` : undefined },
    ...(!isOverview ? [{ label: activeTabLabel }] : []),
  ];

  useSetBreadcrumbs(breadcrumbItems, [customer?.name, customer?.id, activeTab, activeTabLabel, breadcrumbIsChild, breadcrumbParent?.id, breadcrumbParent?.name]);

  const canEditCustomer = user?.accessRole === "admin" || user?.accessRole === "office";

  // Scroll to and briefly highlight a contract card after navigating from the dashboard
  useEffect(() => {
    if (activeTab === "contracts" && highlightContractId) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-testid="card-contract-${highlightContractId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        const clearTimer = setTimeout(() => {
          setHighlightContractId(null);
        }, 2000);
        return () => clearTimeout(clearTimer);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTab, highlightContractId]);

  // Note management
  const [isAddNoteDialogOpen, setIsAddNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const noteForm = useForm<Omit<InsertNote, "companyId" | "customerId" | "authorId">>({
    resolver: zodResolver(insertNoteSchema.omit({ companyId: true, customerId: true, authorId: true })),
    defaultValues: {
      body: "",
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: Omit<InsertNote, "companyId" | "customerId" | "authorId">) => {
      return apiRequest("POST", `/api/customers/${id}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "notes"] });
      toast({
        title: t("common.success"),
        description: t("customerDetail.noteCreated"),
      });
      setIsAddNoteDialogOpen(false);
      noteForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: extractApiErrorMessage(error) ?? error.message,
        variant: "destructive",
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: Omit<InsertNote, "companyId" | "customerId" | "authorId"> }) => {
      return apiRequest("PATCH", `/api/notes/${noteId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "notes"] });
      toast({
        title: t("common.success"),
        description: t("customerDetail.noteUpdated"),
      });
      setEditingNote(null);
      noteForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: extractApiErrorMessage(error) ?? error.message,
        variant: "destructive",
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "notes"] });
      toast({
        title: t("common.success"),
        description: t("customerDetail.noteDeleted"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: extractApiErrorMessage(error) ?? error.message,
        variant: "destructive",
      });
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  useEffect(() => {
    if (!id) return;
    if (isLoadingCustomer) return;
    if (!customer) {
      removeRecentCustomer(user?.activeCompanyId, id);
      return;
    }
    if (customer.active === "false") {
      removeRecentCustomer(user?.activeCompanyId, customer.id);
      return;
    }
    if (customer.companyId === user?.activeCompanyId) recordRecentCustomer(user?.activeCompanyId, customer.id);
  }, [id, customer, isLoadingCustomer, user?.activeCompanyId]);

  if (isLoadingCustomer) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">{t("customers.noCustomersFound")}</p>
        </div>
      </div>
    );
  }

  const sortedNotes = [...notes].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const calculateCoverage = (contracts: Contract[]) => {
    const now = new Date();
    const currentContracts = contracts.filter(c => {
      if (c.status !== "active") return false;
      
      // Check if contract is within its term
      const startDate = new Date(c.startDate);
      if (startDate > now) return false; // Contract hasn't started yet
      
      if (c.endDate) {
        const endDate = new Date(c.endDate);
        if (endDate < now) return false; // Contract has ended
      }
      
      return true;
    });
    
    const hasMaintenance = currentContracts.some(c => c.serviceType === "Maintenance");
    const hasSnow = currentContracts.some(c => c.serviceType === "Snow");
    
    if (hasMaintenance && hasSnow) {
      return t("customerDetail.coverageMaintAndSnow");
    } else if (hasMaintenance) {
      return t("customerDetail.coverageMaintOnly");
    } else if (hasSnow) {
      return t("customerDetail.coverageSnowOnly");
    } else {
      return t("customerDetail.noCoverage");
    }
  };

  const coverage = summary.isLoading ? t("common.loading") : summary.error ? t("cp1.loadFailed") : summary.data?.coverage.landscape
    ? t(summary.data.coverage.snow ? "cp1.both" : "cp1.landscape")
    : t(summary.data?.coverage.snow ? "cp1.snow" : "cp1.noContract");

  const isChildCustomer = !!customer.parentCustomerId;
  const childCustomers = customer.childCustomers || [];
  const isParentCustomer = customer.isParent === "true" || childCustomers.length > 0;
  const parentCustomer = customer.parentCustomer || null;

  if (customer.isParent === "true") {
    return (
      <div className="flex h-full bg-background">
        <ParentCustomerDashboard customer={customer} />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <CustomerRailSidebar
        customerId={customer.id}
        customerName={customer.name}
        customers={activeCustomersForSwitcher}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userRole={user?.activeRole}
        snowEnabled={summary.data?.coverage.snow ?? false}
        badgeCounts={{
          tickets: openTicketCount,
          proposals: pendingProposalCount,
          billing: activeContractCount,
          fulfillment: servicePlanItemCount,
        }}
      />
      <div className="flex-1 min-w-0 overflow-y-auto space-y-6 p-6 md:p-8">
      <FinishSetupBanner customerId={customer.id} status={customer.status} />
      <div className="flex items-start justify-between gap-4">
      {/* Left column: name/switcher, badges */}
      <div className="flex flex-col gap-1 min-w-0">
        {/* Name / switcher */}
        <div className="flex items-center gap-2">
          {isParentCustomer && (
            <Building2 className="w-6 h-6 text-primary flex-shrink-0" />
          )}
          {activeCustomersForSwitcher.length > 1 ? (
            <Select value={customer.id} onValueChange={(val) => navigate(`/dashboard/customers/${val}`)}>
              <SelectTrigger
                className="w-auto border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0 [&>svg]:hidden gap-1.5 hover:opacity-75 transition-opacity"
                data-testid="select-customer-switcher"
              >
                <span className="text-3xl font-semibold tracking-tight" data-testid="text-customer-name">
                  {customer.name}
                </span>
                <span className="flex-shrink-0"><ChevronDown className="w-5 h-5 text-muted-foreground mt-1" /></span>
              </SelectTrigger>
              <SelectContent>
                {activeCustomersForSwitcher.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`option-customer-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-customer-name">
              {customer.name}
            </h1>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {customer.customerNumber && (
            <span className="text-sm text-muted-foreground font-medium" data-testid="text-customer-number">
              #{customer.customerNumber}
            </span>
          )}
          <StatusBadge status={customer.status} />
          {isParentCustomer && (
            <Badge variant="secondary" data-testid="badge-parent-customer">
              {t("customerDetail.parentAccount")}
            </Badge>
          )}
          {isChildCustomer && parentCustomer && (
            <Link href={`/dashboard/customers/${parentCustomer.id}?tab=overview`}>
              <Badge variant="outline" className="cursor-pointer gap-1" data-testid="badge-branch-customer">
                <Building2 className="w-3 h-3" />
                {t("customerDetail.partOf", { name: parentCustomer.name })}
              </Badge>
            </Link>
          )}
          {isChildCustomer && !parentCustomer && (
            <Badge variant="outline" data-testid="badge-branch-customer">
              {t("customerDetail.branch")}
            </Badge>
          )}
          <Badge 
            variant={coverage === t("customerDetail.coverageMaintAndSnow") ? "default" : coverage === t("customerDetail.noCoverage") ? "outline" : "secondary"}
            data-testid="badge-coverage-status"
          >
            {coverage}
          </Badge>
          {customer.ranking === "key_account" ? (
            <Badge variant="default" data-testid="badge-ranking">Key Account</Badge>
          ) : customer.ranking === "preferred" ? (
            <Badge variant="secondary" data-testid="badge-ranking">Preferred</Badge>
          ) : (
            <Badge variant="outline" data-testid="badge-ranking">Standard</Badge>
          )}
          {customer.includeInRoute && (
            <Badge variant="secondary" data-testid="badge-include-in-route">
              {t("customers.onRoute")}
            </Badge>
          )}
          {customer.tags && customer.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {customer.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1" data-testid="customer-account-manager">
              {t("accountManagers.label")}: {!accountManagers.data || accountManagers.isError ? "—" : accountManagers.data.assignments[customer.id]?.name ?? t("accountManagers.notAssigned")}
        </p>
      </div>

      {/* Right column: action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <Button 
          size="sm"
          variant="outline" 
          data-testid="button-add-note"
          onClick={() => {
            noteForm.reset({ body: "" });
            setEditingNote(null);
            setIsAddNoteDialogOpen(true);
            setActiveTab("notes");
          }}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          {t("customerDetail.addNote")}
        </Button>
        {(user?.accessRole === "admin" || user?.accessRole === "office") && (
          <Button 
            size="sm"
            variant="outline"
            data-testid="button-add-ticket"
            onClick={() => navigate(`/dashboard/tickets/new?customerId=${customer.id}`)}
          >
            <TicketIcon className="w-4 h-4 mr-2" />
            {t("customerDetail.addTicket")}
          </Button>
        )}
        {canEditCustomer && (
          <Button size="sm" variant="default" asChild>
            <Link href={`/dashboard/customers/${customer.id}/edit`} data-testid="button-edit-customer">
              <Edit className="w-4 h-4 mr-2" />
              {t("customerEdit.eyebrow")}
            </Link>
          </Button>
        )}
      </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>

        <TabsContent value="overview">
          <CustomerDashboard
            customerId={id!}
            customer={customer}
            contacts={contacts}
            contracts={contracts}
            tickets={tickets}
            notes={notes}
            pmCompanies={pmCompanies}
            pmManagers={pmManagers}
            isParentCustomer={isParentCustomer}
            childCustomers={childCustomers}
            onTabChange={setActiveTab}
            onContractClick={(contractId) => {
              setActiveTab("contracts");
              setHighlightContractId(contractId);
            }}
          />
          {!isParentCustomer && <SiteDetailsCard customer={customer} canEdit={canEditCustomer} />}
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-end gap-2">
            {contacts.length > 0 && contacts.some(c => c.emails && c.emails.length > 0) && (
              <Button 
                size="sm"
                variant="outline"
                onClick={() => {
                  const allEmails = contacts
                    .flatMap(c => c.emails || [])
                    .filter(Boolean);
                  if (allEmails.length > 0) {
                    navigator.clipboard.writeText(allEmails.join(", "));
                    toast({
                      title: t("common.success"),
                      description: `${allEmails.length} email${allEmails.length > 1 ? 's' : ''}`,
                    });
                  }
                }}
                data-testid="button-copy-all-emails"
              >
                <Mail className="w-4 h-4 mr-2" />
                {t("common.email")}
              </Button>
            )}
            {canEditCustomer && (
              <Button size="sm" asChild>
                <Link href={`/dashboard/customers/${customer.id}/edit#contacts`} data-testid="button-edit-contacts">
                  <Edit className="w-4 h-4 mr-2" />
                  {t("customerEdit.editContacts")}
                </Link>
              </Button>
            )}
          </div>
          {isLoadingContacts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{t("customerDetail.noContacts")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{contact.name}</p>
                        {contact.isPrimary === "true" && (
                          <Badge variant="secondary" className="text-xs">{t("customerDetail.isPrimary")}</Badge>
                        )}
                      </div>
                      {contact.role && (
                        <p className="text-sm text-muted-foreground">{contact.role}</p>
                      )}
                      {contact.phones && contact.phones.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          {contact.phones.map((phone, idx) => (
                            <span key={idx}>{phone}{idx < contact.phones!.length - 1 ? ", " : ""}</span>
                          ))}
                        </div>
                      )}
                      {contact.emails && contact.emails.length > 0 && (
                        <div className="text-sm text-muted-foreground flex items-center flex-wrap gap-x-2">
                          {contact.emails.map((email, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              {email}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover-elevate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(email);
                                  toast({
                                    title: t("common.success"),
                                    description: t("common.email"),
                                  });
                                }}
                                data-testid={`button-copy-email-${contact.id}-${idx}`}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              {idx < contact.emails!.length - 1 && ","}
                            </span>
                          ))}
                        </div>
                      )}
                      {contact.notes && (
                        <p className="text-sm text-muted-foreground mt-2">{contact.notes}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              size="sm"
              onClick={() => {
                noteForm.reset({ body: "" });
                setEditingNote(null);
                setIsAddNoteDialogOpen(true);
              }}
              data-testid="button-add-note-tab"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("customerDetail.addNote")}
            </Button>
          </div>
          {isLoadingNotes ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : sortedNotes.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{t("customerDetail.noNotes")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedNotes.map((note) => (
                <Card key={note.id} data-testid={`card-note-${note.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-sm font-medium">{t("customerDetail.tabs.notes")}</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-note-date-${note.id}`}>
                            {format(new Date(note.createdAt), "MMM d, yyyy")}
                          </p>
                        </div>
                        <p className="text-sm" data-testid={`text-note-body-${note.id}`}>{note.body}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setEditingNote(note);
                            noteForm.reset({
                              body: note.body,
                            });
                          }}
                          data-testid={`button-edit-note-${note.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              data-testid={`button-delete-note-${note.id}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("common.delete")} {t("customerDetail.tabs.notes")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("ticketDetail.cannotUndo")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("common.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {(user?.accessRole === "admin" || user?.accessRole === "office") && (
          <TabsContent value="annual-rollup" className="space-y-4">
            <AnnualServiceRollup customerId={customer.id} />
          </TabsContent>
        )}

        <TabsContent value="tickets" className="space-y-4">
          <TicketListView
            customerId={customer.id}
            showHeader={false}
            showCustomerColumn={false}
            showBatchActions={false}
            showQuickAdd={false}
            showNewTicketButton={true}
          />
        </TabsContent>

        {(user?.accessRole === "admin" || user?.accessRole === "office") && (
          <>
            <TabsContent value="proposals" className="space-y-4">
              <CustomerProposalsSection customerId={params?.id!} />
              <CustomerCrewWorksheetsSection customerId={params?.id!} />
            </TabsContent>
            <TabsContent value="visual-scopes" className="space-y-4">
              <CustomerVisualScopesSection customerId={params?.id!} />
            </TabsContent>
            <TabsContent value="contracts" className="space-y-4">
                <div className="max-w-xl"><QboCustomerCard customerId={id!} isParent={isParentCustomer} /></div>
                <CustomerContracts customerId={id!}>
                <div className="flex justify-between items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="show-ended-contracts"
                      checked={showEndedContracts}
                      onCheckedChange={(checked) => setShowEndedContracts(checked as boolean)}
                      data-testid="toggle-show-ended-contracts"
                    />
                    <label 
                      htmlFor="show-ended-contracts"
                      className="text-sm font-medium cursor-pointer"
                    >
                      {t("customerDetail.showEnded")}
                    </label>
                  </div>
                </div>
              
                {isLoadingContracts ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : (() => {
                  const filteredContracts = showEndedContracts 
                    ? contracts 
                    : contracts.filter(c => c.status === "active" || c.status === "paused");
                  
                  return filteredContracts.length === 0 ? (
                    <Card>
                      <CardContent className="flex items-center justify-center p-12">
                        <div className="text-center">
                          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">
                            {showEndedContracts ? t("customerDetail.noDocumentsFound") : t("customerDetail.noDocumentsFound")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filteredContracts.map((contract) => (
                        <ContractCard 
                          key={contract.id} 
                          contract={contract}
                          customerId={params?.id!}
                          formatFileSize={formatFileSize}
                          setShowVersionHistory={setShowVersionHistory}
                          highlight={highlightContractId === contract.id}
                        />
                      ))}
                    </div>
                  );
                })()}

                <VersionHistoryDialog 
                  contractId={showVersionHistory}
                  onClose={() => setShowVersionHistory(null)}
                  formatFileSize={formatFileSize}
                />
                </CustomerContracts>
              </TabsContent>

            <TabsContent value="rate-sheet" className="space-y-4">
              <CustomerContractPanel customerId={params?.id!} kind="rates" />
            </TabsContent>

            <TabsContent value="revenue" className="space-y-4">
              <CustomerContractPanel customerId={params?.id!} kind="revenue" />
            </TabsContent>

            <TabsContent value="monthly-summary" className="space-y-4">
              <CustomerContractPanel customerId={params?.id!} kind="monthly" />
            </TabsContent>
          </>
        )}

        {summary.data?.coverage.snow && (user?.accessRole === "admin" || user?.accessRole === "office" || user?.accessRole === "field_manager") && (
          <TabsContent value="snow" className="space-y-4">
            <CustomerSnowHistory customerId={params?.id!} customerName={customer.name} />
          </TabsContent>
        )}

        <TabsContent value="maps" className="space-y-4">
          <CustomerMapsSection customerId={params?.id!} />
        </TabsContent>

        <TabsContent value="service-checklist" className="space-y-4">
          <ServiceChecklistTab customerId={params?.id!} />
        </TabsContent>

        {(user?.accessRole === "admin" || user?.accessRole === "office") && (
          <TabsContent value="communications" className="space-y-4">
            <CommunicationListTab
              queryKey={["/api/customers", params?.id!, "communications"]}
              customerId={params?.id}
            />
          </TabsContent>
        )}

        {(user?.accessRole === "admin" || user?.accessRole === "office") && (
          <TabsContent value="settings" className="space-y-4">
            {customer && <CustomerLocationEditor customer={customer} />}
            <CustomerSchedulingSection customerId={params?.id!} />
          </TabsContent>
        )}

        <TabsContent value="fulfillment" className="space-y-4">
          <ServiceFulfillmentPanel customerId={params?.id!} />
        </TabsContent>
      </Tabs>


      <Dialog open={isAddNoteDialogOpen || !!editingNote} onOpenChange={(open) => {
        if (!open) {
          setIsAddNoteDialogOpen(false);
          setEditingNote(null);
          noteForm.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNote ? t("customerDetail.editNote") : t("customerDetail.addNote")}</DialogTitle>
            <DialogDescription>
              {editingNote ? t("customerDetail.updateNoteDesc") : t("customerDetail.addNoteDesc")}
            </DialogDescription>
          </DialogHeader>
          <Form {...noteForm}>
            <form onSubmit={noteForm.handleSubmit((data) => {
              if (editingNote) {
                updateNoteMutation.mutate({ noteId: editingNote.id, data });
              } else {
                createNoteMutation.mutate(data);
              }
            })} className="space-y-4">
              <FormField
                control={noteForm.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customerDetail.noteContent")} *</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("customerDetail.noteContent")} {...field} rows={5} data-testid="textarea-note-body" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddNoteDialogOpen(false);
                  setEditingNote(null);
                  noteForm.reset();
                }} data-testid="button-cancel-note">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createNoteMutation.isPending || updateNoteMutation.isPending} data-testid="button-save-note">
                  {editingNote 
                    ? (updateNoteMutation.isPending ? t("common.saving") : t("common.save"))
                    : (createNoteMutation.isPending ? t("common.creating") : t("common.create"))
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}

export function RateSheetSection({ customerId }: { customerId: string }) {
  return <CustomerContractPanel customerId={customerId} kind="rates" />;
}

// Layer type configuration - bright colors for satellite visibility
const LAYER_TYPES = {
  base: [
    { value: "community_outline", label: "Community Outline", color: "#00FFFF" }, // Bright cyan
  ],
  community: [
    { value: "mowing", label: "Mowing Zones", color: "#00FF00" },      // Bright green
    { value: "native_grass", label: "Native Grass Areas", color: "#ADFF2F" }, // Green-yellow
    { value: "landscape_beds", label: "Landscape Beds", color: "#FF6600" },   // Bright orange
    { value: "pet_stations", label: "Pet Stations", color: "#FF00FF" },       // Magenta
  ],
  snow: [
    { value: "atv_route", label: "ATV Routes", color: "#FFD700" },     // Bright orangish yellow (gold)
    { value: "truck_plow", label: "Truck Plow", color: "#FFFF00" },    // Yellow
    { value: "hand_shovel", label: "Hand Shovel", color: "#FF69B4" },  // Hot pink
    { value: "ice_melt", label: "Ice Melt", color: "#FF0000" },        // Bright red
    { value: "ice_melt_buckets", label: "Ice Melt Buckets", color: "#00CED1" }, // Dark turquoise
  ],
  custom: [] as { value: string; label: string; color: string }[],
};

// Preset colors optimized for satellite map visibility
const PRESET_COLORS = [
  { hex: "#FF0000", name: "Red" },
  { hex: "#00FF00", name: "Lime" },
  { hex: "#FFFF00", name: "Yellow" },
  { hex: "#FF00FF", name: "Magenta" },
  { hex: "#00FFFF", name: "Cyan" },
  { hex: "#FF6600", name: "Orange" },
  { hex: "#FF69B4", name: "Hot Pink" },
  { hex: "#ADFF2F", name: "Green Yellow" },
  { hex: "#FFD700", name: "Gold" },
  { hex: "#7FFF00", name: "Chartreuse" },
  { hex: "#FF1493", name: "Deep Pink" },
  { hex: "#00FF7F", name: "Spring Green" },
  { hex: "#FF4500", name: "Orange Red" },
  { hex: "#1E90FF", name: "Dodger Blue" },
  { hex: "#FFFFFF", name: "White" },
];

function CustomerSnowHistory({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { t } = useTranslation();
  const { data: impacts = [], isLoading } = useQuery<(SnowEventPropertyImpact & { snowEvent: SnowEvent })[]>({
    queryKey: [`/api/customers/${customerId}/snow-impacts`],
  });

  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (impacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Snowflake className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("customerDetail.noSnowHistory")}</p>
        </CardContent>
      </Card>
    );
  }

  const billingStatusLabels: Record<string, string> = {
    not_created: t("statuses.pending"),
    ticket_created: t("statuses.ticketCreated"),
    invoiced: t("statuses.invoiced"),
    paid: t("statuses.paid"),
  };

  const billingStatusVariant = (status: string) => {
    switch (status) {
      case "paid": return "default";
      case "invoiced": return "secondary";
      case "ticket_created": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">{t("customerDetail.snowProfile")}</h3>
        <Badge variant="secondary" data-testid="badge-snow-count">
          {impacts.length} {t("customerDetail.stormEvent")}{impacts.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="space-y-3">
        {impacts.map((impact) => {
          const event = impact.snowEvent;
          const eventDate = new Date(event.eventStartDateTime);
          return (
            <Card
              key={impact.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/snow/${event.id}`)}
              data-testid={`card-snow-impact-${impact.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {event.eventName || eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <Badge variant="secondary" data-testid={`badge-range-${impact.id}`}>
                        {event.snowRange}
                      </Badge>
                      <Badge
                        variant={event.status === "locked" ? "default" : "outline"}
                        data-testid={`badge-status-${impact.id}`}
                      >
                        {event.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {eventDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      {event.eventEndDateTime && ` — ${new Date(event.eventEndDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </p>
                    {impact.serviceTypes && impact.serviceTypes.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {impact.serviceTypes.map((svc) => (
                          <Badge key={svc} variant="outline" className="text-xs">
                            {svc}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {impact.siteNotes && (
                      <p className="text-sm text-muted-foreground mt-1">{impact.siteNotes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={billingStatusVariant(impact.billingStatus) as any} data-testid={`badge-billing-${impact.id}`}>
                      {billingStatusLabels[impact.billingStatus] || impact.billingStatus}
                    </Badge>
                    {impact.laborHours && (
                      <span className="text-xs text-muted-foreground">{impact.laborHours} hrs</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CustomerMapsSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploadingLayer, setUploadingLayer] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showMapViewer, setShowMapViewer] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"base" | "community" | "snow" | "custom">("community");
  const [selectedLayerType, setSelectedLayerType] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = user?.accessRole === "admin" || user?.accessRole === "office";

  const { data: mapLayers = [], isLoading } = useQuery<CustomerMapLayer[]>({
    queryKey: ["/api/customers", customerId, "map-layers"],
  });

  const createLayerMutation = useMutation({
    mutationFn: async (data: { name: string; layerType: string; category: string; kmlPath: string; color: string }) => {
      return apiRequest("POST", `/api/customers/${customerId}/map-layers`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "map-layers"] });
      toast({ title: t("propertyMaps.layerUploaded") });
      setShowUploadDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" });
    },
  });

  const updateLayerMutation = useMutation({
    mutationFn: async ({ layerId, data }: { layerId: string; data: { kmlPath: string } }) => {
      return apiRequest("PATCH", `/api/customers/${customerId}/map-layers/${layerId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "map-layers"] });
      toast({ title: t("propertyMaps.layerUploaded") });
      setShowUploadDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" });
    },
  });

  const deleteLayerMutation = useMutation({
    mutationFn: async (layerId: string) => {
      return apiRequest("DELETE", `/api/customers/${customerId}/map-layers/${layerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "map-layers"] });
      toast({ title: t("propertyMaps.layerDeleted") });
    },
    onError: () => {
      toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedCategory("community");
    setSelectedLayerType("");
    setCustomName("");
    setSelectedColor("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Get colors already in use by existing layers for this customer
  const usedColors = new Set(mapLayers.map((l) => l.color.toUpperCase()));

  // Get available colors (not already used)
  const availableColors = PRESET_COLORS.filter((c) => !usedColors.has(c.hex.toUpperCase()));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // For custom layers, require name and color
    if (selectedCategory === "custom") {
      if (!file || !customName.trim() || !selectedColor) {
        toast({ title: t("propertyMaps.provideNameAndColor"), variant: "destructive" });
        return;
      }
    } else {
      if (!file || !selectedLayerType) return;
    }

    setUploadingLayer(true);

    try {
      // Get presigned upload URL
      const urlRes = await apiRequest("POST", `/api/customers/${customerId}/map-layers/upload-url`, {
        fileName: file.name,
        contentType: file.type || "application/vnd.google-earth.kml+xml",
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      // Upload file to object storage
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/vnd.google-earth.kml+xml" },
      });

      if (selectedCategory === "custom") {
        // For custom layers, check if one with the same name exists
        const existingCustomLayer = mapLayers.find(
          (l) => l.category === "custom" && l.name.toLowerCase() === customName.trim().toLowerCase()
        );
        
        if (existingCustomLayer) {
          // Update existing custom layer
          await updateLayerMutation.mutateAsync({
            layerId: existingCustomLayer.id,
            data: { kmlPath: objectPath },
          });
        } else {
          // Create new custom layer record
          await createLayerMutation.mutateAsync({
            name: customName.trim(),
            layerType: "custom",
            category: "custom",
            kmlPath: objectPath,
            color: selectedColor,
          });
        }
      } else {
        // Find the layer config for preset types
        const layerConfig = [...LAYER_TYPES.base, ...LAYER_TYPES.community, ...LAYER_TYPES.snow].find(
          (l) => l.value === selectedLayerType
        );

        // Check if a layer of this type already exists for this customer
        const existingLayer = mapLayers.find(
          (l) => l.layerType === selectedLayerType && l.category === selectedCategory
        );

        if (existingLayer) {
          // Update existing layer with new file
          await updateLayerMutation.mutateAsync({
            layerId: existingLayer.id,
            data: { kmlPath: objectPath },
          });
        } else {
          // Create new layer record
          await createLayerMutation.mutateAsync({
            name: customName || layerConfig?.label || selectedLayerType,
            layerType: selectedLayerType,
            category: selectedCategory,
            kmlPath: objectPath,
            color: selectedColor || layerConfig?.color || "#6b7280",
          });
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" });
    } finally {
      setUploadingLayer(false);
    }
  };

  const baseLayers = mapLayers.filter((l) => l.category === "base");
  const communityLayers = mapLayers.filter((l) => l.category === "community");
  const snowLayers = mapLayers.filter((l) => l.category === "snow");
  const customLayers = mapLayers.filter((l) => l.category === "custom");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">{t("propertyMaps.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("propertyMaps.description")}
          </p>
        </div>
        <div className="flex gap-2">
          {mapLayers.length > 0 && (
            <Button
              variant="outline"
              data-testid="button-view-map"
              onClick={() => setShowMapViewer(true)}
            >
              <Map className="w-4 h-4 mr-2" />
              {t("propertyMaps.viewMap")}
            </Button>
          )}
          {canEdit && (
            <Button
              data-testid="button-add-map-layer"
              onClick={() => setShowUploadDialog(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              {t("propertyMaps.addLayer")}
            </Button>
          )}
        </div>
      </div>

      {showMapViewer && (
        <LayerMapViewer
          customerId={customerId}
          fullScreen
          onClose={() => setShowMapViewer(false)}
        />
      )}

      {/* Base Layers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {t("propertyMaps.baseLayers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {baseLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("propertyMaps.noBaseLayers")}
            </p>
          ) : (
            <div className="space-y-2">
              {baseLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`layer-item-${layer.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: layer.color || "#00FFFF" }}
                    />
                    <div>
                      <p className="font-medium text-sm">{layer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {LAYER_TYPES.base.find((t) => t.value === layer.layerType)?.label || layer.layerType}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-layer-${layer.id}`}
                      onClick={() => deleteLayerMutation.mutate(layer.id)}
                      disabled={deleteLayerMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Community Season Layers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {t("propertyMaps.communitySeason")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {communityLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("propertyMaps.noCommunityLayers")}
            </p>
          ) : (
            <div className="space-y-2">
              {communityLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`layer-item-${layer.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: layer.color || "#22c55e" }}
                    />
                    <div>
                      <p className="font-medium text-sm">{layer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {LAYER_TYPES.community.find((t) => t.value === layer.layerType)?.label || layer.layerType}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-layer-${layer.id}`}
                      onClick={() => deleteLayerMutation.mutate(layer.id)}
                      disabled={deleteLayerMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snow Season Layers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {t("propertyMaps.snowSeason")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snowLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("propertyMaps.noSnowLayers")}
            </p>
          ) : (
            <div className="space-y-2">
              {snowLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`layer-item-${layer.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: layer.color || "#3b82f6" }}
                    />
                    <div>
                      <p className="font-medium text-sm">{layer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {LAYER_TYPES.snow.find((t) => t.value === layer.layerType)?.label || layer.layerType}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-layer-${layer.id}`}
                      onClick={() => deleteLayerMutation.mutate(layer.id)}
                      disabled={deleteLayerMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Layers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {t("propertyMaps.customLayers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("propertyMaps.noCustomLayers")}
            </p>
          ) : (
            <div className="space-y-2">
              {customLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`layer-item-${layer.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: layer.color || "#6b7280" }}
                    />
                    <div>
                      <p className="font-medium text-sm">{layer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("propertyMaps.customLayers")}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`button-delete-layer-${layer.id}`}
                      onClick={() => deleteLayerMutation.mutate(layer.id)}
                      disabled={deleteLayerMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("propertyMaps.addMapLayer")}</DialogTitle>
            <DialogDescription>
              {t("propertyMaps.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <div className="space-y-2">
              <Label>{t("propertyMaps.layerCategory")}</Label>
              <Select
                value={selectedCategory}
                onValueChange={(v) => {
                  setSelectedCategory(v as "base" | "community" | "snow" | "custom");
                  setSelectedLayerType("");
                  setSelectedColor("");
                }}
              >
                <SelectTrigger data-testid="select-layer-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">{t("propertyMaps.baseLayers")}</SelectItem>
                  <SelectItem value="community">{t("propertyMaps.communitySeason")}</SelectItem>
                  <SelectItem value="snow">{t("propertyMaps.snowSeason")}</SelectItem>
                  <SelectItem value="custom">{t("propertyMaps.customLayers")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedCategory !== "custom" && (
              <div className="space-y-2">
                <Label>{t("propertyMaps.layerType")}</Label>
                <Select value={selectedLayerType} onValueChange={(v) => {
                  setSelectedLayerType(v);
                  // Auto-select the color for preset types
                  const config = [...LAYER_TYPES.base, ...LAYER_TYPES.community, ...LAYER_TYPES.snow].find(l => l.value === v);
                  if (config) setSelectedColor(config.color);
                }}>
                  <SelectTrigger data-testid="select-layer-type">
                    <SelectValue placeholder={t("propertyMaps.selectLayerType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {LAYER_TYPES[selectedCategory].map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: type.color }}
                          />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCategory === "custom" && (
              <div className="space-y-2">
                <Label>{t("propertyMaps.layerName")} <span className="text-destructive">*</span></Label>
                <Input
                  data-testid="input-custom-layer-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t("propertyMaps.enterLayerName")}
                />
              </div>
            )}

            {selectedCategory !== "custom" && (
              <div className="space-y-2">
                <Label>{t("propertyMaps.customName")}</Label>
                <Input
                  data-testid="input-layer-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t("propertyMaps.overrideDefault")}
                />
              </div>
            )}

            {/* Color Selection - always show for custom, optionally for others */}
            <div className="space-y-2">
              <Label>
                {t("propertyMaps.layerColor")} {selectedCategory === "custom" && <span className="text-destructive">*</span>}
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {availableColors.length === 0 
                  ? t("propertyMaps.allColorsInUse")
                  : t("propertyMaps.selectColor")}
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => {
                  const isUsed = usedColors.has(color.hex.toUpperCase());
                  const isSelected = selectedColor === color.hex;
                  return (
                    <button
                      key={color.hex}
                      type="button"
                      disabled={isUsed}
                      onClick={() => setSelectedColor(color.hex)}
                      className={`w-8 h-8 rounded-md border-2 transition-all ${
                        isSelected 
                          ? "border-primary ring-2 ring-primary ring-offset-2" 
                          : isUsed 
                            ? "border-muted opacity-30 cursor-not-allowed" 
                            : "border-transparent hover:border-muted-foreground"
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={isUsed ? `${color.name} (in use)` : color.name}
                      data-testid={`color-${color.hex.slice(1)}`}
                    >
                      {isUsed && (
                        <X className="w-4 h-4 mx-auto text-black/50" />
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedColor && (
                <p className="text-xs text-muted-foreground">
                  Selected: {PRESET_COLORS.find(c => c.hex === selectedColor)?.name || selectedColor}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("propertyMaps.kmlFile")}</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".kml,.kmz"
                data-testid="input-layer-file"
                onChange={handleFileUpload}
                disabled={
                  uploadingLayer || 
                  (selectedCategory === "custom" 
                    ? (!customName.trim() || !selectedColor)
                    : !selectedLayerType)
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("propertyMaps.acceptsKml")}
              </p>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false);
                resetForm();
              }}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== SERVICE CHECKLIST TAB ====================

type CampaignItemWithCampaign = import("@shared/schema").CampaignItem & {
  campaign: import("@shared/schema").Campaign;
};

function ServiceChecklistTab({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"season" | "category" | "month">("season");
  const [selectedItem, setSelectedItem] = useState<CampaignItemWithCampaign | null>(null);

  const { items: rawItems, isLoading } = useCustomerServices(customerId);

  const { data: companyUsersWithDetails = [] } = useQuery<Array<{ id: string; userId: string; role: string; user: { id: string; firstName: string; lastName: string; email: string } }>>({
    queryKey: ["/api/company-users"],
  });

  const { data: seasons = [] } = useQuery<import("@shared/schema").Season[]>({
    queryKey: ["/api/seasons"],
  });

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    rawItems.forEach((item) => {
      const start = item.campaign?.windowStart;
      if (start) {
        const y = new Date(start).getFullYear();
        years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [rawItems, currentYear]);

  const itemsByYear = useMemo(() => {
    return rawItems.filter((item) => {
      const start = item.campaign?.windowStart;
      if (!start) return false;
      return new Date(start).getFullYear() === selectedYear;
    });
  }, [rawItems, selectedYear]);

  const summaryStats = useMemo(() => {
    const pending = itemsByYear.filter(i => i.status === "pending").length;
    const completed = itemsByYear.filter(i => i.status === "completed").length;
    const skipped = itemsByYear.filter(i => i.status === "skipped").length;
    return { pending, completed, skipped, total: itemsByYear.length };
  }, [itemsByYear]);

  const availableCampaigns = useMemo(() => {
    const seen: Record<string, string> = {};
    const ids: string[] = [];
    itemsByYear.forEach((item) => {
      if (item.campaign && !seen[item.campaign.id]) {
        seen[item.campaign.id] = item.campaign.title;
        ids.push(item.campaign.id);
      }
    });
    return ids.map((id) => ({ id, title: seen[id] }));
  }, [itemsByYear]);

  const availableSeasons = useMemo(() => {
    const seasonIds = new Set<string>();
    itemsByYear.forEach((item) => {
      if (item.campaign?.seasonId) seasonIds.add(item.campaign.seasonId);
    });
    return seasons.filter((s) => seasonIds.has(s.id));
  }, [itemsByYear, seasons]);

  const filteredItems = useMemo(() => {
    return itemsByYear.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.campaign?.category !== categoryFilter) return false;
      if (seasonFilter !== "all" && item.campaign?.seasonId !== seasonFilter) return false;
      if (campaignFilter !== "all" && item.campaignId !== campaignFilter) return false;
      return true;
    });
  }, [itemsByYear, statusFilter, categoryFilter, seasonFilter, campaignFilter]);

  const groupedItems = useMemo(() => {
    const groupByKey = (getKey: (item: CampaignItemWithCampaign) => string | null, getLabel: (key: string, items: CampaignItemWithCampaign[]) => string) => {
      const keys: string[] = [];
      const groups: Record<string, CampaignItemWithCampaign[]> = {};
      filteredItems.forEach((item) => {
        const key = getKey(item) || "unknown";
        if (!groups[key]) { groups[key] = []; keys.push(key); }
        groups[key].push(item);
      });
      return keys.map((key) => ({ label: getLabel(key, groups[key]), items: groups[key] }));
    };

    if (groupBy === "category") {
      return groupByKey(
        (item) => item.campaign?.category || "general",
        (key) => t(`cp1.categories.${key.toLowerCase()}`, { defaultValue: key }),
      );
    } else if (groupBy === "month") {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return groupByKey(
        (item) => {
          const start = item.campaign?.windowStart;
          if (!start) return null;
          return monthNames[new Date(start).getMonth()];
        },
        (key) => key,
      );
    } else {
      return groupByKey(
        (item) => item.campaign?.seasonId || "no-season",
        (key) => {
          if (key === "no-season") return "No Season";
          const season = seasons.find((s) => s.id === key);
          return season?.name || `Season (${key.slice(0, 8)})`;
        },
      );
    }
  }, [filteredItems, groupBy, seasons]);

  const formatDateRange = (start: string, end: string) => {
    if (!start || !end) return "";
    try {
      const s = format(new Date(start), "MMM d");
      const e = format(new Date(end), "MMM d, yyyy");
      return `${s} – ${e}`;
    } catch {
      return `${start} – ${end}`;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    if (status === "completed") return "default";
    if (status === "skipped") return "secondary";
    return "outline";
  };

  const getCategoryColor = (category: string) => {
    if (category === "chemical") return "text-emerald-600 dark:text-emerald-400";
    if (category === "irrigation") return "text-blue-600 dark:text-blue-400";
    return "text-muted-foreground";
  };

  const resolveUserName = (userId: string | null | undefined) => {
    if (!userId) return null;
    const cu = companyUsersWithDetails.find(cu => cu.userId === userId);
    if (cu) {
      const name = `${cu.user.firstName} ${cu.user.lastName}`.trim();
      return name || cu.user.email || null;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="service-checklist-tab">
      {/* Header: Year selector + grouping */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28" data-testid="select-checklist-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)} data-testid={`option-year-${y}`}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {summaryStats.total} service{summaryStats.total !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by:</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "season" | "category" | "month")}>
            <SelectTrigger className="w-32" data-testid="select-group-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="season">Season</SelectItem>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status summary pills */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card" data-testid="summary-pending">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{summaryStats.pending}</span>
          <span className="text-xs text-muted-foreground">Pending</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card" data-testid="summary-completed">
          <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{summaryStats.completed}</span>
          <span className="text-xs text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card" data-testid="summary-skipped">
          <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{summaryStats.skipped}</span>
          <span className="text-xs text-muted-foreground">Skipped</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36" data-testid="select-filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="chemical">Chemical</SelectItem>
            <SelectItem value="irrigation">Irrigation</SelectItem>
          </SelectContent>
        </Select>

        <Select value={seasonFilter} onValueChange={setSeasonFilter} disabled={availableSeasons.length === 0}>
          <SelectTrigger className="w-36" data-testid="select-filter-season">
            <SelectValue placeholder="All Seasons" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Seasons</SelectItem>
            {availableSeasons.map((s) => (
              <SelectItem key={s.id} value={s.id} data-testid={`option-season-${s.id}`}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={campaignFilter} onValueChange={setCampaignFilter} disabled={availableCampaigns.length === 0}>
          <SelectTrigger className="w-44" data-testid="select-filter-campaign">
            <SelectValue placeholder="All Campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {availableCampaigns.map((c) => (
              <SelectItem key={c.id} value={c.id} data-testid={`option-campaign-${c.id}`}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || categoryFilter !== "all" || seasonFilter !== "all" || campaignFilter !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setStatusFilter("all"); setCategoryFilter("all"); setSeasonFilter("all"); setCampaignFilter("all"); }}
            data-testid="button-clear-filters"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Checklist items */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm" data-testid="empty-checklist">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {rawItems.length === 0
            ? "No campaign services have been linked to this customer yet."
            : "No services match the current filters."}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedItems.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                {group.label}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-md border bg-card hover-elevate cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                    data-testid={`row-checklist-item-${item.id}`}
                  >
                    <div className="flex-shrink-0">
                      {item.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : item.status === "skipped" ? (
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate" data-testid={`text-item-title-${item.id}`}>
                          {item.campaign?.title || "Untitled Service"}
                        </span>
                        <Badge variant="outline" className={`text-xs capitalize ${getCategoryColor(item.campaign?.category || "general")}`} data-testid={`badge-category-${item.id}`}>
                          {t(`cp1.categories.${(item.campaign?.category || "general").toLowerCase()}`, { defaultValue: item.campaign?.category || "general" })}
                        </Badge>
                        {classifyCustomerService(item.status, item.campaignWindowStart, item.campaignWindowEnd) === "overdue" &&
                          <Badge variant="destructive">{t("cp1.serviceStates.overdue")}</Badge>}
                      </div>
                      {item.campaign?.windowStart && item.campaign?.windowEnd && (
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-window-${item.id}`}>
                          {formatDateRange(item.campaign.windowStart, item.campaign.windowEnd)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.completedAt && (
                        <span className="text-xs text-muted-foreground hidden sm:block" data-testid={`text-completed-at-${item.id}`}>
                          {format(new Date(item.completedAt), "MMM d")}
                        </span>
                      )}
                      <Badge variant={getStatusBadgeVariant(item.status)} className="capitalize text-xs" data-testid={`badge-status-${item.id}`}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle data-testid="drawer-title">{selectedItem.campaign?.title || "Service Detail"}</SheetTitle>
                <SheetDescription>
                  Read-only service checklist detail
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={getStatusBadgeVariant(selectedItem.status)} className="capitalize" data-testid="drawer-status">
                    {selectedItem.status}
                  </Badge>
                  <Badge variant="outline" className={`capitalize ${getCategoryColor(selectedItem.campaign?.category || "general")}`} data-testid="drawer-category">
                    {t(`cp1.categories.${(selectedItem.campaign?.category || "general").toLowerCase()}`, { defaultValue: selectedItem.campaign?.category || "general" })}
                  </Badge>
                  {selectedItem.campaign?.subtype && (
                    <Badge variant="secondary" className="capitalize text-xs" data-testid="drawer-subtype">
                      {selectedItem.campaign.subtype.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>

                {/* Campaign info */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Campaign</p>
                  <div className="p-3 rounded-md border bg-muted/40 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid="drawer-campaign-title">
                        {selectedItem.campaign?.title}
                      </span>
                      <Link href={`/dashboard/campaigns/${selectedItem.campaignId}`}>
                        <span className="text-xs text-primary hover:underline cursor-pointer" data-testid="link-campaign-detail">
                          View campaign
                        </span>
                      </Link>
                    </div>
                    {selectedItem.campaign?.windowStart && selectedItem.campaign?.windowEnd && (
                      <p className="text-xs text-muted-foreground" data-testid="drawer-window">
                        Window: {formatDateRange(selectedItem.campaign.windowStart, selectedItem.campaign.windowEnd)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Completion details */}
                {(selectedItem.status === "completed" || selectedItem.completedAt) && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completion</p>
                    <div className="p-3 rounded-md border bg-muted/40 space-y-1.5">
                      {selectedItem.completedAt && (
                        <div className="flex justify-between text-sm gap-2">
                          <span className="text-muted-foreground">Completed at</span>
                          <span data-testid="drawer-completed-at">
                            {format(new Date(selectedItem.completedAt), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                        </div>
                      )}
                      {selectedItem.completedById && (
                        <div className="flex justify-between text-sm gap-2">
                          <span className="text-muted-foreground">Completed by</span>
                          <span data-testid="drawer-completed-by">
                            {resolveUserName(selectedItem.completedById) || selectedItem.completedById}
                          </span>
                        </div>
                      )}
                      {selectedItem.notes && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Notes</span>
                          <p className="text-sm" data-testid="drawer-notes">{selectedItem.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Skip reason */}
                {selectedItem.status === "skipped" && selectedItem.skipReason && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skip Reason</p>
                    <p className="text-sm p-3 rounded-md border bg-muted/40" data-testid="drawer-skip-reason">
                      {selectedItem.skipReason}
                    </p>
                  </div>
                )}

                {/* Notes for pending items */}
                {selectedItem.status === "pending" && selectedItem.notes && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
                    <p className="text-sm p-3 rounded-md border bg-muted/40" data-testid="drawer-pending-notes">
                      {selectedItem.notes}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== CUSTOMER PROPOSALS SECTION ====================

function CustomerVisualScopesSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const { data: sheets = [], isLoading } = useQuery<import("@shared/schema").VisualScopeSheet[]>({
    queryKey: ["/api/customers", customerId, "visual-scope-sheets"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/visual-scope-sheets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch visual scope sheets");
      return res.json();
    },
  });

  const handleNew = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/visual-scope-sheets", {
        customerId,
        title: t("customerDetail.tabs.visualScopes"),
        scopeDate: new Date().toISOString().split("T")[0],
      });
      if (!res.ok) throw new Error("Failed to create visual scope sheet");
      const sheet = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "visual-scope-sheets"] });
      navigate(`/dashboard/tools/visual-scope/${sheet.id}`);
    } catch {
      toast({ title: t("common.error"), description: t("customerDetail.noVisualScopes"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    try { const [y, m, day] = d.split("-"); return `${m}/${day}/${y}`; } catch { return d; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-medium">{t("customerDetail.tabs.visualScopes")}</h3>
        <Button size="sm" onClick={handleNew} disabled={creating} data-testid="button-new-visual-scope-customer">
          {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("common.creating")}</> : <><Plus className="w-4 h-4 mr-2" />{t("customerDetail.createVisualScope")}</>}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : sheets.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Map className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t("customerDetail.noVisualScopes")}
        </div>
      ) : (
        <div className="space-y-2">
          {sheets.map((sheet) => (
            <div
              key={sheet.id}
              className="flex items-center justify-between p-3 rounded-md border hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/tools/visual-scope/${sheet.id}`)}
              data-testid={`row-visual-scope-${sheet.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" data-testid={`text-visual-scope-title-${sheet.id}`}>{sheet.title}</span>
                  <Badge variant="secondary" className="text-xs capitalize">{sheet.status}</Badge>
                  {sheet.baseImagePath && (
                    <Badge variant="outline" className="text-xs">{t("customerDetail.baseImageCaptured")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(sheet.scopeDate ?? "")}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/tools/visual-scope/${sheet.id}`); }}
                data-testid={`button-open-visual-scope-${sheet.id}`}
              >
                {t("common.view")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerCrewWorksheetsSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.accessRole ?? "";
  const canWriteCrewWorksheets =
    role === "admin" || role === "office" || role === "field_manager" ||
    role === "crew_supervisor" || role === "landscape_supervisor";
  const [creating, setCreating] = useState(false);

  const { data: worksheets = [], isLoading } = useQuery<import("@shared/schema").CrewWorksheetWithDetails[]>({
    queryKey: ["/api/customers", customerId, "crew-worksheets"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/crew-worksheets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch crew worksheets");
      return res.json();
    },
  });

  const handleNew = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/crew-worksheets", {
        customerId,
        title: t("crewWorksheets.title"),
        worksheetDate: new Date().toISOString().split("T")[0],
      });
      if (!res.ok) throw new Error("Failed");
      const w = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "crew-worksheets"] });
      navigate(`/dashboard/tools/crew-worksheets/${w.id}`);
    } catch {
      toast({ title: t("common.error"), description: t("crewWorksheets.createFailed"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    try { const [y, m, day] = d.split("-"); return `${m}/${day}/${y}`; } catch { return d; }
  };

  return (
    <div className="mt-8 pt-6 border-t">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-medium">{t("crewWorksheets.customerSectionTitle")}</h3>
        {canWriteCrewWorksheets && (
          <Button size="sm" onClick={handleNew} disabled={creating} data-testid="button-new-crew-worksheet-customer">
            {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("common.creating")}</> : <><Plus className="w-4 h-4 mr-2" />{t("crewWorksheets.newWorksheet")}</>}
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
      ) : worksheets.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t("crewWorksheets.noWorksheetsForCustomer")}
        </div>
      ) : (
        <div className="space-y-2">
          {worksheets.map(w => (
            <div key={w.id}
              className="flex items-center justify-between p-3 rounded-md border hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/tools/crew-worksheets/${w.id}`)}
              data-testid={`row-crew-worksheet-${w.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">{w.worksheetNumber}</span>
                  <span className="font-medium text-sm" data-testid={`text-cw-title-${w.id}`}>{w.title}</span>
                  {w.status === "finalized" ? (
                    <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-500/50">{t("statuses.finalized")}</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">{t("statuses.draft")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(w.worksheetDate)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerProposalsSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const { data: proposals = [], isLoading } = useQuery<import("@shared/schema").ProposalWithDetails[]>({
    queryKey: ["/api/customers", customerId, "proposals"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/proposals`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch proposals");
      return res.json();
    },
  });

  const handleNewProposal = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/proposals", {
        customerId,
        title: t("customerDetail.tabs.proposals"),
        proposalDate: new Date().toISOString().split("T")[0],
      });
      if (!res.ok) throw new Error("Failed to create proposal");
      const p = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "proposals"] });
      navigate(`/dashboard/tools/proposals/${p.id}`);
    } catch {
      toast({ title: t("common.error"), description: t("customerDetail.noProposals"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    try { const [y, m, day] = d.split("-"); return `${m}/${day}/${y}`; } catch { return d; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-medium">{t("customerDetail.tabs.proposals")}</h3>
        <Button size="sm" onClick={handleNewProposal} disabled={creating} data-testid="button-new-proposal-customer">
          {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("common.creating")}</> : <><Plus className="w-4 h-4 mr-2" />{t("customerDetail.createProposal")}</>}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t("customerDetail.noProposals")}
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 rounded-md border hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/tools/proposals/${p.id}`)}
              data-testid={`row-proposal-${p.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" data-testid={`text-proposal-title-${p.id}`}>{p.title}</span>
                  <Badge variant="secondary" className="text-xs">{t(`statuses.${p.status}`, { defaultValue: t("statuses.draft") })}</Badge>
                  {p.versions && p.versions.length > 0 && (
                    <Badge variant="outline" className="text-xs" data-testid={`badge-version-${p.id}`}>
                      v{p.versions[p.versions.length - 1].versionNumber}
                    </Badge>
                  )}
                  {p.estimateNumber && (
                    <span className="text-xs text-muted-foreground">#{p.estimateNumber}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(p.proposalDate)}
                  {p.versions && p.versions.length > 0 && (
                    <span className="ml-2">
                      &middot; {t("statuses.finalized")} {(() => {
                        const d = new Date(p.versions[p.versions.length - 1].finalizedAt);
                        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                      })()}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
