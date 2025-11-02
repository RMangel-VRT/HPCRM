import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings } from "@shared/schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const companySchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
});

const benchmarksSchema = z.object({
  smallPad: z.number().min(0),
  hoaStandard: z.number().min(0),
  hoaComplex: z.number().min(0),
});

export default function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("company");
  const [mowingMonths, setMowingMonths] = useState<string[]>([]);
  const [cleanupMonths, setCleanupMonths] = useState<string[]>([]);
  const [featureFlags, setFeatureFlags] = useState({
    tickets_v2: false,
    forecast_v2: false,
    qbo_write: false,
  });

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
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
        <TabsList>
          <TabsTrigger value="company" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="seasons" data-testid="tab-seasons">Seasons</TabsTrigger>
          <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">Feature Flags</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
