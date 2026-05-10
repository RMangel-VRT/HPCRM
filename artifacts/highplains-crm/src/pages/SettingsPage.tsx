import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
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
import { Building2, User, Plus, Pencil, Trash2, X, Phone, Mail, Copy, FileText, Eye, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings, PropertyManagementCompany, PropertyManager, PropertyManagerEmail, PropertyManagerPhone, PropertyManagerWithContacts } from "@shared/schema";
import ServicePlanTemplatesAdmin from "@/components/ServicePlanTemplatesAdmin";
import ChemicalProductsAdmin from "@/components/ChemicalProductsAdmin";

interface ManagerEmailInput {
  email: string;
  isPrimary: "true" | "false";
}

interface ManagerPhoneInput {
  phone: string;
  phoneType: "personal" | "company";
  isPrimary: "true" | "false";
}

const MONTHS_WITH_KEYS = [
  { value: "Jan", key: "months.jan" }, { value: "Feb", key: "months.feb" }, { value: "Mar", key: "months.mar" },
  { value: "Apr", key: "months.apr" }, { value: "May", key: "months.may" }, { value: "Jun", key: "months.jun" },
  { value: "Jul", key: "months.jul" }, { value: "Aug", key: "months.aug" }, { value: "Sep", key: "months.sep" },
  { value: "Oct", key: "months.oct" }, { value: "Nov", key: "months.nov" }, { value: "Dec", key: "months.dec" },
];

const companySchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  pesticideLicenseNumber: z.string().optional(),
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [location, navigate] = useLocation();
  
  // Check if user is admin (can see all tabs) vs office (can only see Property Management)
  const isAdmin = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;
  const validTabs = [
    'company', 'seasons', 'benchmarks', 'property-management', 'features',
    'email-templates', 'billing', 'service-plans', 'chemical-products', 'notification-templates',
  ];
  const getDefaultTab = () => {
    const pathSegments = location.split('?')[0].split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && validTabs.includes(lastSegment)) return lastSegment;
    return isAdmin ? "company" : "property-management";
  };
  const [activeTab, setActiveTab] = useState(getDefaultTab);
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(`/dashboard/settings/${tab}`, { replace: true });
  };

  useSetBreadcrumbs([
    { label: t("settings.title") },
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

  const { data: companyData } = useQuery<{ pesticideLicenseNumber: string | null }>({
    queryKey: ["/api/company"],
    enabled: isAdmin === true,
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

  const { data: chemicalTemplates = [] } = useQuery<{ preVisitHtml: string; postVisitHtml: string }[]>({
    queryKey: ["/api/chemical-notification-templates"],
    enabled: isAdmin === true,
  });

  const anyChemTemplateMissingLicense = isAdmin &&
    !companyData?.pesticideLicenseNumber?.trim() &&
    chemicalTemplates.some(tpl =>
      /\{\{#if\s+pesticideLicenseNumber\}\}/.test(tpl.preVisitHtml) ||
      /\{\{#if\s+pesticideLicenseNumber\}\}/.test(tpl.postVisitHtml)
    );

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
      toast({ title: t("settings.templateUpdated") });
    },
    onError: () => {
      toast({ title: t("settings.templateFailed"), variant: "destructive" });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      return await apiRequest("PATCH", `/api/email-rules/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-rules"] });
      toast({ title: t("settings.ruleUpdated") });
    },
    onError: () => {
      toast({ title: t("settings.ruleFailed"), variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<Settings>) => {
      return await apiRequest("PATCH", "/api/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: t("settings.saved"),
        description: t("settings.savedMsg"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("settings.saveFailed"),
        variant: "destructive",
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (updates: { pesticideLicenseNumber?: string | null }) => {
      return await apiRequest("PATCH", "/api/company", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("settings.saveFailed"),
        variant: "destructive",
      });
    },
  });

  const companyForm = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      companyName: "",
      pesticideLicenseNumber: "",
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
      toast({ title: t("common.success"), description: t("settings.pmCompanyCreated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.pmCompanyCreateFailed"), variant: "destructive" });
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
      toast({ title: t("common.success"), description: t("settings.pmCompanyUpdated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.pmCompanyUpdateFailed"), variant: "destructive" });
    },
  });
  
  const deletePmCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/property-management-companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-management-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      toast({ title: t("common.delete"), description: t("settings.pmCompanyUpdated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.pmCompanyDeleteFailed"), variant: "destructive" });
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
      toast({ title: t("common.success"), description: t("settings.pmCompanyCreated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.pmManagerCreateFailed"), variant: "destructive" });
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
      toast({ title: t("common.success"), description: t("settings.pmManagerUpdated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.pmManagerUpdateFailed"), variant: "destructive" });
    },
  });
  
  const deletePmManagerMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/property-managers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/property-managers"] });
      toast({ title: t("common.delete"), description: t("settings.pmManagerUpdated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.pmManagerDeleteFailed"), variant: "destructive" });
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

  // Initialize form values when settings or company data load
  useEffect(() => {
    if (settings && !isLoading) {
      companyForm.reset({
        companyName: settings.companyName,
        pesticideLicenseNumber: companyData?.pesticideLicenseNumber ?? "",
      });

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
  }, [settings, isLoading, companyData]);

  const handleCompanySubmit = companyForm.handleSubmit((data) => {
    updateSettingsMutation.mutate({ companyName: data.companyName });
    updateCompanyMutation.mutate({ pesticideLicenseNumber: data.pesticideLicenseNumber || null });
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
          <h1 className="text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
          {t("settings.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.manage")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          {isAdmin && (
            <>
              <TabsTrigger value="company" data-testid="tab-company">{t("settings.tabs.company")}</TabsTrigger>
              <TabsTrigger value="seasons" data-testid="tab-seasons">{t("settings.tabs.seasons")}</TabsTrigger>
              <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">{t("settings.tabs.benchmarks")}</TabsTrigger>
            </>
          )}
          {canAccessPropertyManagement && (
            <TabsTrigger value="property-management" data-testid="tab-property-management">{t("settings.tabs.propertyMgmt")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="features" data-testid="tab-features">{t("settings.tabs.featureFlags")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="email-templates" data-testid="tab-email-templates">{t("settings.tabs.emailTemplates")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="billing" data-testid="tab-billing">{t("settings.tabs.billing")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="service-plans" data-testid="tab-service-plans">Service Plans</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="shared-mailboxes" data-testid="tab-shared-mailboxes">{t("nav.sharedMailboxes")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="chemical-products" data-testid="tab-chemical-products">{t("chemicalProducts.title")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="notification-templates" data-testid="tab-notification-templates">Notification Templates</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.companyInfo")}</CardTitle>
              <CardDescription>
                {t("settings.companyInfoDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleCompanySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">{t("settings.companyName")}</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="pesticideLicenseNumber">Pesticide Applicator License #</Label>
                  <Input
                    id="pesticideLicenseNumber"
                    {...companyForm.register("pesticideLicenseNumber")}
                    placeholder="e.g. 28374"
                    data-testid="input-pesticide-license-number"
                  />
                  {anyChemTemplateMissingLicense && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="warning-settings-pesticide-license">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>
                        One or more chemical notification templates include a pesticide license footer. Fill in this field so the license number appears in compliance emails.
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending || updateCompanyMutation.isPending}
                    data-testid="button-save-company"
                  >
                    {(updateSettingsMutation.isPending || updateCompanyMutation.isPending) ? t("common.saving") : t("settings.saveChanges")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seasons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.serviceSeasons")}</CardTitle>
              <CardDescription>
                {t("settings.seasonDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base">{t("settings.mowingSeason")}</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("settings.clickToToggle")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {MONTHS_WITH_KEYS.map((month) => (
                    <Badge
                      key={month.value}
                      onClick={() => toggleMonth(month.value, "mowing")}
                      className={
                        mowingMonths.includes(month.value)
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 cursor-pointer hover-elevate active-elevate-2"
                          : "bg-muted text-muted-foreground cursor-pointer hover-elevate active-elevate-2"
                      }
                      data-testid={`badge-mowing-${month.value.toLowerCase()}`}
                    >
                      {t(month.key)}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-base">{t("settings.cleanupSeason")}</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("settings.clickToToggle")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {MONTHS_WITH_KEYS.map((month) => (
                    <Badge
                      key={month.value}
                      onClick={() => toggleMonth(month.value, "cleanup")}
                      className={
                        cleanupMonths.includes(month.value)
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 cursor-pointer hover-elevate active-elevate-2"
                          : "bg-muted text-muted-foreground cursor-pointer hover-elevate active-elevate-2"
                      }
                      data-testid={`badge-cleanup-${month.value.toLowerCase()}`}
                    >
                      {t(month.key)}
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
                  {updateSettingsMutation.isPending ? t("common.saving") : t("settings.saveChanges")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.tabs.benchmarks")}</CardTitle>
              <CardDescription>
                {t("settings.companyInfoDesc")}
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
                    {updateSettingsMutation.isPending ? t("common.saving") : t("settings.saveChanges")}
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
                  {t("settings.tabs.propertyMgmt")}
                </CardTitle>
                <CardDescription>
                  {t("settings.manage")}
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenPmCompanyDialog()} data-testid="button-add-pm-company" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                {t("common.add")}
              </Button>
            </CardHeader>
            <CardContent>
              {pmCompanies.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{t("common.noResults")}</p>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("common.name")}</TableHead>
                          <TableHead>{t("common.phone")}</TableHead>
                          <TableHead>{t("common.email")}</TableHead>
                          <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                  {t("settings.tabs.propertyMgmt")}
                </CardTitle>
                <CardDescription>
                  {t("settings.manage")}
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
                          title: t("common.success"),
                          description: `${allEmails.length} email${allEmails.length > 1 ? 's' : ''}`,
                        });
                      }
                    }}
                    data-testid="button-copy-all-pm-emails"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {t("common.email")}
                  </Button>
                )}
                <Button onClick={() => handleOpenPmManagerDialog()} data-testid="button-add-pm-manager" className="flex-1 sm:flex-initial">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("common.add")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pmManagers.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{t("common.noResults")}</p>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("common.name")}</TableHead>
                          <TableHead>{t("settings.tabs.company")}</TableHead>
                          <TableHead>{t("common.phone")}</TableHead>
                          <TableHead>{t("common.email")}</TableHead>
                          <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                                          title: t("common.success"),
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
                                  toast({ title: t("common.success") });
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
              <CardTitle>{t("settings.tabs.featureFlags")}</CardTitle>
              <CardDescription>
                {t("settings.manage")}
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
                  {updateSettingsMutation.isPending ? t("common.saving") : t("settings.saveChanges")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email-templates" className="space-y-6">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300" data-testid="banner-chem-templates-moved">
            These are system notification templates for non-chemical events (welcome emails, ticket alerts, work completion). Chemical campaign templates are managed under{" "}
            <Link href="/dashboard/settings/notification-templates" className="underline font-medium">Settings → Notification Templates</Link>.
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.tabs.emailTemplates")}</CardTitle>
              <CardDescription>
                Manage email templates used for notifications. Available variables: {"{{ticketTitle}}"}, {"{{customerName}}"}, {"{{companyName}}"}, {"{{completionDate}}"}, {"{{ticketDescription}}"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("common.noResults")}</p>
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
                            {template.isActive ? t("statuses.active") : t("statuses.inactive")}
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
                            {t("common.edit")}
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
              <CardTitle>{t("settings.tabs.emailTemplates")}</CardTitle>
              <CardDescription>
                {t("settings.manage")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {emailRules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("common.noResults")}</p>
              ) : (
                <div className="space-y-3">
                  {emailRules.map((rule: any) => {
                    const linkedTemplate = emailTemplates.find((tmpl: any) => tmpl.id === rule.templateId);
                    return (
                      <div key={rule.id} className="flex items-center justify-between gap-2 flex-wrap p-3 border rounded-md">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{rule.eventKey.replace(/\./g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                          <p className="text-xs text-muted-foreground">
                            {linkedTemplate?.name || t("common.unknown")}
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

        <TabsContent value="service-plans" className="space-y-6">
          <ServicePlanTemplatesAdmin />
        </TabsContent>

        <TabsContent value="chemical-products" className="space-y-6">
          <ChemicalProductsAdmin />
        </TabsContent>

        <TabsContent value="notification-templates" className="space-y-6" data-testid="content-notification-templates">
          <Card>
            <CardHeader>
              <CardTitle>Chemical Notification Templates</CardTitle>
              <CardDescription>
                Pre-visit and post-visit emails sent for chemical campaigns. Templates include per-template product details
                (product name, active ingredient, EPA reg #, re-entry interval, watering / mowing instructions, post-application
                expectation) that are merged into rendered emails as defaults.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/dashboard/settings/notification-templates"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
                data-testid="link-open-notification-templates"
              >
                Open Notification Templates
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Edit Email Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("common.edit")} {t("settings.tabs.emailTemplates")}</DialogTitle>
            <DialogDescription>
              Modify the subject and body of this template. Use {"{{variableName}}"} for dynamic content.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <div className="space-y-2">
              <Label>{t("schedule.templateName")}</Label>
              <p className="text-sm text-muted-foreground">{editingTemplate?.name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-subject">{t("common.title")}</Label>
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
                <Label>{t("common.preview")}</Label>
              </div>
              <iframe
                className="border rounded-md w-full bg-white"
                style={{ height: "200px" }}
                sandbox=""
                srcDoc={templateHtmlBody
                  .replace(/\{\{ticketTitle\}\}/g, "Sample Ticket Title")
                  .replace(/\{\{customerName\}\}/g, "Sample Customer")
                  .replace(/\{\{companyName\}\}/g, "High Plains Property Maintenance")
                  .replace(/\{\{completionDate\}\}/g, new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))
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
              <Label>{t("common.active")}</Label>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>{t("common.cancel")}</Button>
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
              {updateTemplateMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Property Management Company Dialog */}
      <Dialog open={pmCompanyDialogOpen} onOpenChange={setPmCompanyDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingPmCompany ? t("common.edit") : t("common.add")}</DialogTitle>
            <DialogDescription>
              {editingPmCompany ? t("settings.manage") : t("settings.manage")}
            </DialogDescription>
          </DialogHeader>
          <Form {...pmCompanyForm}>
            <form onSubmit={handlePmCompanySubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              <FormField
                control={pmCompanyForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.companyName")}</FormLabel>
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
                      <FormLabel>{t("common.phone")}</FormLabel>
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
                      <FormLabel>{t("common.email")}</FormLabel>
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
                    <FormLabel>{t("common.address")}</FormLabel>
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
                      <FormLabel>{t("customers.city")}</FormLabel>
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
                      <FormLabel>{t("customers.state")}</FormLabel>
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
                      <FormLabel>{t("customers.zipCode")}</FormLabel>
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
                    <FormLabel>{t("common.notes")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-company-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPmCompanyDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={createPmCompanyMutation.isPending || updatePmCompanyMutation.isPending} data-testid="button-save-pm-company">
                  {createPmCompanyMutation.isPending || updatePmCompanyMutation.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Property Manager Dialog */}
      <Dialog open={pmManagerDialogOpen} onOpenChange={setPmManagerDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingPmManager ? t("common.edit") : t("common.add")}</DialogTitle>
            <DialogDescription>
              {editingPmManager ? t("settings.manage") : t("settings.manage")}
            </DialogDescription>
          </DialogHeader>
          <Form {...pmManagerForm}>
            <form onSubmit={handlePmManagerSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              <FormField
                control={pmManagerForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")} *</FormLabel>
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
                    <FormLabel>{t("settings.tabs.propertyMgmt")}</FormLabel>
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-pm-manager-company">
                          <SelectValue placeholder={t("common.select")} />
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
                  <Label className="text-sm font-medium flex items-center gap-1"><Mail className="h-4 w-4" /> {t("common.email")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setManagerEmails([...managerEmails, { email: "", isPrimary: "false" }])}
                    data-testid="button-add-manager-email"
                  >
                    <Plus className="h-4 w-4 mr-1" /> {t("common.add")}
                  </Button>
                </div>
                {managerEmails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
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
                  <Label className="text-sm font-medium flex items-center gap-1"><Phone className="h-4 w-4" /> {t("common.phone")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setManagerPhones([...managerPhones, { phone: "", phoneType: "company", isPrimary: "false" }])}
                    data-testid="button-add-manager-phone"
                  >
                    <Plus className="h-4 w-4 mr-1" /> {t("common.add")}
                  </Button>
                </div>
                {managerPhones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
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
                    <FormLabel>{t("common.notes")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-pm-manager-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPmManagerDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={createPmManagerMutation.isPending || updatePmManagerMutation.isPending} data-testid="button-save-pm-manager">
                  {createPmManagerMutation.isPending || updatePmManagerMutation.isPending ? t("common.saving") : t("common.save")}
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
  const { t } = useTranslation();
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
      ? tags.filter(tag => tag !== "billing")
      : [...tags, "billing"];
    
    try {
      await apiRequest("PATCH", `/api/company-users/${companyUserId}/tags`, { tags: newTags });
      queryClient.invalidateQueries({ queryKey: ["/api/company-users"] });
      toast({ title: t("common.success") });
    } catch (err) {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const runDryRun = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/migrate-invoices", { dryRun: true });
      const data = await res.json();
      setMigrationPreview(data.tickets);
      setMigrationComplete(false);
    } catch (err) {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const executeMigration = async () => {
    setMigrationRunning(true);
    try {
      const res = await apiRequest("POST", "/api/admin/migrate-invoices", { dryRun: false });
      const data = await res.json();
      toast({ title: t("common.success") });
      setMigrationComplete(true);
      setMigrationPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pending-invoices"] });
    } catch (err) {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setMigrationRunning(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.tabs.billing")}</CardTitle>
          <CardDescription>
            {t("settings.manage")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
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
          <CardTitle>{t("settings.tabs.billing")}</CardTitle>
          <CardDescription>
            {t("settings.manage")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {migrationComplete ? (
            <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{t("common.success")}</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">{t("statuses.completed")}</p>
            </div>
          ) : migrationPreview ? (
            <>
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {t("common.preview")}: {migrationPreview.length}
                </p>
              </div>
              {migrationPreview.length > 0 && (
                <>
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("common.title")}</TableHead>
                          <TableHead>{t("common.type")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                          <TableHead>{t("common.customer")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {migrationPreview.map(item => (
                          <TableRow key={item.ticketId}>
                            <TableCell className="text-sm">{item.title}</TableCell>
                            <TableCell><Badge variant="outline">{item.ticketType}</Badge></TableCell>
                            <TableCell className="text-sm">{item.currentStatus}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.customerName}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="sm:hidden space-y-2">
                    {migrationPreview.map(item => (
                      <div key={item.ticketId} className="border rounded-md p-3 space-y-1" data-testid={`card-migration-ticket-${item.ticketId}`}>
                        <p className="text-sm font-medium" data-testid={`text-migration-title-${item.ticketId}`}>{item.title}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{item.ticketType}</Badge>
                          <span className="text-xs text-muted-foreground" data-testid={`text-migration-status-${item.ticketId}`}>{item.currentStatus}</span>
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid={`text-migration-customer-${item.ticketId}`}>{item.customerName}</p>
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
                  {migrationRunning ? t("common.loading") : t("common.confirm")}
                </Button>
                <Button variant="outline" onClick={() => setMigrationPreview(null)} data-testid="button-cancel-migration">
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={runDryRun} variant="outline" data-testid="button-preview-migration">
              <Eye className="w-4 h-4 mr-2" />
              {t("common.preview")}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
