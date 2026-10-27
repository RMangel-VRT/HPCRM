import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
export function PlannerCrewPicker({ crew }: { crew?: { name: string; color: string; defaultHoursPerDay: number; crewId: string | null } | null }) {
  const { toast } = useToast();
  const [id, setId] = useState("");
  const { data: owners = [] } = useQuery<Array<{ id: string; name: string; supervisorName: string; isActive: boolean; plannerCrew: unknown }>>({ queryKey: ["/api/crews"] });
  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/maintenance-crews", { crewId: id }),
    onSuccess: () => { setId(""); queryClient.invalidateQueries({ queryKey: ["/api/maintenance-crews"] }); queryClient.invalidateQueries({ queryKey: ["/api/crews"] }); },
    onError: (e: Error) => toast({ title: "Could not add column", description: e.message, variant: "destructive" }),
  });
  return <div className="space-y-3 rounded border p-3">
    {crew ? <><strong>{crew.name}</strong><p>{owners.find(c => c.id === crew.crewId)?.supervisorName ?? "Not connected"} · {crew.defaultHoursPerDay}h/day</p><span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: crew.color }} /></> :
      <><label htmlFor="planner-owner">Add column for standing crew</label><select id="planner-owner" className="w-full rounded border p-2 bg-background" value={id} onChange={e => setId(e.target.value)}>
        <option value="">Select a crew</option>{owners.filter(c => !c.plannerCrew && c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select><Button disabled={!id || add.isPending} onClick={() => add.mutate()}>Add column</Button></>}
    <Link href="/dashboard/settings/crews" className="block text-sm underline">Edit in Settings → Crews</Link>
  </div>;
}
