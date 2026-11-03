import { CalendarDays } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoutePreview } from "@/hooks/use-routes";
import { routeServiceLabel, serviceColorVar, weekdayName } from "@/lib/routes";
import { PlannerReplacedBanner } from "./PlannerReplacedBanner";

export default function RouteSchedulePreview() {
  const preview = useRoutePreview();
  return (
    <Card data-testid="card-route-preview">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5" />Routes — weekly pattern</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <PlannerReplacedBanner />
        {preview.isPending ? <p className="text-sm text-muted-foreground">Loading routes…</p> :
          preview.isError ? <p role="alert" className="text-sm text-destructive">Routes could not be loaded. Try refreshing this page.</p> :
          !preview.data?.stops.length ? <p className="text-sm text-muted-foreground">No properties are on a route yet.</p> :
          <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
            {preview.data.stops.map(stop => <li key={stop.id} className="border-l-4 p-3 text-sm" style={{ borderLeftColor: serviceColorVar(stop.serviceKey) }}>
              <Link href={`/dashboard/customers/${stop.customerId}`} className="font-medium hover:underline">{stop.name}</Link>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{routeServiceLabel(stop.serviceKey)}</span><span>{stop.crew?.name}</span>
                <span>{weekdayName(stop.weekday)}</span><span>{stop.everyWeeks === 2 ? "Every 2 weeks" : "Every week"}</span>
              </div>
            </li>)}
          </ul>}
      </CardContent>
    </Card>
  );
}
