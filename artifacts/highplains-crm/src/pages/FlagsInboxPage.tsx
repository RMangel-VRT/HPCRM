import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Flag as FlagIcon, X } from "lucide-react";
import { type FlagStatus, type FlagTag } from "@shared/schema";
import { tagMetaFromList, useFlagTaxonomy } from "@/hooks/useFlagTaxonomy";

type FlagListItem = {
  id: string;
  tag: FlagTag;
  status: FlagStatus;
  note: string | null;
  propertyId: string | null;
  propertyName: string | null;
  ticketId: string | null;
  crewId: string | null;
  crewName: string | null;
  createdByName: string | null;
  createdAt: string;
  photos: { id: string; signedUrl: string | null }[];
};

type FlagsResponse = { items: FlagListItem[]; total: number; limit: number; offset: number };

type CrewListItem = { id: string; name: string };
type PropertySearchResult = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
};

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "new") return "destructive";
  if (status === "resolved" || status === "dismissed") return "outline";
  return "secondary";
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function FlagsInboxPage() {
  const { tags: FLAG_TAGS, statuses: FLAG_STATUSES } = useFlagTaxonomy();
  const [statusFilter, setStatusFilter] = useState<"all" | FlagStatus>("new");
  const [tagFilter, setTagFilter] = useState<"all" | FlagTag>("all");
  const [crewFilter, setCrewFilter] = useState<"all" | string>("all");
  const [property, setProperty] = useState<{ id: string; name: string } | null>(null);
  const [propertyQuery, setPropertyQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: crewData } = useQuery<{ id: string; name: string }[] | CrewListItem[]>({
    queryKey: ["/api/crews"],
  });
  const crews: CrewListItem[] = Array.isArray(crewData) ? (crewData as CrewListItem[]) : [];

  const { data: propertyResults } = useQuery<PropertySearchResult[]>({
    queryKey: [`/api/flags/customer-search?q=${encodeURIComponent(propertyQuery)}`],
    enabled: propertyQuery.trim().length > 0 && !property,
  });

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (tagFilter !== "all") params.set("tag", tagFilter);
  if (crewFilter !== "all") params.set("crewId", crewFilter);
  if (property) params.set("propertyId", property.id);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("limit", "100");
  const url = `/api/flags?${params.toString()}`;

  const { data, isLoading, isError, refetch } = useQuery<FlagsResponse>({
    queryKey: [url],
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const newCount = items.filter((i) => i.status === "new").length;

  const clearFilters = () => {
    setStatusFilter("new");
    setTagFilter("all");
    setCrewFilter("all");
    setProperty(null);
    setPropertyQuery("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-6" data-testid="page-flags-inbox">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FlagIcon className="w-6 h-6 text-destructive" />
            Field Flags
            {newCount > 0 ? (
              <Badge variant="destructive" data-testid="text-flags-new-count">{newCount} new</Badge>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">Issues reported by crews from the field.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger data-testid="select-flag-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {FLAG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tag</label>
              <Select value={tagFilter} onValueChange={(v) => setTagFilter(v as typeof tagFilter)}>
                <SelectTrigger data-testid="select-flag-tag-filter">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {FLAG_TAGS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Crew</label>
              <Select value={crewFilter} onValueChange={(v) => setCrewFilter(v)}>
                <SelectTrigger data-testid="select-flag-crew-filter">
                  <SelectValue placeholder="Crew" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All crews</SelectItem>
                  {crews.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 lg:col-span-1 relative">
              <label className="text-xs font-medium text-muted-foreground">Property</label>
              {property ? (
                <div className="flex items-center gap-2 border rounded-md px-2 py-1.5 bg-muted/40">
                  <span className="text-sm truncate flex-1" data-testid="text-flag-property-filter">{property.name}</span>
                  <button
                    type="button"
                    onClick={() => { setProperty(null); setPropertyQuery(""); }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear property"
                    data-testid="button-clear-property-filter"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search properties…"
                    value={propertyQuery}
                    onChange={(e) => setPropertyQuery(e.target.value)}
                    data-testid="input-flag-property-search"
                  />
                  {propertyQuery.trim() && propertyResults && propertyResults.length > 0 ? (
                    <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                      {propertyResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => { setProperty({ id: r.id, name: r.name }); setPropertyQuery(""); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                          data-testid={`option-property-${r.id}`}
                        >
                          <div className="font-medium">{r.name}</div>
                          {r.street ? (
                            <div className="text-xs text-muted-foreground">{r.street}{r.city ? `, ${r.city}` : ""}{r.state ? `, ${r.state}` : ""}</div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-flag-date-from"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-flag-date-to"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-flag-filters">
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : isError ? (
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-destructive">Couldn't load flags.</p>
          <Button onClick={() => refetch()} data-testid="button-retry-flags">Retry</Button>
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <FlagIcon className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="font-medium">No flags match these filters</p>
            <p className="text-sm text-muted-foreground">When the field crew flags an issue, it'll show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table data-testid="table-flags-inbox">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[64px]">Photo</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Crew / Reporter</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => {
                  const meta = tagMetaFromList(f.tag, FLAG_TAGS);
                  const thumb = f.photos[0]?.signedUrl ?? null;
                  return (
                    <TableRow key={f.id} data-testid={`row-flag-${f.id}`}>
                      <TableCell>
                        {thumb ? (
                          <img src={thumb} alt="" className="w-12 h-12 rounded object-cover bg-muted" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <FlagIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-block px-2 py-0.5 text-xs font-medium rounded text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.label}
                        </span>
                        {f.note ? (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1 max-w-[280px]">{f.note}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {f.propertyName ? (
                          <span className="text-sm">{f.propertyName}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">No property</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{f.crewName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{f.createdByName ?? "Unknown"}</div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDateTime(f.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(f.status)}>{f.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline" data-testid={`button-open-flag-${f.id}`}>
                          <Link href={`/dashboard/flags/${f.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
