import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Edit, Layers, Maximize2, Ruler, Trash2, Upload, X, MapPin } from "lucide-react";
import type { Customer, CustomerMapLayer } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useCustomerScope } from "@/lib/customerScope";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LayerMapViewer from "@/components/LayerMapViewer";
import CustomerLocationEditor from "@/components/CustomerLocationEditor";
import CustomerSchedulingSection from "@/components/CustomerSchedulingSection";
import SiteDetailsCard from "@/components/customer/SiteDetailsCard";

type Category = "base" | "community" | "snow" | "custom";

const LAYER_TYPES: Record<Category, { value: string; label: string; color: string }[]> = {
  base: [{ value: "community_outline", label: "Community Outline", color: "#00FFFF" }],
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
  custom: [],
};

const PRESET_COLORS = [
  { hex: "#FF0000", name: "Red" }, { hex: "#00FF00", name: "Lime" }, { hex: "#FFFF00", name: "Yellow" },
  { hex: "#FF00FF", name: "Magenta" }, { hex: "#00FFFF", name: "Cyan" }, { hex: "#FF6600", name: "Orange" },
  { hex: "#FF69B4", name: "Hot Pink" }, { hex: "#ADFF2F", name: "Green Yellow" }, { hex: "#FFD700", name: "Gold" },
  { hex: "#7FFF00", name: "Chartreuse" }, { hex: "#FF1493", name: "Deep Pink" }, { hex: "#00FF7F", name: "Spring Green" },
  { hex: "#FF4500", name: "Orange Red" }, { hex: "#1E90FF", name: "Dodger Blue" }, { hex: "#FFFFFF", name: "White" },
];

interface Props {
  customer: Customer;
  /** Location + mowing edits: AM1 accessRole admin/office only. */
  canEditLocation: boolean;
  /** Existing map-layer eligibility (unchanged). */
  canEditLayers: boolean;
  /** Site details Edit link (CQ7 editor). */
  canEditCustomer: boolean;
}

export default function PropertyPage({ customer, canEditLocation, canEditLayers, canEditCustomer }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const customerId = customer.id;
  const [locationOpen, setLocationOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fullMap, setFullMap] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<Category>("community");
  const [layerType, setLayerType] = useState("");
  const [customName, setCustomName] = useState("");
  const [color, setColor] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const scope = useCustomerScope();
  const { data: layers = [], isLoading } = useQuery<CustomerMapLayer[]>({
    queryKey: ["/api/customers", customerId, "map-layers", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<CustomerMapLayer[]>(`/api/customers/${customerId}/map-layers`, signal),
  });
  useEffect(() => { setHidden(new Set()); }, [customerId]);
  const shown = useMemo(() => new Set(layers.filter(l => !hidden.has(l.id)).map(l => l.id)), [layers, hidden]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "map-layers"] });
  const resetForm = () => { setCategory("community"); setLayerType(""); setCustomName(""); setColor(""); if (fileRef.current) fileRef.current.value = ""; };
  const createLayer = useMutation({
    mutationFn: (data: { name: string; layerType: string; category: string; kmlPath: string; color: string }) => scope.request("POST", `/api/customers/${customerId}/map-layers`, data),
    onSuccess: () => { invalidate(); toast({ title: t("propertyMaps.layerUploaded") }); setUploadOpen(false); resetForm(); },
    onError: () => toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" }),
  });
  const updateLayer = useMutation({
    mutationFn: ({ layerId, kmlPath }: { layerId: string; kmlPath: string }) => scope.request("PATCH", `/api/customers/${customerId}/map-layers/${layerId}`, { kmlPath }),
    onSuccess: () => { invalidate(); toast({ title: t("propertyMaps.layerUploaded") }); setUploadOpen(false); resetForm(); },
    onError: () => toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" }),
  });
  const deleteLayer = useMutation({
    mutationFn: (layerId: string) => scope.request("DELETE", `/api/customers/${customerId}/map-layers/${layerId}`),
    onSuccess: () => { invalidate(); toast({ title: t("propertyMaps.layerDeleted") }); },
    onError: () => toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" }),
  });

  const usedColors = new Set(layers.map(l => (l.color ?? "").toUpperCase()));
  const presetFor = (v: string) => [...LAYER_TYPES.base, ...LAYER_TYPES.community, ...LAYER_TYPES.snow].find(l => l.value === v);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (category === "custom" ? (!file || !customName.trim() || !color) : (!file || !layerType)) {
      if (category === "custom") toast({ title: t("propertyMaps.provideNameAndColor"), variant: "destructive" });
      return;
    }
    setUploading(true);
    const startedCompany = scope.companyId;
    try {
      const urlRes = await scope.request("POST", `/api/customers/${customerId}/map-layers/upload-url`, {
        fileName: file!.name, contentType: file!.type || "application/vnd.google-earth.kml+xml",
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      scope.assertSameCompany(startedCompany);
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file!.type || "application/vnd.google-earth.kml+xml" } });
      scope.assertSameCompany(startedCompany);
      const existing = category === "custom"
        ? layers.find(l => l.category === "custom" && l.name.toLowerCase() === customName.trim().toLowerCase())
        : layers.find(l => l.layerType === layerType && l.category === category);
      if (existing) await updateLayer.mutateAsync({ layerId: existing.id, kmlPath: objectPath });
      else {
        const preset = presetFor(layerType);
        await createLayer.mutateAsync(category === "custom"
          ? { name: customName.trim(), layerType: "custom", category: "custom", kmlPath: objectPath, color }
          : { name: customName || preset?.label || layerType, layerType, category, kmlPath: objectPath, color: color || preset?.color || "#6b7280" });
      }
    } catch {
      toast({ title: t("propertyMaps.layerCreateFailed"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const lat = customer.locationLat != null ? Number(customer.locationLat) : null;
  const lng = customer.locationLng != null ? Number(customer.locationLng) : null;
  const pin: [number, number] | null = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  const seasonLabel = (c: string) => t(`customerPages.property.season.${c}`, { defaultValue: c });
  const typeLabel = (l: CustomerMapLayer) => l.category === "custom" ? t("propertyMaps.customLayers")
    : LAYER_TYPES[(l.category as Category)]?.find(x => x.value === l.layerType)?.label ?? l.layerType;

  return (
    <div className="space-y-4" data-testid="property-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-base font-semibold">{t("customerPages.property.mapTitle")}</h3>
        <div className="flex gap-2 flex-wrap">
          {layers.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setFullMap(true)} data-testid="button-view-map">
              <Maximize2 className="w-4 h-4 mr-2" />{t("propertyMaps.viewMap")}
            </Button>
          )}
          {canEditLocation && (
            <Button size="sm" variant="outline" onClick={() => setLocationOpen(true)} data-testid="button-property-edit-location">
              <MapPin className="w-4 h-4 mr-2" />{t("customerDetail.editLocation")}
            </Button>
          )}
          {canEditLayers && (
            <Button size="sm" onClick={() => setUploadOpen(true)} data-testid="button-add-map-layer">
              <Upload className="w-4 h-4 mr-2" />{t("propertyMaps.addLayer")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <Card className="overflow-hidden">
            <div className="relative h-[340px]" data-testid="property-map">
              {isLoading ? <Skeleton className="absolute inset-0" />
                : <LayerMapViewer key={customerId} customerId={customerId} contained light pin={pin} shownLayerIds={shown}
                    initialCenter={pin ?? undefined} initialZoom={pin ? 17 : undefined} />}
            </div>
            <p className="px-4 py-2 text-xs text-muted-foreground border-t tabular-nums" data-testid="text-property-coordinates">
              {pin ? `${t("customerDetail.currentCoords")}: ${pin[0].toFixed(6)}, ${pin[1].toFixed(6)}` : t("customerDetail.noLocationSet")}
            </p>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-muted-foreground" />{t("customerPages.property.layers")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? <div className="p-4"><Skeleton className="h-20 w-full" /></div> : layers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-layers">{t("customerPages.property.noLayers")}</p>
              ) : (
                <Table data-testid="table-map-layers">
                  <TableHeader><TableRow>
                    <TableHead>{t("customerPages.property.layer")}</TableHead>
                    <TableHead>{t("customerPages.property.seasonCol")}</TableHead>
                    <TableHead className="w-16 text-center">{t("customerPages.property.show")}</TableHead>
                    <TableHead className="w-12"><span className="sr-only">{t("common.actions")}</span></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {layers.map(l => (
                      <TableRow key={l.id} data-testid={`layer-item-${l.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm border flex-shrink-0" style={{ backgroundColor: l.color || "#6b7280" }} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{l.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{typeLabel(l)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{seasonLabel(l.category)}</TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={shown.has(l.id)} aria-label={t("customerPages.property.show")}
                            onCheckedChange={v => setHidden(prev => { const n = new Set(prev); if (v) n.delete(l.id); else n.add(l.id); return n; })}
                            data-testid={`checkbox-show-layer-${l.id}`} />
                        </TableCell>
                        <TableCell>
                          {canEditLayers && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={t("common.actions")} data-testid={`button-layer-actions-${l.id}`}>
                                  <span aria-hidden="true" className="leading-none">...</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="text-destructive" disabled={deleteLayer.isPending}
                                  onClick={() => deleteLayer.mutate(l.id)} data-testid={`button-delete-layer-${l.id}`}>
                                  <Trash2 className="w-4 h-4 mr-2" />{t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <SiteDetailsCard customer={customer} canEdit={canEditCustomer} />
          <div data-testid="card-mowing-setup">
            <CustomerSchedulingSection customerId={customerId} readOnly={!canEditLocation} />
          </div>
          <Card data-testid="card-property-size">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[13.5px] font-semibold flex items-center gap-2"><Ruler className="h-4 w-4 text-muted-foreground" aria-hidden="true" data-testid="icon-property-size" />{t("customerPages.property.size")}</CardTitle>
              {canEditCustomer && (
                <Link href={`/dashboard/customers/${customerId}/edit#property`} className="text-xs text-primary underline" data-testid="link-edit-size">
                  <Edit className="w-3 h-3 inline mr-1" />{t("common.edit")}
                </Link>
              )}
            </CardHeader>
            <CardContent className="text-sm grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">{t("customerPages.property.acres")}</span>
              <span data-testid="text-property-acres">{customer.acres || "\u2014"}</span>
              <span className="text-muted-foreground">{t("customerPages.property.complexity")}</span>
              <span data-testid="text-property-complexity">{customer.complexityScore || "\u2014"}</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {fullMap && <LayerMapViewer customerId={customerId} fullScreen onClose={() => setFullMap(false)} />}

      {canEditLocation && (
        <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("customerDetail.editLocation")}</DialogTitle>
              <DialogDescription>{t("customerPages.property.editLocationDesc")}</DialogDescription>
            </DialogHeader>
            {locationOpen && <CustomerLocationEditor customer={customer} canEdit autoEdit />}
          </DialogContent>
        </Dialog>
      )}

      {canEditLayers && (
        <Dialog open={uploadOpen} onOpenChange={o => { setUploadOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("propertyMaps.addMapLayer")}</DialogTitle>
              <DialogDescription>{t("propertyMaps.description")}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              <div className="space-y-2">
                <Label>{t("propertyMaps.layerCategory")}</Label>
                <Select value={category} onValueChange={v => { setCategory(v as Category); setLayerType(""); setColor(""); }}>
                  <SelectTrigger data-testid="select-layer-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">{t("propertyMaps.baseLayers")}</SelectItem>
                    <SelectItem value="community">{t("propertyMaps.communitySeason")}</SelectItem>
                    <SelectItem value="snow">{t("propertyMaps.snowSeason")}</SelectItem>
                    <SelectItem value="custom">{t("propertyMaps.customLayers")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {category !== "custom" ? (
                <>
                  <div className="space-y-2">
                    <Label>{t("propertyMaps.layerType")}</Label>
                    <Select value={layerType} onValueChange={v => { setLayerType(v); const p = presetFor(v); if (p) setColor(p.color); }}>
                      <SelectTrigger data-testid="select-layer-type"><SelectValue placeholder={t("propertyMaps.selectLayerType")} /></SelectTrigger>
                      <SelectContent>
                        {LAYER_TYPES[category].map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ backgroundColor: type.color }} />{type.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("propertyMaps.customName")}</Label>
                    <Input data-testid="input-layer-name" value={customName} onChange={e => setCustomName(e.target.value)} placeholder={t("propertyMaps.overrideDefault")} />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>{t("propertyMaps.layerName")} <span className="text-destructive">*</span></Label>
                  <Input data-testid="input-custom-layer-name" value={customName} onChange={e => setCustomName(e.target.value)} placeholder={t("propertyMaps.enterLayerName")} />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("propertyMaps.layerColor")}</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => {
                    const used = usedColors.has(c.hex.toUpperCase());
                    return (
                      <button key={c.hex} type="button" disabled={used} onClick={() => setColor(c.hex)} title={c.name}
                        className={`w-8 h-8 rounded-md border-2 ${color === c.hex ? "border-primary ring-2 ring-primary ring-offset-2" : used ? "opacity-30 cursor-not-allowed" : "border-transparent"}`}
                        style={{ backgroundColor: c.hex }} data-testid={`color-${c.hex.slice(1)}`}>
                        {used && <X className="w-4 h-4 mx-auto text-black/50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("propertyMaps.kmlFile")}</Label>
                <Input ref={fileRef} type="file" accept=".kml,.kmz" data-testid="input-layer-file" onChange={onFile}
                  disabled={uploading || (category === "custom" ? (!customName.trim() || !color) : !layerType)} />
                <p className="text-xs text-muted-foreground">{t("propertyMaps.acceptsKml")}</p>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => { setUploadOpen(false); resetForm(); }}>{t("common.cancel")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
