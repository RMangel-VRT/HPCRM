import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Building2, User, Plus, Pencil, Trash2, X, Phone, Mail, Copy, FileText, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings, PropertyManagementCompany, PropertyManager, PropertyManagerEmail, PropertyManagerPhone, PropertyManagerWithContacts } from "@shared/schema";

interface ManagerEmailInput {
  email: string;
  isPrimary: "true" | "false";
}

interface ManagerPhoneInput {
  phone: string;
  phoneType: "personal" | "company";
  isPrimary: "true" | "false";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const companySchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
});

const benchmarksSchema = z.object({
  smallPad: z.number().min(0),
  hoaStandard: z.number().min(0),
  hoaComplex: z.number().min(0),
});

const pmCompanySchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  notes: z.string().optional(),
});

const pmManagerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  propertyManagementCompanyId: z.string().min(1, "Company is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export default function SettingsPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  
  // Check if user is admin (can see all tabs) vs office (can only see Property Management)
  const isAdmin = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;
  const [activeTab, setActiveTab] = useState(isAdmin ? "company" : "property-management");

  useSetBreadcrumbs([
    { label: "Settings" },
  ], []);
  const [mowingMonths, setMowingMonths] = useState<string[]>([]);
  const [cleanupMonths, setCleanupMonths] = useState<string[]>([]);
  const [featureFlags, setFeatureFlags] = useState({
    tickets_v2: false,
    forecast_v2: false,
    qbo_write: false,
  });
  
  // Check if user has access to Property Management (admin or office)
  const canAccessPropertyManagement = currentUser?.activeRole === "admin" || currentUser?.activeRole === "office" || currentUser?.isSuperAdminBool;
  
  // Property Management state
  const [pmCompanyDialogOpen, setPmCompanyDialogOpen] = useState(false);
  const [pmManagerDialogOpen, setPmManagerDialogOpen] = useState(false);
  const [editingPmCompany, setEditingPmCompany] = useState<PropertyManagementCompany | null>(null);
  const [editingPmManager, setEditingPmManager] = useState<PropertyManager | null>(null);
  const [managerEmails, setManagerEmails] = useState<ManagerEmailInput[]>([]);
  const [managerPhones, setManagerPhones] = useState<ManagerPhoneInput[]>([]);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });
  
  // Property Management queries
  const { data: pmCompanies = [] } = useQuery<PropertyManagementCompany[]>({
    queryKey: ["/api/property-management-companies"],
  });
  
  const { data: pmManagers = [] } = useQuery<PropertyManager[]>({
    queryKey: ["/api/property-managers"],
  });

  // Email Templates state and queries
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateHtmlBody, setTemplateHtmlBody] = useState("");

  const { data: emailTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/email-templates"],
    enabled: isAdmin === true,
  });

  const { data: emailRules = [] } = useQuery<any[]>({
    queryKey: ["/api/email-rules"],
    enabled: isAdmin === true,
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/email-templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setEditingTemplate(null);
      toast({ title: "Template updated" });
    },
    onError: () => {
      toast({ title: "Failed to update template", variant: "destructive" });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      return await apiRequest("PATCH", `/api/email-rules/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-rules"] });
      toast({ title: "Rule updated" });
    },
    onError: () => {
      toast({ title: "Failed to update rule", variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<Settings>) => {
      return await apiRequest("PATCH", "/api/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const companyForm = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      companyName: "",
    },
  });

  const benchmarksForm = useForm<z.infer<typeof benchmarksSchema>>({
    resolver: zodResolver(benchmarksSchema),
    defaultValues: {
      smallPad: 50,
      hoaStandard: 45,
      hoaComplex: 55,
    },
  });
  
  // Property Management forms
  const pmCompanyForm = useForm<z.infer<typeof pmCompanySchema>>({
    resolver: zodResolver(pmCompanySchema),
    defaultValues: { name: "", phone: "", email: "", street: "", city: "", state: "", zip: "", notes: "" },
  });
  
  const pmManagerForm = useForm<z.infer<typeof pmManagerSchema>>({
    resolver: zodResolver(pmManagerSchema),
    defaultValues: { name: "", propertyManagementCompanyId: "", phone: "", email: "", notes: "" },
  });
  
  // Property Management mutations
  const createPmCompanyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof pmCompanySchema>) => {
      return await apiRequest("POST", "/api/property-management-companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-management-companies"] });
      setPmCompanyDialogOpen(false);
      setEditingPmCompany(null);
      pmCompanyForm.reset();
      toast({ title: "Success", description: "Property management company created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create company.", variant: "destructive" });
    },
  });
  
  const updatePmCompanyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof pmCompanySchema> }) => {
      return await apiRequest("PATCH", `/api/property-management-companies/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-management-companies"] });
      setPmCompanyDialogOpen(false);
      setEditingPmCompany(null);
      pmCompanyForm.reset();
      toast({ title: "Success", description: "Company updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update company.", variant: "destructive" });
    },
  });
  
  const deletePmCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/property-management-companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-management-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      toast({ title: "Deleted", description: "Company deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete company.", variant: "destructive" });
    },
  });
  
  const createPmManagerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof pmManagerSchema> & { emails: ManagerEmailInput[]; phones: ManagerPhoneInput[] }) => {
      const { emails, phones, ...managerData } = data;
      const response = await apiRequest("POST", "/api/property-managers", managerData);
      const manager = await response.json() as PropertyManager;
      if (emails.length > 0 || phones.length > 0) {
        await apiRequest("PUT", `/api/property-managers/${manager.id}/contacts`, { emails, phones });
      }
      return manager;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      setPmManagerDialogOpen(false);
      setEditingPmManager(null);
      pmManagerForm.reset();
      setManagerEmails([]);
      setManagerPhones([]);
      toast({ title: "Success", description: "Property manager created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create manager.", variant: "destructive" });
    },
  });
  
  const updatePmManagerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof pmManagerSchema> & { emails: ManagerEmailInput[]; phones: ManagerPhoneInput[] } }) => {
      const { emails, phones, ...managerData } = data;
      const manager = await apiRequest("PATCH", `/api/property-managers/${id}`, managerData);
      await apiRequest("PUT", `/api/property-managers/${id}/contacts`, { emails, phones });
      return manager;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      setPmManagerDialogOpen(false);
      setEditingPmManager(null);
      pmManagerForm.reset();
      setManagerEmails([]);
      setManagerPhones([]);
      toast({ title: "Success", description: "Manager updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update manager.", variant: "destructive" });
    },
  });
  
  const deletePmManagerMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/property-managers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      toast({ title: "Deleted", description: "Manager deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete manager.", variant: "destructive" });
    },
  });
  
  // Property Management handlers
  const handleOpenPmCompanyDialog = (company?: PropertyManagementCompany) => {
    if (company) {
      setEditingPmCompany(company);
      pmCompanyForm.reset({
        name: company.name,
        phone: company.phone || "",
        email: company.email || "",
        street: company.street || "",
        city: company.city || "",
        state: company.state || "",
        zip: company.zip || "",
        notes: company.notes || "",
      });
    } else {
      setEditingPmCompany(null);
      pmCompanyForm.reset({ name: "", phone: "", email: "", street: "", city: "", state: "", zip: "", notes: "" });
    }
    setPmCompanyDialogOpen(true);
  };
  
  const handleOpenPmManagerDialog = async (manager?: PropertyManager) => {
    if (manager) {
      setEditingPmManager(manager);
      pmManagerForm.reset({
        name: manager.name,
        propertyManagementCompanyId: manager.propertyManagementCompanyId,
        phone: manager.phone || "",
        email: manager.email || "",
        notes: manager.notes || "",
      });
      try {
        const response = await fetch(`/api/property-managers/${manager.id}/contacts`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json() as PropertyManagerWithContacts;
          setManagerEmails(data.emails.map(e => ({ email: e.email, isPrimary: e.isPrimary })));
          setManagerPhones(data.phones.map(p => ({ phone: p.phone, phoneType: p.phoneType, isPrimary: p.isPrimary })));
        }
      } catch {
        setManagerEmails([]);
        setManagerPhones([]);
      }
    } else {
      setEditingPmManager(null);
      pmManagerForm.reset({ name: "", propertyManagementCompanyId: "", phone: "", email: "", notes: "" });
      setManagerEmails([]);
      setManagerPhones([]);
    }
    setPmManagerDialogOpen(true);
  };
  
  const handlePmCompanySubmit = pmCompanyForm.handleSubmit((data) => {
    if (editingPmCompany) {
      updatePmCompanyMutation.mutate({ id: editingPmCompany.id, data });
    } else {
      createPmCompanyMutation.mutate(data);
    }
  });
  
  const handlePmManagerSubmit = pmManagerForm.handleSubmit((data) => {
    const submitData = { ...data, emails: managerEmails, phones: managerPhones };
    if (editingPmManager) {
      updatePmManagerMutation.mutate({ id: editingPmManager.id, data: submitData });
    } else {
      createPmManagerMutation.mutate(submitData);
    }
  });

  // Initialize form values when settings load
  useEffect(() => {
    if (settings && !isLoading) {
      companyForm.reset({ companyName: settings.companyName });

      if (settings.mowingSeasonMonths.length > 0) {
        setMowingMonths(settings.mowingSeasonMonths);
      }

      if (settings.cleanupSeasonMonths.length > 0) {
        setCleanupMonths(settings.cleanupSeasonMonths);
      }

      const parsedBenchmarks = settings.hourlyRateBenchmarks ? JSON.parse(settings.hourlyRateBenchmarks) : {};
      if (Object.keys(parsedBenchmarks).length > 0) {
        benchmarksForm.reset({
          smallPad: parsedBenchmarks.smallPad || 50,
          hoaStandard: parsedBenchmarks.hoaStandard || 45,
          hoaComplex: parsedBenchmarks.hoaComplex || 55,
        });
      }

      const parsedFlags = settings.featureFlags ? JSON.parse(settings.featureFlags) : {};
      if (Object.keys(parsedFlags).length > 0) {
        setFeatureFlags({
          tickets_v2: parsedFlags.tickets_v2 || false,
          forecast_v2: parsedFlags.forecast_v2 || false,
          qbo_write: parsedFlags.qbo_write || false,
        });
      }
    }
  }, [settings, isLoading]);

  const handleCompanySubmit = companyForm.handleSubmit((data) => {
    updateSettingsMutation.mutate({ companyName: data.companyName });
  });

  const toggleMonth = (month: string, type: "mowing" | "cleanup") => {
    if (type === "mowing") {
      setMowingMonths((prev) =>
        prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
      );
    } else {
      setCleanupMonths((prev) =>
        prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
      );
    }
  };

  const handleSeasonsSubmit = () => {
    updateSettingsMutation.mutate({
      mowingSeasonMonths: mowingMonths,
      cleanupSeasonMonths: cleanupMonths,
    });
  };

  const handleBenchmarksSubmit = benchmarksForm.handleSubmit((data) => {
    updateSettingsMutation.mutate({
      hourlyRateBenchmarks: JSON.stringify(data),
    });
  });

  const handleFeatureFlagToggle = (flag: keyof typeof featureFlags) => {
    setFeatureFlags((prev) => ({ ...prev, [flag]: !prev[flag] }));
  };

  const handleFeaturesSubmit = () => {
    updateSettingsMutation.mutate({
      featureFlags: JSON.stringify(featureFlags),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage company settings and feature flags
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {isAdmin && (
            <>
              <TabsTrigger value="company" data-testid="tab-company">Company</TabsTrigger>
              <TabsTrigger value="seasons" data-testid="tab-seasons">Seasons</TabsTrigger>
              <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
            </>
          )}
          {canAccessPropertyManagement && (
            <TabsTrigger value="property-management" data-testid="tab-property-management">Property Management</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="features" data-testid="tab-features">Feature Flags</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="email-templates" data-testid="tab-email-templates">Email Templates</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="billing" data-testid="tab-billing">Billing</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                Basic company details used throughout the system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleCompanySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    {...companyForm.register("companyName")}
                    data-testid="input-company-name"
                  />
                  {companyForm.formState.errors.companyName && (
                    <p className="text-sm text-destructive">
                      {companyForm.formState.errors.companyName.message}
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-company"
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seasons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Service Seasons</CardTitle>
              <CardDescription>
                Define which months each service type is active
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base">Mowing Season</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Click months to toggle selection
                </p>
                <div className="flex flex-wrap gap-2">
                  {MONTHS.map((month) => (
                    <Badge
                      key={month}
                      onClick={() => toggleMonth(month, "mowing")}
                      className={
                        mowingMonths.includes(month)
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 cursor-pointer hover-elevate active-elevate-2"
                          : "bg-muted text-muted-foreground cursor-pointer hover-elevate active-elevate-2"
                      }
                      data-testid={`badge-mowing-${month.toLowerCase()}`}
                    >
                      {month}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-base">Cleanup Season</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Click months to toggle selection
                </p>
                <div className="flex flex-wrap gap-2">
                  {MONTHS.map((month) => (
                    <Badge
                      key={month}
                      onClick={() => toggleMonth(month, "cleanup")}
                      className={
                        cleanupMonths.includes(month)
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 cursor-pointer hover-elevate active-elevate-2"
                          : "bg-muted text-muted-foreground cursor-pointer hover-elevate active-elevate-2"
                      }
                      data-testid={`badge-cleanup-${month.toLowerCase()}`}
                    >
                      {month}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSeasonsSubmit}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-seasons"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Rate Benchmarks</CardTitle>
              <CardDescription>
                Standard hourly rates for different property types ($/hour)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleBenchmarksSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smallPad">Small Pad</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="smallPad"
                        type="number"
                        {...benchmarksForm.register("smallPad", { valueAsNumber: true })}
                        className="pl-7"
                        data-testid="input-small-pad"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hoaStandard">HOA Standard</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="hoaStandard"
                        type="number"
                        {...benchmarksForm.register("hoaStandard", { valueAsNumber: true })}
                        className="pl-7"
                        data-testid="input-hoa-standard"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hoaComplex">HOA Complex</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="hoaComplex"
                        type="number"
                        {...benchmarksForm.register("hoaComplex", { valueAsNumber: true })}
                        className="pl-7"
                        data-testid="input-hoa-complex"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-benchmarks"
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {canAccessPropertyManagement && (
        <TabsContent value="property-management" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Property Management Companies
                </CardTitle>
                <CardDescription>
                  Manage companies that oversee multiple properties
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenPmCompanyDialog()} data-testid="button-add-pm-company" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </CardHeader>
            <CardContent>
              {pmCompanies.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No property management companies yet.</p>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pmCompanies.map((company) => (
                          <TableRow key={company.id} data-testid={`row-pm-company-${company.id}`}>
                            <TableCell className="font-medium">{company.name}</TableCell>
                            <TableCell>{company.phone || "-"}</TableCell>
                            <TableCell>{company.email || "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="icon" variant="ghost" onClick={() => handleOpenPmCompanyDialog(company)} data-testid={`button-edit-pm-company-${company.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => deletePmCompanyMutation.mutate(company.id)} data-testid={`button-delete-pm-company-${company.id}`}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="sm:hidden space-y-3">
                    {pmCompanies.map((company) => (
                      <div key={company.id} className="border rounded-md p-3 space-y-2" data-testid={`card-pm-company-${company.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm" data-testid={`text-pm-company-name-${company.id}`}>{company.name}</p>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleOpenPmCompanyDialog(company)} data-testid={`button-edit-pm-company-m-${company.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deletePmCompanyMutation.mutate(company.id)} data-testid={`button-delete-pm-company-m-${company.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {company.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pm-company-phone-${company.id}`}><Phone className="w-3 h-3" /> {company.phone}</p>
                        )}
                        {company.email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pm-company-email-${company.id}`}><Mail className="w-3 h-3" /> {company.email}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Property Managers
                </CardTitle>
                <CardDescription>
                  Individual managers who handle specific properties
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {pmManagers.length > 0 && pmManagers.some(m => m.email) && (
                  <Button 
                    variant="outline"
                    className="flex-1 sm:flex-initial"
                    onClick={() => {
                      const allEmails = pmManagers
                        .map(m => m.email)
                        .filter(Boolean) as string[];
                      if (allEmails.length > 0) {
                        navigator.clipboard.writeText(allEmails.join(", "));
                        toast({
                          title: "Copied",
                          description: `${allEmails.length} email${allEmails.length > 1 ? 's' : ''} copied to clipboard`,
                        });
                      }
                    }}
                    data-testid="button-copy-all-pm-emails"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Copy Emails
                  </Button>
                )}
                <Button onClick={() => handleOpenPmManagerDialog()} data-testid="button-add-pm-manager" className="flex-1 sm:flex-initial">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Manager
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pmManagers.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No property managers yet.</p>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pmManagers.map((manager) => {
                          const company = pmCompanies.find((c) => c.id === manager.propertyManagementCompanyId);
                          return (
                            <TableRow key={manager.id} data-testid={`row-pm-manager-${manager.id}`}>
                              <TableCell className="font-medium">{manager.name}</TableCell>
                              <TableCell>{company?.name || "-"}</TableCell>
                              <TableCell>{manager.phone || "-"}</TableCell>
                              <TableCell>
                                {manager.email ? (
                                  <span className="inline-flex items-center gap-1">
                                    {manager.email}
                                    <button
                                      type="button"
                                      className="text-muted-foreground p-0.5 rounded hover-elevate active-elevate-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(manager.email!);
                                        toast({
                                          title: "Copied",
                                          description: "Email copied to clipboard",
                                        });
                                      }}
                                      data-testid={`button-copy-pm-email-${manager.id}`}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </span>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="icon" variant="ghost" onClick={() => handleOpenPmManagerDialog(manager)} data-testid={`button-edit-pm-manager-${manager.id}`}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => deletePmManagerMutation.mutate(manager.id)} data-testid={`button-delete-pm-manager-${manager.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="sm:hidden space-y-3">
                    {pmManagers.map((manager) => {
                      const company = pmCompanies.find((c) => c.id === manager.propertyManagementCompanyId);
                      return (
                        <div key={manager.id} className="border rounded-md p-3 space-y-2" data-testid={`card-pm-manager-${manager.id}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate" data-testid={`text-pm-manager-name-${manager.id}`}>{manager.name}</p>
                              {company && <p className="text-xs text-muted-foreground" data-testid={`text-pm-manager-company-${manager.id}`}>{company.name}</p>}
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => handleOpenPmManagerDialog(manager)} data-testid={`button-edit-pm-manager-m-${manager.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => deletePmManagerMutation.mutate(manager.id)} data-testid={`button-delete-pm-manager-m-${manager.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {manager.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pm-manager-phone-${manager.id}`}><Phone className="w-3 h-3" /> {manager.phone}</p>
                          )}
                          {manager.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-pm-manager-email-${manager.id}`}>
                              <Mail className="w-3 h-3" /> {manager.email}
                              <span
                                role="button"
                                className="text-muted-foreground p-0.5 rounded hover-elevate active-elevate-2 ml-1 cursor-pointer inline-flex"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(manager.email!);
                                  toast({ title: "Copied", description: "Email copied to clipboard" });
                                }}
                                data-testid={`button-copy-pm-email-m-${manager.id}`}
                              >
                                <Copy className="w-3 h-3" />
                              </span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>
                Enable or disable experimental features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="tickets-v2" className="text-base">Tickets V2</Label>
                  <p className="text-sm text-muted-foreground">
                    Enhanced ticketing system with advanced features
                  </p>
                </div>
                <Switch
                  id="tickets-v2"
                  checked={featureFlags.tickets_v2}
                  onCheckedChange={() => handleFeatureFlagToggle("tickets_v2")}
                  data-testid="switch-tickets-v2"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="forecast-v2" className="text-base">Forecast V2</Label>
                  <p className="text-sm text-muted-foreground">
                    Advanced labor forecasting and planning tools
                  </p>
                </div>
                <Switch
                  id="forecast-v2"
                  checked={featureFlags.forecast_v2}
                  onCheckedChange={() => handleFeatureFlagToggle("forecast_v2")}
                  data-testid="switch-forecast-v2"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="qbo-write" className="text-base">QuickBooks Write Access</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow creating and updating QuickBooks records (requires approval)
                  </p>
                </div>
                <Switch
                  id="qbo-write"
                  checked={featureFlags.qbo_write}
                  onCheckedChange={() => handleFeatureFlagToggle("qbo_write")}
                  data-testid="switch-qbo-write"
                  disabled
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleFeaturesSubmit}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-features"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email-templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Templates</CardTitle>
              <CardDescription>
                Manage email templates used for notifications. Available variables: {"{{ticketTitle}}"}, {"{{customerName}}"}, {"{{companyName}}"}, {"{{completionDate}}"}, {"{{ticketDescription}}"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No email templates found</p>
              ) : (
                <div className="space-y-3">
                  {emailTemplates.map((template: any) => (
                    <div key={template.id} className="border rounded-md p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{template.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Category: {template.category}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={template.isActive ? "default" : "secondary"}>
                            {template.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingTemplate(template);
                              setTemplateSubject(template.subject);
                              setTemplateHtmlBody(template.htmlBody);
                            }}
                            data-testid={`button-edit-template-${template.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Subject:</span> {template.subject}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Rules</CardTitle>
              <CardDescription>
                Control which events trigger email notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {emailRules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No email rules configured</p>
              ) : (
                <div className="space-y-3">
                  {emailRules.map((rule: any) => {
                    const linkedTemplate = emailTemplates.find((t: any) => t.id === rule.templateId);
                    return (
                      <div key={rule.id} className="flex items-center justify-between gap-2 flex-wrap p-3 border rounded-md">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{rule.eventKey.replace(/\./g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                          <p className="text-xs text-muted-foreground">
                            Template: {linkedTemplate?.name || "Unknown"}
                          </p>
                        </div>
                        <Switch
                          checked={rule.isEnabled}
                          onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: rule.id, isEnabled: checked })}
                          data-testid={`switch-rule-${rule.id}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <BillingSettings />
        </TabsContent>

      </Tabs>

      {/* Edit Email Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
            <DialogDescription>
              Modify the subject and body of this template. Use {"{{variableName}}"} for dynamic content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <p className="text-sm text-muted-foreground">{editingTemplate?.name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject</Label>
              <Input
                id="template-subject"
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
                data-testid="input-template-subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-body">HTML Body</Label>
              <Textarea
                id="template-body"
                value={templateHtmlBody}
                onChange={(e) => setTemplateHtmlBody(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                data-testid="textarea-template-body"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <Label>Preview</Label>
              </div>
              <iframe
                className="border rounded-md w-full bg-white"
                style={{ height: "200px" }}
                sandbox=""
                srcDoc={templateHtmlBody
                  .replace(/\{\{ticketTitle\}\}/g, "Sample Ticket Title")
                  .replace(/\{\{customerName\}\}/g, "Sample Customer")
                  .replace(/\{\{companyName\}\}/g, "High Plains Property Maintenance")
                  .replace(/\{\{completionDate\}\}/g, new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))
                  .replace(/\{\{ticketDescription\}\}/g, "Sample description of the work completed.")}
                data-testid="template-preview"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editingTemplate?.isActive ?? true}
                onCheckedChange={(checked) => {
                  if (editingTemplate) {
                    setEditingTemplate({ ...editingTemplate, isActive: checked });
                  }
                }}
                data-testid="switch-template-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingTemplate) {
                  updateTemplateMutation.mutate({
                    id: editingTemplate.id,
                    data: {
                      subject: templateSubject,
                      htmlBody: templateHtmlBody,
                      isActive: editingTemplate.isActive,
                    },
                  });
                }
              }}
              disabled={updateTemplateMutation.isPending}
              data-testid="button-save-template"
            >
              {updateTemplateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Property Management Company Dialog */}
      <Dialog open={pmCompanyDialogOpen} onOpenChange={setPmCompanyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPmCompany ? "Edit Company" : "Add Property Management Company"}</DialogTitle>
            <DialogDescription>
              {editingPmCompany ? "Update the company details below." : "Enter the details for the new property management company."}
            </DialogDescription>
          </DialogHeader>
          <Form {...pmCompanyForm}>
            <form onSubmit={handlePmCompanySubmit} className="space-y-4">
              <FormField
                control={pmCompanyForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-company-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={pmCompanyForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-pm-company-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pmCompanyForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-pm-company-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={pmCompanyForm.control}
                name="street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-company-street" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 sm:grid-cols-3 gap-4">
                <FormField
                  control={pmCompanyForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-pm-company-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pmCompanyForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-pm-company-state" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pmCompanyForm.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-pm-company-zip" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={pmCompanyForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-company-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPmCompanyDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createPmCompanyMutation.isPending || updatePmCompanyMutation.isPending} data-testid="button-save-pm-company">
                  {createPmCompanyMutation.isPending || updatePmCompanyMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Property Manager Dialog */}
      <Dialog open={pmManagerDialogOpen} onOpenChange={setPmManagerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPmManager ? "Edit Manager" : "Add Property Manager"}</DialogTitle>
            <DialogDescription>
              {editingPmManager ? "Update the manager details below." : "Enter the details for the new property manager."}
            </DialogDescription>
          </DialogHeader>
          <Form {...pmManagerForm}>
            <form onSubmit={handlePmManagerSubmit} className="space-y-4">
              <FormField
                control={pmManagerForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manager Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-manager-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={pmManagerForm.control}
                name="propertyManagementCompanyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Management Company</FormLabel>
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-pm-manager-company">
                          <SelectValue placeholder="Select a company (optional)" />
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1"><Mail className="h-4 w-4" /> Email Addresses</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setManagerEmails([...managerEmails, { email: "", isPrimary: "false" }])}
                    data-testid="button-add-manager-email"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Email
                  </Button>
                </div>
                {managerEmails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No email addresses added</p>
                ) : (
                  <div className="space-y-2">
                    {managerEmails.map((emailItem, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="email"
                          value={emailItem.email}
                          onChange={(e) => {
                            const updated = [...managerEmails];
                            updated[index].email = e.target.value;
                            setManagerEmails(updated);
                          }}
                          placeholder="email@example.com"
                          className="flex-1"
                          data-testid={`input-manager-email-${index}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setManagerEmails(managerEmails.filter((_, i) => i !== index))}
                          data-testid={`button-remove-manager-email-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1"><Phone className="h-4 w-4" /> Phone Numbers</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setManagerPhones([...managerPhones, { phone: "", phoneType: "company", isPrimary: "false" }])}
                    data-testid="button-add-manager-phone"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Phone
                  </Button>
                </div>
                {managerPhones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No phone numbers added</p>
                ) : (
                  <div className="space-y-2">
                    {managerPhones.map((phoneItem, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={phoneItem.phone}
                          onChange={(e) => {
                            const updated = [...managerPhones];
                            updated[index].phone = e.target.value;
                            setManagerPhones(updated);
                          }}
                          placeholder="(555) 123-4567"
                          className="flex-1"
                          data-testid={`input-manager-phone-${index}`}
                        />
                        <Select
                          value={phoneItem.phoneType}
                          onValueChange={(value: "personal" | "company") => {
                            const updated = [...managerPhones];
                            updated[index].phoneType = value;
                            setManagerPhones(updated);
                          }}
                        >
                          <SelectTrigger className="w-28" data-testid={`select-phone-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="company">Company</SelectItem>
                            <SelectItem value="personal">Personal</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setManagerPhones(managerPhones.filter((_, i) => i !== index))}
                          data-testid={`button-remove-manager-phone-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <FormField
                control={pmManagerForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-manager-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPmManagerDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createPmManagerMutation.isPending || updatePmManagerMutation.isPending} data-testid="button-save-pm-manager">
                  {createPmManagerMutation.isPending || updatePmManagerMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CompanyUserWithUser {
  id: string;
  userId: string;
  role: string;
  status: string;
  tags: string[] | null;
  user: { id: string; firstName: string; lastName: string; email: string };
}

interface MigrationPreviewTicket {
  ticketId: string;
  title: string;
  ticketType: string;
  currentStatus: string;
  reason: string;
  customerName: string;
}

function BillingSettings() {
  const { toast } = useToast();
  const [migrationPreview, setMigrationPreview] = useState<MigrationPreviewTicket[] | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);

  const { data: teamMembers, isLoading: teamLoading } = useQuery<CompanyUserWithUser[]>({
    queryKey: ["/api/company-users"],
  });

  const toggleBillingTag = async (companyUserId: string, currentTags: string[] | null) => {
    const tags = currentTags || [];
    const newTags = tags.includes("billing")
      ? tags.filter(t => t !== "billing")
      : [...tags, "billing"];
    
    try {
      await apiRequest("PATCH", `/api/company-users/${companyUserId}/tags`, { tags: newTags });
      queryClient.invalidateQueries({ queryKey: ["/api/company-users"] });
      toast({ title: newTags.includes("billing") ? "Billing tag added" : "Billing tag removed" });
    } catch (err) {
      toast({ title: "Failed to update tags", variant: "destructive" });
    }
  };

  const runDryRun = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/migrate-invoices", { dryRun: true });
      const data = await res.json();
      setMigrationPreview(data.tickets);
      setMigrationComplete(false);
    } catch (err) {
      toast({ title: "Failed to preview migration", variant: "destructive" });
    }
  };

  const executeMigration = async () => {
    setMigrationRunning(true);
    try {
      const res = await apiRequest("POST", "/api/admin/migrate-invoices", { dryRun: false });
      const data = await res.json();
      toast({ title: `Migration complete: ${data.count} Invoice tickets created` });
      setMigrationComplete(true);
      setMigrationPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pending-invoices"] });
    } catch (err) {
      toast({ title: "Migration failed", variant: "destructive" });
    } finally {
      setMigrationRunning(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Billing User Assignment</CardTitle>
          <CardDescription>
            Tag a team member as the billing user. All auto-created Invoice tickets will be assigned to this person.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <p className="text-sm text-muted-foreground">Loading team members...</p>
          ) : (
            <div className="space-y-2">
              {teamMembers?.filter(m => m.status === "active" && (m.role === "admin" || m.role === "office")).map(member => (
                <div key={member.id} className="flex items-center justify-between gap-4 p-3 rounded-md border" data-testid={`billing-user-${member.id}`}>
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{member.user.firstName} {member.user.lastName}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                    {(member.tags || []).includes("billing") && (
                      <Badge variant="secondary">billing</Badge>
                    )}
                  </div>
                  <Switch
                    checked={(member.tags || []).includes("billing")}
                    onCheckedChange={() => toggleBillingTag(member.id, member.tags)}
                    data-testid={`toggle-billing-${member.id}`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Ticket Migration</CardTitle>
          <CardDescription>
            Create Invoice tickets for existing tickets that are at billing-ready statuses but don't have linked Invoice tickets yet. 
            This ensures the pending invoices list is populated exclusively with Invoice tickets going forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {migrationComplete ? (
            <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">Migration completed successfully.</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">All billing-ready tickets now have linked Invoice tickets.</p>
            </div>
          ) : migrationPreview ? (
            <>
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Preview: {migrationPreview.length} ticket{migrationPreview.length !== 1 ? "s" : ""} will get Invoice tickets created
                </p>
              </div>
              {migrationPreview.length > 0 && (
                <>
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Customer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {migrationPreview.map(t => (
                          <TableRow key={t.ticketId}>
                            <TableCell className="text-sm">{t.title}</TableCell>
                            <TableCell><Badge variant="outline">{t.ticketType}</Badge></TableCell>
                            <TableCell className="text-sm">{t.currentStatus}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{t.customerName}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="sm:hidden space-y-2">
                    {migrationPreview.map(t => (
                      <div key={t.ticketId} className="border rounded-md p-3 space-y-1" data-testid={`card-migration-ticket-${t.ticketId}`}>
                        <p className="text-sm font-medium" data-testid={`text-migration-title-${t.ticketId}`}>{t.title}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{t.ticketType}</Badge>
                          <span className="text-xs text-muted-foreground" data-testid={`text-migration-status-${t.ticketId}`}>{t.currentStatus}</span>
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid={`text-migration-customer-${t.ticketId}`}>{t.customerName}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  onClick={executeMigration} 
                  disabled={migrationRunning || migrationPreview.length === 0}
                  data-testid="button-execute-migration"
                >
                  {migrationRunning ? "Migrating..." : `Create ${migrationPreview.length} Invoice Ticket${migrationPreview.length !== 1 ? "s" : ""}`}
                </Button>
                <Button variant="outline" onClick={() => setMigrationPreview(null)} data-testid="button-cancel-migration">
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={runDryRun} variant="outline" data-testid="button-preview-migration">
              <Eye className="w-4 h-4 mr-2" />
              Preview Migration
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
