import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Cloud,
  Thermometer,
  Wind,
  Droplets,
  Navigation,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface WeatherData {
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  humidity: number | null;
  conditions: string;
  recordedAt: string;
}

export interface WeatherCapturableItem {
  id: string;
  customerId?: string;
  weatherTemp?: number | null;
  weatherWindSpeed?: number | null;
  weatherWindDirection?: string | null;
  weatherHumidity?: number | null;
  weatherConditions?: string | null;
  weatherRecordedAt?: Date | string | null;
}

interface WeatherCapturePanelProps {
  item: WeatherCapturableItem;
  campaignId: string;
  customerId?: string;
  customerLat?: number | null;
  customerLng?: number | null;
}

function windDirectionLabel(deg: number | null): string {
  if (deg == null) return "N/A";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function WeatherPreviewCard({ weather }: { weather: WeatherData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
        <Thermometer className="w-4 h-4 text-orange-500 shrink-0" />
        <div>
          <div className="text-xs text-muted-foreground">Temp</div>
          <div className="text-sm font-medium" data-testid="text-weather-temp">
            {weather.temperature != null ? `${Math.round(weather.temperature)}°F` : "N/A"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
        <Wind className="w-4 h-4 text-blue-500 shrink-0" />
        <div>
          <div className="text-xs text-muted-foreground">Wind</div>
          <div className="text-sm font-medium" data-testid="text-weather-wind">
            {weather.windSpeed != null ? `${Math.round(weather.windSpeed)} mph` : "N/A"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
        <Navigation className="w-4 h-4 text-teal-500 shrink-0" />
        <div>
          <div className="text-xs text-muted-foreground">Direction</div>
          <div className="text-sm font-medium" data-testid="text-weather-direction">
            {windDirectionLabel(weather.windDirection)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
        <Droplets className="w-4 h-4 text-cyan-500 shrink-0" />
        <div>
          <div className="text-xs text-muted-foreground">Humidity</div>
          <div className="text-sm font-medium" data-testid="text-weather-humidity">
            {weather.humidity != null ? `${Math.round(weather.humidity)}%` : "N/A"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WeatherCapturePanel({ item, campaignId, customerId, customerLat, customerLng }: WeatherCapturePanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"now" | "custom">("now");
  const [customDatetime, setCustomDatetime] = useState("");
  const [preview, setPreview] = useState<WeatherData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [editing, setEditing] = useState(false);

  const hasSavedWeather = item.weatherTemp != null || item.weatherConditions != null;

  const fetchWeather = async () => {
    setFetching(true);
    setPreview(null);
    try {
      const params = new URLSearchParams();
      if (customerId) params.set("customerId", customerId);
      if (customerLat != null && customerLng != null) {
        params.set("lat", String(customerLat));
        params.set("lng", String(customerLng));
      }
      if (mode === "custom" && customDatetime) {
        params.set("datetime", new Date(customDatetime).toISOString());
      }
      const res = await fetch(`/api/weather?${params}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: err.error || "Failed to fetch weather", variant: "destructive" });
        setFetching(false);
        return;
      }
      const data = await res.json();
      setPreview(data);
    } catch {
      toast({ title: "Weather fetch failed", variant: "destructive" });
    }
    setFetching(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (weather: WeatherData) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${item.id}/weather`, weather);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Weather saved" });
      setPreview(null);
      setEditing(false);
    },
    onError: () => {
      toast({ title: "Failed to save weather", variant: "destructive" });
    },
  });

  if (hasSavedWeather && !editing) {
    return (
      <Card data-testid="card-weather-saved">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            Weather at Application
            <Badge variant="outline" className="ml-auto">
              <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" />
              Recorded
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <WeatherPreviewCard
            weather={{
              temperature: item.weatherTemp ?? null,
              windSpeed: item.weatherWindSpeed ?? null,
              windDirection: item.weatherWindDirection != null ? Number(item.weatherWindDirection) : null,
              humidity: item.weatherHumidity ?? null,
              conditions: item.weatherConditions || "Unknown",
              recordedAt: item.weatherRecordedAt?.toString() || "",
            }}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Cloud className="w-3 h-3" />
            <span>{item.weatherConditions}</span>
            {item.weatherRecordedAt && (
              <>
                <Clock className="w-3 h-3 ml-2" />
                <span>{new Date(item.weatherRecordedAt).toLocaleString()}</span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              saveMutation.reset();
              setPreview(null);
              setEditing(true);
            }}
            data-testid="button-recapture-weather"
          >
            Re-capture Weather
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-weather-capture">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          Weather at Application
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={mode === "now" ? "default" : "outline"}
            size="sm"
            onClick={() => { setMode("now"); setPreview(null); }}
            data-testid="button-weather-now"
          >
            Capture Now
          </Button>
          <Button
            variant={mode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => { setMode("custom"); setPreview(null); }}
            data-testid="button-weather-custom"
          >
            <Clock className="w-3 h-3 mr-1" />
            Past Date & Time
          </Button>
        </div>

        {mode === "custom" && (
          <div className="space-y-1">
            <Label className="text-xs">Date & Time of Application</Label>
            <Input
              type="datetime-local"
              value={customDatetime}
              onChange={(e) => setCustomDatetime(e.target.value)}
              data-testid="input-weather-datetime"
            />
          </div>
        )}

        <Button
          onClick={fetchWeather}
          disabled={fetching || (mode === "custom" && !customDatetime)}
          data-testid="button-fetch-weather"
        >
          {fetching && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          <Cloud className="w-4 h-4 mr-1" />
          Fetch Weather
        </Button>

        {preview && (
          <div className="space-y-3">
            <WeatherPreviewCard weather={preview} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Cloud className="w-3 h-3" />
              <span>{preview.conditions}</span>
              <Clock className="w-3 h-3 ml-2" />
              <span>{new Date(preview.recordedAt).toLocaleString()}</span>
            </div>
            <Button
              onClick={() => saveMutation.mutate(preview)}
              disabled={saveMutation.isPending}
              data-testid="button-save-weather"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Confirm & Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
