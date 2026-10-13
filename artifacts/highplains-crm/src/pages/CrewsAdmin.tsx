import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CREW_COLORS } from "@shared/schema";
import { standingCrewFormSchema } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Crew = {
  color: string | null;
  defaultHoursPerDay: number | null;
  displayOrder: number | null;
  plannerCrew: { id: string; name: string } | null;
  campaignTeamCount: number;
  id: string;
  companyId: string;
  name: string;
  supervisorUserId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  supervisorName: string | null;
  supervisorEmail: string | null;
};

type EligibleSupervisor = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
};

const crewSchema = standingCrewFormSchema;
type PlannerCrew = { id: string; name: string; crewId: string | null; isActive: boolean };

type CrewFormValues = z.infer<typeof crewSchema>;

// `apiRequest` throws an Error whose `.message` is sometimes a JSON-stringified
// payload and sometimes a plain string; narrow safely from `unknown`.
function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  try {
    const parsed: unknown = JSON.parse(err.message);
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as { message: unknown }).message;
      if (typeof m === "string" && m.length > 0) return m;
    }
  } catch {
    // not JSON — fall through to the raw message
  }
  return err.message;
}

export default function CrewsAdmin() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [supervisorPickerOpen, setSupervisorPickerOpen] = useState(false);

  const { data: crews = [], isLoading } = useQuery<Crew[]>({
    queryKey: ["/api/crews"],
    staleTime: 30_000, refetchOnWindowFocus: true,
  });
  const { data: supervisors = [] } = useQuery<EligibleSupervisor[]>({
    queryKey: ["/api/crews/eligible-supervisors"],
  });
  const { data: plannerCrews = [] } = useQuery<PlannerCrew[]>({ queryKey: ["/api/maintenance-crews"], staleTime: 30_000, refetchOnWindowFocus: true });
  const unmatched = plannerCrews.filter(p => p.isActive && !p.crewId);
  const refreshCrews = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
    queryClient.invalidateQueries({ queryKey: ["/api/maintenance-crews"] });
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
  };
  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => apiRequest("POST", "/api/crews/order", { ids }),
    onSuccess: refreshCrews,
    onError: (err) => { refreshCrews(); toast({ title: "Order could not be saved", description: extractErrorMessage(err, "Refresh and try again"), variant: "destructive" }); },
  });
  const moveCrew = (index: number, delta: number) => {
    const ids = crews.map(c => c.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    reorderMutation.mutate(ids);
  };

  const form = useForm<CrewFormValues>({
    resolver: zodResolver(crewSchema),
    defaultValues: { name: "", supervisorUserId: "", isActive: true, color: CREW_COLORS[0], defaultHoursPerDay: 8, plannerCrewId: null },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", supervisorUserId: "", isActive: true, color: CREW_COLORS[0], defaultHoursPerDay: 8, plannerCrewId: null });
    setDialogOpen(true);
  };

  const openEdit = (crew: Crew) => {
    setEditing(crew);
    form.reset({
      name: crew.name,
      supervisorUserId: crew.supervisorUserId,
      isActive: crew.isActive,
      color: crew.color ?? CREW_COLORS[crews.indexOf(crew) % CREW_COLORS.length],
      defaultHoursPerDay: crew.defaultHoursPerDay ?? 8,
      plannerCrewId: crew.plannerCrew?.id ?? null,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: CrewFormValues) => {
      if (editing) {
        return await apiRequest("PATCH", `/api/crews/${editing.id}`, values);
      }
      return await apiRequest("POST", "/api/crews", values);
    },
    onSuccess: () => {
      refreshCrews();
      setDialogOpen(false);
      toast({ title: editing ? "Crew updated" : "Crew created" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Save failed",
        description: extractErrorMessage(err, "Failed to save crew"),
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/crews/${vars.id}`, { isActive: vars.isActive });
    },
    onSuccess: () => {
      refreshCrews();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/crews/${id}`);
    },
    onSuccess: () => {
      refreshCrews();
      toast({ title: "Crew deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  const supervisorOptions = useMemo(() => supervisors, [supervisors]);

  const onSubmit = (values: CrewFormValues) => {
    saveMutation.mutate(values);
  };

  return (
    <div className="space-y-6">
      {unmatched.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <button type="button" className="text-left underline" onClick={() => {
            const planner = unmatched[0];
            const standing = crews.find(c => c.isActive && !c.plannerCrew && c.name.trim().toLowerCase() === planner.name.trim().toLowerCase());
            if (standing) openEdit(standing); else openCreate();
            if (!standing) form.setValue("name", planner.name);
            form.setValue("plannerCrewId", planner.id);
          }}>
            {unmatched.length} planner crews aren't linked to a crew yet. They won't appear on the Scheduling board.
          </button>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Crews</CardTitle>
            <CardDescription>
              A crew is a field team owned by a supervisor. Supervisors use the
              High Plains mobile app to view their crew's work. Supervisors must
              hold one of these roles: <strong>Crew Supervisor</strong>,{" "}
              <strong>Field Manager</strong>, or <strong>Landscape Supervisor</strong>.
            </CardDescription>
          </div>
          <Button onClick={openCreate} data-testid="button-new-crew">
            <Plus className="mr-2 h-4 w-4" />
            New crew
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading crews…</p>
          ) : crews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No crews yet. Click "New crew" to create one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Hours/day</TableHead>
                  <TableHead>Planner crew</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crews.map((crew, index) => (
                  <TableRow key={crew.id} data-testid={`row-crew-${crew.id}`}>
                    <TableCell className="font-medium"><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: crew.color ?? CREW_COLORS[index % CREW_COLORS.length] }} />{crew.name}</TableCell>
                    <TableCell>{crew.defaultHoursPerDay ?? 8}</TableCell>
                    <TableCell>{crew.plannerCrew?.name ?? "None"}</TableCell>
                    <TableCell>
                      {crew.supervisorName ?? "—"}
                      {crew.supervisorEmail ? (
                        <span className="block text-xs text-muted-foreground">
                          {crew.supervisorEmail}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={crew.isActive}
                          onCheckedChange={(v) =>
                            toggleActiveMutation.mutate({ id: crew.id, isActive: v })
                          }
                          aria-label="Toggle active"
                        />
                        <Badge variant={crew.isActive ? "default" : "secondary"}>
                          {crew.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" aria-label={`Move ${crew.name} up`} disabled={index === 0 || reorderMutation.isPending} onClick={() => moveCrew(index, -1)}>Up</Button>
                        <Button variant="ghost" size="sm" aria-label={`Move ${crew.name} down`} disabled={index === crews.length - 1 || reorderMutation.isPending} onClick={() => moveCrew(index, 1)}>Down</Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(crew)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Delete crew "${crew.name}"?`)) {
                              deleteMutation.mutate(crew.id);
                            }
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit crew" : "New crew"}</DialogTitle>
            <DialogDescription>
              Assign a supervisor who will own this crew in the mobile app.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem><FormLabel>Color</FormLabel><FormControl><Input type="color" value={field.value ?? CREW_COLORS[0]} onChange={field.onChange} /></FormControl>
                  <div className="flex gap-1">{CREW_COLORS.map(color => <button key={color} type="button" aria-label={`Use ${color}`} className="h-5 w-5 rounded border" style={{ backgroundColor: color }} onClick={() => field.onChange(color)} />)}</div><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="defaultHoursPerDay" render={({ field }) => (
                <FormItem><FormLabel>Hours/day</FormLabel><FormControl><Input type="number" min={0} max={24} step="0.5" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="plannerCrewId" render={({ field }) => (
                <FormItem><FormLabel>Planner crew</FormLabel><Select value={field.value ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent><SelectItem value="none">None</SelectItem>{plannerCrews.filter(p => !p.crewId || p.id === editing?.plannerCrew?.id).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select><FormMessage /></FormItem>
              )} />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. North Crew" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supervisorUserId"
                render={({ field }) => {
                  const selected = supervisorOptions.find((s) => s.id === field.value);
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>Supervisor</FormLabel>
                      <Popover open={supervisorPickerOpen} onOpenChange={setSupervisorPickerOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={supervisorPickerOpen}
                              className={cn(
                                "w-full justify-between font-normal",
                                !field.value && "text-muted-foreground",
                              )}
                              data-testid="button-supervisor-picker"
                            >
                              {selected
                                ? `${selected.name} · ${selected.role.replace(/_/g, " ")}`
                                : "Select a supervisor"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          {supervisorOptions.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-muted-foreground">
                              No eligible supervisors. Assign someone the
                              "Crew Supervisor" role on the Users page first.
                            </div>
                          ) : (
                            <Command>
                              <CommandInput
                                placeholder="Search supervisors…"
                                data-testid="input-supervisor-search"
                              />
                              <CommandList>
                                <CommandEmpty>No matching supervisors.</CommandEmpty>
                                <CommandGroup>
                                  {supervisorOptions.map((s) => {
                                    const haystack = `${s.name} ${s.email ?? ""} ${s.role.replace(/_/g, " ")}`;
                                    return (
                                      <CommandItem
                                        key={s.id}
                                        value={haystack}
                                        onSelect={() => {
                                          field.onChange(s.id);
                                          setSupervisorPickerOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === s.id ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span>
                                            {s.name}
                                            <span className="ml-2 text-xs text-muted-foreground">
                                              · {s.role.replace(/_/g, " ")}
                                            </span>
                                          </span>
                                          {s.email ? (
                                            <span className="text-xs text-muted-foreground">
                                              {s.email}
                                            </span>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          )}
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Active</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Inactive crews remain in the system but won't be selectable.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {editing ? "Save changes" : "Create crew"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
