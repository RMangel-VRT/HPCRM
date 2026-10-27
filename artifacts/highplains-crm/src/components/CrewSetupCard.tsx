import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Item = { id: string; name: string; color: string; defaultHoursPerDay?: number; placementCount?: number; campaignId?: string; campaignTitle?: string; leaderUserId?: string; unavailableCrewIds?: string[] };
type Crew = { id: string; name: string; plannerCrew: { id: string } | null };
export function CrewSetupCard() {
  const { toast } = useToast();
  const { data, isError } = useQuery<{ planners: Item[]; teams: Item[] }>({ queryKey: ["/api/crews/setup"], staleTime: 0 });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const { data: supervisors = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ["/api/crews/eligible-supervisors"] });
  const [creating, setCreating] = useState<{ item: Item; source: "planner" | "campaign-team" } | null>(null);
  const [form, setForm] = useState({ name: "", color: "#2563eb", defaultHoursPerDay: 8, supervisorUserId: "" });
  const mutation = useMutation({
    mutationFn: async ({ item, source, crewId }: { item: Item; source: "planner" | "campaign-team"; crewId?: string }) => {
      if (!crewId) return apiRequest("POST", `/api/crews/from-${source}/${item.id}`, form);
      return apiRequest("PATCH", source === "planner" ? `/api/maintenance-crews/${item.id}` : `/api/campaigns/${item.campaignId}/crews/${item.id}`, { crewId });
    },
    onSuccess: () => {
      setCreating(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance-crews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: (e: Error) => toast({ title: "Crew setup failed", description: e.message, variant: "destructive" }),
  });
  if (isError) return <p role="alert">Crew setup could not be loaded. Refresh to try again.</p>;
  if (!data || data.planners.length + data.teams.length === 0) return null;
  return <Card id="crew-setup">
    <CardHeader><CardTitle>Finish crew setup: {data.planners.length + data.teams.length} items aren't connected to a crew yet.</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {(["planner", "campaign-team"] as const).flatMap(source => (source === "planner" ? data.planners : data.teams).map(item =>
        <div key={`${source}-${item.id}`} className="flex flex-wrap items-center gap-3 rounded border p-3">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
          <div className="flex-1"><strong>{item.name}</strong><p className="text-sm text-muted-foreground">{source === "planner" ? `Planner column · ${item.placementCount} placements` : `Campaign team · ${item.campaignTitle}`}</p></div>
          <select aria-label={`Link ${item.name} to crew`} value="" disabled={mutation.isPending} className="rounded border p-2 text-sm bg-background"
            onChange={e => mutation.mutate({ item, source, crewId: e.target.value })}>
            <option value="" disabled>Link to crew…</option>
            {crews.filter(c => source === "planner" ? !c.plannerCrew : !item.unavailableCrewIds?.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => {
            setForm({ name: item.name, color: item.color, defaultHoursPerDay: item.defaultHoursPerDay ?? 8, supervisorUserId: supervisors.some(s => s.id === item.leaderUserId) ? item.leaderUserId! : "" });
            setCreating({ item, source });
          }}>Create crew from this</Button>
        </div>))}
      <Dialog open={!!creating} onOpenChange={open => { if (!open) setCreating(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Create and connect crew</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (creating) mutation.mutate(creating); }}>
            <label className="block">Name<Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="block">Color<Input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></label>
            <label className="block">Hours/day<Input type="number" min={0} max={24} step="0.5" required value={form.defaultHoursPerDay} onChange={e => setForm({ ...form, defaultHoursPerDay: Number(e.target.value) })} /></label>
            <label className="block">Supervisor<select required className="block w-full border rounded p-2 bg-background" value={form.supervisorUserId} onChange={e => setForm({ ...form, supervisorUserId: e.target.value })}>
              <option value="">Select a supervisor</option>{supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
            <Button type="submit" disabled={mutation.isPending}>Create and connect</Button>
          </form>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
