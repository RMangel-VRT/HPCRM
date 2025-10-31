import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("company");
  const [featureFlags, setFeatureFlags] = useState({
    tickets_v2: false,
    forecast_v2: false,
    qbo_write: false,
  });

  const handleFeatureFlagToggle = (flag: keyof typeof featureFlags) => {
    setFeatureFlags((prev) => ({ ...prev, [flag]: !prev[flag] }));
    console.log(`Feature flag ${flag} toggled to ${!featureFlags[flag]}`);
  };

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
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  defaultValue="GreenScape Landscaping"
                  data-testid="input-company-name"
                />
              </div>
              <div className="flex justify-end">
                <Button data-testid="button-save-company">Save Changes</Button>
              </div>
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
                  Months when mowing services are typically provided
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((month) => (
                    <Badge key={month} className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {month}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-base">Cleanup Season</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Months for spring and fall cleanup services
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Mar", "Nov"].map((month) => (
                    <Badge key={month} className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                      {month}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-base">Blowout Season</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Months for irrigation system winterization
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Oct"].map((month) => (
                    <Badge key={month} className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {month}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button data-testid="button-save-seasons">Save Changes</Button>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smallPad">Small Pad</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="smallPad"
                      type="number"
                      defaultValue="50"
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
                      defaultValue="45"
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
                      defaultValue="55"
                      className="pl-7"
                      data-testid="input-hoa-complex"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button data-testid="button-save-benchmarks">Save Changes</Button>
              </div>
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
                <Button data-testid="button-save-features">Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
