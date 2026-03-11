import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      toast({ title: t("snow.stormCreated") });
      navigate(`/dashboard/snow/${event.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snowRange || !startDateTime) {
      toast({ title: t("snow.missingFields"), description: t("snow.missingFieldsMsg"), variant: "destructive" });
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
        <h1 className="text-2xl font-bold tracking-tight">{t("snow.newStormEvent")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("snow.stormDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="eventName">{t("snow.eventName")}</Label>
              <Input
                id="eventName"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder={t("snow.autoGenerateName")}
                data-testid="input-event-name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("snow.autoGenerateName")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDateTime">{t("snow.startDateTime")}</Label>
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
                <Label htmlFor="endDateTime">{t("snow.endDateTime")}</Label>
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
              <Label htmlFor="snowRange">{t("snow.accumulationRange")}</Label>
              <Select value={snowRange} onValueChange={setSnowRange} required>
                <SelectTrigger data-testid="select-snow-range">
                  <SelectValue placeholder={t("snow.selectRange")} />
                </SelectTrigger>
                <SelectContent>
                  {SNOW_RANGES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reportedTotalInches">{t("snow.reportedTotalInches")}</Label>
              <Input
                id="reportedTotalInches"
                value={reportedTotalInches}
                onChange={(e) => setReportedTotalInches(e.target.value)}
                placeholder="e.g. 3.5"
                data-testid="input-total-inches"
              />
            </div>

            <div>
              <Label htmlFor="measurementNotes">{t("snow.measurementNotes").replace(":", "")}</Label>
              <Textarea
                id="measurementNotes"
                value={measurementNotes}
                onChange={(e) => setMeasurementNotes(e.target.value)}
                data-testid="input-measurement-notes"
              />
            </div>

            <div>
              <Label htmlFor="eventNotes">{t("snow.eventNotes").replace(":", "")}</Label>
              <Textarea
                id="eventNotes"
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                data-testid="input-event-notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link href="/dashboard/snow">
                <Button type="button" variant="outline">{t("snow.cancelBtn")}</Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-event">
                {createMutation.isPending ? "Creating..." : t("snow.createContinue")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
