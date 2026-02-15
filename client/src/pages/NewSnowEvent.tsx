import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Snowflake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SNOW_RANGES } from "@shared/schema";
import type { SnowEvent } from "@shared/schema";

export default function NewSnowEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const now = new Date();
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [eventName, setEventName] = useState("");
  const [startDateTime, setStartDateTime] = useState(localDatetime);
  const [endDateTime, setEndDateTime] = useState("");
  const [snowRange, setSnowRange] = useState("");
  const [reportedTotalInches, setReportedTotalInches] = useState("");
  const [measurementNotes, setMeasurementNotes] = useState("");
  const [eventNotes, setEventNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/snow-events", data);
      return res.json() as Promise<SnowEvent>;
    },
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ["/api/snow-events"] });
      toast({ title: "Storm event created" });
      navigate(`/dashboard/snow/${event.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snowRange || !startDateTime) {
      toast({ title: "Missing fields", description: "Start date and accumulation range are required.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      eventName: eventName || undefined,
      eventStartDateTime: new Date(startDateTime).toISOString(),
      eventEndDateTime: endDateTime ? new Date(endDateTime).toISOString() : undefined,
      snowRange,
      reportedTotalInches: reportedTotalInches || undefined,
      measurementNotes: measurementNotes || undefined,
      eventNotes: eventNotes || undefined,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="new-snow-event-page">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/snow">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Snowflake className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">New Storm Event</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Storm Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="eventName">Event Name</Label>
              <Input
                id="eventName"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Auto-generated if left blank"
                data-testid="input-event-name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to auto-generate (e.g. "Snow Event - 2026-02-15")
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDateTime">Start Date/Time *</Label>
                <Input
                  id="startDateTime"
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  required
                  data-testid="input-start-datetime"
                />
              </div>
              <div>
                <Label htmlFor="endDateTime">End Date/Time</Label>
                <Input
                  id="endDateTime"
                  type="datetime-local"
                  value={endDateTime}
                  onChange={(e) => setEndDateTime(e.target.value)}
                  data-testid="input-end-datetime"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="snowRange">Accumulation Range *</Label>
              <Select value={snowRange} onValueChange={setSnowRange} required>
                <SelectTrigger data-testid="select-snow-range">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {SNOW_RANGES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reportedTotalInches">Reported Total Inches</Label>
              <Input
                id="reportedTotalInches"
                value={reportedTotalInches}
                onChange={(e) => setReportedTotalInches(e.target.value)}
                placeholder="e.g. 3.5"
                data-testid="input-total-inches"
              />
            </div>

            <div>
              <Label htmlFor="measurementNotes">Measurement Notes</Label>
              <Textarea
                id="measurementNotes"
                value={measurementNotes}
                onChange={(e) => setMeasurementNotes(e.target.value)}
                placeholder="Where measurement was sourced, conditions, drifting..."
                data-testid="input-measurement-notes"
              />
            </div>

            <div>
              <Label htmlFor="eventNotes">Event Notes</Label>
              <Textarea
                id="eventNotes"
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                placeholder="Wind/drift notes, temps, ice, timing..."
                data-testid="input-event-notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link href="/dashboard/snow">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-event">
                {createMutation.isPending ? "Creating..." : "Create & Continue"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
