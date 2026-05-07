import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Users, X, Trash2, Pencil, Search, ExternalLink, Lock } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import type { Campaign, CampaignItem, CampaignCrewWithMembers, CompanyUser, User as UserType } from "@shared/schema";

interface CampaignDetailLike extends Campaign {
  items: (CampaignItem & { customerCity?: string | null })[];
}

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: UserType;
}

interface Props {
  campaign: CampaignDetailLike;
  campaignId: string;
}

const COLOR_PRESETS = [
  "#2563eb", "#16a34a", "#dc2626", "#ea580c",
  "#9333ea", "#0891b2", "#ca8a04", "#475569",
];

export default function ExtraBillableCampaignView({ campaign, campaignId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<"properties" | "crews" | "billing">("properties");
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [editingCrew, setEditingCrew] = useState<CampaignCrewWithMembers | null>(null);
  const [search, setSearch] = useState("");

  const isAdminOffice = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: crews = [] } = useQuery<CampaignCrewWithMembers[]>({
    queryKey: ["/api/campaigns", campaignId, "crews"],
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
    enabled: isAdminOffice,
  });

  const memberPool = useMemo(
    () =>
      companyUsersData
        .filter(cu =>
          ["admin", "office", "field_manager", "field", "landscape_supervisor"].includes(cu.companyUser.role),
        )
        .map(cu => ({ id: cu.companyUser.userId, name: cu.user.name, role: cu.companyUser.role })),
    [companyUsersData],
  );

  const crewById = useMemo(() => {
    const m = new Map<string, CampaignCrewWithMembers>();
    crews.forEach(c => m.set(c.id, c));
    return m;
  }, [crews]);

  const items = campaign.items || [];

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      (i.customerName || "").toLowerCase().includes(q) ||
      (i.customerCity || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const counters = useMemo(() => {
    const completed = items.filter(i => i.status === "completed").length;
    const photos = items.reduce((acc, i) => acc + ((i.completionPhotoStorageKeys?.length) || 0), 0);
    const estimated = items.reduce((acc, i) => acc + Number(i.estimatedAmount || 0), 0);
    return { total: items.length, completed, photos, estimated };
  }, [items]);

  const assignItemMutation = useMutation({
    mutationFn: async ({ itemId, crewId }: { itemId: string; crewId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${itemId}/crew`, {
        assignedCampaignCrewId: crewId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "crews"] });
    },
    onError: () => toast({ title: "Failed to update assignment", variant: "destructive" }),
  });

  const deleteCrewMutation = useMutation({
    mutationFn: async (crewId: string) => {
      const res = await apiRequest("DELETE", `/api/campaigns/${campaignId}/crews/${crewId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "crews"] });
      toast({ title: t("campaigns.extraBillableCrewDeleted") });
    },
    onError: (e: Error) => toast({ title: e.message || t("campaigns.extraBillableCrewDeleteFailed"), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant={tab === "properties" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("properties")}
          data-testid="button-eb-tab-properties"
        >
          {t("campaigns.extraBillableTabProperties")}
        </Button>
        <Button
          variant={tab === "crews" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("crews")}
          data-testid="button-eb-tab-crews"
        >
          {t("campaigns.extraBillableTabCrews")}
        </Button>
        <Button
          variant={tab === "billing" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("billing")}
          data-testid="button-eb-tab-billing"
        >
          {t("campaigns.extraBillableTabBillingQueue")}
        </Button>
      </div>

      {tab === "properties" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <CounterTile label={t("campaigns.extraBillablePropertyCount")} value={String(counters.total)} testId="counter-eb-properties" />
              <CounterTile label={t("campaigns.extraBillableCompletedCount")} value={`${counters.completed} / ${counters.total}`} testId="counter-eb-completed" />
              <CounterTile label={t("campaigns.extraBillablePhotosCount")} value={String(counters.photos)} testId="counter-eb-photos" />
              <CounterTile label={t("campaigns.extraBillableTotalEstimated")} value={`$${counters.estimated.toFixed(2)}`} testId="counter-eb-estimated" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={t("campaigns.extraBillableSearchProperties")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-eb-search"
                />
              </div>
              {isAdminOffice && (
                <Button size="sm" variant="outline" disabled data-testid="button-eb-add-properties">
                  <Plus className="w-4 h-4 mr-1" />
                  {t("campaigns.extraBillableAddProperties")}
                </Button>
              )}
            </div>
            {items.length === 0 ? (
              <EmptyState icon={Users} title={t("common.empty")} description="" />
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-eb-no-match">
                {t("campaigns.extraBillableNoMatchingProperties")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">{t("common.properties")}</th>
                      <th className="text-left p-2 font-medium">{t("common.city") || "City"}</th>
                      <th className="text-left p-2 font-medium">{t("campaigns.extraBillableAssignedCrew")}</th>
                      <th className="text-left p-2 font-medium">{t("common.status")}</th>
                      <th className="text-left p-2 font-medium">{t("campaigns.extraBillablePhotosCount")}</th>
                      <th className="text-right p-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const crew = item.assignedCampaignCrewId ? crewById.get(item.assignedCampaignCrewId) : null;
                      const photoCount = item.completionPhotoStorageKeys?.length || 0;
                      return (
                        <tr key={item.id} className="border-b" data-testid={`row-eb-item-${item.id}`}>
                          <td className="p-2">
                            <Link href={`/customers/${item.customerId}`} className="hover:underline" data-testid={`link-customer-${item.id}`}>
                              {item.customerName}
                            </Link>
                          </td>
                          <td className="p-2 text-muted-foreground">{item.customerCity || "—"}</td>
                          <td className="p-2">
                            {isAdminOffice ? (
                              <Select
                                value={item.assignedCampaignCrewId || "none"}
                                onValueChange={(v) =>
                                  assignItemMutation.mutate({ itemId: item.id, crewId: v === "none" ? null : v })
                                }
                              >
                                <SelectTrigger className="w-[180px]" data-testid={`select-eb-assign-${item.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t("campaigns.extraBillableUnassigned")}</SelectItem>
                                  {crews.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : crew ? (
                              <Badge variant="outline" style={{ borderColor: crew.color }}>{crew.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">{t("campaigns.extraBillableUnassigned")}</span>
                            )}
                          </td>
                          <td className="p-2">
                            <Badge variant={item.status === "completed" ? "default" : "outline"}>
                              {item.status}
                            </Badge>
                          </td>
                          <td className="p-2 text-muted-foreground" data-testid={`text-eb-photos-${item.id}`}>{photoCount}</td>
                          <td className="p-2 text-right">
                            <Button asChild variant="ghost" size="sm" data-testid={`button-eb-open-${item.id}`}>
                              <Link href={`/customers/${item.customerId}`}>
                                <ExternalLink className="w-4 h-4 mr-1" />
                                {t("campaigns.extraBillableOpenProperty")}
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "crews" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {isAdminOffice && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => { setEditingCrew(null); setCrewDialogOpen(true); }}
                  data-testid="button-add-crew"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("campaigns.extraBillableAddCrew")}
                </Button>
              </div>
            )}
            {crews.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-crews">
                {t("campaigns.extraBillableNoCrews")}
              </p>
            ) : (
              <div className="space-y-3">
                {crews.map(crew => (
                  <CrewCard
                    key={crew.id}
                    crew={crew}
                    isAdminOffice={isAdminOffice}
                    onEdit={() => { setEditingCrew(crew); setCrewDialogOpen(true); }}
                    onDelete={() => {
                      if (window.confirm(t("campaigns.extraBillableDeleteCrewConfirm"))) {
                        deleteCrewMutation.mutate(crew.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "billing" && (
        <Card>
          <CardContent className="p-6 text-center space-y-2" data-testid="billing-queue-placeholder">
            <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("campaigns.extraBillableBillingQueueLocked")}
            </p>
          </CardContent>
        </Card>
      )}

      {crewDialogOpen && (
        <CrewDialog
          open={crewDialogOpen}
          onOpenChange={setCrewDialogOpen}
          crew={editingCrew}
          campaignId={campaignId}
          memberPool={memberPool}
        />
      )}
    </div>
  );
}

function CounterTile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md border p-3" data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function CrewCard({
  crew,
  isAdminOffice,
  onEdit,
  onDelete,
}: {
  crew: CampaignCrewWithMembers;
  isAdminOffice: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border p-3 space-y-2" data-testid={`crew-card-${crew.id}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: crew.color }} />
          <span className="font-medium" data-testid={`text-crew-name-${crew.id}`}>{crew.name}</span>
          <Badge variant="outline" className="text-xs">
            {t("campaigns.extraBillableCrewLeader")}: {crew.leaderName || crew.leaderUserId}
          </Badge>
          <Badge variant="secondary" className="text-xs" data-testid={`badge-crew-completed-${crew.id}`}>
            {t("campaigns.extraBillableCompletedCount")}: {crew.completedCount} / {crew.itemCount}
          </Badge>
          <Badge variant="secondary" className="text-xs" data-testid={`badge-crew-photos-${crew.id}`}>
            {t("campaigns.extraBillablePhotosCount")}: {crew.photoCount}
          </Badge>
        </div>
        {isAdminOffice && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-crew-${crew.id}`}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={onDelete} data-testid={`button-delete-crew-${crew.id}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {crew.members.map((m: { userId: string; userName: string }) => (
          <Badge key={m.userId} variant="secondary" className="gap-1" data-testid={`badge-crew-member-${crew.id}-${m.userId}`}>
            {m.userName}
            {m.userId === crew.leaderUserId && (
              <span className="ml-1 text-[10px] uppercase">★</span>
            )}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function CrewDialog({
  open,
  onOpenChange,
  crew,
  campaignId,
  memberPool,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  crew: CampaignCrewWithMembers | null;
  campaignId: string;
  memberPool: { id: string; name: string; role: string }[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState(crew?.name || "");
  const [color, setColor] = useState(crew?.color || COLOR_PRESETS[0]);
  const [leaderUserId, setLeaderUserId] = useState(crew?.leaderUserId || "");
  const [memberIds, setMemberIds] = useState<Set<string>>(
    new Set<string>(crew?.members.map((m: { userId: string }) => m.userId) ?? []),
  );

  const toggleMember = (id: string) => {
    if (id === leaderUserId) return;
    setMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, color, leaderUserId };
      const res = crew
        ? await apiRequest("PATCH", `/api/campaigns/${campaignId}/crews/${crew.id}`, body)
        : await apiRequest("POST", `/api/campaigns/${campaignId}/crews`, body);
      const saved = await res.json();
      const crewId = saved.id as string;
      // Sync members: add new, remove dropped (leader is auto-added server-side)
      const existing = new Set<string>(crew?.members.map((m: { userId: string }) => m.userId) ?? [saved.leaderUserId as string]);
      const desired = new Set<string>(memberIds);
      desired.add(leaderUserId);
      const toAdd: string[] = [];
      const toRemove: string[] = [];
      desired.forEach((id: string) => { if (!existing.has(id)) toAdd.push(id); });
      existing.forEach((id: string) => { if (!desired.has(id) && id !== leaderUserId) toRemove.push(id); });
      for (const id of toAdd) {
        await apiRequest("POST", `/api/campaigns/${campaignId}/crews/${crewId}/members`, { userId: id });
      }
      for (const id of toRemove) {
        await apiRequest("DELETE", `/api/campaigns/${campaignId}/crews/${crewId}/members/${id}`);
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "crews"] });
      toast({ title: t("campaigns.extraBillableCrewSaved") });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: e.message || t("campaigns.extraBillableCrewSaveFailed"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{crew ? t("campaigns.extraBillableEditCrew") : t("campaigns.extraBillableAddCrew")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("campaigns.extraBillableCrewName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-crew-name" />
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.extraBillableColorPresets")}</Label>
            <div className="flex flex-wrap gap-2" data-testid="color-presets">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-md border-2 hover-elevate ${color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  data-testid={`button-color-${c.replace("#", "")}`}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-9 p-1"
                data-testid="input-crew-color"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.extraBillableCrewLeader")}</Label>
            <Select value={leaderUserId} onValueChange={(v) => { setLeaderUserId(v); setMemberIds(prev => { const n = new Set(prev); n.add(v); return n; }); }}>
              <SelectTrigger data-testid="select-crew-leader">
                <SelectValue placeholder="…" />
              </SelectTrigger>
              <SelectContent>
                {memberPool.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.extraBillableSelectMembers")}</Label>
            <p className="text-xs text-muted-foreground">{t("campaigns.extraBillableLeaderPinned")}</p>
            <ScrollArea className="h-40 rounded-md border p-2">
              <div className="space-y-1">
                {memberPool.map(m => {
                  const isLeader = m.id === leaderUserId;
                  const checked = isLeader || memberIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 text-sm rounded-md p-1 ${isLeader ? "bg-muted" : "hover-elevate"}`}
                      data-testid={`row-member-${m.id}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={isLeader}
                        onCheckedChange={() => toggleMember(m.id)}
                        data-testid={`checkbox-member-${m.id}`}
                      />
                      <span className="flex-1">{m.name}</span>
                      {isLeader && <Badge variant="outline" className="text-[10px]">{t("campaigns.extraBillableCrewLeader")}</Badge>}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!name || !leaderUserId || saveMutation.isPending}
            data-testid="button-save-crew"
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
