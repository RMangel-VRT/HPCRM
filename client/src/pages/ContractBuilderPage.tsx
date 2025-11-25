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
import { Search, FileText, Save, Download, ArrowLeft, FileCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { ContractTemplate } from "@shared/schema";

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

type SectionState = {
  templateId: string;
  isIncluded: boolean;
  customContent: string | null;
};

type VariableValue = {
  key: string;
  value: string;
};

type ContractBuilderDocument = {
  id: string;
  customerId: string;
  documentTitle: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

export default function ContractBuilderPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [isDraftSelectionOpen, setIsDraftSelectionOpen] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  useEffect(() => {
    console.log('[Contract Builder] isDraftSelectionOpen state changed to:', isDraftSelectionOpen);
  }, [isDraftSelectionOpen]);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  const [sections, setSections] = useState<Record<string, SectionState>>({});
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => {
    console.log('[Contract Builder] documentId state changed to:', documentId);
  }, [documentId]);

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

  const { data: existingDrafts, refetch: refetchDrafts, isLoading: draftsLoading } = useQuery<ContractBuilderDocument[]>({
    queryKey: ['/api/contract-builder/documents', { customerId: selectedCustomer?.id }],
    queryFn: async () => {
      const response = await fetch(`/api/contract-builder/documents?customerId=${selectedCustomer?.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error('Failed to fetch drafts');
      return response.json();
    },
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

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: typeof newCustomerForm) => {
      const response = await apiRequest("POST", "/api/customers", customerData);
      return await response.json();
    },
    onSuccess: (newCustomer: Customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      handleCustomerSelect(newCustomer);
      setNewCustomerForm({ name: "", street: "", city: "", state: "", zip: "" });
      setIsCreatingCustomer(false);
      toast({
        title: "Customer created",
        description: `${newCustomer.name} has been created successfully.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const extractVariables = (content: string | null | undefined): string[] => {
    if (!content) return [];
    const matches = content.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    const uniqueVars = new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")));
    const result: string[] = [];
    uniqueVars.forEach((v) => result.push(v));
    return result;
  };

  // Memoize which service categories are included to avoid recalculating per variable
  const includedServiceCategories = useMemo(() => {
    if (!templates) return { irrigation: false, snow: false, maintenance: false };
    
    return {
      irrigation: templates.some(
        (t) => t.category === "irrigation" && sections[t.id]?.isIncluded !== false
      ),
      snow: templates.some(
        (t) => t.category === "snow" && sections[t.id]?.isIncluded !== false
      ),
      maintenance: templates.some(
        (t) => t.category === "maintenance" && sections[t.id]?.isIncluded !== false
      ),
    };
  }, [templates, sections]);

  const shouldShowVariable = (variableKey: string): boolean => {
    const varLower = variableKey.toLowerCase();
    
    // Explicit mapping of variable patterns to required service categories
    const variableServiceMap: Record<string, keyof typeof includedServiceCategories> = {
      // Irrigation-specific
      irrigation: "irrigation",
      
      // Snow/winter-specific
      handshovel: "snow",
      plow: "snow",
      plowtruck: "snow",
      atv: "snow",
      skid: "snow",
      snow: "snow",
      icemelt: "snow",
      ice_melt: "snow",
    };
    
    // Check if variable matches any service-specific pattern
    for (const [pattern, category] of Object.entries(variableServiceMap)) {
      if (varLower.includes(pattern)) {
        return includedServiceCategories[category];
      }
    }
    
    // All other variables (customer info, contract terms, payments, etc.) are always visible
    return true;
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
      console.log('[Contract Builder] Creating document for customer:', customer.name);
      try {
        const response = await apiRequest("POST", "/api/contract-builder/documents", {
          customerId: customer.id,
          documentTitle: `Contract for ${customer.name}`,
        });
        console.log('[Contract Builder] Response status:', response.status, response.statusText);
        if (!response.ok) {
          throw new Error(`Failed to create document: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('[Contract Builder] Document created with response data:', JSON.stringify(data));
        if (!data.id) {
          console.error('[Contract Builder] ERROR: Response missing id field!', data);
          throw new Error('Server response missing document ID');
        }
        return data;
      } catch (error) {
        console.error('[Contract Builder] Error creating document:', error);
        throw error;
      }
    },
    onSuccess: (data: { id: string }) => {
      console.log('[Contract Builder] onSuccess called with data:', JSON.stringify(data));
      console.log('[Contract Builder] Setting documentId to:', data.id);
      setDocumentId(data.id);
      console.log('[Contract Builder] Closing draft selection dialog');
      setIsDraftSelectionOpen(false);
      toast({
        title: "Document created",
        description: "Contract document initialized successfully",
      });
    },
    onError: (error: Error) => {
      console.error('[Contract Builder] onError called with error:', error);
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
          displayOrder: template?.displayOrder || 0,
        };
      });
      const response = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/sections`, sectionsData);
      // 204 No Content response, don't try to parse JSON
      if (response.status === 204) return;
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
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
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
      // 204 No Content response, don't try to parse JSON
      if (response.status === 204) return;
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
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
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
        description: `Document saved as ${data.fileName}. Use "Publish & Create Contract" to add this as an active contract in the CRM.`,
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

  const publishAndCreateMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("No document ID");
      console.log('[Publish] Saving sections and variables...');
      await saveSectionsMutation.mutateAsync();
      await saveVariablesMutation.mutateAsync();
      console.log('[Publish] Calling publish-and-create endpoint...');
      const response = await apiRequest("POST", `/api/contract-builder/documents/${documentId}/publish-and-create`, {});
      console.log('[Publish] Response status:', response.status, response.statusText);
      const data = await response.json();
      console.log('[Publish] Response data:', data);
      return data;
    },
    onSuccess: (data: { contract: { id: string; customerId: string }; fileName: string }) => {
      console.log('[Publish] onSuccess called with data:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", data.contract.customerId, "contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", data.contract.customerId] });
      toast({
        title: "Contract created successfully",
        description: "The contract has been created and the PDF has been attached",
      });
      console.log('[Publish] Navigating to customer page:', `/customers/${data.contract.customerId}`);
      // Navigate to customer detail page, contracts tab
      setLocation(`/customers/${data.contract.customerId}`);
    },
    onError: (error: any) => {
      console.error('[Publish] onError called:', error);
      
      // Extract user-friendly error message from various error formats
      let errorMessage = "An error occurred while publishing the contract";
      
      if (error.message) {
        // Try to parse JSON error message from API
        try {
          // Format: "400: {"error":"message"}"
          const match = error.message.match(/\d+:\s*(\{.*\})/);
          if (match) {
            const jsonError = JSON.parse(match[1]);
            errorMessage = jsonError.error || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Publish failed",
        description: errorMessage,
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
    autoFilledVars.contract_start_date = today.toISOString().split("T")[0];
    autoFilledVars.contract_end_date = nextYear.toISOString().split("T")[0];
    
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
            displayOrder: template?.displayOrder || 0,
          };
        });
        const sectionsResponse = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/sections`, sectionsData);
        // 204 No Content response, don't try to parse JSON
        if (sectionsResponse.status !== 204) {
          await sectionsResponse.json();
        }

        const variablesData = Object.entries(variables).map(([key, value]) => ({
          documentId,
          variableKey: key,
          variableValue: value,
        }));
        const variablesResponse = await apiRequest("PUT", `/api/contract-builder/documents/${documentId}/variables`, variablesData);
        // 204 No Content response, don't try to parse JSON
        if (variablesResponse.status !== 204) {
          await variablesResponse.json();
        }

        queryClient.invalidateQueries({ queryKey: ["/api/contract-builder/documents", documentId] });
        console.log("Auto-saved at", new Date().toLocaleTimeString());
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [documentId, sections, variables]);

  const handleCustomerSelect = (customer: Customer) => {
    console.log('[Contract Builder] Customer selected:', customer.name, 'ID:', customer.id);
    setSelectedCustomer(customer);
    setIsCustomerDialogOpen(false);
    setIsCreatingCustomer(false);
    setCustomerSearch("");
    // Draft dialog will open via useEffect watching selectedCustomer
  };

  // Auto-create or load draft when customer is selected
  useEffect(() => {
    if (selectedCustomer && !isCustomerDialogOpen && !documentId) {
      console.log('[Contract Builder] useEffect: Customer selected, checking for existing drafts for', selectedCustomer.name);
      
      // Wait for drafts query to finish loading
      if (draftsLoading) {
        console.log('[Contract Builder] Drafts still loading, waiting...');
        return;
      }
      
      // Check if drafts exist (filter to only show draft status, not published)
      const unpublishedDrafts = existingDrafts?.filter(d => d.status === 'draft') || [];
      
      if (unpublishedDrafts.length > 0) {
        // Show draft selection dialog
        console.log('[Contract Builder] Found', unpublishedDrafts.length, 'draft(s), showing selection dialog');
        setIsDraftSelectionOpen(true);
      } else {
        // No drafts exist, auto-create a new one
        console.log('[Contract Builder] No existing drafts, auto-creating new draft for', selectedCustomer.name);
        createDocumentMutation.mutate(selectedCustomer);
      }
    }
  }, [selectedCustomer, isCustomerDialogOpen, documentId, existingDrafts, draftsLoading]);

  const handleCreateNewDraft = () => {
    console.log('[Contract Builder] handleCreateNewDraft called, selectedCustomer:', selectedCustomer?.name);
    if (!selectedCustomer) {
      console.error('[Contract Builder] No selected customer, aborting');
      return;
    }
    // Reset all state before creating a new draft
    console.log('[Contract Builder] Resetting state and creating new draft...');
    setSections({});
    setVariables({});
    setDocumentId(null);
    createDocumentMutation.mutate(selectedCustomer);
  };

  const loadDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const [sectionsRes, variablesRes] = await Promise.all([
        apiRequest("GET", `/api/contract-builder/documents/${draftId}/sections`),
        apiRequest("GET", `/api/contract-builder/documents/${draftId}/variables`),
      ]);
      const sections = await sectionsRes.json();
      const variables = await variablesRes.json();
      return { draftId, sections, variables };
    },
    onSuccess: (data) => {
      setDocumentId(data.draftId);
      
      const loadedSections: Record<string, SectionState> = {};
      data.sections.forEach((section: any) => {
        loadedSections[section.templateId] = {
          templateId: section.templateId,
          isIncluded: section.isIncluded,
          customContent: section.customContent,
        };
      });
      setSections(loadedSections);

      const loadedVariables: Record<string, string> = {};
      data.variables.forEach((variable: any) => {
        loadedVariables[variable.variableKey] = variable.variableValue;
      });
      setVariables(loadedVariables);

      setIsDraftSelectionOpen(false);
      toast({
        title: "Draft loaded",
        description: "Your saved draft has been loaded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to load draft: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleCreateCustomer = () => {
    if (!newCustomerForm.name || !newCustomerForm.street || !newCustomerForm.city || !newCustomerForm.state || !newCustomerForm.zip) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields to create a customer.",
        variant: "destructive",
      });
      return;
    }
    createCustomerMutation.mutate(newCustomerForm);
  };

  const handleSectionToggle = (templateId: string, isIncluded: boolean) => {
    setSections((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], isIncluded },
    }));
  };

  const handleVariableChange = (key: string, value: string) => {
    setVariables((prev) => {
      const updated = { ...prev, [key]: value };
      
      // Auto-calculate petstations_total_price = num_petstations * petstation_price
      if (key === 'num_petstations' || key === 'petstation_price') {
        const numStations = parseFloat(updated.num_petstations || '0');
        const pricePerStation = parseFloat(updated.petstation_price || '0');
        if (!isNaN(numStations) && !isNaN(pricePerStation)) {
          updated.petstations_total_price = (numStations * pricePerStation).toFixed(2);
        }
      }
      
      // Auto-calculate monthly_payment = contract_amount / num_months
      if (key === 'contract_amount' || key === 'num_months') {
        const contractAmount = parseFloat(updated.contract_amount || '0');
        const numMonths = parseFloat(updated.num_months || '0');
        if (!isNaN(contractAmount) && !isNaN(numMonths) && numMonths > 0) {
          updated.monthly_payment = (contractAmount / numMonths).toFixed(2);
        }
      }
      
      return updated;
    });
  };

  const handleSaveAll = async () => {
    await saveSectionsMutation.mutateAsync();
    await saveVariablesMutation.mutateAsync();
  };

  const renderPreview = () => {
    if (!templates) return [];
    const includedTemplates = templates
      .filter((t) => sections[t.id]?.isIncluded !== false)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return includedTemplates.map((template) => {
      let content = sections[template.id]?.customContent || template.defaultContent;
      
      // Create an array of parts with variable highlighting
      const parts: Array<{ text: string; isVariable: boolean; varKey?: string }> = [];
      let lastIndex = 0;
      const variableRegex = /\{\{(\w+)\}\}/g;
      let match;
      
      while ((match = variableRegex.exec(content)) !== null) {
        // Add text before the variable
        if (match.index > lastIndex) {
          parts.push({ text: content.slice(lastIndex, match.index), isVariable: false });
        }
        
        // Add the variable with its value or placeholder
        const varKey = match[1];
        const varValue = variables[varKey] || `{{${varKey}}}`;
        parts.push({ text: varValue, isVariable: true, varKey });
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < content.length) {
        parts.push({ text: content.slice(lastIndex), isVariable: false });
      }
      
      return {
        title: template.sectionTitle,
        parts,
      };
    });
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
                    <DialogTitle>{isCreatingCustomer ? "New Customer" : "Select Customer"}</DialogTitle>
                  </DialogHeader>
                  
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant={!isCreatingCustomer ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsCreatingCustomer(false)}
                      className="flex-1"
                      data-testid="button-search-mode"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                    <Button
                      variant={isCreatingCustomer ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsCreatingCustomer(true)}
                      className="flex-1"
                      data-testid="button-create-mode"
                    >
                      New Customer
                    </Button>
                  </div>

                  {!isCreatingCustomer ? (
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
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="customer-name">Customer Name *</Label>
                        <Input
                          id="customer-name"
                          placeholder="Enter customer name"
                          value={newCustomerForm.name}
                          onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                          data-testid="input-new-customer-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customer-street">Street Address *</Label>
                        <Input
                          id="customer-street"
                          placeholder="123 Main St"
                          value={newCustomerForm.street}
                          onChange={(e) => setNewCustomerForm({ ...newCustomerForm, street: e.target.value })}
                          data-testid="input-new-customer-street"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2 col-span-1">
                          <Label htmlFor="customer-city">City *</Label>
                          <Input
                            id="customer-city"
                            placeholder="Denver"
                            value={newCustomerForm.city}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, city: e.target.value })}
                            data-testid="input-new-customer-city"
                          />
                        </div>
                        <div className="space-y-2 col-span-1">
                          <Label htmlFor="customer-state">State *</Label>
                          <Input
                            id="customer-state"
                            placeholder="CO"
                            value={newCustomerForm.state}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, state: e.target.value })}
                            maxLength={2}
                            data-testid="input-new-customer-state"
                          />
                        </div>
                        <div className="space-y-2 col-span-1">
                          <Label htmlFor="customer-zip">ZIP *</Label>
                          <Input
                            id="customer-zip"
                            placeholder="80202"
                            value={newCustomerForm.zip}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, zip: e.target.value })}
                            maxLength={10}
                            data-testid="input-new-customer-zip"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsCreatingCustomer(false);
                            setNewCustomerForm({ name: "", street: "", city: "", state: "", zip: "" });
                          }}
                          className="flex-1"
                          data-testid="button-cancel-create"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateCustomer}
                          disabled={createCustomerMutation.isPending}
                          className="flex-1"
                          data-testid="button-confirm-create"
                        >
                          {createCustomerMutation.isPending ? "Creating..." : "Create & Continue"}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Intermediate state: customer selected but no document yet (show draft selection)
  if (selectedCustomer && !documentId) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Button 
              variant="ghost" 
              size="sm" 
              className="mb-4" 
              onClick={() => setSelectedCustomer(null)}
              data-testid="button-back-to-customer"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Customer Selection
            </Button>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">
              Contract for {selectedCustomer.name}
            </h1>
            <p className="text-muted-foreground">
              {selectedCustomer.street}, {selectedCustomer.city}, {selectedCustomer.state} {selectedCustomer.zip}
            </p>
          </div>

          <Dialog open={isDraftSelectionOpen} onOpenChange={(open) => {
            console.log('[Contract Builder] Draft dialog onOpenChange called with:', open);
            setIsDraftSelectionOpen(open);
          }}>
            <DialogContent className="max-w-2xl" data-testid="dialog-draft-selection">
              <DialogHeader>
                <DialogTitle>Load Draft or Create New?</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {(() => {
                  const unpublishedDrafts = existingDrafts?.filter(d => d.status === 'draft') || [];
                  return unpublishedDrafts.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Found {unpublishedDrafts.length} existing {unpublishedDrafts.length === 1 ? 'draft' : 'drafts'} for {selectedCustomer?.name || 'this customer'}
                    </p>
                    
                    <ScrollArea className="h-64 border rounded-md p-2">
                      <div className="space-y-2">
                        {unpublishedDrafts.map((draft) => (
                          <Card
                            key={draft.id}
                            className="hover-elevate cursor-pointer"
                            onClick={() => loadDraftMutation.mutate(draft.id)}
                            data-testid={`card-draft-${draft.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium" data-testid={`text-draft-title-${draft.id}`}>
                                    {draft.documentTitle}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Status: <span className="capitalize">{draft.status}</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Last updated: {new Date(draft.updatedAt).toLocaleDateString()} at {new Date(draft.updatedAt).toLocaleTimeString()}
                                  </p>
                                </div>
                                <FileText className="w-5 h-5 text-muted-foreground" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>

                    <Separator />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-drafts">
                    No existing drafts found for {selectedCustomer?.name || 'this customer'}
                  </p>
                );
                })()}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsDraftSelectionOpen(false);
                      setSelectedCustomer(null);
                    }}
                    className="flex-1"
                    data-testid="button-cancel-draft-selection"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateNewDraft}
                    disabled={createDocumentMutation.isPending}
                    className="flex-1"
                    data-testid="button-create-new-draft"
                  >
                    {createDocumentMutation.isPending ? "Creating..." : "Create New Draft"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Show loading state while checking for drafts */}
          {draftsLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">Checking for existing drafts...</p>
              </CardContent>
            </Card>
          ) : !isDraftSelectionOpen ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">Loading contract builder...</p>
              </CardContent>
            </Card>
          ) : null}
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
              variant="outline"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Draft
            </Button>
            <Button 
              variant="outline" 
              onClick={() => exportPdfMutation.mutate()}
              disabled={!documentId || exportPdfMutation.isPending}
              data-testid="button-export-pdf"
            >
              <Download className="w-4 h-4 mr-2" />
              {exportPdfMutation.isPending ? "Exporting..." : "Export PDF"}
            </Button>
            <Button 
              variant="default" 
              onClick={() => publishAndCreateMutation.mutate()}
              disabled={!documentId || publishAndCreateMutation.isPending}
              data-testid="button-publish-create"
            >
              <FileCheck className="w-4 h-4 mr-2" />
              {publishAndCreateMutation.isPending ? "Publishing..." : "Publish & Create Contract"}
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
              <div className="space-y-4 pr-4">
                {templatesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading sections...</p>
                ) : (
                  (() => {
                    const sortedTemplates = templates?.sort((a, b) => a.displayOrder - b.displayOrder) || [];
                    
                    return (
                      <>
                        {/* Sections I-IV: Auto-included */}
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-primary sticky top-0 bg-background py-2 z-10">
                            Sections I-IV (Auto-Included)
                          </h3>
                          <div className="space-y-2 pl-4">
                            {sortedTemplates
                              .filter(t => ['header', 'terms', 'definitions', 'general_provisions', 'communication'].includes(t.sectionKey))
                              .map((template) => (
                                <div key={template.id} className="flex items-start gap-3 py-2 opacity-60" data-testid={`card-section-${template.sectionKey}`}>
                                  <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                                    <div className="w-3 h-3 bg-primary rounded-sm" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">
                                      {template.sectionNumber ? `${template.sectionNumber}. ` : ''}{template.sectionTitle}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Section V: Maintenance - Subsections are checkable */}
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-primary sticky top-0 bg-background py-2 z-10">
                            Section V - Maintenance & Site Care and Scope of Work
                          </h3>
                          <div className="space-y-2 pl-4">
                            {sortedTemplates
                              .filter(t => t.category === 'maintenance' && t.sectionNumber?.startsWith('V.'))
                              .map((template) => (
                                <div key={template.id} className="flex items-start gap-3 py-2" data-testid={`card-section-${template.sectionKey}`}>
                                  <Checkbox
                                    checked={sections[template.id]?.isIncluded !== false}
                                    onCheckedChange={(checked) =>
                                      handleSectionToggle(template.id, checked as boolean)
                                    }
                                    data-testid={`checkbox-section-${template.sectionKey}`}
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">
                                      {template.sectionNumber?.replace('V.', '')}. {template.sectionTitle}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Sections VI-VIII: Checkable */}
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-primary sticky top-0 bg-background py-2 z-10">
                            Sections VI-VIII (Optional Services)
                          </h3>
                          <div className="space-y-2 pl-4">
                            {sortedTemplates
                              .filter(t => ['irrigation', 'winter_services', 'snow_ice'].includes(t.sectionKey))
                              .map((template) => (
                                <div key={template.id} className="flex items-start gap-3 py-2" data-testid={`card-section-${template.sectionKey}`}>
                                  <Checkbox
                                    checked={sections[template.id]?.isIncluded !== false}
                                    onCheckedChange={(checked) =>
                                      handleSectionToggle(template.id, checked as boolean)
                                    }
                                    data-testid={`checkbox-section-${template.sectionKey}`}
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">
                                      {template.sectionNumber}. {template.sectionTitle}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Sections IX-XIII: Auto-included */}
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-primary sticky top-0 bg-background py-2 z-10">
                            Sections IX-XIII (Auto-Included)
                          </h3>
                          <div className="space-y-2 pl-4">
                            {sortedTemplates
                              .filter(t => ['insurance', 'termination', 'payments', 'labor_rates', 'acceptance'].includes(t.sectionKey))
                              .map((template) => (
                                <div key={template.id} className="flex items-start gap-3 py-2 opacity-60" data-testid={`card-section-${template.sectionKey}`}>
                                  <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                                    <div className="w-3 h-3 bg-primary rounded-sm" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">
                                      {template.sectionNumber}. {template.sectionTitle}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="variables" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-full">
              <div className="space-y-6 pr-4">
                {templatesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading variables...</p>
                ) : (
                  (() => {
                    const categoryLabels: Record<string, string> = {
                      header: "I. Header & Property Information",
                      terms: "II. General Terms & Definitions",
                      maintenance: "V. Landscape Maintenance Services",
                      irrigation: "VI. Irrigation Services",
                      snow: "VII-VIII. Winter & Snow Services",
                      payments: "XI. Payment Terms",
                      acceptance: "XIII. Acceptance & Signatures",
                    };
                    
                    const sortedTemplates = templates
                      ?.filter((t) => sections[t.id]?.isIncluded !== false)
                      .sort((a, b) => a.displayOrder - b.displayOrder) || [];
                    
                    const variablesBySectionId: Record<string, string[]> = {};
                    sortedTemplates.forEach((template) => {
                      const content = sections[template.id]?.customContent || template.defaultContent;
                      const vars = extractVariables(content);
                      if (vars.length > 0) {
                        variablesBySectionId[template.id] = vars;
                      }
                    });
                    
                    const hasVariables = Object.keys(variablesBySectionId).length > 0;
                    if (!hasVariables) {
                      return (
                        <p className="text-sm text-muted-foreground">
                          No variables found in selected sections
                        </p>
                      );
                    }
                    
                    return sortedTemplates.map((template) => {
                      const templateVars = variablesBySectionId[template.id];
                      if (!templateVars || templateVars.length === 0) return null;
                      
                      // Filter variables based on included sections
                      const visibleVars = templateVars.filter((varKey) => shouldShowVariable(varKey));
                      if (visibleVars.length === 0) return null;
                      
                      return (
                        <div key={template.id} className="space-y-3">
                          <div className="sticky top-0 bg-background py-2 z-10">
                            <h3 className="text-sm font-semibold text-primary">
                              {categoryLabels[template.category]} - {template.sectionTitle}
                            </h3>
                          </div>
                          <div className="space-y-4 pl-4">
                            {visibleVars.map((varKey) => {
                              const isCalculated = varKey === 'petstations_total_price' || varKey === 'monthly_payment';
                              return (
                                <div key={varKey} className="space-y-2">
                                  <Label htmlFor={`var-${varKey}`} className="text-sm font-medium" data-testid={`label-variable-${varKey}`}>
                                    {varKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                                    {isCalculated && <span className="text-xs text-muted-foreground ml-2">(Auto-calculated)</span>}
                                  </Label>
                                  <Input
                                    id={`var-${varKey}`}
                                    value={variables[varKey] || ""}
                                    onChange={(e) => handleVariableChange(varKey, e.target.value)}
                                    placeholder={`Enter ${varKey.replace(/_/g, " ")}`}
                                    disabled={isCalculated}
                                    className={isCalculated ? "bg-muted" : ""}
                                    data-testid={`input-variable-${varKey}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-full">
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-6" data-testid="text-preview">
                    {renderPreview().map((section, sectionIndex) => (
                      <div key={sectionIndex} className="space-y-3">
                        <h3 className="text-lg font-semibold border-b pb-2">
                          {section.title}
                        </h3>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">
                          {section.parts.map((part, partIndex) => (
                            part.isVariable ? (
                              <span
                                key={partIndex}
                                className="bg-yellow-100 dark:bg-yellow-900/30 px-1 py-0.5 rounded font-medium text-yellow-900 dark:text-yellow-100"
                                title={part.varKey ? `Variable: ${part.varKey}` : undefined}
                                data-testid={`variable-highlight-${part.varKey}`}
                              >
                                {part.text}
                              </span>
                            ) : (
                              <span key={partIndex}>{part.text}</span>
                            )
                          ))}
                        </div>
                        {sectionIndex < renderPreview().length - 1 && (
                          <div className="border-t pt-2 mt-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
