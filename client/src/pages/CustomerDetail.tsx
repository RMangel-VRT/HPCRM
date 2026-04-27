import { useState, useRef, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { useTabParam } from "@/hooks/useTabParam";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer, Contact, Note, Contract, ContractDocument, ContractMonthlyAmount, CustomerRateSheet, InsertContract, InsertContact, InsertNote, InsertCustomer, CustomerMapLayer, PropertyManagementCompany, PropertyManager, Ticket, SnowEvent, SnowEventPropertyImpact } from "@shared/schema";
import { insertContractSchema, insertContactSchema, insertNoteSchema, insertCustomerSchema } from "@shared/schema";
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
import { Switch } from "@/components/ui/switch";
import StatusBadge from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
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

interface ContractCardProps {
  contract: Contract;
  customerId: string;
  canUploadDocuments: boolean;
  onUploadClick: (contractId: string, isReplace: boolean) => void;
  uploadingFile: boolean;
  formatFileSize: (bytes: number) => string;
  setShowVersionHistory: (contractId: string | null) => void;
}

function ContractCard({ contract, customerId, canUploadDocuments, onUploadClick, uploadingFile, formatFileSize, setShowVersionHistory }: ContractCardProps) {
  const { t } = useTranslation();
  const { data: currentDocument, isLoading } = useQuery<ContractDocument>({
    queryKey: ["/api/contracts", contract.id, "documents", "current"],
  });
  
  const { data: rateSheet } = useQuery<CustomerRateSheet | null>({
    queryKey: ["/api/customers", customerId, "rate-sheet"],
  });
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  const canEditBilling = user?.activeRole === "admin" || user?.activeRole === "office";
  const canEndContract = (user?.activeRole === "admin" || user?.activeRole === "office") && contract.status === "active";
  const canDeleteContract = user?.activeRole === "admin";
  
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditContractOpen, setIsEditContractOpen] = useState(false);
  const [editContractData, setEditContractData] = useState({
    serviceType: contract.serviceType,
    billingPattern: contract.billingPattern,
    startDate: format(new Date(contract.startDate), "yyyy-MM-dd"),
    endDate: contract.endDate ? format(new Date(contract.endDate), "yyyy-MM-dd") : "",
    po: contract.po || "",
    notes: contract.notes || "",
    hasMobilizationFee: contract.hasMobilizationFee || false,
    mobilizationFeeAmount: contract.mobilizationFeeAmount ? (contract.mobilizationFeeAmount / 100).toFixed(2) : "0.00",
  });
  
  // Reset edit form data when dialog opens to sync with latest contract data
  useEffect(() => {
    if (isEditContractOpen) {
      setEditContractData({
        serviceType: contract.serviceType,
        billingPattern: contract.billingPattern,
        startDate: format(new Date(contract.startDate), "yyyy-MM-dd"),
        endDate: contract.endDate ? format(new Date(contract.endDate), "yyyy-MM-dd") : "",
        po: contract.po || "",
        notes: contract.notes || "",
        hasMobilizationFee: contract.hasMobilizationFee || false,
        mobilizationFeeAmount: contract.mobilizationFeeAmount ? (contract.mobilizationFeeAmount / 100).toFixed(2) : "0.00",
      });
    }
  }, [isEditContractOpen, contract]);
  
  const { data: monthlyAmounts = [], isLoading: isLoadingAmounts } = useQuery<ContractMonthlyAmount[]>({
    queryKey: ["/api/contracts", contract.id, "monthly-amounts"],
  });
  
  const [localAmounts, setLocalAmounts] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditingAmounts, setIsEditingAmounts] = useState(false);
  const [billingMode, setBillingMode] = useState<"variable" | "even">("variable");
  const [evenMonthlyAmount, setEvenMonthlyAmount] = useState<string>("0.00");
  
  const monthNames = [t("months.jan"), t("months.feb"), t("months.mar"), t("months.apr"), t("months.may"), t("months.jun"), t("months.jul"), t("months.aug"), t("months.sep"), t("months.oct"), t("months.nov"), t("months.dec")];
  
  // Detect billing mode from existing amounts - if all non-zero amounts are the same, it's "even"
  useEffect(() => {
    if (monthlyAmounts.length > 0) {
      const nonZeroAmounts = monthlyAmounts.filter(a => a.amount > 0);
      if (nonZeroAmounts.length > 0) {
        const firstAmount = nonZeroAmounts[0].amount;
        const allSame = nonZeroAmounts.every(a => a.amount === firstAmount);
        if (allSame && nonZeroAmounts.length === 12) {
          setBillingMode("even");
          setEvenMonthlyAmount((firstAmount / 100).toFixed(2));
        } else {
          setBillingMode("variable");
        }
      }
    }
  }, [monthlyAmounts]);
  
  const initializedAmounts = useMemo(() => {
    const amounts: Record<number, string> = {};
    for (let i = 1; i <= 12; i++) {
      const existing = monthlyAmounts.find(a => a.month === i);
      amounts[i] = existing ? (existing.amount / 100).toFixed(2) : "0.00";
    }
    return amounts;
  }, [monthlyAmounts]);
  
  useEffect(() => {
    if (!hasChanges && monthlyAmounts.length > 0) {
      setLocalAmounts(initializedAmounts);
    }
  }, [initializedAmounts, hasChanges, monthlyAmounts.length]);
  
  const annualTotal = useMemo(() => {
    if (billingMode === "even") {
      const monthlyVal = parseFloat(evenMonthlyAmount) || 0;
      return monthlyVal * 12;
    }
    const amounts = Object.keys(localAmounts).length > 0 ? localAmounts : initializedAmounts;
    return Object.values(amounts).reduce((sum, val) => {
      const num = parseFloat(val) || 0;
      return sum + num;
    }, 0);
  }, [localAmounts, initializedAmounts, billingMode, evenMonthlyAmount]);
  
  const handleAmountChange = (month: number, value: string) => {
    // Allow empty string during editing, or valid decimal numbers
    if (value !== "" && !/^\d*\.?\d{0,2}$/.test(value)) return;
    setLocalAmounts(prev => ({ ...prev, [month]: value }));
    setHasChanges(true);
  };
  
  const validateAmounts = () => {
    const amounts = Object.keys(localAmounts).length > 0 ? localAmounts : initializedAmounts;
    for (let i = 1; i <= 12; i++) {
      const value = amounts[i] || "0.00";
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        return false;
      }
    }
    return true;
  };

  const handleEvenAmountChange = (value: string) => {
    if (value !== "" && !/^\d*\.?\d{0,2}$/.test(value)) return;
    setEvenMonthlyAmount(value);
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (billingMode === "even") {
        const evenVal = parseFloat(evenMonthlyAmount);
        if (isNaN(evenVal) || evenVal < 0) {
          throw new Error("Monthly amount must be a non-negative number");
        }
        const amountCents = Math.round(evenVal * 100);
        const data = Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          amount: amountCents,
        }));
        return await apiRequest("PUT", `/api/contracts/${contract.id}/monthly-amounts`, data);
      }
      
      if (!validateAmounts()) {
        throw new Error("All monthly amounts must be non-negative numbers");
      }
      
      const amounts = Object.keys(localAmounts).length > 0 ? localAmounts : initializedAmounts;
      const data = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const amountStr = amounts[month] || "0.00";
        const amountCents = Math.round(parseFloat(amountStr) * 100);
        return {
          month,
          amount: amountCents,
        };
      });
      
      return await apiRequest("PUT", `/api/contracts/${contract.id}/monthly-amounts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contract.id, "monthly-amounts"] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && (
            key.startsWith("/api/revenue/contract-audit") ||
            key.startsWith("/api/revenue/exceptions") ||
            key.startsWith("/api/revenue/overview")
          );
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "all-monthly-amounts"] });
      setHasChanges(false);
      setIsEditingAmounts(false);
      toast({
        title: t("common.success"),
        description: t("contracts.billingAmountsSaved"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const endContractMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/contracts/${contract.id}`, { status: "ended" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contracts"] });
      setShowEndConfirm(false);
      toast({
        title: t("common.success"),
        description: t("contracts.contractEnded"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteContractMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/contracts/${contract.id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contracts"] });
      setShowDeleteConfirm(false);
      toast({
        title: t("common.success"),
        description: t("contracts.contractDeleted"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: async () => {
      const mobilizationCents = editContractData.hasMobilizationFee 
        ? Math.round(parseFloat(editContractData.mobilizationFeeAmount || "0") * 100)
        : 0;
      
      const payload = {
        serviceType: editContractData.serviceType,
        billingPattern: editContractData.billingPattern,
        startDate: new Date(editContractData.startDate).toISOString(),
        endDate: editContractData.endDate ? new Date(editContractData.endDate).toISOString() : null,
        po: editContractData.po || null,
        notes: editContractData.notes || null,
        hasMobilizationFee: editContractData.hasMobilizationFee,
        mobilizationFeeAmount: mobilizationCents,
      };
      
      console.log("Saving contract with payload:", payload);
      
      return await apiRequest("PATCH", `/api/contracts/${contract.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contracts"] });
      setIsEditContractOpen(false);
      toast({
        title: t("common.success"),
        description: t("contracts.contractUpdated"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid={`card-contract-${contract.id}`}>
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
                {canUploadDocuments && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => onUploadClick(contract.id, true)}
                    disabled={uploadingFile}
                    data-testid="button-replace-document"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {t("customerDetail.replace")}
                  </Button>
                )}
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
              {canUploadDocuments && (
                <Button 
                  size="sm"
                  onClick={() => onUploadClick(contract.id, false)}
                  disabled={uploadingFile}
                  data-testid="button-upload-document"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  {t("common.upload")}
                </Button>
              )}
            </div>
          )}
        </div>

        <Separator className="my-3" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{t("customerDetail.billingTabs.monthlySummary")}</p>
            {!isEditingAmounts && canEditBilling && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setIsEditingAmounts(true)}
                data-testid="button-edit-amounts"
              >
                {t("contracts.editAmounts")}
              </Button>
            )}
            {isEditingAmounts && (
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    setLocalAmounts(initializedAmounts);
                    setHasChanges(false);
                    setIsEditingAmounts(false);
                    // Reset billing mode to detected state
                    if (monthlyAmounts.length > 0) {
                      const nonZeroAmounts = monthlyAmounts.filter(a => a.amount > 0);
                      if (nonZeroAmounts.length === 12) {
                        const firstAmount = nonZeroAmounts[0].amount;
                        const allSame = nonZeroAmounts.every(a => a.amount === firstAmount);
                        if (allSame) {
                          setBillingMode("even");
                          setEvenMonthlyAmount((firstAmount / 100).toFixed(2));
                        } else {
                          setBillingMode("variable");
                        }
                      } else {
                        setBillingMode("variable");
                      }
                    }
                  }}
                  data-testid="button-cancel-amounts"
                >
                  {t("common.cancel")}
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    if (billingMode === "variable" && !validateAmounts()) {
                      toast({
                        title: t("contracts.invalidAmounts"),
                        description: t("contracts.invalidAmountsMsg"),
                        variant: "destructive",
                      });
                      return;
                    }
                    saveMutation.mutate();
                  }}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-amounts"
                >
                  {saveMutation.isPending ? t("common.saving") : t("contracts.saveChanges")}
                </Button>
              </div>
            )}
          </div>
          
          {/* Billing Mode Toggle - only shown when editing */}
          {isEditingAmounts && (
            <div className="flex items-center gap-3 mb-3 p-2 bg-muted/30 rounded-md">
              <span className={`text-sm ${billingMode === "variable" ? "font-medium" : "text-muted-foreground"}`}>
                {t("contracts.variable")}
              </span>
              <Switch
                checked={billingMode === "even"}
                onCheckedChange={(checked) => {
                  const newMode = checked ? "even" : "variable";
                  setBillingMode(newMode);
                  setHasChanges(true);
                  // If switching to even, calculate from current amounts
                  if (newMode === "even") {
                    const currentTotal = Object.values(
                      Object.keys(localAmounts).length > 0 ? localAmounts : initializedAmounts
                    ).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
                    setEvenMonthlyAmount((currentTotal / 12).toFixed(2));
                  }
                }}
                data-testid="switch-billing-mode"
              />
              <span className={`text-sm ${billingMode === "even" ? "font-medium" : "text-muted-foreground"}`}>
                {t("contracts.even")}
              </span>
            </div>
          )}
          
          {isLoadingAmounts ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-3">
              {billingMode === "even" && isEditingAmounts ? (
                /* Even mode - single input for all months */
                <div className="p-3 border rounded-md">
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t("customerDetail.sameAmountAll12")}
                  </label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="text"
                      value={evenMonthlyAmount}
                      onChange={(e) => handleEvenAmountChange(e.target.value)}
                      className="pl-6 text-lg font-medium"
                      placeholder="0.00"
                      data-testid="input-even-amount"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("customerDetail.appliedToEach12")}
                  </p>
                </div>
              ) : (
                /* Variable mode - grid of 12 inputs */
                <div className="grid grid-cols-3 gap-2">
                  {monthNames.map((monthName, index) => {
                    const month = index + 1;
                    const amounts = Object.keys(localAmounts).length > 0 ? localAmounts : initializedAmounts;
                    const value = amounts[month] || "0.00";
                    
                    return (
                      <div key={month}>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {monthName}
                        </label>
                        {isEditingAmounts ? (
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              $
                            </span>
                            <Input
                              type="text"
                              value={value}
                              onChange={(e) => handleAmountChange(month, e.target.value)}
                              className="pl-5 text-sm"
                              data-testid={`input-month-${month}`}
                            />
                          </div>
                        ) : (
                          <p className="text-sm font-medium" data-testid={`text-month-${month}`}>
                            ${value}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

        <ContractServices contractId={contract.id} canEdit={canEditBilling} />

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

        {(canEditBilling || canEndContract || canDeleteContract) && (
          <>
            <Separator className="my-3" />
            <div className="flex gap-2 flex-wrap">
              {canEditBilling && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setIsEditContractOpen(true)}
                  data-testid={`button-edit-contract-${contract.id}`}
                >
                  <Edit className="w-3 h-3 mr-1" />
                  {t("common.edit")}
                </Button>
              )}
              {canEndContract && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowEndConfirm(true)}
                  data-testid={`button-end-contract-${contract.id}`}
                >
                  {t("contracts.endContract")}
                </Button>
              )}
              {canDeleteContract && (
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid={`button-delete-contract-${contract.id}`}
                >
                  {t("contracts.deleteContract")}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contracts.endContract")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contracts.endContractMsg")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => endContractMutation.mutate()}
              disabled={endContractMutation.isPending}
            >
              {endContractMutation.isPending ? t("common.saving") : t("contracts.endContract")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contracts.deleteContract")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contracts.deleteContractMsg")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteContractMutation.mutate()}
              disabled={deleteContractMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContractMutation.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditContractOpen} onOpenChange={setIsEditContractOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("customerDetail.editContractDetails")}</DialogTitle>
            <DialogDescription>
              {t("customerDetail.updateContractInfo")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("contracts.serviceType")}</Label>
                <Select 
                  value={editContractData.serviceType} 
                  onValueChange={(v) => setEditContractData({...editContractData, serviceType: v as any})}
                >
                  <SelectTrigger data-testid="edit-select-service-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Maintenance">{t("serviceTypes.maintenance")}</SelectItem>
                    <SelectItem value="Chemical">{t("serviceTypes.chemical")}</SelectItem>
                    <SelectItem value="Snow">{t("serviceTypes.snow")}</SelectItem>
                    <SelectItem value="Irrigation">{t("serviceTypes.irrigation")}</SelectItem>
                    <SelectItem value="Other">{t("serviceTypes.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("contracts.billingSchedule")}</Label>
                <Select 
                  value={editContractData.billingPattern} 
                  onValueChange={(v) => setEditContractData({...editContractData, billingPattern: v as any})}
                >
                  <SelectTrigger data-testid="edit-select-billing-pattern">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("contracts.monthly")}</SelectItem>
                    <SelectItem value="seasonal">{t("contracts.seasonal")}</SelectItem>
                    <SelectItem value="12-of-12">{t("contracts.twelveOfTwelve")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("contracts.startDate")}</Label>
                <Input
                  type="date"
                  value={editContractData.startDate}
                  onChange={(e) => setEditContractData({...editContractData, startDate: e.target.value})}
                  data-testid="edit-input-start-date"
                />
              </div>
              <div>
                <Label>{t("contracts.endDate")}</Label>
                <Input
                  type="date"
                  value={editContractData.endDate}
                  onChange={(e) => setEditContractData({...editContractData, endDate: e.target.value})}
                  data-testid="edit-input-end-date"
                />
              </div>
            </div>
            <div>
              <Label>{t("contracts.poNumber")}</Label>
              <Input
                value={editContractData.po}
                onChange={(e) => setEditContractData({...editContractData, po: e.target.value})}
                placeholder={t("contracts.poNumber")}
                data-testid="edit-input-po"
              />
            </div>
            <div>
              <Label>{t("common.notes")}</Label>
              <Textarea
                value={editContractData.notes}
                onChange={(e) => setEditContractData({...editContractData, notes: e.target.value})}
                placeholder={t("contracts.additionalNotes")}
                data-testid="edit-input-notes"
              />
            </div>
            
            {editContractData.serviceType === "Maintenance" && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="edit-has-mobilization"
                    checked={editContractData.hasMobilizationFee}
                    onCheckedChange={(checked) => setEditContractData({...editContractData, hasMobilizationFee: checked as boolean})}
                    data-testid="edit-checkbox-mobilization"
                  />
                  <label htmlFor="edit-has-mobilization" className="text-sm font-medium cursor-pointer">
                    {t("customerDetail.includesMobilizationFee")}
                  </label>
                </div>
                {editContractData.hasMobilizationFee && (
                  <div>
                    <Label>{t("customerDetail.mobilizationFeeAmount")}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="text"
                        value={editContractData.mobilizationFeeAmount}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
                            setEditContractData({...editContractData, mobilizationFeeAmount: value});
                          }
                        }}
                        className="pl-7"
                        placeholder="0.00"
                        data-testid="edit-input-mobilization-amount"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t("customerDetail.mobilizationFeeDesc")}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditContractOpen(false)} data-testid="edit-button-cancel">
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={() => updateContractMutation.mutate()}
              disabled={updateContractMutation.isPending}
              data-testid="edit-button-save"
            >
              {updateContractMutation.isPending ? t("common.saving") : t("contracts.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface VersionHistoryDialogProps {
  contractId: string | null;
  onClose: () => void;
  formatFileSize: (bytes: number) => string;
}

function VersionHistoryDialog({ contractId, onClose, formatFileSize }: VersionHistoryDialogProps) {
  const { t } = useTranslation();
  const { data: documents = [], isLoading } = useQuery<ContractDocument[]>({
    queryKey: ["/api/contracts", contractId, "documents"],
    enabled: !!contractId,
  });

  return (
    <Dialog open={!!contractId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("contracts.versionHistory")}</DialogTitle>
          <DialogDescription>
            {t("customerDetail.signedAgreement")}
          </DialogDescription>
        </DialogHeader>
        
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
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/dashboard/customers/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const [activeTab, setActiveTab] = useTabParam("overview");

  const [uploadingContractId, setUploadingContractId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isAddContractDialogOpen, setIsAddContractDialogOpen] = useState(false);
  const [showEndedContracts, setShowEndedContracts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer & { childCustomers?: Customer[]; parentCustomer?: Customer | null }>({
    queryKey: ["/api/customers", id],
    enabled: !!id,
  });

  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/customers", id, "contacts"],
    enabled: !!id,
  });

  const { data: notes = [], isLoading: isLoadingNotes } = useQuery<Note[]>({
    queryKey: ["/api/customers", id, "notes"],
    enabled: !!id,
  });

  const { data: contracts = [], isLoading: isLoadingContracts } = useQuery<Contract[]>({
    queryKey: ["/api/customers", id, "contracts"],
    enabled: !!id,
  });

  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery<Ticket[]>({
    queryKey: ["/api/customers", id, "tickets"],
    enabled: !!id,
  });
  
  // Property Management queries
  const { data: pmCompanies = [] } = useQuery<PropertyManagementCompany[]>({
    queryKey: ["/api/property-management-companies"],
  });
  
  const { data: pmManagers = [] } = useQuery<PropertyManager[]>({
    queryKey: ["/api/property-managers"],
  });

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const availableParentCustomers = allCustomers.filter(
    (c) => (c.isParent === "true" || !c.parentCustomerId) && c.id !== id
  );
  const activeCustomersForSwitcher = allCustomers
    .filter((c) => c.active === "true")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const { data: parentContracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/customers", customer?.parentCustomerId, "contracts"],
    enabled: !!customer?.parentCustomerId,
  });

  const canUploadDocuments = user?.activeRole === "admin" || user?.activeRole === "office";
  const canEditContracts = user?.activeRole === "admin" || user?.activeRole === "office";

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
      document.title = `${customerName} | Greenfield`;
    } else {
      document.title = `${customerName} \u2014 ${activeTabLabel} | Greenfield`;
    }
    return () => {
      document.title = "Greenfield";
    };
  }, [customer?.name, activeTab, activeTabLabel, isOverview]);

  const breadcrumbItems: { label: string; href?: string }[] = [
    { label: t("customers.title"), href: "/dashboard/customers" },
    { label: customer?.name || t("common.loading"), href: customer ? `/dashboard/customers/${customer.id}?tab=overview` : undefined },
    ...(!isOverview ? [{ label: activeTabLabel }] : []),
  ];

  useSetBreadcrumbs(breadcrumbItems, [customer?.name, customer?.id, activeTab, activeTabLabel]);

  const contractForm = useForm<Omit<InsertContract, "companyId" | "customerId">>({
    resolver: zodResolver(
      insertContractSchema
        .omit({ companyId: true, customerId: true })
        .refine(
          (data) => {
            if (!data.endDate) return true;
            const start = new Date(data.startDate);
            const end = new Date(data.endDate);
            return end >= start;
          },
          {
            message: "End date must be after or equal to start date",
            path: ["endDate"],
          }
        )
    ),
    defaultValues: {
      serviceType: "Maintenance",
      billingPattern: "monthly",
      status: "active",
      startDate: new Date(),
      endDate: undefined,
      po: "",
      notes: "",
      hasMobilizationFee: false,
      mobilizationFeeAmount: 0,
    },
  });

  const watchedServiceType = contractForm.watch("serviceType");

  const createContractMutation = useMutation({
    mutationFn: async (data: Omit<InsertContract, "companyId" | "customerId">) => {
      return apiRequest("POST", `/api/customers/${id}/contracts`, {
        ...data,
        startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
        endDate: data.endDate ? (data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "contracts"] });
      toast({
        title: t("common.success"),
        description: t("contracts.contractUpdated"),
      });
      setIsAddContractDialogOpen(false);
      contractForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Customer edit management
  const [isEditCustomerDialogOpen, setIsEditCustomerDialogOpen] = useState(false);
  
  const customerForm = useForm<Omit<InsertCustomer, "companyId">>({
    resolver: zodResolver(insertCustomerSchema.omit({ companyId: true })),
    defaultValues: {
      name: customer?.name || "",
      customerNumber: customer?.customerNumber || "",
      street: customer?.street || "",
      city: customer?.city || "",
      state: customer?.state || "",
      zip: customer?.zip || "",
      status: customer?.status || "active",
      tags: customer?.tags || [],
      acres: customer?.acres || "",
      complexityScore: customer?.complexityScore || undefined,
      active: customer?.active || "true",
      customerType: customer?.customerType || "commercial",
      snowEnabled: customer?.snowEnabled || false,
      includeInRoute: customer?.includeInRoute || false,
      propertyManagementCompanyId: customer?.propertyManagementCompanyId || null,
      propertyManagerId: customer?.propertyManagerId || null,
      parentCustomerId: customer?.parentCustomerId || null,
      ranking: customer?.ranking || "standard",
    },
  });

  // Update form when customer data loads
  useEffect(() => {
    if (customer && isEditCustomerDialogOpen) {
      customerForm.reset({
        name: customer.name,
        customerNumber: customer.customerNumber || "",
        street: customer.street,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
        status: customer.status,
        tags: customer.tags || [],
        acres: customer.acres || "",
        complexityScore: customer.complexityScore || undefined,
        active: customer.active,
        customerType: customer.customerType || "commercial",
        snowEnabled: customer.snowEnabled,
        includeInRoute: customer.includeInRoute,
        propertyManagementCompanyId: customer.propertyManagementCompanyId || null,
        propertyManagerId: customer.propertyManagerId || null,
        parentCustomerId: customer.parentCustomerId || null,
        ranking: customer.ranking || "standard",
      });
    }
  }, [customer, customerForm, isEditCustomerDialogOpen]);
  
  // Clear property manager when company changes
  const watchedPmCompanyId = customerForm.watch("propertyManagementCompanyId");
  const prevPmCompanyIdRef = useRef(watchedPmCompanyId);
  useEffect(() => {
    // Only clear if the company ID actually changed (not on initial load)
    if (prevPmCompanyIdRef.current !== undefined && prevPmCompanyIdRef.current !== watchedPmCompanyId) {
      // Always clear manager when company changes to prevent stale data
      customerForm.setValue("propertyManagerId", null);
    }
    prevPmCompanyIdRef.current = watchedPmCompanyId;
  }, [watchedPmCompanyId, customerForm]);

  const updateCustomerMutation = useMutation({
    mutationFn: async (data: Omit<InsertCustomer, "companyId">) => {
      // Include the expectedUpdatedAt to detect conflicts
      const payload = {
        ...data,
        expectedUpdatedAt: customer?.updatedAt,
      };
      const response = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      
      if (response.status === 409) {
        const conflictData = await response.json();
        throw new Error("CONFLICT:" + JSON.stringify(conflictData));
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update customer");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: t("common.success"),
        description: t("customers.updated"),
      });
      setIsEditCustomerDialogOpen(false);
    },
    onError: (error: Error) => {
      if (error.message.startsWith("CONFLICT:")) {
        toast({
          title: t("common.error"),
          description: t("customers.updateFailed"),
          variant: "destructive",
        });
        // Refresh the data
        queryClient.invalidateQueries({ queryKey: ["/api/customers", id] });
        setIsEditCustomerDialogOpen(false);
      } else {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // Contact management
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedPmCompanyForContact, setSelectedPmCompanyForContact] = useState<string | null>(null);

  const contactForm = useForm<Omit<InsertContact, "companyId" | "customerId">>({
    resolver: zodResolver(insertContactSchema.omit({ companyId: true, customerId: true })),
    defaultValues: {
      name: "",
      phones: [],
      emails: [],
      role: "",
      isPrimary: "false",
      notes: "",
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: Omit<InsertContact, "companyId" | "customerId">) => {
      return apiRequest("POST", `/api/customers/${id}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "contacts"] });
      toast({
        title: t("common.success"),
        description: t("customerDetail.contactCreated"),
      });
      setIsAddContactDialogOpen(false);
      setSelectedPmCompanyForContact(null);
      contactForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: { contactId: string; data: Omit<InsertContact, "companyId" | "customerId"> }) => {
      return apiRequest("PATCH", `/api/contacts/${contactId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      toast({
        title: t("common.success"),
        description: t("customerDetail.contactUpdated"),
      });
      setEditingContact(null);
      setSelectedPmCompanyForContact(null);
      contactForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "contacts"] });
      toast({
        title: t("common.success"),
        description: t("customerDetail.contactDeleted"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
        description: error.message,
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
        description: error.message,
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
        description: error.message,
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

  const handleFileSelect = async (contractId: string, isReplace: boolean) => {
    if (!fileInputRef.current) return;
    
    const file = fileInputRef.current.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({
        title: t("common.error"),
        description: t("customerDetail.invalidFileType"),
        variant: "destructive",
      });
      return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t("common.error"),
        description: t("customerDetail.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);

    try {
      const urlResponse = await apiRequest("POST", `/api/contracts/${contractId}/documents/upload-url`);
      const { uploadURL } = await urlResponse.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": "application/pdf",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      await apiRequest("POST", `/api/contracts/${contractId}/documents`, {
        uploadURL: uploadURL,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "documents"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "contracts"] });

      toast({
        title: t("common.success"),
        description: t("customerDetail.documentUploaded"),
      });

      setUploadingContractId(null);
      setShowReplaceConfirm(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: t("common.error"),
        description: t("customerDetail.uploadFailed"),
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleUploadClick = (contractId: string, isReplace: boolean) => {
    if (isReplace) {
      setShowReplaceConfirm(contractId);
    } else {
      setUploadingContractId(contractId);
      setTimeout(() => fileInputRef.current?.click(), 0);
    }
  };

  const confirmReplace = (contractId: string) => {
    setShowReplaceConfirm(null);
    setUploadingContractId(contractId);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

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
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">{t("customers.noCustomersFound")}</p>
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

  const coverage = calculateCoverage(contracts);

  const isChildCustomer = !!customer.parentCustomerId;
  const childCustomers = customer.childCustomers || [];
  const isParentCustomer = customer.isParent === "true" || childCustomers.length > 0;
  const parentCustomer = customer.parentCustomer || null;

  return (
    <div className="flex min-h-full">
      <CustomerRailSidebar
        customerId={customer.id}
        customerName={customer.name}
        customers={activeCustomersForSwitcher}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userRole={user?.activeRole}
        snowEnabled={customer.snowEnabled ?? false}
      />
      <div className="flex-1 min-w-0 space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
      {/* Left column: breadcrumb, name/switcher, badges */}
      <div className="flex flex-col gap-1 min-w-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="breadcrumb-customer-detail">
          <span>{t("customers.title")}</span>
          {isChildCustomer && parentCustomer && (
            <>
              <span>→</span>
              <Link href={`/dashboard/customers/${parentCustomer.id}`} data-testid="text-parent-link">
                <span className="hover:text-foreground cursor-pointer">
                  {parentCustomer.name}
                </span>
              </Link>
            </>
          )}
          {!isOverview && (
            <>
              <span>→</span>
              <span data-testid="breadcrumb-active-tab">{activeTabLabel}</span>
            </>
          )}
        </div>

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
          {isChildCustomer && (
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
        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
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
        <Button 
          size="sm"
          variant="default"
          data-testid="button-edit-customer"
          onClick={() => setIsEditCustomerDialogOpen(true)}
        >
          <Edit className="w-4 h-4 mr-2" />
          {t("common.edit")}
        </Button>
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
          />
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
            <Button 
              size="sm" 
              onClick={() => setIsAddContactDialogOpen(true)}
              data-testid="button-add-contact"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("customerDetail.addContact")}
            </Button>
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
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          setEditingContact(contact);
                          contactForm.reset({
                            name: contact.name,
                            phones: contact.phones || [],
                            emails: contact.emails || [],
                            role: contact.role || "",
                            isPrimary: contact.isPrimary,
                            notes: contact.notes || "",
                          });
                        }}
                        data-testid={`button-edit-contact-${contact.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("common.delete")} {t("customerDetail.tabs.contacts")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("ticketDetail.cannotUndo")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteContactMutation.mutate(contact.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t("common.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
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

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
          <>
            <TabsContent value="proposals" className="space-y-4">
              <CustomerProposalsSection customerId={params?.id!} />
            </TabsContent>
            <TabsContent value="visual-scopes" className="space-y-4">
              <CustomerVisualScopesSection customerId={params?.id!} />
            </TabsContent>
            <TabsContent value="contracts" className="space-y-4">
                {isChildCustomer && parentCustomer ? (
                  <div className="space-y-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 className="w-4 h-4" />
                          <span>
                            {t("customerDetail.parentContractsManaged")}{" "}
                            <Link href={`/dashboard/customers/${parentCustomer.id}`}>
                              <span className="text-primary hover:underline cursor-pointer" data-testid="link-parent-contracts">
                                {t("common.view")} {parentCustomer.name} {t("customerDetail.billingTabs.contracts")}
                              </span>
                            </Link>
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                    {parentContracts.filter(c => c.status === "active" || c.status === "paused").map((contract) => (
                      <Card key={contract.id} className="opacity-80" data-testid={`card-parent-contract-${contract.id}`}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{contract.serviceType}</p>
                              <p className="text-sm text-muted-foreground">
                                {contract.billingPattern} {t("customerDetail.tabs.billing")}
                              </p>
                            </div>
                            <Badge variant={contract.status === "active" ? "default" : "secondary"}>
                              {contract.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {contracts.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 mt-6 mb-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <h3 className="text-sm font-medium text-muted-foreground">
                            {t("customerDetail.legacyContracts")}
                          </h3>
                        </div>
                        {contracts.map((contract) => (
                          <Card key={contract.id} className="border-dashed" data-testid={`card-legacy-contract-${contract.id}`}>
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <p className="font-medium">{contract.serviceType}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {contract.billingPattern} {t("customerDetail.tabs.billing")}
                                    {contract.endDate && (
                                      <span> · {t("contracts.endDate")} {new Date(contract.endDate).toLocaleDateString()}</span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{t("customerDetail.legacy")}</Badge>
                                  <Badge variant={contract.status === "active" ? "default" : (contract.status === "ended" ? "destructive" : "secondary")}>
                                    {contract.status}
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                <>
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
                  {canEditContracts && (
                    <Button size="sm" onClick={() => setIsAddContractDialogOpen(true)} data-testid="button-add-contract">
                      <Plus className="w-4 h-4 mr-2" />
                      {t("customerDetail.newContract")}
                    </Button>
                  )}
                </div>
              
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={() => uploadingContractId && handleFileSelect(uploadingContractId, showReplaceConfirm !== null)}
                />
              
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
                          canUploadDocuments={canUploadDocuments}
                          onUploadClick={handleUploadClick}
                          uploadingFile={uploadingFile}
                          formatFileSize={formatFileSize}
                          setShowVersionHistory={setShowVersionHistory}
                        />
                      ))}
                    </div>
                  );
                })()}

                <AlertDialog open={showReplaceConfirm !== null} onOpenChange={(open) => !open && setShowReplaceConfirm(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("customerDetail.replaceDocument")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("customerDetail.replaceDocumentMsg")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => showReplaceConfirm && confirmReplace(showReplaceConfirm)}>
                        {t("customerDetail.replaceBtn")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <VersionHistoryDialog 
                  contractId={showVersionHistory}
                  onClose={() => setShowVersionHistory(null)}
                  formatFileSize={formatFileSize}
                />
                </>
                )}
              </TabsContent>

            <TabsContent value="rate-sheet" className="space-y-4">
              <RateSheetSection customerId={params?.id!} />
            </TabsContent>

            <TabsContent value="revenue" className="space-y-4">
              <RevenueSection customerId={params?.id!} />
            </TabsContent>

            <TabsContent value="monthly-summary" className="space-y-4">
              <MonthlyBillingSummarySection customerId={params?.id!} contracts={contracts} />
            </TabsContent>
          </>
        )}

        {customer.snowEnabled && (user?.activeRole === "admin" || user?.activeRole === "office" || user?.activeRole === "field_manager") && (
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

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
          <TabsContent value="communications" className="space-y-4">
            <CommunicationListTab
              queryKey={["/api/customers", params?.id!, "communications"]}
            />
          </TabsContent>
        )}

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
          <TabsContent value="settings" className="space-y-4">
            {customer && <CustomerLocationEditor customer={customer} />}
            <CustomerSchedulingSection customerId={params?.id!} />
          </TabsContent>
        )}

        <TabsContent value="fulfillment" className="space-y-4">
          <ServiceFulfillmentPanel customerId={params?.id!} />
        </TabsContent>
      </Tabs>

      <Dialog open={isAddContractDialogOpen} onOpenChange={setIsAddContractDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("customerDetail.addContractTitle")}</DialogTitle>
            <DialogDescription>
              {t("customerDetail.addContractDesc")}
            </DialogDescription>
          </DialogHeader>
          <Form {...contractForm}>
            <form onSubmit={contractForm.handleSubmit((data) => createContractMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={contractForm.control}
                  name="serviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("contracts.serviceType")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-service-type">
                            <SelectValue placeholder={t("contracts.serviceType")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Maintenance">{t("serviceTypes.maintenance")}</SelectItem>
                          <SelectItem value="Chemical">{t("serviceTypes.chemical")}</SelectItem>
                          <SelectItem value="Snow">{t("serviceTypes.snow")}</SelectItem>
                          <SelectItem value="Irrigation">{t("serviceTypes.irrigation")}</SelectItem>
                          <SelectItem value="Other">{t("serviceTypes.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contractForm.control}
                  name="billingPattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("contracts.billingSchedule")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-billing-pattern">
                            <SelectValue placeholder={t("contracts.billingSchedule")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monthly">{t("contracts.monthly")}</SelectItem>
                          <SelectItem value="seasonal">{t("contracts.seasonal")}</SelectItem>
                          <SelectItem value="12-of-12">{t("contracts.twelveOfTwelve")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={contractForm.control}
                  name="startDate"
                  render={({ field }) => {
                    const dateValue = field.value instanceof Date && !isNaN(field.value.getTime())
                      ? field.value.toISOString().split('T')[0] 
                      : '';
                    return (
                      <FormItem>
                        <FormLabel>{t("contracts.startDate")} *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            data-testid="input-start-date"
                            value={dateValue}
                            onChange={(e) => {
                              const dateStr = e.target.value;
                              if (dateStr) {
                                const date = new Date(dateStr + 'T00:00:00');
                                field.onChange(date);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={contractForm.control}
                  name="endDate"
                  render={({ field }) => {
                    const dateValue = field.value instanceof Date && !isNaN(field.value.getTime())
                      ? field.value.toISOString().split('T')[0] 
                      : '';
                    return (
                      <FormItem>
                        <FormLabel>{t("contracts.endDate")}</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            data-testid="input-end-date"
                            value={dateValue}
                            onChange={(e) => {
                              const dateStr = e.target.value;
                              if (dateStr) {
                                const date = new Date(dateStr + 'T00:00:00');
                                field.onChange(date);
                              } else {
                                field.onChange(undefined);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <FormField
                control={contractForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.status")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder={t("common.status")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">{t("statuses.active")}</SelectItem>
                        <SelectItem value="paused">{t("statuses.paused")}</SelectItem>
                        <SelectItem value="ended">{t("statuses.ended")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contractForm.control}
                name="po"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("contracts.poNumber")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("contracts.poNumber")} {...field} value={field.value || ""} data-testid="input-po" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contractForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.notes")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("contracts.additionalNotes")}
                        {...field}
                        value={field.value || ""}
                        data-testid="textarea-notes"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {watchedServiceType === "Maintenance" && (
                <div className="space-y-3 pt-2 border-t">
                  <FormField
                    control={contractForm.control}
                    name="hasMobilizationFee"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox 
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-has-mobilization"
                          />
                        </FormControl>
                        <FormLabel className="font-medium cursor-pointer">
                          {t("customerDetail.includesMobilizationFee")}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  {contractForm.watch("hasMobilizationFee") && (
                    <FormField
                      control={contractForm.control}
                      name="mobilizationFeeAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("customerDetail.mobilizationFeeAmount")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="pl-7"
                                placeholder="0.00"
                                value={(field.value || 0) / 100}
                                onChange={(e) => {
                                  const cents = Math.round(parseFloat(e.target.value || "0") * 100);
                                  field.onChange(cents);
                                }}
                                data-testid="input-mobilization-amount"
                              />
                            </div>
                          </FormControl>
                          <FormDescription>{t("customerDetail.mobilizationFeeDesc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddContractDialogOpen(false)} data-testid="button-cancel">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createContractMutation.isPending} data-testid="button-save-contract">
                  {createContractMutation.isPending ? t("common.creating") : t("common.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddContactDialogOpen || !!editingContact} onOpenChange={(open) => {
        if (!open) {
          setIsAddContactDialogOpen(false);
          setEditingContact(null);
          setSelectedPmCompanyForContact(null);
          contactForm.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContact ? t("customerDetail.editContact") : t("customerDetail.addContact")}</DialogTitle>
            <DialogDescription>
              {editingContact ? t("customerDetail.updateContactInfo") : t("customerDetail.addContactDesc")}
            </DialogDescription>
          </DialogHeader>
          <Form {...contactForm}>
            <form onSubmit={contactForm.handleSubmit((data) => {
              const payload = {
                ...data,
                selectedPmCompanyId: data.role === "Property Manager" ? selectedPmCompanyForContact : null,
              };
              if (editingContact) {
                updateContactMutation.mutate({ contactId: editingContact.id, data: payload });
              } else {
                createContactMutation.mutate(payload);
              }
            })} className="space-y-4">
              <FormField
                control={contactForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")} *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-contact-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="phones"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.phone")}</FormLabel>
                    <div className="space-y-2">
                      {(field.value || []).map((phone: string, index: number) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder="555-1234"
                            value={phone}
                            onChange={(e) => {
                              const newPhones = [...(field.value || [])];
                              newPhones[index] = e.target.value;
                              field.onChange(newPhones);
                            }}
                            data-testid={`input-contact-phone-${index}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newPhones = (field.value || []).filter((_: string, i: number) => i !== index);
                              field.onChange(newPhones);
                            }}
                            data-testid={`button-remove-phone-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => field.onChange([...(field.value || []), ""])}
                        data-testid="button-add-phone"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t("common.add")} {t("common.phone")}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="emails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.email")}</FormLabel>
                    <div className="space-y-2">
                      {(field.value || []).map((email: string, index: number) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="john@example.com"
                            value={email}
                            onChange={(e) => {
                              const newEmails = [...(field.value || [])];
                              newEmails[index] = e.target.value;
                              field.onChange(newEmails);
                            }}
                            data-testid={`input-contact-email-${index}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newEmails = (field.value || []).filter((_: string, i: number) => i !== index);
                              field.onChange(newEmails);
                            }}
                            data-testid={`button-remove-email-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => field.onChange([...(field.value || []), ""])}
                        data-testid="button-add-email"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t("common.add")} {t("common.email")}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customerDetail.contactRole")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-contact-role">
                          <SelectValue placeholder={t("customerDetail.contactRole")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Property Manager">{t("customerDetail.propertyManager")}</SelectItem>
                        <SelectItem value="Board President">{t("customerDetail.boardPresident")}</SelectItem>
                        <SelectItem value="HOA Contact">{t("customerDetail.hoaContact")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {contactForm.watch("role") === "Property Manager" && (
                <FormItem>
                  <FormLabel>{t("customerDetail.propertyManagement")}</FormLabel>
                  <Select 
                    value={selectedPmCompanyForContact || ""} 
                    onValueChange={setSelectedPmCompanyForContact}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-pm-company-for-contact">
                        <SelectValue placeholder={t("customerDetail.propertyManagement")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {pmCompanies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t("customerDetail.propertyManagement")}
                  </FormDescription>
                </FormItem>
              )}
              <FormField
                control={contactForm.control}
                name="isPrimary"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value === "true"}
                        onCheckedChange={(checked) => field.onChange(checked ? "true" : "false")}
                        data-testid="checkbox-contact-primary"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">{t("customers.primaryContact")}</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.notes")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("common.notes")} {...field} value={field.value || ""} rows={3} data-testid="textarea-contact-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddContactDialogOpen(false);
                  setEditingContact(null);
                  setSelectedPmCompanyForContact(null);
                  contactForm.reset();
                }} data-testid="button-cancel-contact">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createContactMutation.isPending || updateContactMutation.isPending} data-testid="button-save-contact">
                  {editingContact 
                    ? (updateContactMutation.isPending ? t("common.saving") : t("common.save"))
                    : (createContactMutation.isPending ? t("common.creating") : t("common.create"))
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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

      <Dialog open={isEditCustomerDialogOpen} onOpenChange={setIsEditCustomerDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("customerDetail.editCustomer")}</DialogTitle>
            <DialogDescription>
              {t("customerDetail.updateCustomerInfo")}
            </DialogDescription>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit((data) => updateCustomerMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={customerForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customers.customerName")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Corporation" {...field} data-testid="input-customer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="customerNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customers.customerNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder="CUST-001" {...field} value={field.value || ""} data-testid="input-customer-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={customerForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.status")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer-status">
                            <SelectValue placeholder={t("common.status")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t("statuses.active")}</SelectItem>
                          <SelectItem value="prospect">{t("statuses.prospect")}</SelectItem>
                          <SelectItem value="inactive">{t("statuses.inactive")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="acres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customers.acres")}</FormLabel>
                      <FormControl>
                        <Input placeholder="1.5" {...field} value={field.value || ""} data-testid="input-customer-acres" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={customerForm.control}
                name="street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.streetAddress")} *</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" {...field} data-testid="input-customer-street" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={customerForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customers.city")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Cityville" {...field} data-testid="input-customer-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customers.state")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="TX" {...field} data-testid="input-customer-state" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customers.zipCode")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} data-testid="input-customer-zip" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={customerForm.control}
                name="complexityScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.complexity")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-customer-complexity">
                          <SelectValue placeholder={t("customers.complexity")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">{t("customerDetail.complexitySimple")}</SelectItem>
                        <SelectItem value="2">{t("customerDetail.complexityBelowAvg")}</SelectItem>
                        <SelectItem value="3">{t("customerDetail.complexityAverage")}</SelectItem>
                        <SelectItem value="4">{t("customerDetail.complexityAboveAvg")}</SelectItem>
                        <SelectItem value="5">{t("customerDetail.complexityComplex")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={customerForm.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("campaigns.customerTypeLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "commercial"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer-type-edit">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="commercial">{t("campaigns.customerTypeCommercial")}</SelectItem>
                          <SelectItem value="hoa">{t("campaigns.customerTypeHoa")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="ranking"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ranking</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "standard"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer-ranking">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="standard" data-testid="option-ranking-standard">Standard</SelectItem>
                          <SelectItem value="preferred" data-testid="option-ranking-preferred">Preferred</SelectItem>
                          <SelectItem value="key_account" data-testid="option-ranking-key-account">Key Account</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={customerForm.control}
                name="snowEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>{t("customerDetail.snowEnabled")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("customerDetail.snowEnabledDesc")}
                      </p>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-snow-enabled"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={customerForm.control}
                name="includeInRoute"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>{t("customerDetail.includeInRoute")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("customerDetail.includeInRouteDesc")}
                      </p>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-include-in-route"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={customerForm.control}
                name="parentCustomerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customerDetail.parentAccount")}</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === "_none" ? null : value)} 
                      value={field.value || "_none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-customer-parent">
                          <SelectValue placeholder={t("customerDetail.parentAccount")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">{t("common.none")}</SelectItem>
                        {availableParentCustomers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={customerForm.control}
                  name="propertyManagementCompanyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customerDetail.propertyManagement")}</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "_none" ? null : value)} 
                        value={field.value || "_none"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-customer-pm-company">
                            <SelectValue placeholder={t("customerDetail.propertyManagement")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("common.none")}</SelectItem>
                          {pmCompanies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="propertyManagerId"
                  render={({ field }) => {
                    const selectedPmCompanyId = customerForm.watch("propertyManagementCompanyId");
                    const filteredManagers = selectedPmCompanyId 
                      ? pmManagers.filter(m => m.propertyManagementCompanyId === selectedPmCompanyId)
                      : pmManagers;
                    return (
                      <FormItem>
                        <FormLabel>{t("customerDetail.propertyManager")}</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "_none" ? null : value)} 
                          value={field.value || "_none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-customer-pm-manager">
                              <SelectValue placeholder={t("customerDetail.propertyManager")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">{t("common.none")}</SelectItem>
                            {filteredManagers.map((manager) => (
                              <SelectItem key={manager.id} value={manager.id}>
                                {manager.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsEditCustomerDialogOpen(false);
                    customerForm.reset();
                  }} 
                  data-testid="button-cancel-customer"
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={updateCustomerMutation.isPending} data-testid="button-save-customer">
                  {updateCustomerMutation.isPending ? t("common.saving") : t("common.save")}
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

interface MonthlyBillingSummaryProps {
  customerId: string;
  contracts: Contract[];
}

function MonthlyBillingSummarySection({ customerId, contracts }: MonthlyBillingSummaryProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const { data: allMonthlyAmounts = [] } = useQuery<{ contractId: string; amounts: ContractMonthlyAmount[] }[]>({
    queryKey: ["/api/customers", customerId, "all-monthly-amounts", selectedYear],
  });
  
  const monthNames = [t("months.jan"), t("months.feb"), t("months.mar"), t("months.apr"), t("months.may"), t("months.jun"), t("months.jul"), t("months.aug"), t("months.sep"), t("months.oct"), t("months.nov"), t("months.dec")];
  
  const activeContracts = contracts.filter(c => c.status === "active" || c.status === "paused");
  
  const monthlySummary = useMemo(() => {
    const summary: { month: number; total: number; byContract: { contractId: string; serviceType: string; amount: number }[] }[] = [];
    
    for (let month = 1; month <= 12; month++) {
      const monthData: { month: number; total: number; byContract: { contractId: string; serviceType: string; amount: number }[] } = {
        month,
        total: 0,
        byContract: []
      };
      
      for (const contractAmounts of allMonthlyAmounts) {
        const contract = contracts.find(c => c.id === contractAmounts.contractId);
        if (!contract || contract.status === "ended") continue;
        
        const monthAmount = contractAmounts.amounts.find(a => a.month === month);
        if (monthAmount && monthAmount.amount > 0) {
          const amount = monthAmount.amount / 100;
          monthData.total += amount;
          monthData.byContract.push({
            contractId: contract.id,
            serviceType: contract.serviceType,
            amount
          });
        }
      }
      
      summary.push(monthData);
    }
    
    return summary;
  }, [allMonthlyAmounts, contracts]);
  
  const totalAnnual = monthlySummary.reduce((sum, m) => sum + m.total, 0);
  
  const maintenanceMonthly = monthlySummary.map(m => ({
    month: m.month,
    amount: m.byContract.filter(c => c.serviceType === "Maintenance").reduce((sum, c) => sum + c.amount, 0)
  }));
  
  const chemicalMonthly = monthlySummary.map(m => ({
    month: m.month,
    amount: m.byContract.filter(c => c.serviceType === "Chemical").reduce((sum, c) => sum + c.amount, 0)
  }));
  
  const otherMonthly = monthlySummary.map(m => ({
    month: m.month,
    amount: m.byContract.filter(c => c.serviceType !== "Maintenance" && c.serviceType !== "Chemical").reduce((sum, c) => sum + c.amount, 0)
  }));
  
  // Mobilization fees are monthly recurring, so calculate monthly total
  const monthlyMobilizationTotal = useMemo(() => {
    return activeContracts
      .filter(c => c.hasMobilizationFee && c.mobilizationFeeAmount && c.mobilizationFeeAmount > 0)
      .reduce((sum, c) => sum + (c.mobilizationFeeAmount / 100), 0);
  }, [activeContracts]);
  
  // Calculate annual mobilization (12 months * monthly mobilization)
  const annualMobilization = monthlyMobilizationTotal * 12;
  
  // Add mobilization to each month's total for the real total billing
  const totalAnnualWithMobilization = totalAnnual + annualMobilization;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("customerDetail.monthlySummaryTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("customerDetail.monthlySummaryDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedYear(selectedYear - 1)}
            data-testid="button-summary-prev-year"
          >
            ← {selectedYear - 1}
          </Button>
          <span className="text-sm font-medium px-3" data-testid="text-summary-year">{selectedYear}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedYear(selectedYear + 1)}
            data-testid="button-summary-next-year"
          >
            {selectedYear + 1} →
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("customerDetail.annualTotal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-summary-annual-total">
              ${totalAnnualWithMobilization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {monthlyMobilizationTotal > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("customerDetail.includesMobilizationFee")} ${annualMobilization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("customerDetail.activeContracts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-summary-active-contracts">
              {activeContracts.length}
            </p>
          </CardContent>
        </Card>
        {monthlyMobilizationTotal > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("customerDetail.mobilizationFeeAmount")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-summary-mobilization">
                ${monthlyMobilizationTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ${annualMobilization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/year
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("customerDetail.monthlyBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("contracts.month")}</TableHead>
                <TableHead className="text-right">{t("serviceTypes.maintenance")}</TableHead>
                <TableHead className="text-right">{t("serviceTypes.chemical")}</TableHead>
                <TableHead className="text-right">{t("serviceTypes.other")}</TableHead>
                {monthlyMobilizationTotal > 0 && (
                  <TableHead className="text-right">{t("customerDetail.mobilizationFeeAmount")}</TableHead>
                )}
                <TableHead className="text-right">{t("common.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlySummary.map((month, idx) => {
                const monthTotalWithMobilization = month.total + monthlyMobilizationTotal;
                return (
                  <TableRow key={month.month} data-testid={`row-month-${month.month}`}>
                    <TableCell className="font-medium">{monthNames[idx]}</TableCell>
                    <TableCell className="text-right">
                      {maintenanceMonthly[idx].amount > 0 
                        ? `$${maintenanceMonthly[idx].amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {chemicalMonthly[idx].amount > 0 
                        ? `$${chemicalMonthly[idx].amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {otherMonthly[idx].amount > 0 
                        ? `$${otherMonthly[idx].amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                    {monthlyMobilizationTotal > 0 && (
                      <TableCell className="text-right">
                        ${monthlyMobilizationTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-semibold">
                      {monthTotalWithMobilization > 0 
                        ? `$${monthTotalWithMobilization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-bold border-t-2">
                <TableCell>{t("common.total")}</TableCell>
                <TableCell className="text-right">
                  ${maintenanceMonthly.reduce((sum, m) => sum + m.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right">
                  ${chemicalMonthly.reduce((sum, m) => sum + m.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right">
                  ${otherMonthly.reduce((sum, m) => sum + m.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                {monthlyMobilizationTotal > 0 && (
                  <TableCell className="text-right">
                    ${annualMobilization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  ${totalAnnualWithMobilization.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
    </div>
  );
}

interface CustomerRevenueData {
  annualProjection: number;
  monthlyBreakdown: { month: number; total: number; byServiceType: { serviceType: string; amount: number }[] }[];
  contractBreakdown: { contractId: string; serviceType: string; status: string; startDate: Date; endDate: Date | null; annualTotal: number }[];
}

function RevenueSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const { data: revenueData, isLoading } = useQuery<CustomerRevenueData>({
    queryKey: ["/api/customers", customerId, "revenue", selectedYear],
  });
  
  const monthNames = [t("months.jan"), t("months.feb"), t("months.mar"), t("months.apr"), t("months.may"), t("months.jun"), t("months.jul"), t("months.aug"), t("months.sep"), t("months.oct"), t("months.nov"), t("months.dec")];
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  
  if (!revenueData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-sm text-muted-foreground">{t("customerDetail.noDocumentsFound")}</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("customerDetail.revenueOverview")}</h3>
          <p className="text-sm text-muted-foreground">{t("customerDetail.revenueDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedYear(selectedYear - 1)}
            data-testid="button-prev-year"
          >
            ← {selectedYear - 1}
          </Button>
          <span className="text-sm font-medium px-3" data-testid="text-selected-year">{selectedYear}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedYear(selectedYear + 1)}
            data-testid="button-next-year"
          >
            {selectedYear + 1} →
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("customerDetail.annualProjection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold" data-testid="text-annual-projection">
            ${revenueData.annualProjection.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("customerDetail.annualTotal")} {selectedYear}
          </p>
        </CardContent>
      </Card>
      
      {(() => {
        const maintenanceTotal = revenueData.monthlyBreakdown.reduce((sum, month) => {
          const maintenance = month.byServiceType.find(s => s.serviceType === 'Maintenance');
          return sum + (maintenance?.amount || 0);
        }, 0);
        const chemicalTotal = revenueData.monthlyBreakdown.reduce((sum, month) => {
          const chemical = month.byServiceType.find(s => s.serviceType === 'Chemical');
          return sum + (chemical?.amount || 0);
        }, 0);
        
        if (maintenanceTotal === 0 && chemicalTotal === 0) return null;
        
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("serviceTypes.maintenance")} {t("customerDetail.billingTabs.revenue")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-maintenance-total">
                  ${maintenanceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("customerDetail.annualTotal")} {selectedYear}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("serviceTypes.chemical")} {t("customerDetail.billingTabs.revenue")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-chemical-total">
                  ${chemicalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("customerDetail.annualTotal")} {selectedYear}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("contracts.month")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {revenueData.monthlyBreakdown.map((monthData) => (
              <div key={monthData.month} className="p-3 border rounded-md">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {monthNames[monthData.month - 1]}
                </p>
                <p className="text-lg font-semibold" data-testid={`text-month-${monthData.month}-total`}>
                  ${monthData.total.toFixed(2)}
                </p>
                {monthData.byServiceType.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {monthData.byServiceType.map((service) => (
                      <div key={service.serviceType} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{service.serviceType}:</span>
                        <span className="font-medium">${service.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("customerDetail.billingTabs.contracts")}</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.contractBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("customerDetail.noDocumentsFound")}</p>
          ) : (
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium">{t("contracts.serviceType")}</th>
                    <th className="text-left p-3 text-xs font-medium">{t("common.status")}</th>
                    <th className="text-left p-3 text-xs font-medium">{t("contracts.startDate")}</th>
                    <th className="text-right p-3 text-xs font-medium">{t("customerDetail.annualTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.contractBreakdown.map((contract) => (
                    <tr key={contract.contractId} className="border-b last:border-0" data-testid={`row-contract-${contract.contractId}`}>
                      <td className="p-3 text-sm">{contract.serviceType}</td>
                      <td className="p-3">
                        <StatusBadge status={contract.status as "active" | "paused" | "ended"} />
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {format(new Date(contract.startDate), "MMM d, yyyy")}
                        {contract.endDate ? ` - ${format(new Date(contract.endDate), "MMM d, yyyy")}` : ` - ${t("customerDetail.ongoing")}`}
                      </td>
                      <td className="p-3 text-sm font-semibold text-right" data-testid={`text-contract-${contract.contractId}-total`}>
                        ${contract.annualTotal.toFixed(2)}
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

// RateInput component defined outside to prevent focus loss on re-renders
interface RateInputProps {
  label: string;
  field: string;
  unit: string;
  value: string;
  onChange: (field: string, value: string) => void;
  canEdit: boolean;
  isPending: boolean;
}

function RateInput({ label, field, unit, value, onChange, canEdit, isPending }: RateInputProps) {
  return (
    <div>
      <Label htmlFor={field} className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <div className="relative flex-1">
          <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id={field}
            data-testid={`input-rate-${field}`}
            value={value}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder={canEdit ? "Not set" : "—"}
            disabled={!canEdit || isPending}
            className="pl-8"
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}

function RateSheetSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: rateSheet, isLoading } = useQuery<CustomerRateSheet | null>({
    queryKey: ["/api/customers", customerId, "rate-sheet"],
  });

  const [localRates, setLocalRates] = useState<Record<string, string>>({});
  const [localNotes, setLocalNotes] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (rateSheet && !hasChanges) {
      const rates: Record<string, string> = {};
      
      // Maintenance & Emergency Labor
      if (rateSheet.generalLabor !== null) rates.generalLabor = (rateSheet.generalLabor / 100).toFixed(2);
      if (rateSheet.operatorLabor !== null) rates.operatorLabor = (rateSheet.operatorLabor / 100).toFixed(2);
      if (rateSheet.irrigationLabor !== null) rates.irrigationLabor = (rateSheet.irrigationLabor / 100).toFixed(2);
      if (rateSheet.emergencyGeneralLabor !== null) rates.emergencyGeneralLabor = (rateSheet.emergencyGeneralLabor / 100).toFixed(2);
      if (rateSheet.emergencyIrrigationLabor !== null) rates.emergencyIrrigationLabor = (rateSheet.emergencyIrrigationLabor / 100).toFixed(2);
      
      // Snow & Ice Services
      if (rateSheet.handShovelLabor !== null) rates.handShovelLabor = (rateSheet.handShovelLabor / 100).toFixed(2);
      if (rateSheet.plowTruck !== null) rates.plowTruck = (rateSheet.plowTruck / 100).toFixed(2);
      if (rateSheet.atv !== null) rates.atv = (rateSheet.atv / 100).toFixed(2);
      if (rateSheet.skidSteer !== null) rates.skidSteer = (rateSheet.skidSteer / 100).toFixed(2);
      if (rateSheet.snowBlower !== null) rates.snowBlower = (rateSheet.snowBlower / 100).toFixed(2);
      if (rateSheet.iceMeltMaterial !== null) rates.iceMeltMaterial = (rateSheet.iceMeltMaterial / 100).toFixed(2);
      if (rateSheet.iceMeltApplicationLabor !== null) rates.iceMeltApplicationLabor = (rateSheet.iceMeltApplicationLabor / 100).toFixed(2);
      
      setLocalRates(rates);
      setLocalNotes(rateSheet.notes || "");
    }
  }, [rateSheet, hasChanges]);

  const handleRateChange = (field: string, value: string) => {
    // Only allow positive numbers with up to 2 decimal places or empty string
    if (value !== "" && !/^\d*\.?\d{0,2}$/.test(value)) return;
    
    setLocalRates(prev => {
      const updated = { ...prev };
      if (value === "") {
        delete updated[field];
      } else {
        updated[field] = value;
      }
      return updated;
    });
    setHasChanges(true);
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data: Record<string, number | null | string> = {};
      
      // Convert all rate fields to cents or null
      const rateFields = [
        'generalLabor', 'operatorLabor', 'irrigationLabor', 'emergencyGeneralLabor', 'emergencyIrrigationLabor',
        'handShovelLabor', 'plowTruck', 'atv', 'skidSteer', 'snowBlower', 'iceMeltMaterial', 'iceMeltApplicationLabor'
      ];
      
      for (const field of rateFields) {
        if (localRates[field] && localRates[field] !== "") {
          data[field] = Math.round(parseFloat(localRates[field]) * 100);
        } else {
          data[field] = null;
        }
      }
      
      data.notes = localNotes || null;
      
      return await apiRequest("PUT", `/api/customers/${customerId}/rate-sheet`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "rate-sheet"] });
      setHasChanges(false);
      toast({
        title: t("common.success"),
        description: t("customerDetail.rateSheetSaved"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message || t("customerDetail.rateSheetError"),
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={["maintenance", "snow"]} className="space-y-4">
        <AccordionItem value="maintenance">
          <AccordionTrigger className="text-lg font-semibold" data-testid="accordion-maintenance">
            {t("customerDetail.landscapingRates")}
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RateInput label={t("customerDetail.generalLabor")} field="generalLabor" unit={t("customerDetail.perHour")} value={localRates.generalLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.operatorLabor")} field="operatorLabor" unit={t("customerDetail.perHour")} value={localRates.operatorLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.irrigationLabor")} field="irrigationLabor" unit={t("customerDetail.perHour")} value={localRates.irrigationLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.emergencyGeneralLabor")} field="emergencyGeneralLabor" unit={t("customerDetail.perHour")} value={localRates.emergencyGeneralLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.emergencyIrrigationLabor")} field="emergencyIrrigationLabor" unit={t("customerDetail.perHour")} value={localRates.emergencyIrrigationLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="snow">
          <AccordionTrigger className="text-lg font-semibold" data-testid="accordion-snow">
            {t("customerDetail.snowRates")}
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RateInput label={t("customerDetail.handShovel")} field="handShovelLabor" unit={t("customerDetail.perHour")} value={localRates.handShovelLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.plowTruck")} field="plowTruck" unit={t("customerDetail.perHour")} value={localRates.plowTruck || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.atv")} field="atv" unit={t("customerDetail.perHour")} value={localRates.atv || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.skidSteer")} field="skidSteer" unit={t("customerDetail.perHour")} value={localRates.skidSteer || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.snowBlower")} field="snowBlower" unit={t("customerDetail.perHour")} value={localRates.snowBlower || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.iceMeltMaterial")} field="iceMeltMaterial" unit={t("customerDetail.perPound")} value={localRates.iceMeltMaterial || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label={t("customerDetail.iceMeltApplicationLabor")} field="iceMeltApplicationLabor" unit={t("customerDetail.perHour")} value={localRates.iceMeltApplicationLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("customerDetail.rateNotes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            data-testid="textarea-rate-notes"
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder={canEdit ? t("customerDetail.rateNotesPlaceholder") : "—"}
            disabled={!canEdit || saveMutation.isPending}
            rows={3}
          />
        </CardContent>
      </Card>

      {rateSheet?.lastUpdatedBy && rateSheet?.lastUpdatedAt && (
        <div className="text-sm text-muted-foreground" data-testid="text-last-updated">
          {t("customerDetail.lastUpdated")} {format(new Date(rateSheet.lastUpdatedAt), "PPp")}
        </div>
      )}

      {canEdit && hasChanges && (
        <div className="flex justify-end">
          <Button
            data-testid="button-save-rate-sheet"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? t("common.saving") : t("customerDetail.saveRates")}
          </Button>
        </div>
      )}

      {!canEdit && (
        <div className="text-sm text-muted-foreground text-center p-4 bg-muted/50 rounded-md">
          {t("customerDetail.noPermission")}
        </div>
      )}
    </div>
  );
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

  const canEdit = user?.activeRole === "admin" || user?.activeRole === "office";

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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("propertyMaps.addMapLayer")}</DialogTitle>
            <DialogDescription>
              {t("propertyMaps.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter>
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
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"season" | "category" | "month">("season");
  const [selectedItem, setSelectedItem] = useState<CampaignItemWithCampaign | null>(null);

  const { data: rawItems = [], isLoading } = useQuery<CampaignItemWithCampaign[]>({
    queryKey: ["/api/customers", customerId, "campaign-items"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/campaign-items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaign items");
      return res.json();
    },
  });

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
        (key) => key.charAt(0).toUpperCase() + key.slice(1),
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
                          {item.campaign?.category || "general"}
                        </Badge>
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
                    {selectedItem.campaign?.category || "general"}
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
                  <Badge variant="secondary" className="text-xs">{t("statuses.draft")}</Badge>
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
                      &middot; {t("customerDetail.finalized")} {(() => {
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
