import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { MaintenanceVisitConfig, MaintenanceCrew } from "@shared/schema";
import { insertMaintenanceVisitConfigSchema } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Clock, Users, Calendar, Save, Edit, X } from "lucide-react";

interface CustomerSchedulingSectionProps {
  customerId: string;
}

const DAYS_OF_WEEK = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
] as const;

export default function CustomerSchedulingSection({ customerId }: CustomerSchedulingSectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  
  const canEdit = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: config, isLoading: isLoadingConfig } = useQuery<MaintenanceVisitConfig | null>({
    queryKey: ["/api/customers", customerId, "maintenance-config"],
  });

  const { data: crews = [], isLoading: isLoadingCrews } = useQuery<MaintenanceCrew[]>({
    queryKey: ["/api/maintenance-crews"],
  });

  const [formData, setFormData] = useState({
    estimatedDurationMinutes: 60,
    crewSize: 2,
    preferredDay: "" as string,
    preferredCrewId: "" as string,
    notes: "",
    isActive: true,
  });

  const resetForm = () => {
    if (config) {
      setFormData({
        estimatedDurationMinutes: config.estimatedDurationMinutes,
        crewSize: config.crewSize,
        preferredDay: config.preferredDay || "",
        preferredCrewId: config.preferredCrewId || "",
        notes: config.notes || "",
        isActive: config.isActive ?? true,
      });
    } else {
      setFormData({
        estimatedDurationMinutes: 60,
        crewSize: 2,
        preferredDay: "",
        preferredCrewId: "",
        notes: "",
        isActive: true,
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("PUT", `/api/customers/${customerId}/maintenance-config`, {
        ...data,
        preferredDay: data.preferredDay || undefined,
        preferredCrewId: data.preferredCrewId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "maintenance-config"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Scheduling configuration saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
  };

  const handleSave = () => {
    if (formData.estimatedDurationMinutes < 1) {
      toast({
        title: "Validation Error",
        description: "Duration must be at least 1 minute",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(formData);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
  };

  if (isLoadingConfig || isLoadingCrews) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mowing Schedule Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const preferredCrew = crews.find(c => c.id === config?.preferredCrewId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">Mowing Schedule Configuration</CardTitle>
          <CardDescription>
            Configure this property's mowing visit settings for the weekly scheduler
          </CardDescription>
        </div>
        {canEdit && !isEditing && (
          <Button variant="outline" size="sm" onClick={handleEdit} data-testid="button-edit-schedule-config">
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {!config && !isEditing ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="mb-4">No scheduling configuration set for this property</p>
            {canEdit && (
              <Button onClick={handleEdit} data-testid="button-add-schedule-config">
                Configure Scheduling
              </Button>
            )}
          </div>
        ) : isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Estimated Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  max="480"
                  value={formData.estimatedDurationMinutes}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    estimatedDurationMinutes: parseInt(e.target.value) || 60 
                  }))}
                  data-testid="input-duration"
                />
                <p className="text-xs text-muted-foreground">
                  {formatDuration(formData.estimatedDurationMinutes)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crewSize">Crew Size</Label>
                <Select
                  value={formData.crewSize.toString()}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    crewSize: parseInt(value) 
                  }))}
                >
                  <SelectTrigger id="crewSize" data-testid="select-crew-size">
                    <SelectValue placeholder="Select crew size" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? "person" : "people"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferredDay">Preferred Day</Label>
                <Select
                  value={formData.preferredDay}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    preferredDay: value === "none" ? "" : value 
                  }))}
                >
                  <SelectTrigger id="preferredDay" data-testid="select-preferred-day">
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {DAYS_OF_WEEK.map(day => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferredCrew">Preferred Crew</Label>
                <Select
                  value={formData.preferredCrewId}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    preferredCrewId: value === "none" ? "" : value 
                  }))}
                >
                  <SelectTrigger id="preferredCrew" data-testid="select-preferred-crew">
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {crews.filter(c => c.isActive).map(crew => (
                      <SelectItem key={crew.id} value={crew.id}>
                        {crew.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Special instructions, gate codes, access notes..."
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="resize-none"
                rows={3}
                data-testid="input-schedule-notes"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-schedule">
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saveMutation.isPending}
                data-testid="button-save-schedule"
              >
                <Save className="w-4 h-4 mr-1" />
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium" data-testid="text-schedule-duration">
                    {formatDuration(config!.estimatedDurationMinutes)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Crew Size</p>
                  <p className="font-medium" data-testid="text-schedule-crew-size">
                    {config!.crewSize} {config!.crewSize === 1 ? "person" : "people"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Preferred Day</p>
                  <p className="font-medium" data-testid="text-schedule-preferred-day">
                    {config!.preferredDay 
                      ? DAYS_OF_WEEK.find(d => d.value === config!.preferredDay)?.label 
                      : "No preference"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Preferred Crew</p>
                  <p className="font-medium" data-testid="text-schedule-preferred-crew">
                    {preferredCrew?.name || "No preference"}
                  </p>
                </div>
              </div>
            </div>

            {config!.notes && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p className="text-sm" data-testid="text-schedule-notes">{config!.notes}</p>
              </div>
            )}

            <div className="pt-2">
              <Badge variant={config!.isActive ? "default" : "secondary"}>
                {config!.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
