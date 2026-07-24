import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Link2, Link2Off, AlertTriangle, CheckCircle2, Search, UserPlus, ShieldCheck, PlusCircle } from "lucide-react";
import type { QboCacheRow, QboMappingRow, QboPullResult, QboConnectionStatus, QboCustomerCache, QboDuplicateCandidate, QboDuplicateCheckResult } from "@shared/schema";
import { cn } from "@/lib/utils";

const INVALIDATE_KEYS = [
  ["/api/qbo/customers/cache"],
  ["/api/qbo/customers/mapping"],
  ["/api/qbo/customers/unbound-count"],
];

function invalidateAll() {
  for (const key of INVALIDATE_KEYS) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

// ── State chip for Full Customer List ─────────────────────────────────────────
function StateChip({ state }: { state: QboCacheRow["state"] }) {
  const { t } = useTranslation();
  if (state === "in_crm") {
    return <Badge className="bg-green-100 text-green-800 border-green-200">{t("qboMapping.stateInCrm")}</Badge>;
  }
  if (state === "inactive") {
    return <Badge variant="secondary">{t("qboMapping.stateInactive")}</Badge>;
  }
  return <Badge variant="outline">{t("qboMapping.stateNotInCrm")}</Badge>;
}

// ── Confidence indicator ───────────────────────────────────────────────────────
function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(score, 1) * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ── Promote to CRM dialog ──────────────────────────────────────────────────────
function PromoteDialog({
  open,
  cacheRow,
  onClose,
}: {
  open: boolean;
  cacheRow: QboCustomerCache | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const reset = useCallback((row: QboCustomerCache | null) => {
    if (!row) return;
    setName(row.displayName);
    setStreet(row.billAddrLine1 ?? "");
    setCity(row.billAddrCity ?? "");
    setState(row.billAddrCountrySubDivisionCode ?? "");
    setZip(row.billAddrPostalCode ?? "");
  }, []);

  // Deterministically prefill whenever the dialog opens or cacheRow changes
  useEffect(() => {
    if (open && cacheRow) reset(cacheRow);
  }, [open, cacheRow, reset]);

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/qbo/customers/promote", {
        qboId: cacheRow!.qboId,
        overrides: { name, street, city, state, zip },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("qboMapping.promoted") });
      invalidateAll();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.promoteFailed"), variant: "destructive" });
    },
  });

  if (!cacheRow) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else reset(cacheRow); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("qboMapping.promoteTitle")}</DialogTitle>
          <DialogDescription>{t("qboMapping.promoteDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>{t("common.address")}</Label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} className="mt-1" placeholder={t("qboMapping.street")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Label>{t("qboMapping.city")}</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("qboMapping.state")}</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("qboMapping.zip")}</Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => promoteMutation.mutate()}
            disabled={promoteMutation.isPending || !name || !street || !city || !state || !zip}
          >
            {promoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("qboMapping.promoteAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manual picker dialog ───────────────────────────────────────────────────────
function ManualPickerDialog({
  open,
  customerId,
  onClose,
}: {
  open: boolean;
  customerId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedQboId, setSelectedQboId] = useState<string | null>(null);

  const { data: cacheRows = [], isLoading } = useQuery<QboCacheRow[]>({
    queryKey: ["/api/qbo/customers/cache", { filter: "not_in_crm", search }],
    queryFn: async () => {
      const params = new URLSearchParams({ filter: "not_in_crm", ...(search ? { search } : {}) });
      const res = await apiRequest("GET", `/api/qbo/customers/cache?${params}`);
      return res.json();
    },
    enabled: open,
  });

  const bindMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/qbo/customers/bind", {
        customerId,
        qboId: selectedQboId,
      });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? t("qboMapping.bindFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("qboMapping.bound") });
      invalidateAll();
      onClose();
      setSelectedQboId(null);
      setSearch("");
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.bindFailed"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setSelectedQboId(null); setSearch(""); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("qboMapping.manualPickerTitle")}</DialogTitle>
          <DialogDescription>{t("qboMapping.manualPickerDesc")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("qboMapping.searchQbo")}
            className="pl-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : cacheRows.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">{t("qboMapping.noResults")}</div>
          ) : (
            cacheRows.map((row) => (
              <button
                key={row.qboId}
                onClick={() => setSelectedQboId(row.qboId)}
                className={cn(
                  "w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-muted text-sm border-b last:border-b-0",
                  selectedQboId === row.qboId && "bg-primary/10",
                )}
              >
                <div>
                  <div className="font-medium">{row.displayName}</div>
                  {(row.billAddrCity || row.billAddrPostalCode) && (
                    <div className="text-xs text-muted-foreground">
                      {[row.billAddrCity, row.billAddrPostalCode].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
                {selectedQboId === row.qboId && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setSelectedQboId(null); setSearch(""); }}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => bindMutation.mutate()}
            disabled={!selectedQboId || bindMutation.isPending}
          >
            {bindMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("qboMapping.bindAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create in QuickBooks dialog ────────────────────────────────────────────────
type CreateStage = "loading" | "exact" | "near" | "none";

interface CreateOverrides {
  displayName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
}

function EditableField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={error ? "border-destructive" : ""}
      />
    </div>
  );
}

function CreateForm({
  overrides,
  onChange,
  conflictError,
  t,
}: {
  overrides: CreateOverrides;
  onChange: (field: keyof CreateOverrides, value: string) => void;
  conflictError: string | null;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      <EditableField
        label={t("qboMapping.displayNameLabel")}
        value={overrides.displayName}
        onChange={(v) => onChange("displayName", v)}
        error={!!conflictError}
      />
      {conflictError && <p className="text-xs text-destructive -mt-2">{conflictError}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <EditableField
            label={t("qboMapping.street")}
            value={overrides.street}
            onChange={(v) => onChange("street", v)}
          />
        </div>
        <EditableField
          label={t("qboMapping.city")}
          value={overrides.city}
          onChange={(v) => onChange("city", v)}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditableField
            label={t("qboMapping.state")}
            value={overrides.state}
            onChange={(v) => onChange("state", v)}
          />
          <EditableField
            label={t("qboMapping.zip")}
            value={overrides.zip}
            onChange={(v) => onChange("zip", v)}
          />
        </div>
      </div>
      <EditableField
        label={t("qboMapping.emailLabel")}
        value={overrides.email}
        onChange={(v) => onChange("email", v)}
      />
      <EditableField
        label={t("qboMapping.phoneLabel")}
        value={overrides.phone}
        onChange={(v) => onChange("phone", v)}
      />
    </div>
  );
}

function CreateInQboDialog({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: QboMappingRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [stage, setStage] = useState<CreateStage>("loading");
  const [candidates, setCandidates] = useState<QboDuplicateCandidate[]>([]);
  const [overrides, setOverrides] = useState<CreateOverrides>({
    displayName: "", street: "", city: "", state: "", zip: "", email: "", phone: "",
  });
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [collisionCandidate, setCollisionCandidate] = useState<QboDuplicateCandidate | null>(null);

  const setField = useCallback((field: keyof CreateOverrides, value: string) => {
    setOverrides((prev) => ({ ...prev, [field]: value }));
    if (field === "displayName") { setConflictError(null); setCollisionCandidate(null); }
  }, []);

  // Reset and run duplicate-check when dialog opens
  useEffect(() => {
    if (!open || !row) return;
    setStage("loading");
    setCandidates([]);
    setConflictError(null);
    setCollisionCandidate(null);

    apiRequest("POST", "/api/qbo/customers/duplicate-check", { customerId: row.customerId })
      .then(async (res) => {
        const data = await res.json() as QboDuplicateCheckResult;
        const found = data.candidates ?? [];
        const crm = data.crmCustomer;
        setCandidates(found);
        setOverrides({
          displayName: crm?.name ?? row.customerName,
          street: crm?.street ?? "",
          city: crm?.city ?? row.customerCity,
          state: crm?.state ?? "",
          zip: crm?.zip ?? row.customerZip,
          email: crm?.primaryEmail ?? "",
          phone: crm?.primaryPhone ?? "",
        });
        const hasExact = found.some((c) => c.matchType === "exact_display_name");
        if (hasExact) setStage("exact");
        else if (found.length > 0) setStage("near");
        else setStage("none");
      })
      .catch(() => {
        setOverrides((prev) => ({ ...prev, displayName: row.customerName }));
        setStage("none");
      });
  }, [open, row]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/qbo/customers/create", {
        customerId: row!.customerId,
        displayNameOverride: overrides.displayName || undefined,
        streetOverride: overrides.street || undefined,
        cityOverride: overrides.city || undefined,
        stateOverride: overrides.state || undefined,
        zipOverride: overrides.zip || undefined,
        emailOverride: overrides.email || undefined,
        phoneOverride: overrides.phone || undefined,
      });
      if (!res.ok) {
        const data = await res.json() as { message?: string; displayNameCollision?: boolean; candidate?: QboDuplicateCandidate };
        if (data.displayNameCollision) {
          setConflictError(data.message ?? t("qboMapping.nameConflict"));
          if (data.candidate) {
            setCollisionCandidate({ ...data.candidate, matchType: "exact_display_name" });
          } else {
            // Race: no candidate returned — re-run duplicate check to surface bindable matches
            apiRequest("POST", "/api/qbo/customers/duplicate-check", { customerId: row!.customerId })
              .then(async (r) => {
                const d = await r.json() as QboDuplicateCheckResult;
                const exact = (d.candidates ?? []).filter((c) => c.matchType === "exact_display_name");
                if (exact.length > 0) setCollisionCandidate(exact[0]);
              })
              .catch(() => undefined);
          }
          return;
        }
        throw new Error(data.message ?? t("qboMapping.createFailed"));
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (!data) return;
      toast({ title: t("qboMapping.created") });
      queryClient.invalidateQueries({ queryKey: ["/api/qbo/customers/mapping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qbo/customers/unbound-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qbo/connection"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.createFailed"), variant: "destructive" });
    },
  });

  const bindMutation = useMutation({
    mutationFn: async (qboId: string) => {
      const res = await apiRequest("POST", "/api/qbo/customers/bind", {
        customerId: row!.customerId,
        qboId,
      });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? t("qboMapping.bindFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("qboMapping.bound") });
      queryClient.invalidateQueries({ queryKey: ["/api/qbo/customers/mapping"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qbo/customers/unbound-count"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.bindFailed"), variant: "destructive" });
    },
  });

  if (!row) return null;

  // Exact matches: DisplayName-exact live hits (must link, create blocked)
  const exactMatches = candidates.filter((c) => c.matchType === "exact_display_name");
  // Near matches: all other candidates (cache fuzzy + live email-based)
  const nearMatches = candidates.filter((c) => c.matchType !== "exact_display_name");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("qboMapping.createInQboTitle")}</DialogTitle>
          <DialogDescription>{t("qboMapping.createInQboDesc")}</DialogDescription>
        </DialogHeader>

        {stage === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("qboMapping.checkingDuplicates")}</p>
          </div>
        )}

        {stage === "exact" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-yellow-50 border border-yellow-200">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">{t("qboMapping.exactMatchFound")}</p>
                <p className="text-xs text-yellow-700 mt-0.5">{t("qboMapping.exactMatchDesc")}</p>
              </div>
            </div>
            <div className="space-y-2">
              {exactMatches.map((c) => (
                <div key={c.qboId} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <div className="font-medium text-sm">{c.displayName}</div>
                    {(c.city || c.zip) && (
                      <div className="text-xs text-muted-foreground">{[c.city, c.zip].filter(Boolean).join(", ")}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => bindMutation.mutate(c.qboId)}
                    disabled={bindMutation.isPending}
                  >
                    {bindMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    <Link2 className="w-3 h-3 mr-1" />
                    {t("qboMapping.bindInstead")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "near" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 border border-blue-200">
              <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">{t("qboMapping.nearMatchesFound")}</p>
                <p className="text-xs text-blue-700 mt-0.5">{t("qboMapping.nearMatchesDesc")}</p>
              </div>
            </div>
            <div className="space-y-2">
              {nearMatches.map((c) => (
                <div key={c.qboId} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <div className="font-medium text-sm">{c.displayName}</div>
                    {(c.city || c.zip) && (
                      <div className="text-xs text-muted-foreground">{[c.city, c.zip].filter(Boolean).join(", ")}</div>
                    )}
                    {c.source === "cache" && <ConfidenceBar score={c.score} />}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bindMutation.mutate(c.qboId)}
                    disabled={bindMutation.isPending}
                  >
                    {bindMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    <Link2 className="w-3 h-3 mr-1" />
                    {t("qboMapping.bindInstead")}
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-3">
              <CreateForm
                overrides={overrides}
                onChange={setField}
                conflictError={conflictError}
                t={t}
              />
              {collisionCandidate && (
                <div className="border rounded-md p-3 bg-yellow-50 border-yellow-200 space-y-2">
                  <p className="text-xs font-medium text-yellow-800">{t("qboMapping.exactMatchDesc")}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{collisionCandidate.displayName}</div>
                      {(collisionCandidate.city || collisionCandidate.zip) && (
                        <div className="text-xs text-muted-foreground">{[collisionCandidate.city, collisionCandidate.zip].filter(Boolean).join(", ")}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bindMutation.mutate(collisionCandidate.qboId)}
                      disabled={bindMutation.isPending}
                    >
                      {bindMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      <Link2 className="w-3 h-3 mr-1" />
                      {t("qboMapping.bindInstead")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {stage === "none" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-green-50 border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">{t("qboMapping.noMatchFound")}</p>
                <p className="text-xs text-green-700 mt-0.5">{t("qboMapping.noMatchFoundDesc")}</p>
              </div>
            </div>
            <CreateForm
              overrides={overrides}
              onChange={setField}
              conflictError={conflictError}
              t={t}
            />
            {collisionCandidate && (
              <div className="border rounded-md p-3 bg-yellow-50 border-yellow-200 space-y-2">
                <p className="text-xs font-medium text-yellow-800">{t("qboMapping.exactMatchDesc")}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{collisionCandidate.displayName}</div>
                    {(collisionCandidate.city || collisionCandidate.zip) && (
                      <div className="text-xs text-muted-foreground">{[collisionCandidate.city, collisionCandidate.zip].filter(Boolean).join(", ")}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bindMutation.mutate(collisionCandidate.qboId)}
                    disabled={bindMutation.isPending}
                  >
                    {bindMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    <Link2 className="w-3 h-3 mr-1" />
                    {t("qboMapping.bindInstead")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          {(stage === "none" || stage === "near") && (
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !overrides.displayName.trim()}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {createMutation.isPending ? t("qboMapping.creating") : t("qboMapping.createAction")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab 1: Full Customer List ──────────────────────────────────────────────────
function FullCustomerList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "in_crm" | "not_in_crm" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [promotingRow, setPromotingRow] = useState<QboCustomerCache | null>(null);

  const { data: rows = [], isLoading } = useQuery<QboCacheRow[]>({
    queryKey: ["/api/qbo/customers/cache", { filter, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ filter, ...(search ? { search } : {}) });
      const res = await apiRequest("GET", `/api/qbo/customers/cache?${params}`);
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("qboMapping.searchQbo")}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("qboMapping.filterAll")}</SelectItem>
            <SelectItem value="in_crm">{t("qboMapping.stateInCrm")}</SelectItem>
            <SelectItem value="not_in_crm">{t("qboMapping.stateNotInCrm")}</SelectItem>
            <SelectItem value="inactive">{t("qboMapping.stateInactive")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("qboMapping.noQboCustomers")}</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("qboMapping.location")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("qboMapping.linkedCrm")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.qboId}>
                  <TableCell>
                    <div className="font-medium">{row.displayName}</div>
                    {row.email && <div className="text-xs text-muted-foreground">{row.email}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[row.billAddrCity, row.billAddrPostalCode].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <StateChip state={row.state} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.boundCrmCustomerName ? (
                      <span className="text-green-700">{row.boundCrmCustomerName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.state === "not_in_crm" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPromotingRow(row as QboCustomerCache)}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        {t("qboMapping.promoteToCrm")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PromoteDialog
        open={promotingRow !== null}
        cacheRow={promotingRow}
        onClose={() => setPromotingRow(null)}
      />
    </div>
  );
}

// ── Tab 2: CRM Customer Matching ───────────────────────────────────────────────
function CrmCustomerMatching({ connectionStatus }: { connectionStatus: QboConnectionStatus | undefined }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "bound" | "unbound">("all");
  const [search, setSearch] = useState("");
  const [manualPickerId, setManualPickerId] = useState<string | null>(null);
  const [lastPullResult, setLastPullResult] = useState<QboPullResult | null>(null);
  const [createInQboRow, setCreateInQboRow] = useState<QboMappingRow | null>(null);

  const connected = connectionStatus?.status === "connected";
  const qboWriteEnabled = connectionStatus?.qboWriteEnabled ?? false;

  const { data: rows = [], isLoading, refetch } = useQuery<QboMappingRow[]>({
    queryKey: ["/api/qbo/customers/mapping", { filter, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ filter, ...(search ? { search } : {}) });
      const res = await apiRequest("GET", `/api/qbo/customers/mapping?${params}`);
      return res.json();
    },
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/qbo/customers/pull");
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? t("qboMapping.pullFailed"));
      }
      return res.json() as Promise<QboPullResult>;
    },
    onSuccess: (data) => {
      setLastPullResult(data);
      toast({
        title: t("qboMapping.pullSuccess"),
        description: t("qboMapping.pullSummary", {
          pulled: data.pulled,
          deactivated: data.deactivated,
          stale: data.staleBindings,
        }),
      });
      invalidateAll();
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.pullFailed"), variant: "destructive" });
    },
  });

  const bindMutation = useMutation({
    mutationFn: async ({ customerId, qboId }: { customerId: string; qboId: string }) => {
      const res = await apiRequest("POST", "/api/qbo/customers/bind", { customerId, qboId });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? t("qboMapping.bindFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("qboMapping.bound") });
      invalidateAll();
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.bindFailed"), variant: "destructive" });
    },
  });

  const unbindMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const res = await apiRequest("POST", "/api/qbo/customers/unbind", { customerId });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? t("qboMapping.unbindFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("qboMapping.unbound") });
      invalidateAll();
    },
    onError: (err: Error) => {
      toast({ title: err.message || t("qboMapping.unbindFailed"), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header: pull button + last pulled timestamp */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div title={!connected ? t("qboMapping.connectFirst") : undefined}>
          <Button
            onClick={() => pullMutation.mutate()}
            disabled={!connected || pullMutation.isPending}
            className="gap-2"
          >
            {pullMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {t("qboMapping.pullFromQbo")}
          </Button>
        </div>
        {lastPullResult && (
          <p className="text-xs text-muted-foreground">
            {t("qboMapping.lastPulled", { time: new Date(lastPullResult.lastPulledAt).toLocaleString() })}
          </p>
        )}
      </div>

      {/* Empty states */}
      {!connected && (
        <div className="border rounded-md p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto" />
          <p className="text-sm font-medium">{t("qboMapping.notConnectedTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("qboMapping.notConnectedDesc")}</p>
        </div>
      )}

      {/* Filter + search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("qboMapping.searchCrm")}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "unbound", "bound"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {t(`qboMapping.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("qboMapping.noCrmCustomers")}</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">{t("qboMapping.crmCustomer")}</TableHead>
                <TableHead>{t("qboMapping.qboMatch")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.customerId} className={row.stale ? "bg-yellow-50" : undefined}>
                  <TableCell>
                    <div className="font-medium">{row.customerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {[row.customerCity, row.customerZip].filter(Boolean).join(", ")}
                    </div>
                    <Badge variant="outline" className="mt-1 text-xs">{row.customerStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.stale && (
                      <div className="flex items-center gap-1.5 text-yellow-700 text-sm mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{t("qboMapping.staleBinding")}</span>
                      </div>
                    )}
                    {row.bound && !row.stale ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700">{row.qboDisplayName}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {row.suggestions.map((sug) => (
                          <div
                            key={sug.qboId}
                            className="border rounded-md p-2 text-sm flex flex-col gap-1 min-w-[150px] max-w-[200px]"
                          >
                            <div className="font-medium text-xs leading-tight">{sug.displayName}</div>
                            {(sug.billAddrCity || sug.billAddrPostalCode) && (
                              <div className="text-xs text-muted-foreground">
                                {[sug.billAddrCity, sug.billAddrPostalCode].filter(Boolean).join(", ")}
                              </div>
                            )}
                            <ConfidenceBar score={sug.score} />
                            {sug.verified && (
                              <div className="flex items-center gap-1 text-xs text-blue-700">
                                <ShieldCheck className="w-3 h-3" />
                                {t("qboMapping.verifiedIrrigoPro")}
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-1 h-6 text-xs"
                              onClick={() => bindMutation.mutate({ customerId: row.customerId, qboId: sug.qboId })}
                              disabled={bindMutation.isPending}
                            >
                              <Link2 className="w-3 h-3 mr-1" />
                              {t("qboMapping.bindAction")}
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7"
                            onClick={() => setManualPickerId(row.customerId)}
                          >
                            <Search className="w-3 h-3 mr-1" />
                            {t("qboMapping.manualPick")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!row.bound && connected && (
                        <div title={!qboWriteEnabled ? t("qboMapping.writeDisabledTooltip") : undefined}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setCreateInQboRow(row)}
                            disabled={!qboWriteEnabled}
                          >
                            <PlusCircle className="w-3.5 h-3.5 mr-1" />
                            {t("qboMapping.createInQbo")}
                          </Button>
                        </div>
                      )}
                      {row.bound && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => unbindMutation.mutate(row.customerId)}
                          disabled={unbindMutation.isPending}
                        >
                          <Link2Off className="w-4 h-4 mr-1" />
                          {row.stale ? t("qboMapping.rebind") : t("qboMapping.unbind")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ManualPickerDialog
        open={manualPickerId !== null}
        customerId={manualPickerId}
        onClose={() => setManualPickerId(null)}
      />
      <CreateInQboDialog
        open={createInQboRow !== null}
        row={createInQboRow}
        onClose={() => setCreateInQboRow(null)}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function QboCustomerMapping() {
  const { t } = useTranslation();

  useSetBreadcrumbs([
    { label: t("settings.title"), href: "/dashboard/settings/features" },
    { label: t("qboMapping.title") },
  ], []);

  const { data: connectionStatus } = useQuery<QboConnectionStatus>({
    queryKey: ["/api/qbo/connection"],
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("qboMapping.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("qboMapping.description")}</p>
      </div>

      <Tabs defaultValue="matching">
        <TabsList>
          <TabsTrigger value="matching">{t("qboMapping.tabMatching")}</TabsTrigger>
          <TabsTrigger value="fullList">{t("qboMapping.tabFullList")}</TabsTrigger>
        </TabsList>

        <TabsContent value="matching" className="mt-6">
          <CrmCustomerMatching connectionStatus={connectionStatus} />
        </TabsContent>

        <TabsContent value="fullList" className="mt-6">
          <FullCustomerList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
