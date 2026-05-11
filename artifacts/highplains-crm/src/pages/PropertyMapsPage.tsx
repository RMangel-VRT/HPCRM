import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import type { Customer, CustomerMapLayer } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Layers, ChevronLeft, Upload, Trash2, X, Map, Pencil } from "lucide-react";
import LayerMapViewer from "@/components/LayerMapViewer";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CustomerWithLayers extends Customer {
  layerCount?: number;
}

const LAYER_TYPES = {
  base: [
    { value: "community_outline", label: "Community Outline", color: "#00FFFF" },
  ],
  community: [
    { value: "mowing", label: "Mowing Zones", color: "#00FF00" },
    { value: "native_grass", label: "Native Grass Areas", color: "#ADFF2F" },
    { value: "landscape_beds", label: "Landscape Beds", color: "#FF6600" },
    { value: "pet_stations", label: "Pet Stations", color: "#FF00FF" },
  ],
  snow: [
    { value: "atv_route", label: "ATV Routes", color: "#FFD700" },
    { value: "truck_plow", label: "Truck Plow", color: "#FFFF00" },
    { value: "hand_shovel", label: "Hand Shovel", color: "#FF69B4" },
    { value: "ice_melt", label: "Ice Melt", color: "#FF0000" },
    { value: "ice_melt_buckets", label: "Ice Melt Buckets", color: "#00CED1" },
  ],
  custom: [] as { value: string; label: string; color: string }[],
};

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

function CustomerMapManager({ customerId, customerName, onClose }: { customerId: string; customerName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"view" | "edit">("view");
  
  // Only mapping users get the special tabbed interface
  const isMappingUser = user?.activeRole === "mapping";
  // canEdit controls whether edit actions (delete, upload) are shown within the interface
  // Both admin and mapping can edit when they have access to the edit interface
  const canEdit = user?.activeRole === "admin" || user?.activeRole === "mapping";
  const [uploadingLayer, setUploadingLayer] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"base" | "community" | "snow" | "custom">("community");
  const [selectedLayerType, setSelectedLayerType] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      toast({ title: "Layer updated successfully" });
      setShowUploadDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update layer", variant: "destructive" });
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

  const usedColors = new Set(mapLayers.map((l) => l.color.toUpperCase()));
  const availableColors = PRESET_COLORS.filter((c) => !usedColors.has(c.hex.toUpperCase()));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
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
      const urlRes = await apiRequest("POST", `/api/customers/${customerId}/map-layers/upload-url`, {
        fileName: file.name,
        contentType: file.type || "application/vnd.google-earth.kml+xml",
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/vnd.google-earth.kml+xml" },
      });

      if (selectedCategory === "custom") {
        const existingCustomLayer = mapLayers.find(
          (l) => l.category === "custom" && l.name.toLowerCase() === customName.trim().toLowerCase()
        );
        
        if (existingCustomLayer) {
          await updateLayerMutation.mutateAsync({
            layerId: existingCustomLayer.id,
            data: { kmlPath: objectPath },
          });
        } else {
          await createLayerMutation.mutateAsync({
            name: customName.trim(),
            layerType: "custom",
            category: "custom",
            kmlPath: objectPath,
            color: selectedColor,
          });
        }
      } else {
        const layerConfig = [...LAYER_TYPES.base, ...LAYER_TYPES.community, ...LAYER_TYPES.snow].find(
          (l) => l.value === selectedLayerType
        );

        const existingLayer = mapLayers.find(
          (l) => l.layerType === selectedLayerType && l.category === selectedCategory
        );

        if (existingLayer) {
          await updateLayerMutation.mutateAsync({
            layerId: existingLayer.id,
            data: { kmlPath: objectPath },
          });
        } else {
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
      toast({ title: "Failed to upload file", variant: "destructive" });
    } finally {
      setUploadingLayer(false);
    }
  };

  const baseLayers = mapLayers.filter((l) => l.category === "base");
  const communityLayers = mapLayers.filter((l) => l.category === "community");
  const snowLayers = mapLayers.filter((l) => l.category === "snow");
  const customLayers = mapLayers.filter((l) => l.category === "custom");

  const renderLayerList = (layers: CustomerMapLayer[], emptyMessage: string, typeConfig: { value: string; label: string; color: string }[]) => (
    layers.length === 0 ? (
      <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
    ) : (
      <div className="space-y-2">
        {layers.map((layer) => (
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
                  {typeConfig.find((t) => t.value === layer.layerType)?.label || layer.layerType}
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
    )
  );

  // For non-mapping users, show full-screen map view only (no tabs, no edit)
  if (!isMappingUser) {
    return (
      <div className="fixed inset-0 z-40 bg-background">
        <LayerMapViewer
          customerId={customerId}
          fullScreen={true}
          onClose={onClose}
        />
      </div>
    );
  }

  // For mapping users only, show the tabbed interface with view and edit capabilities
  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b gap-2">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            data-testid="button-back-to-list"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-customer-name">{customerName}</h1>
            <p className="text-sm text-muted-foreground">{t("propertyMaps.title")}</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "view" | "edit")} className="flex-1 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-12">
            <TabsTrigger value="view" className="gap-2" data-testid="tab-view-map">
              <Map className="w-4 h-4" />
              {t("propertyMaps.viewMap")}
            </TabsTrigger>
            {canEdit && (
              <TabsTrigger value="edit" className="gap-2" data-testid="tab-edit-layers">
                <Pencil className="w-4 h-4" />
                {t("propertyMaps.editLayers")}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="view" className="flex-1 m-0 relative h-[60vh] min-h-[420px] sm:h-[70vh]">
          <LayerMapViewer
            customerId={customerId}
            fullScreen={false}
            isVisible={activeTab === "view"}
          />
        </TabsContent>

        {canEdit && (
          <TabsContent value="edit" className="flex-1 m-0 overflow-auto p-4">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-semibold">Property Maps & Layers</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("propertyMaps.description")}
                  </p>
                </div>
                <Button
                  data-testid="button-add-map-layer"
                  onClick={() => setShowUploadDialog(true)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t("propertyMaps.addLayer")}
                </Button>
              </div>

            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      {t("propertyMaps.baseLayers")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderLayerList(baseLayers, t("propertyMaps.noBaseLayers"), LAYER_TYPES.base)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      {t("propertyMaps.communitySeason")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderLayerList(communityLayers, t("propertyMaps.noCommunityLayers"), LAYER_TYPES.community)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      {t("propertyMaps.snowSeason")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderLayerList(snowLayers, t("propertyMaps.noSnowLayers"), LAYER_TYPES.snow)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      {t("propertyMaps.customLayers")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {customLayers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t("propertyMaps.noCustomLayers")}</p>
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
                                <p className="text-xs text-muted-foreground">Custom Layer</p>
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
              </>
            )}
            </div>
          </TabsContent>
        )}
      </Tabs>


      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("propertyMaps.addMapLayer")}</DialogTitle>
            <DialogDescription>
              Upload a KML file to define a service zone or route
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
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
          <DialogFooter className="pt-4">
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

export default function PropertyMapsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithLayers | null>(null);
  const searchString = useSearch();
  const autoSelectDone = useRef(false);

  const { data: customersResp, isLoading } = useQuery<{ customers: CustomerWithLayers[]; total: number }>({
    queryKey: ["/api/customers"],
  });
  const customers = customersResp?.customers ?? [];

  useEffect(() => {
    if (autoSelectDone.current || isLoading || customers.length === 0) return;
    const params = new URLSearchParams(searchString);
    const customerId = params.get("customerId");
    if (!customerId) return;
    const match = customers.find((c) => c.id === customerId);
    if (match) {
      setSelectedCustomer(match);
      autoSelectDone.current = true;
    }
  }, [customers, isLoading, searchString]);

  const getFullAddress = (c: CustomerWithLayers) => 
    `${c.street}, ${c.city}, ${c.state} ${c.zip}`;

  const filteredCustomers = customers
    .filter((customer) => {
      if (customer.active !== "true") return false;
      const searchLower = searchTerm.toLowerCase();
      return customer.name.toLowerCase().includes(searchLower) ||
        customer.street.toLowerCase().includes(searchLower) ||
        customer.city.toLowerCase().includes(searchLower);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (selectedCustomer) {
    return (
      <CustomerMapManager
        customerId={selectedCustomer.id}
        customerName={selectedCustomer.name}
        onClose={() => setSelectedCustomer(null)}
      />
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Property Maps</h1>
        <p className="text-sm text-muted-foreground">
          View and manage service zones and routes for customer properties
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-property"
          placeholder="Search by customer name or address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              {searchTerm ? "No properties match your search" : "No customers found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCustomers.map((customer) => (
            <Card
              key={customer.id}
              className="hover-elevate cursor-pointer"
              data-testid={`card-customer-map-${customer.id}`}
              onClick={() => setSelectedCustomer(customer)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" data-testid={`text-customer-name-${customer.id}`}>
                        {customer.name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {getFullAddress(customer)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      <span>Layers</span>
                    </Badge>
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
