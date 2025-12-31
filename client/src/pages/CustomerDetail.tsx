import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer, Contact, Note, Contract, ContractDocument, ContractMonthlyAmount, CustomerRateSheet, InsertContract, InsertContact, InsertNote, InsertCustomer, CustomerMapLayer, PropertyManagementCompany, PropertyManager } from "@shared/schema";
import { insertContractSchema, insertContactSchema, insertNoteSchema, insertCustomerSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import { Edit, Plus, Users, FileText, MessageSquare, MapPin, BarChart3, Upload, Download, Eye, Paperclip, History, RefreshCw, DollarSign, Map, Layers, Trash2, X, Ticket, Building, Check, Loader2 } from "lucide-react";
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
import LayerMapViewer from "@/components/LayerMapViewer";
import CustomerSchedulingSection from "@/components/CustomerSchedulingSection";

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
  
  const { data: monthlyAmounts = [], isLoading: isLoadingAmounts } = useQuery<ContractMonthlyAmount[]>({
    queryKey: ["/api/contracts", contract.id, "monthly-amounts"],
  });
  
  const [localAmounts, setLocalAmounts] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditingAmounts, setIsEditingAmounts] = useState(false);
  const [billingMode, setBillingMode] = useState<"variable" | "even">("variable");
  const [evenMonthlyAmount, setEvenMonthlyAmount] = useState<string>("0.00");
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
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
      setHasChanges(false);
      setIsEditingAmounts(false);
      toast({
        title: "Success",
        description: "Monthly billing amounts saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save monthly amounts",
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
        title: "Success",
        description: "Contract ended",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to end contract",
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
        title: "Success",
        description: "Contract deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete contract",
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
            <p className="text-muted-foreground">Start Date</p>
            <p data-testid={`text-contract-start-${contract.id}`}>
              {format(new Date(contract.startDate), "MMM d, yyyy")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">End Date</p>
            <p data-testid={`text-contract-end-${contract.id}`}>
              {contract.endDate ? format(new Date(contract.endDate), "MMM d, yyyy") : "Ongoing"}
            </p>
          </div>
        </div>
        {contract.po && (
          <div className="mb-3 text-sm">
            <p className="text-muted-foreground">PO Number</p>
            <p data-testid={`text-contract-po-${contract.id}`}>{contract.po}</p>
          </div>
        )}

        <Separator className="my-3" />

        <div>
          <p className="text-sm font-medium mb-2">Signed Agreement</p>
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
                    Version {currentDocument.version} • {formatFileSize(currentDocument.fileSize)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {format(new Date(currentDocument.uploadedAt), "MMM d, yyyy")}
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
                  View
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
                  Download
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
                    Replace
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowVersionHistory(contract.id)}
                  data-testid="link-version-history"
                >
                  <History className="w-3 h-3 mr-1" />
                  History
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 border rounded-md">
              <p className="text-sm text-muted-foreground">No signed agreement uploaded yet</p>
              {canUploadDocuments && (
                <Button 
                  size="sm"
                  onClick={() => onUploadClick(contract.id, false)}
                  disabled={uploadingFile}
                  data-testid="button-upload-document"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Upload
                </Button>
              )}
            </div>
          )}
        </div>

        <Separator className="my-3" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Monthly Billing</p>
            {!isEditingAmounts && canEditBilling && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setIsEditingAmounts(true)}
                data-testid="button-edit-amounts"
              >
                Edit Amounts
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
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    if (billingMode === "variable" && !validateAmounts()) {
                      toast({
                        title: "Invalid amounts",
                        description: "All monthly amounts must be non-negative numbers",
                        variant: "destructive",
                      });
                      return;
                    }
                    saveMutation.mutate();
                  }}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-amounts"
                >
                  {saveMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </div>
          
          {/* Billing Mode Toggle - only shown when editing */}
          {isEditingAmounts && (
            <div className="flex items-center gap-3 mb-3 p-2 bg-muted/30 rounded-md">
              <span className={`text-sm ${billingMode === "variable" ? "font-medium" : "text-muted-foreground"}`}>
                Variable
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
                Even
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
                    Same amount for all 12 months
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
                    This amount will be applied to each of the 12 months
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
                <p className="text-sm font-medium">Annual Total</p>
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
              <p className="text-sm font-medium mb-2">Applied Rates</p>
              <div className="text-xs space-y-1.5 bg-muted/30 p-2 rounded-md">
                {contract.serviceType.toLowerCase().includes('snow') || contract.serviceType.toLowerCase().includes('ice') ? (
                  <>
                    {rateSheet.handShovelLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hand Shovel:</span>
                        <span className="font-medium">${(rateSheet.handShovelLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.plowTruck !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plow Truck:</span>
                        <span className="font-medium">${(rateSheet.plowTruck / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.atv !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ATV:</span>
                        <span className="font-medium">${(rateSheet.atv / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.skidSteer !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Skid Steer:</span>
                        <span className="font-medium">${(rateSheet.skidSteer / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.snowBlower !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Snow Blower:</span>
                        <span className="font-medium">${(rateSheet.snowBlower / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.iceMeltMaterial !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ice Melt Material:</span>
                        <span className="font-medium">${(rateSheet.iceMeltMaterial / 100).toFixed(2)}/lb</span>
                      </div>
                    )}
                    {rateSheet.iceMeltApplicationLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ice Melt Application:</span>
                        <span className="font-medium">${(rateSheet.iceMeltApplicationLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {rateSheet.generalLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">General Labor:</span>
                        <span className="font-medium">${(rateSheet.generalLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.operatorLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Operator Labor:</span>
                        <span className="font-medium">${(rateSheet.operatorLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.irrigationLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Irrigation Labor:</span>
                        <span className="font-medium">${(rateSheet.irrigationLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.emergencyGeneralLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emergency General:</span>
                        <span className="font-medium">${(rateSheet.emergencyGeneralLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                    {rateSheet.emergencyIrrigationLabor !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emergency Irrigation:</span>
                        <span className="font-medium">${(rateSheet.emergencyIrrigationLabor / 100).toFixed(2)}/hr</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {(canEndContract || canDeleteContract) && (
          <>
            <Separator className="my-3" />
            <div className="flex gap-2 flex-wrap">
              {canEndContract && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowEndConfirm(true)}
                  data-testid={`button-end-contract-${contract.id}`}
                >
                  End Contract
                </Button>
              )}
              {canDeleteContract && (
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid={`button-delete-contract-${contract.id}`}
                >
                  Delete Contract
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the contract as ended. This action can be reversed by changing the status back to active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => endContractMutation.mutate()}
              disabled={endContractMutation.isPending}
            >
              {endContractMutation.isPending ? "Ending..." : "End Contract"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the contract, including all monthly amounts, documents, and service records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteContractMutation.mutate()}
              disabled={deleteContractMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContractMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface VersionHistoryDialogProps {
  contractId: string | null;
  onClose: () => void;
  formatFileSize: (bytes: number) => string;
}

function VersionHistoryDialog({ contractId, onClose, formatFileSize }: VersionHistoryDialogProps) {
  const { data: documents = [], isLoading } = useQuery<ContractDocument[]>({
    queryKey: ["/api/contracts", contractId, "documents"],
    enabled: !!contractId,
  });

  return (
    <Dialog open={!!contractId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            All versions of the signed agreement for this contract
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No documents found</p>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
  const [, params] = useRoute("/dashboard/customers/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const [activeTab, setActiveTab] = useState("overview");
  const [uploadingContractId, setUploadingContractId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isAddContractDialogOpen, setIsAddContractDialogOpen] = useState(false);
  const [showEndedContracts, setShowEndedContracts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer>({
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
  
  // Property Management queries
  const { data: pmCompanies = [] } = useQuery<PropertyManagementCompany[]>({
    queryKey: ["/api/property-management-companies"],
  });
  
  const { data: pmManagers = [] } = useQuery<PropertyManager[]>({
    queryKey: ["/api/property-managers"],
  });

  const canUploadDocuments = user?.activeRole === "admin" || user?.activeRole === "office";
  const canEditContracts = user?.activeRole === "admin" || user?.activeRole === "office";

  useSetBreadcrumbs([
    { label: "Customers", href: "/dashboard/customers" },
    { label: customer?.name || "Loading..." },
  ], [customer?.name]);

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
    },
  });

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
        title: "Success",
        description: "Contract created successfully",
      });
      setIsAddContractDialogOpen(false);
      contractForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contract",
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
      street: customer?.street || "",
      city: customer?.city || "",
      state: customer?.state || "",
      zip: customer?.zip || "",
      status: customer?.status || "active",
      tags: customer?.tags || [],
      acres: customer?.acres || "",
      complexityScore: customer?.complexityScore || undefined,
      active: customer?.active || "true",
      propertyManagementCompanyId: customer?.propertyManagementCompanyId || null,
      propertyManagerId: customer?.propertyManagerId || null,
    },
  });

  // Update form when customer data loads
  useEffect(() => {
    if (customer && isEditCustomerDialogOpen) {
      customerForm.reset({
        name: customer.name,
        street: customer.street,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
        status: customer.status,
        tags: customer.tags || [],
        acres: customer.acres || "",
        complexityScore: customer.complexityScore || undefined,
        active: customer.active,
        propertyManagementCompanyId: customer.propertyManagementCompanyId || null,
        propertyManagerId: customer.propertyManagerId || null,
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
        title: "Success",
        description: "Customer updated successfully",
      });
      setIsEditCustomerDialogOpen(false);
    },
    onError: (error: Error) => {
      // Check if it's a conflict error
      if (error.message.startsWith("CONFLICT:")) {
        toast({
          title: "Update Conflict",
          description: "This customer was modified by another user. The page will refresh to show the latest data.",
          variant: "destructive",
        });
        // Refresh the data
        queryClient.invalidateQueries({ queryKey: ["/api/customers", id] });
        setIsEditCustomerDialogOpen(false);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to update customer",
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
        title: "Success",
        description: "Contact created successfully",
      });
      setIsAddContactDialogOpen(false);
      setSelectedPmCompanyForContact(null);
      contactForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contact",
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
        title: "Success",
        description: "Contact updated successfully",
      });
      setEditingContact(null);
      setSelectedPmCompanyForContact(null);
      contactForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contact",
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
        title: "Success",
        description: "Contact deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete contact",
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
        title: "Success",
        description: "Note created successfully",
      });
      setIsAddNoteDialogOpen(false);
      noteForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
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
        title: "Success",
        description: "Note updated successfully",
      });
      setEditingNote(null);
      noteForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update note",
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
        title: "Success",
        description: "Note deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete note",
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
        title: "Invalid file type",
        description: "Please upload a PDF file (.pdf)",
        variant: "destructive",
      });
      return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "File must be under 20 MB",
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
        title: "Success",
        description: isReplace ? "Contract document replaced successfully" : "Contract document uploaded successfully",
      });

      setUploadingContractId(null);
      setShowReplaceConfirm(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Please try again",
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
        <p className="text-muted-foreground">Customer not found</p>
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
      return "Maintenance & Snow";
    } else if (hasMaintenance) {
      return "Maintenance Only";
    } else if (hasSnow) {
      return "Snow Only";
    } else {
      return "No Coverage";
    }
  };

  const coverage = calculateCoverage(contracts);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-customer-name">
              {customer.name}
            </h1>
            <StatusBadge status={customer.status} />
            <Badge 
              variant={coverage === "Maintenance & Snow" ? "default" : coverage === "No Coverage" ? "outline" : "secondary"}
              data-testid="badge-coverage-status"
            >
              {coverage}
            </Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            {customer.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            data-testid="button-add-note"
            onClick={() => {
              setIsAddNoteDialogOpen(true);
              setActiveTab("notes");
            }}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Add Note
          </Button>
          {(user?.activeRole === "admin" || user?.activeRole === "office") && (
            <Button 
              variant="outline"
              data-testid="button-add-ticket"
              onClick={() => navigate(`/dashboard/tickets/new?customerId=${customer.id}`)}
            >
              <Ticket className="w-4 h-4 mr-2" />
              Add Ticket
            </Button>
          )}
          <Button 
            data-testid="button-edit-customer"
            onClick={() => setIsEditCustomerDialogOpen(true)}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            Notes ({notes.length})
          </TabsTrigger>
          {(user?.activeRole === "admin" || user?.activeRole === "office") && (
            <>
              <TabsTrigger value="contracts" data-testid="tab-contracts">
                Contracts ({contracts.length})
              </TabsTrigger>
              <TabsTrigger value="rate-sheet" data-testid="tab-rate-sheet">
                Rate Sheet
              </TabsTrigger>
              <TabsTrigger value="revenue" data-testid="tab-revenue">
                Revenue
              </TabsTrigger>
              <TabsTrigger value="scheduling" data-testid="tab-scheduling">
                Scheduling
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="maps" data-testid="tab-maps">
            <Map className="w-4 h-4 mr-1" />
            Maps
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Address</p>
                  <div className="flex items-start gap-1.5 mt-1">
                    <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm" data-testid="text-customer-address">
                        {customer.street}
                      </p>
                      <p className="text-sm">
                        {customer.city}, {customer.state} {customer.zip}
                      </p>
                    </div>
                  </div>
                </div>
                <Separator />
                {(customer.propertyManagementCompanyId || customer.propertyManagerId) && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Property Management</p>
                      {customer.propertyManagementCompanyId && (
                        <div className="flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-muted-foreground" />
                          <p className="text-sm" data-testid="text-pm-company">
                            {pmCompanies.find(c => c.id === customer.propertyManagementCompanyId)?.name || "Unknown Company"}
                          </p>
                        </div>
                      )}
                      {customer.propertyManagerId && (
                        <div className="flex items-center gap-1.5 ml-5">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <p className="text-sm" data-testid="text-pm-manager">
                            {pmManagers.find(m => m.id === customer.propertyManagerId)?.name || "Unknown Manager"}
                          </p>
                        </div>
                      )}
                    </div>
                    <Separator />
                  </>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Acres</p>
                    <p className="text-sm mt-1" data-testid="text-customer-acres">
                      {customer.acres || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Complexity</p>
                    <p className="text-sm mt-1" data-testid="text-customer-complexity">
                      {customer.complexityScore ? `Level ${customer.complexityScore}` : "—"}
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tags</p>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {customer.tags && customer.tags.length > 0 ? (
                      customer.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-tag-${tag}`}>
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No tags</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Contacts</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="text-contacts-count">
                    {contacts.length}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Active Contracts</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="text-contracts-count">
                    {contracts.filter(c => c.status === "active").length}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Notes</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="text-notes-count">
                    {notes.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              size="sm" 
              onClick={() => setIsAddContactDialogOpen(true)}
              data-testid="button-add-contact"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
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
                  <p className="text-sm text-muted-foreground">No contacts yet</p>
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
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
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
                        <div className="text-sm text-muted-foreground">
                          {contact.emails.map((email, idx) => (
                            <span key={idx}>{email}{idx < contact.emails!.length - 1 ? ", " : ""}</span>
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
                            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this contact? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteContactMutation.mutate(contact.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
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
              onClick={() => setIsAddNoteDialogOpen(true)}
              data-testid="button-add-note-tab"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Note
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
                  <p className="text-sm text-muted-foreground">No notes yet</p>
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
                          <p className="text-sm font-medium">Note</p>
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
                              <AlertDialogTitle>Delete Note</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this note? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
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
          <TabsContent value="contracts" className="space-y-4">
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
                  Show Ended Contracts
                </label>
              </div>
              {canEditContracts && (
                <Button size="sm" onClick={() => setIsAddContractDialogOpen(true)} data-testid="button-add-contract">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Contract
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
                        {showEndedContracts ? "No contracts yet" : "No active or paused contracts"}
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
                  <AlertDialogTitle>Replace signed agreement?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will supersede the current signed agreement. The old file will remain in version history. Continue?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => showReplaceConfirm && confirmReplace(showReplaceConfirm)}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <VersionHistoryDialog 
              contractId={showVersionHistory}
              onClose={() => setShowVersionHistory(null)}
              formatFileSize={formatFileSize}
            />
          </TabsContent>
        )}

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
          <TabsContent value="rate-sheet" className="space-y-4">
            <RateSheetSection customerId={params?.id!} />
          </TabsContent>
        )}

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
          <TabsContent value="revenue" className="space-y-4">
            <RevenueSection customerId={params?.id!} />
          </TabsContent>
        )}

        {(user?.activeRole === "admin" || user?.activeRole === "office") && (
          <TabsContent value="scheduling" className="space-y-4">
            <CustomerSchedulingSection customerId={params?.id!} />
          </TabsContent>
        )}

        <TabsContent value="maps" className="space-y-4">
          <CustomerMapsSection customerId={params?.id!} />
        </TabsContent>
      </Tabs>

      <Dialog open={isAddContractDialogOpen} onOpenChange={setIsAddContractDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Contract</DialogTitle>
            <DialogDescription>
              Create a new service contract for this customer
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
                      <FormLabel>Service Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-service-type">
                            <SelectValue placeholder="Select service type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                          <SelectItem value="Chemical">Chemical</SelectItem>
                          <SelectItem value="Snow">Snow & Ice</SelectItem>
                          <SelectItem value="Irrigation">Irrigation</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
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
                      <FormLabel>Billing Pattern *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-billing-pattern">
                            <SelectValue placeholder="Select pattern" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="seasonal">Seasonal</SelectItem>
                          <SelectItem value="12-of-12">12 of 12</SelectItem>
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
                        <FormLabel>Start Date *</FormLabel>
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
                        <FormLabel>End Date (Optional)</FormLabel>
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
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="ended">Ended</SelectItem>
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
                    <FormLabel>PO Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter PO number" {...field} value={field.value || ""} data-testid="input-po" />
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
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any additional notes about this contract"
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddContractDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={createContractMutation.isPending} data-testid="button-save-contract">
                  {createContractMutation.isPending ? "Creating..." : "Create Contract"}
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
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
            <DialogDescription>
              {editingContact ? "Update contact information" : "Add a new contact for this customer"}
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
                    <FormLabel>Name *</FormLabel>
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
                    <FormLabel>Phone Numbers</FormLabel>
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
                        Add Phone
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
                    <FormLabel>Email Addresses</FormLabel>
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
                        Add Email
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
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-contact-role">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Property Manager">Property Manager</SelectItem>
                        <SelectItem value="Board President">Board President</SelectItem>
                        <SelectItem value="HOA Contact">HOA Contact</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {contactForm.watch("role") === "Property Manager" && (
                <FormItem>
                  <FormLabel>Property Management Company</FormLabel>
                  <Select 
                    value={selectedPmCompanyForContact || ""} 
                    onValueChange={setSelectedPmCompanyForContact}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-pm-company-for-contact">
                        <SelectValue placeholder="Select a company" />
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
                    Select the property management company this contact belongs to
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
                    <FormLabel className="!mt-0">Primary Contact</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes..." {...field} value={field.value || ""} rows={3} data-testid="textarea-contact-notes" />
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
                  Cancel
                </Button>
                <Button type="submit" disabled={createContactMutation.isPending || updateContactMutation.isPending} data-testid="button-save-contact">
                  {editingContact 
                    ? (updateContactMutation.isPending ? "Updating..." : "Update Contact")
                    : (createContactMutation.isPending ? "Creating..." : "Create Contact")
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
            <DialogTitle>{editingNote ? "Edit Note" : "Add Note"}</DialogTitle>
            <DialogDescription>
              {editingNote ? "Update the note" : "Add a new note for this customer"}
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
                    <FormLabel>Note *</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Enter your note here..." {...field} rows={5} data-testid="textarea-note-body" />
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
                  Cancel
                </Button>
                <Button type="submit" disabled={createNoteMutation.isPending || updateNoteMutation.isPending} data-testid="button-save-note">
                  {editingNote 
                    ? (updateNoteMutation.isPending ? "Updating..." : "Update Note")
                    : (createNoteMutation.isPending ? "Creating..." : "Create Note")
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
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information
            </DialogDescription>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit((data) => updateCustomerMutation.mutate(data))} className="space-y-4">
              <FormField
                control={customerForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC Corporation" {...field} data-testid="input-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={customerForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="prospect">Prospect</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
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
                      <FormLabel>Acres</FormLabel>
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
                    <FormLabel>Street Address *</FormLabel>
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
                      <FormLabel>City *</FormLabel>
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
                      <FormLabel>State *</FormLabel>
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
                      <FormLabel>ZIP Code *</FormLabel>
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
                    <FormLabel>Complexity Score</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-customer-complexity">
                          <SelectValue placeholder="Select complexity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 - Simple</SelectItem>
                        <SelectItem value="2">2 - Below Average</SelectItem>
                        <SelectItem value="3">3 - Average</SelectItem>
                        <SelectItem value="4">4 - Above Average</SelectItem>
                        <SelectItem value="5">5 - Complex</SelectItem>
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
                      <FormLabel>Property Management Company</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "_none" ? null : value)} 
                        value={field.value || "_none"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-customer-pm-company">
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
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
                        <FormLabel>Property Manager</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "_none" ? null : value)} 
                          value={field.value || "_none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-customer-pm-manager">
                              <SelectValue placeholder="Select manager" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
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
                  Cancel
                </Button>
                <Button type="submit" disabled={updateCustomerMutation.isPending} data-testid="button-save-customer">
                  {updateCustomerMutation.isPending ? "Updating..." : "Update Customer"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CustomerRevenueData {
  annualProjection: number;
  monthlyBreakdown: { month: number; total: number; byServiceType: { serviceType: string; amount: number }[] }[];
  contractBreakdown: { contractId: string; serviceType: string; status: string; startDate: Date; endDate: Date | null; annualTotal: number }[];
}

function RevenueSection({ customerId }: { customerId: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const { data: revenueData, isLoading } = useQuery<CustomerRevenueData>({
    queryKey: ["/api/customers", customerId, "revenue", selectedYear],
  });
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
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
          <p className="text-sm text-muted-foreground">No revenue data available</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Revenue Projection</h3>
          <p className="text-sm text-muted-foreground">Based on contract monthly amounts</p>
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
          <CardTitle className="text-lg">Annual Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold" data-testid="text-annual-projection">
            ${revenueData.annualProjection.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Total projected revenue for {selectedYear}
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By Month</CardTitle>
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
          <CardTitle className="text-lg">By Contract</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.contractBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No contracts</p>
          ) : (
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium">Service Type</th>
                    <th className="text-left p-3 text-xs font-medium">Status</th>
                    <th className="text-left p-3 text-xs font-medium">Date Range</th>
                    <th className="text-right p-3 text-xs font-medium">Annual Total</th>
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
                        {contract.endDate ? ` - ${format(new Date(contract.endDate), "MMM d, yyyy")}` : " - Ongoing"}
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
        title: "Success",
        description: "Rate sheet saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save rate sheet",
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
            Maintenance & Emergency Labor
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RateInput label="General Labor" field="generalLabor" unit="per hour" value={localRates.generalLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Operator Labor" field="operatorLabor" unit="per hour" value={localRates.operatorLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Irrigation Labor" field="irrigationLabor" unit="per hour" value={localRates.irrigationLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Emergency General Labor" field="emergencyGeneralLabor" unit="per hour" value={localRates.emergencyGeneralLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Emergency Irrigation Labor" field="emergencyIrrigationLabor" unit="per hour" value={localRates.emergencyIrrigationLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="snow">
          <AccordionTrigger className="text-lg font-semibold" data-testid="accordion-snow">
            Snow & Ice Services
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RateInput label="Hand Shovel Labor" field="handShovelLabor" unit="per hour" value={localRates.handShovelLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Plow Truck" field="plowTruck" unit="per hour" value={localRates.plowTruck || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="ATV" field="atv" unit="per hour" value={localRates.atv || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Skid Steer" field="skidSteer" unit="per hour" value={localRates.skidSteer || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Snow Blower" field="snowBlower" unit="per hour" value={localRates.snowBlower || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Ice Melt Material" field="iceMeltMaterial" unit="per pound" value={localRates.iceMeltMaterial || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                  <RateInput label="Ice Melt Application Labor" field="iceMeltApplicationLabor" unit="per hour" value={localRates.iceMeltApplicationLabor || ""} onChange={handleRateChange} canEdit={canEdit} isPending={saveMutation.isPending} />
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            data-testid="textarea-rate-notes"
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder={canEdit ? "Add pricing exceptions or inclusions..." : "—"}
            disabled={!canEdit || saveMutation.isPending}
            rows={3}
          />
        </CardContent>
      </Card>

      {rateSheet?.lastUpdatedBy && rateSheet?.lastUpdatedAt && (
        <div className="text-sm text-muted-foreground" data-testid="text-last-updated">
          Last updated {format(new Date(rateSheet.lastUpdatedAt), "PPp")}
        </div>
      )}

      {canEdit && hasChanges && (
        <div className="flex justify-end">
          <Button
            data-testid="button-save-rate-sheet"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save Rate Sheet"}
          </Button>
        </div>
      )}

      {!canEdit && (
        <div className="text-sm text-muted-foreground text-center p-4 bg-muted/50 rounded-md">
          You do not have permission to edit the rate sheet
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

function CustomerMapsSection({ customerId }: { customerId: string }) {
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
      toast({ title: "Layer uploaded successfully" });
      setShowUploadDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create layer", variant: "destructive" });
    },
  });

  const deleteLayerMutation = useMutation({
    mutationFn: async (layerId: string) => {
      return apiRequest("DELETE", `/api/customers/${customerId}/map-layers/${layerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "map-layers"] });
      toast({ title: "Layer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete layer", variant: "destructive" });
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
        toast({ title: "Please provide a layer name and select a color", variant: "destructive" });
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
        // Create custom layer record
        await createLayerMutation.mutateAsync({
          name: customName.trim(),
          layerType: "custom",
          category: "custom",
          kmlPath: objectPath,
          color: selectedColor,
        });
      } else {
        // Find the layer config for preset types
        const layerConfig = [...LAYER_TYPES.base, ...LAYER_TYPES.community, ...LAYER_TYPES.snow].find(
          (l) => l.value === selectedLayerType
        );

        // Create the layer record
        await createLayerMutation.mutateAsync({
          name: customName || layerConfig?.label || selectedLayerType,
          layerType: selectedLayerType,
          category: selectedCategory,
          kmlPath: objectPath,
          color: selectedColor || layerConfig?.color || "#6b7280",
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Failed to upload file", variant: "destructive" });
    } finally {
      setUploadingLayer(false);
    }
  };

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
          <h3 className="text-lg font-semibold">Property Maps & Layers</h3>
          <p className="text-sm text-muted-foreground">
            Upload KML files to define service zones and routes
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
              View Map
            </Button>
          )}
          {canEdit && (
            <Button
              data-testid="button-add-map-layer"
              onClick={() => setShowUploadDialog(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Add Layer
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

      {/* Community Season Layers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Community Season
          </CardTitle>
        </CardHeader>
        <CardContent>
          {communityLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No community season layers uploaded
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
            Snow Season
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snowLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No snow season layers uploaded
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
            Custom Layers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customLayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom layers uploaded
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
                        Custom Layer
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
            <DialogTitle>Add Map Layer</DialogTitle>
            <DialogDescription>
              Upload a KML file to define a service zone or route
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Layer Category</Label>
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
                  <SelectItem value="base">Base Layers</SelectItem>
                  <SelectItem value="community">Community Season</SelectItem>
                  <SelectItem value="snow">Snow Season</SelectItem>
                  <SelectItem value="custom">Custom Layer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedCategory !== "custom" && (
              <div className="space-y-2">
                <Label>Layer Type</Label>
                <Select value={selectedLayerType} onValueChange={(v) => {
                  setSelectedLayerType(v);
                  // Auto-select the color for preset types
                  const config = [...LAYER_TYPES.base, ...LAYER_TYPES.community, ...LAYER_TYPES.snow].find(l => l.value === v);
                  if (config) setSelectedColor(config.color);
                }}>
                  <SelectTrigger data-testid="select-layer-type">
                    <SelectValue placeholder="Select layer type" />
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
                <Label>Layer Name <span className="text-destructive">*</span></Label>
                <Input
                  data-testid="input-custom-layer-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Enter a name for this layer"
                />
              </div>
            )}

            {selectedCategory !== "custom" && (
              <div className="space-y-2">
                <Label>Custom Name (Optional)</Label>
                <Input
                  data-testid="input-layer-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Override the default layer name"
                />
              </div>
            )}

            {/* Color Selection - always show for custom, optionally for others */}
            <div className="space-y-2">
              <Label>
                Layer Color {selectedCategory === "custom" && <span className="text-destructive">*</span>}
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {availableColors.length === 0 
                  ? "All colors are in use. Delete a layer to free up a color."
                  : "Select a color (already used colors are disabled)"}
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
              <Label>KML File</Label>
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
                Accepts .kml or .kmz files
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
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
