import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Plus, ChevronDown, Check, ArrowLeft, FolderOpen } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlantPalette } from "@shared/schema";
import { format } from "date-fns";

type PaletteWithCustomer = PlantPalette & { customerName?: string | null };

type TabValue = "all" | "templates" | "customer";

export default function PlantPalettes() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabValue>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isTemplate, setIsTemplate] = useState(false);
  const [title, setTitle] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");

  const queryKey = tab === "templates"
    ? ["/api/plant-palettes", "templates"]
    : tab === "customer"
    ? ["/api/plant-palettes", "customer"]
    : ["/api/plant-palettes"];

  const { data: palettes, isLoading } = useQuery<PaletteWithCustomer[]>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab === "templates") params.set("templates", "true");
      const qs = params.toString();
      return apiRequest("GET", `/api/plant-palettes${qs ? `?${qs}` : ""}`).then((r) => r.json());
    },
  });

  const { data: customersResp } = useQuery<{ customers: { id: string; name: string }[]; total: number }>({
    queryKey: ["/api/customers"],
  });
  const customers = customersResp?.customers ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/plant-palettes", {
        title: title.trim() || t("plantPalette.title"),
        isTemplate,
        customerId: isTemplate ? null : (selectedCustomerId || null),
      });
      return res.json();
    },
    onSuccess: (palette: PlantPalette) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-palettes"] });
      setDialogOpen(false);
      resetForm();
      navigate(`/dashboard/tools/plant-palette/${palette.id}`);
    },
    onError: () => {
      toast({ title: t("plantPalette.createFailed"), variant: "destructive" });
    },
  });

  function resetForm() {
    setTitle("");
    setIsTemplate(false);
    setSelectedCustomerId("");
    setSelectedCustomerName("");
  }

  const filteredPalettes = palettes
    ? tab === "customer"
      ? palettes.filter((p) => !p.isTemplate && p.customerId)
      : palettes
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/tools">
          <Button variant="ghost" size="icon" data-testid="button-back-tools">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("plantPalette.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("plantPalette.description")}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-palette">
          <Plus className="w-4 h-4 mr-2" /> {t("plantPalette.newPalette")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">{t("plantPalette.templates")}</TabsTrigger>
          <TabsTrigger value="customer" data-testid="tab-customer">{t("plantPalette.customerPalettes")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !filteredPalettes.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Layers className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">{t("plantPalette.noPalettes")}</p>
            <p className="text-sm text-muted-foreground mb-4">{t("plantPalette.createFirst")}</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-new-empty-state">
              <Plus className="w-4 h-4 mr-2" /> {t("plantPalette.newPalette")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredPalettes.map((palette) => (
            <Card key={palette.id} className="hover-elevate" data-testid={`card-palette-${palette.id}`}>
              <CardContent className="py-3 px-4 flex items-center gap-4">
                <Layers className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" data-testid={`text-palette-title-${palette.id}`}>
                    {palette.title}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid={`text-palette-customer-${palette.id}`}>
                    {palette.isTemplate ? t("plantPalette.templates") : (palette.customerName ?? "—")}
                  </p>
                </div>
                {palette.paletteDate && (
                  <span className="text-sm text-muted-foreground shrink-0" data-testid={`text-palette-date-${palette.id}`}>
                    {palette.paletteDate}
                  </span>
                )}
                <Badge variant={palette.isTemplate ? "outline" : "secondary"} data-testid={`badge-palette-type-${palette.id}`}>
                  {palette.isTemplate ? t("plantPalette.templates") : t(`plantPalette.${palette.status}`)}
                </Badge>
                <Link href={`/dashboard/tools/plant-palette/${palette.id}`}>
                  <Button size="sm" variant="outline" data-testid={`button-open-palette-${palette.id}`}>
                    <FolderOpen className="w-4 h-4 mr-1" /> {t("tools.openTool")}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent data-testid="dialog-new-palette">
          <DialogHeader>
            <DialogTitle>{t("plantPalette.newPalette")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Label htmlFor="palette-title">{t("plantPalette.paletteTitle")}</Label>
              <Input
                id="palette-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Spring Planting Palette"
                data-testid="input-palette-title"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is-template"
                checked={isTemplate}
                onChange={(e) => { setIsTemplate(e.target.checked); if (e.target.checked) { setSelectedCustomerId(""); setSelectedCustomerName(""); } }}
                className="rounded border border-border"
                data-testid="checkbox-is-template"
              />
              <div>
                <Label htmlFor="is-template" className="cursor-pointer">{t("plantPalette.isTemplate")}</Label>
                <p className="text-xs text-muted-foreground">{t("plantPalette.isTemplateDesc")}</p>
              </div>
            </div>

            {!isTemplate && (
              <div className="space-y-2">
                <Label>{t("plantPalette.customer")}</Label>
                <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      data-testid="button-select-customer"
                    >
                      {selectedCustomerName || t("plantPalette.selectCustomer")}
                      <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search customers..." data-testid="input-customer-search" />
                      <CommandList>
                        <CommandEmpty>No customers found</CommandEmpty>
                        <CommandGroup>
                          {customers.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setSelectedCustomerId(c.id);
                                setSelectedCustomerName(c.name);
                                setCustomerOpen(false);
                              }}
                              data-testid={`option-customer-${c.id}`}
                            >
                              <Check className={`w-4 h-4 mr-2 ${selectedCustomerId === c.id ? "opacity-100" : "opacity-0"}`} />
                              {c.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-new-palette">
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-palette">
                {createMutation.isPending ? t("common.creating") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
