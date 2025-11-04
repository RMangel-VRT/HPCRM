import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import type { Customer, Contact, Note, Contract, ContractDocument, ContractMonthlyAmount, CustomerRateSheet } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit, Plus, Users, FileText, MessageSquare, MapPin, BarChart3, Upload, Download, Eye, Paperclip, History, RefreshCw, DollarSign } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

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
  
  const { data: monthlyAmounts = [], isLoading: isLoadingAmounts } = useQuery<ContractMonthlyAmount[]>({
    queryKey: ["/api/contracts", contract.id, "monthly-amounts"],
  });
  
  const [localAmounts, setLocalAmounts] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
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
    const amounts = Object.keys(localAmounts).length > 0 ? localAmounts : initializedAmounts;
    return Object.values(amounts).reduce((sum, val) => {
      const num = parseFloat(val) || 0;
      return sum + num;
    }, 0);
  }, [localAmounts, initializedAmounts]);
  
  const handleAmountChange = (month: number, value: string) => {
    if (!/^\d*\.?\d{0,2}$/.test(value)) return;
    setLocalAmounts(prev => ({ ...prev, [month]: value }));
    setHasChanges(true);
  };
  
  const saveMutation = useMutation({
    mutationFn: async () => {
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
            {hasChanges && canEditBilling && (
              <Button 
                size="sm" 
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-monthly-amounts"
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {isLoadingAmounts ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-3">
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
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="text"
                          value={value}
                          onChange={(e) => handleAmountChange(month, e.target.value)}
                          disabled={!canEditBilling}
                          className="pl-5 text-sm"
                          data-testid={`input-month-${month}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-sm font-medium">Annual Total</p>
                <p className="text-lg font-semibold" data-testid="text-annual-total">
                  ${annualTotal.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

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
      </CardContent>
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
  const id = params?.id;
  const [activeTab, setActiveTab] = useState("overview");
  const [uploadingContractId, setUploadingContractId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
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

  const canUploadDocuments = user?.activeRole === "admin" || user?.activeRole === "office";

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-customer-name">
              {customer.name}
            </h1>
            <StatusBadge status={customer.status} />
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
          <Button variant="outline" data-testid="button-add-note">
            <MessageSquare className="w-4 h-4 mr-2" />
            Add Note
          </Button>
          <Button data-testid="button-edit-customer">
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
          <TabsTrigger value="contracts" data-testid="tab-contracts">
            Contracts ({contracts.length})
          </TabsTrigger>
          <TabsTrigger value="rate-sheet" data-testid="tab-rate-sheet">
            Rate Sheet
          </TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">
            Revenue
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
            <Button size="sm" data-testid="button-add-contact">
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
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{contact.name}</p>
                        {contact.isPrimary === "true" && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      {contact.role && (
                        <p className="text-sm text-muted-foreground">{contact.role}</p>
                      )}
                      {contact.phone && (
                        <p className="text-sm text-muted-foreground">{contact.phone}</p>
                      )}
                      {contact.email && (
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" data-testid={`button-edit-contact-${contact.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-add-note-tab">
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
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-medium">Note</p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-note-date-${note.id}`}>
                        {format(new Date(note.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="text-sm" data-testid={`text-note-body-${note.id}`}>{note.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contracts" className="space-y-4">
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
          ) : contracts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No contracts yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
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
          )}

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

        <TabsContent value="rate-sheet" className="space-y-4">
          <RateSheetSection customerId={params?.id!} />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <RevenueSection customerId={params?.id!} />
        </TabsContent>
      </Tabs>
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

  const RateInput = ({ label, field, unit }: { label: string; field: string; unit: string }) => (
    <div>
      <Label htmlFor={field} className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <div className="relative flex-1">
          <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id={field}
            data-testid={`input-rate-${field}`}
            value={localRates[field] || ""}
            onChange={(e) => handleRateChange(field, e.target.value)}
            placeholder={canEdit ? "Not set" : "—"}
            disabled={!canEdit || saveMutation.isPending}
            className="pl-8"
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );

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
                  <RateInput label="General Labor" field="generalLabor" unit="per hour" />
                  <RateInput label="Operator Labor" field="operatorLabor" unit="per hour" />
                  <RateInput label="Irrigation Labor" field="irrigationLabor" unit="per hour" />
                  <RateInput label="Emergency General Labor" field="emergencyGeneralLabor" unit="per hour" />
                  <RateInput label="Emergency Irrigation Labor" field="emergencyIrrigationLabor" unit="per hour" />
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
                  <RateInput label="Hand Shovel Labor" field="handShovelLabor" unit="per hour" />
                  <RateInput label="Plow Truck" field="plowTruck" unit="per hour" />
                  <RateInput label="ATV" field="atv" unit="per hour" />
                  <RateInput label="Skid Steer" field="skidSteer" unit="per hour" />
                  <RateInput label="Snow Blower" field="snowBlower" unit="per hour" />
                  <RateInput label="Ice Melt Material" field="iceMeltMaterial" unit="per pound" />
                  <RateInput label="Ice Melt Application Labor" field="iceMeltApplicationLabor" unit="per hour" />
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
