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

type Crew = {
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

const crewSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  supervisorUserId: z.string().min(1, "Supervisor is required"),
  isActive: z.boolean().default(true),
});

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
  });
  const { data: supervisors = [] } = useQuery<EligibleSupervisor[]>({
    queryKey: ["/api/crews/eligible-supervisors"],
  });

  const form = useForm<CrewFormValues>({
    resolver: zodResolver(crewSchema),
    defaultValues: { name: "", supervisorUserId: "", isActive: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", supervisorUserId: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (crew: Crew) => {
    setEditing(crew);
    form.reset({
      name: crew.name,
      supervisorUserId: crew.supervisorUserId,
      isActive: crew.isActive,
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
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/crews/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
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
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crews.map((crew) => (
                  <TableRow key={crew.id} data-testid={`row-crew-${crew.id}`}>
                    <TableCell className="font-medium">{crew.name}</TableCell>
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
