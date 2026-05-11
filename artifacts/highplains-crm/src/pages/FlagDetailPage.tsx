import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Flag as FlagIcon, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type FlagStatus } from "@shared/schema";
import { tagMetaFromList, useFlagTaxonomy } from "@/hooks/useFlagTaxonomy";

type FlagPhoto = { id: string; signedUrl: string | null; storageKey: string };
type FlagDetail = {
  id: string;
  tag: string;
  status: FlagStatus;
  note: string | null;
  propertyId: string | null;
  propertyName: string | null;
  ticketId: string | null;
  crewName: string | null;
  createdByName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  photos: FlagPhoto[];
};


export default function FlagDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = params.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const { tags: FLAG_TAGS, statuses: FLAG_STATUSES } = useFlagTaxonomy();

  const detailKey = `/api/flags/${id}`;
  const { data, isLoading, isError } = useQuery<FlagDetail>({
    queryKey: [detailKey],
  });

  type CompanyUserOption = {
    userId: string;
    role: string;
    status: string;
    user: { firstName: string; lastName: string; email: string };
  };
  const { data: companyUsersData, isLoading: companyUsersLoading } = useQuery<CompanyUserOption[]>({
    queryKey: ["/api/company-users"],
  });
  const companyUsers: CompanyUserOption[] = (companyUsersData ?? []).filter(
    (cu) => cu.status === "active" && (cu.role === "admin" || cu.role === "office"),
  );

  const [resolution, setResolution] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);

  const patchMutation = useMutation({
    mutationFn: (body: Partial<{ status: FlagStatus; resolution: string | null; assignedToUserId: string | null }>) =>
      apiRequest("PATCH", detailKey, body).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [detailKey] });
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/flags") });
      toast({ title: "Flag updated" });
    },
    onError: (e) => {
      toast({ title: "Couldn't update flag", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent></Card>;
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p>Flag not found.</p>
          <Button asChild><Link href="/dashboard/flags">Back to inbox</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const meta = tagMetaFromList(data.tag, FLAG_TAGS);
  const isClosed = data.status === "resolved" || data.status === "dismissed";

  return (
    <div className="space-y-6 max-w-4xl" data-testid="page-flag-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/flags")} data-testid="button-back-flags">
          <ArrowLeft className="w-4 h-4 mr-1" /> Inbox
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block px-2.5 py-1 text-xs font-semibold rounded text-white"
                  style={{ backgroundColor: meta.color }}
                  data-testid="text-flag-tag"
                >
                  {meta.label}
                </span>
                <Badge variant={data.status === "new" ? "destructive" : "secondary"} data-testid="text-flag-status">
                  {data.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <CardTitle className="text-xl flex items-center gap-2">
                <FlagIcon className="w-5 h-5 text-destructive" />
                {data.propertyName ?? "Field flag"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Reported by {data.createdByName ?? "Unknown"}
                {data.crewName ? ` (${data.crewName})` : ""}
                {" • "}
                {new Date(data.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {data.propertyId ? (
                <Link
                  href={`/dashboard/customers/${data.propertyId}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  data-testid="link-flag-property"
                >
                  Open property <ExternalLink className="w-3 h-3" />
                </Link>
              ) : null}
              {data.ticketId ? (
                <div>
                  <Link
                    href={`/dashboard/tickets/${data.ticketId}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    data-testid="link-flag-ticket"
                  >
                    Open related ticket <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.note ? (
            <div className="bg-muted/50 rounded p-3 text-sm whitespace-pre-wrap" data-testid="text-flag-note">
              {data.note}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No note from the field.</p>
          )}

          {data.photos.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium mb-2">Photos ({data.photos.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {data.photos.map((p) =>
                  p.signedUrl ? (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setViewer(p.signedUrl)}
                      className="aspect-square rounded-md overflow-hidden bg-muted hover:opacity-90 transition"
                      data-testid={`button-flag-photo-${p.id}`}
                    >
                      <img src={p.signedUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div key={p.id} className="aspect-square rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      Unavailable
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {data.resolution ? (
            <div>
              <h3 className="text-sm font-medium mb-1">Resolution</h3>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded p-3 text-sm whitespace-pre-wrap">
                {data.resolution}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Triage</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={data.status}
                onValueChange={(v) => patchMutation.mutate({ status: v as FlagStatus })}
                disabled={patchMutation.isPending}
              >
                <SelectTrigger data-testid="select-flag-status-update"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLAG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assigned to</label>
              <Select
                value={data.assignedToUserId ?? "__unassigned__"}
                onValueChange={(v) =>
                  patchMutation.mutate({ assignedToUserId: v === "__unassigned__" ? null : v })
                }
                disabled={patchMutation.isPending || companyUsersLoading}
              >
                <SelectTrigger data-testid="select-flag-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {companyUsers.map((cu) => {
                    const fullName = `${cu.user.firstName} ${cu.user.lastName}`.trim() || cu.user.email;
                    return (
                      <SelectItem key={cu.userId} value={cu.userId}>
                        {fullName} <span className="text-muted-foreground">({cu.role})</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {data.assignedToName ? (
                <p className="text-xs text-muted-foreground">Currently: {data.assignedToName}</p>
              ) : null}
            </div>
          </div>

          {!isClosed ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Resolve with a note</label>
              <Textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="What did you do? (optional)"
                rows={3}
                data-testid="input-flag-resolution"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    patchMutation.mutate({ status: "resolved", resolution: resolution.trim() || null })
                  }
                  disabled={patchMutation.isPending}
                  data-testid="button-flag-resolve"
                >
                  Mark resolved
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    patchMutation.mutate({ status: "dismissed", resolution: resolution.trim() || null })
                  }
                  disabled={patchMutation.isPending}
                  data-testid="button-flag-dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => patchMutation.mutate({ status: "acknowledged", resolution: null })}
              disabled={patchMutation.isPending}
              data-testid="button-flag-reopen"
            >
              Reopen
            </Button>
          )}
        </CardContent>
      </Card>

      {viewer ? (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
          data-testid="flag-photo-viewer"
        >
          <img src={viewer} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      ) : null}
    </div>
  );
}
