import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import type { Customer, Contact, Note, Contract, ContractDocument } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit, Plus, Users, FileText, MessageSquare, MapPin, BarChart3, Upload, Download, Eye, Paperclip, History, RefreshCw } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface ContractCardProps {
  contract: Contract;
  canUploadDocuments: boolean;
  onUploadClick: (contractId: string, isReplace: boolean) => void;
  uploadingFile: boolean;
  formatFileSize: (bytes: number) => string;
  setShowVersionHistory: (contractId: string | null) => void;
}

function ContractCard({ contract, canUploadDocuments, onUploadClick, uploadingFile, formatFileSize, setShowVersionHistory }: ContractCardProps) {
  const { data: currentDocument, isLoading } = useQuery<ContractDocument>({
    queryKey: ["/api/contracts", contract.id, "documents", "current"],
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
  const [, params] = useRoute("/customers/:id");
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
      const urlResponse = await apiRequest<{ uploadURL: string }>(`/api/contracts/${contractId}/documents/upload-url`, {
        method: "POST",
      });

      const uploadResponse = await fetch(urlResponse.uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": "application/pdf",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      await apiRequest(`/api/contracts/${contractId}/documents`, {
        method: "POST",
        body: {
          uploadURL: urlResponse.uploadURL,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
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
      </Tabs>
    </div>
  );
}
