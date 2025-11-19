import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Search, FileText, Save, Download, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

type Customer = {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  status: string;
};

type Contact = {
  id: string;
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  isPrimary: string;
};

type Contract = {
  id: string;
  customerId: string;
  serviceType: string;
  billingPattern: string;
  startDate: string;
  endDate: string | null;
  status: string;
};

type ContractMonthlyAmount = {
  id: string;
  contractId: string;
  month: number;
  amount: number;
};

type ContractTemplate = {
  id: string;
  section_key: string;
  section_title: string;
  content: string;
  category: string;
  display_order: number;
  is_required: boolean;
};

type SectionState = {
  templateId: string;
  isIncluded: boolean;
  customContent: string | null;
};

type VariableValue = {
  key: string;
  value: string;
};

export default function ContractBuilderPage() {
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [sections, setSections] = useState<Record<string, SectionState>>({});
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [documentId, setDocumentId] = useState<string | null>(null);

  const { data: templates, isLoading: templatesLoading } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
  });

  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: selectedCustomerDetails } = useQuery<Customer>({
    queryKey: ["/api/customers", selectedCustomer?.id],
    enabled: !!selectedCustomer?.id,
  });

  const { data: customerContacts } = useQuery<Contact[]>({
    queryKey: ["/api/customers", selectedCustomer?.id, "contacts"],
    enabled: !!selectedCustomer?.id,
  });

  const { data: customerContracts } = useQuery<Contract[]>({
    queryKey: ["/api/customers", selectedCustomer?.id, "contracts"],
    enabled: !!selectedCustomer?.id,
  });

  const { data: contractMonthlyAmounts } = useQuery<ContractMonthlyAmount[]>({
    queryKey: ["/api/contract-monthly-amounts"],
    enabled: !!selectedCustomer?.id,
  });

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch) return customers;
    const search = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.street.toLowerCase().includes(search) ||
        c.city.toLowerCase().includes(search)
    );
  }, [customers, customerSearch]);

  const extractVariables = (content: string | null | undefined): string[] => {
    if (!content) return [];
    const matches = content.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    const uniqueVars = new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")));
    const result: string[] = [];
    uniqueVars.forEach((v) => result.push(v));
    return result;
  };

  const allVariables = useMemo(() => {
    if (!templates) return [];
    const vars = new Set<string>();
    templates.forEach((template) => {
      if (sections[template.id]?.isIncluded !== false) {
        const content = sections[template.id]?.customContent || template.defaultContent;
        extractVariables(content).forEach((v) => vars.add(v));
      }
    });
    const varsArray: string[] = [];
    vars.forEach((v) => varsArray.push(v));
    return varsArray.sort();
  }, [templates, sections]);

  useEffect(() => {
    if (templates && Object.keys(sections).length === 0) {
      const initialSections: Record<string, SectionState> = {};
      templates.forEach((template) => {
        initialSections[template.id] = {
          templateId: template.id,
          isIncluded: true,
          customContent: null,
        };
      });
      setSections(initialSections);
    }
  }, [templates, sections]);

  const createDocumentMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      const response = await apiRequest("POST", "/api/contract-builder/documents", {
        customerId: customer.id,
        documentTitle: `Contract for ${customer.name}`,
      });
      return await response.json();
    },
    onSuccess: (data: { id: string }) => {
      setDocumentId(data.id);
      toast({
        title: "Document created",
        description: "Contract document initialized successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveSectionsMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("No document ID");
      if (!templates) throw new Error("No templates loaded");
      
      const sectionsData = Object.values(sections).map((section) => {
        const template = templates.find(t => t.id === section.templateId);
        return {
          documentId,
          templateId: section.templateId,
          isIncluded: section.isIncluded ? "true" : "false",
          customContent: section.customContent,
          displayOrder: template?.display_order || 0,
        };
      });
      const response = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/sections`, sectionsData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId, "sections"] });
      toast({
        title: "Sections saved",
        description: "Contract sections updated successfully",
      });
    },
  });

  const saveVariablesMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("No document ID");
      const variablesData = Object.entries(variables).map(([key, value]) => ({
        documentId,
        variableKey: key,
        variableValue: value,
      }));
      const response = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/variables`, variablesData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId, "variables"] });
      toast({
        title: "Variables saved",
        description: "Contract variables updated successfully",
      });
    },
  });

  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("No document ID");
      await saveSectionsMutation.mutateAsync();
      await saveVariablesMutation.mutateAsync();
      const response = await apiRequest("POST", `/api/contract-builder/documents/${documentId}/export-pdf`, {});
      return await response.json();
    },
    onSuccess: (data: { documentId: string; filePath: string; fileName: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", selectedCustomer?.id, "documents"] });
      toast({
        title: "PDF exported successfully",
        description: `Contract saved as ${data.fileName} and attached to customer`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const autoFillCustomerData = (
    customer: Customer, 
    contacts: Contact[] | undefined,
    contracts: Contract[] | undefined,
    monthlyAmounts: ContractMonthlyAmount[] | undefined
  ) => {
    const autoFilledVars: Record<string, string> = {};
    
    autoFilledVars.property_name = customer.name || "";
    autoFilledVars.property_address = `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`;
    
    const primaryContact = contacts?.find(c => c.isPrimary === "true") || contacts?.[0];
    if (primaryContact) {
      autoFilledVars.property_contact = primaryContact.name || "";
      autoFilledVars.contact_phone = primaryContact.phone || "";
      autoFilledVars.contact_email = primaryContact.email || "";
    }
    
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    autoFilledVars.start_date = today.toISOString().split("T")[0];
    autoFilledVars.end_date = nextYear.toISOString().split("T")[0];
    
    const startMonth = today.getMonth();
    const endMonth = nextYear.getMonth();
    const numMonths = endMonth >= startMonth 
      ? (endMonth - startMonth + 1) 
      : (12 - startMonth + endMonth + 1);
    autoFilledVars.num_months = numMonths.toString();
    
    if (contracts && contracts.length > 0 && monthlyAmounts && monthlyAmounts.length > 0) {
      const maintenanceContract = contracts.find(c => c.serviceType === "Maintenance");
      if (maintenanceContract) {
        const contractAmounts = monthlyAmounts.filter(ma => ma.contractId === maintenanceContract.id);
        if (contractAmounts.length > 0) {
          const totalCents = contractAmounts.reduce((sum, amt) => sum + amt.amount, 0);
          const totalDollars = totalCents / 100;
          const avgMonthly = totalDollars / 12;
          
          autoFilledVars.contract_amount = totalDollars.toFixed(2);
          autoFilledVars.monthly_payment = avgMonthly.toFixed(2);
        }
      }
    }
    
    autoFilledVars.general_labor_rate = "65.00";
    autoFilledVars.emergency_general_labor_rate = "97.50";
    autoFilledVars.irrigation_labor_rate = "95.00";
    autoFilledVars.emergency_irrigation_labor_rate = "142.50";
    autoFilledVars.handshovel_rate = "110.00";
    autoFilledVars.skid_rate = "190.00";
    autoFilledVars.plowtruck_rate = "170.00";
    autoFilledVars.ATV_rate = "140.00";
    autoFilledVars.icemelt_application_rate = "4.50";
    autoFilledVars.holiday_rate = "1.5x";
    autoFilledVars.icemelt_material_rate = "Market Rate";
    
    autoFilledVars.sidewalk_trigger = '1"';
    autoFilledVars.road_trigger = '2"';
    
    return autoFilledVars;
  };

  useEffect(() => {
    if (selectedCustomerDetails && documentId && Object.keys(variables).length === 0) {
      const autoFilled = autoFillCustomerData(
        selectedCustomerDetails, 
        customerContacts,
        customerContracts,
        contractMonthlyAmounts
      );
      setVariables(autoFilled);
    }
  }, [selectedCustomerDetails, customerContacts, customerContracts, contractMonthlyAmounts, documentId, variables]);

  useEffect(() => {
    if (!documentId || Object.keys(sections).length === 0) return;
    
    const autoSaveInterval = setInterval(async () => {
      try {
        const sectionsData = Object.values(sections).map((section) => {
          const template = templates?.find(t => t.id === section.templateId);
          return {
            documentId,
            templateId: section.templateId,
            isIncluded: section.isIncluded ? "true" : "false",
            customContent: section.customContent,
            displayOrder: template?.display_order || 0,
          };
        });
        const sectionsResponse = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/sections`, sectionsData);
        await sectionsResponse.json();

        const variablesData = Object.entries(variables).map(([key, value]) => ({
          documentId,
          variableKey: key,
          variableValue: value,
        }));
        const variablesResponse = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/variables`, variablesData);
        await variablesResponse.json();

        queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId] });
        console.log("Auto-saved at", new Date().toLocaleTimeString());
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [documentId, sections, variables]);

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsCustomerDialogOpen(false);
    createDocumentMutation.mutate(customer);
  };

  const handleSectionToggle = (templateId: string, isIncluded: boolean) => {
    setSections((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], isIncluded },
    }));
  };

  const handleVariableChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAll = async () => {
    await saveSectionsMutation.mutateAsync();
    await saveVariablesMutation.mutateAsync();
  };

  const renderPreview = () => {
    if (!templates) return "";
    const includedTemplates = templates
      .filter((t) => sections[t.id]?.isIncluded !== false)
      .sort((a, b) => a.display_order - b.display_order);

    return includedTemplates
      .map((template) => {
        let content = sections[template.id]?.customContent || template.defaultContent;
        Object.entries(variables).forEach(([key, value]) => {
          content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || `{{${key}}}`);
        });
        return `${template.section_title}\n\n${content}`;
      })
      .join("\n\n---\n\n");
  };

  if (!selectedCustomer) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/dashboard/tools">
              <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tools
              </Button>
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight mb-2" data-testid="text-page-title">
              Contract Builder
            </h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              Create customized landscape maintenance contracts
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Select Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Choose a customer to create a contract for
              </p>
              <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" data-testid="button-select-customer">
                    <Search className="w-4 h-4 mr-2" />
                    Search Customers
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Select Customer</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Search by name or address..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      data-testid="input-customer-search"
                    />
                    <ScrollArea className="h-96">
                      {customersLoading ? (
                        <p className="text-sm text-muted-foreground p-4">Loading customers...</p>
                      ) : filteredCustomers.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-4">No customers found</p>
                      ) : (
                        <div className="space-y-2">
                          {filteredCustomers.map((customer) => (
                            <Card
                              key={customer.id}
                              className="hover-elevate cursor-pointer"
                              onClick={() => handleCustomerSelect(customer)}
                              data-testid={`card-customer-${customer.id}`}
                            >
                              <CardContent className="p-4">
                                <p className="font-medium" data-testid={`text-customer-name-${customer.id}`}>
                                  {customer.name}
                                </p>
                                <p className="text-sm text-muted-foreground" data-testid={`text-customer-address-${customer.id}`}>
                                  {customer.street}, {customer.city}, {customer.state} {customer.zip}
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/tools">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-selected-customer">
                {selectedCustomer.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {selectedCustomer.street}, {selectedCustomer.city}, {selectedCustomer.state} {selectedCustomer.zip}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSaveAll}
              disabled={!documentId || saveSectionsMutation.isPending || saveVariablesMutation.isPending}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Draft
            </Button>
            <Button 
              variant="default" 
              onClick={() => exportPdfMutation.mutate()}
              disabled={!documentId || exportPdfMutation.isPending}
              data-testid="button-export-pdf"
            >
              <Download className="w-4 h-4 mr-2" />
              {exportPdfMutation.isPending ? "Exporting..." : "Export PDF"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="sections" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-4">
            <TabsTrigger value="sections" data-testid="tab-sections">
              Sections
            </TabsTrigger>
            <TabsTrigger value="variables" data-testid="tab-variables">
              Variables ({allVariables.length})
            </TabsTrigger>
            <TabsTrigger value="preview" data-testid="tab-preview">
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sections" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-4">
                {templatesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading sections...</p>
                ) : (
                  templates
                    ?.sort((a, b) => a.display_order - b.display_order)
                    .map((template) => (
                      <Card key={template.id} data-testid={`card-section-${template.section_key}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={sections[template.id]?.isIncluded !== false}
                              onCheckedChange={(checked) =>
                                handleSectionToggle(template.id, checked as boolean)
                              }
                              disabled={template.is_required}
                              data-testid={`checkbox-section-${template.section_key}`}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium">{template.section_title}</p>
                                {template.is_required && (
                                  <span className="text-xs text-muted-foreground">(Required)</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Category: {template.category}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="variables" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-4">
                {allVariables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No variables found in selected sections
                  </p>
                ) : (
                  allVariables.map((varKey) => (
                    <div key={varKey} className="space-y-2">
                      <Label htmlFor={`var-${varKey}`} data-testid={`label-variable-${varKey}`}>
                        {varKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Label>
                      <Input
                        id={`var-${varKey}`}
                        value={variables[varKey] || ""}
                        onChange={(e) => handleVariableChange(varKey, e.target.value)}
                        placeholder={`Enter ${varKey.replace(/_/g, " ")}`}
                        data-testid={`input-variable-${varKey}`}
                      />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-full">
              <Card>
                <CardContent className="p-6">
                  <pre className="whitespace-pre-wrap text-sm font-mono" data-testid="text-preview">
                    {renderPreview()}
                  </pre>
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
