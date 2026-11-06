import { Link } from "wouter";
import { Clock, Users, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { canUseRoutes, useCustomerRouteSummary } from "@/hooks/use-routes";
import { fmtMinutes, routeServiceLabel, serviceColorVar, weekdayName } from "@/lib/routes";

export default function CustomerSchedulingSection({ customerId, readOnly = false }: { customerId: string; readOnly?: boolean }) {
  const { user } = useAuth();
  const summary = useCustomerRouteSummary(customerId);
  return <Card data-testid="card-customer-routes">
    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Routes</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {summary.isPending ? <p>Loading routes…</p> : summary.isError ? <p role="alert">Routes could not be loaded. Try refreshing this page.</p> :
        !summary.data?.stops.length ? <p data-testid="text-customer-routes-empty">Not on a route yet</p> :
        <ul className="divide-y rounded-md border">{summary.data.stops.map(s =>
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-2 text-sm" style={{ borderLeftColor: serviceColorVar(s.serviceKey) }} data-testid={`row-customer-route-${s.id}`}>
            <span className="font-medium">{routeServiceLabel(s.serviceKey)}</span>
            <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" />{s.crew?.name ?? "No crew"}</span>
            <span>{weekdayName(s.weekday)}</span>
            <Badge variant="outline">{s.everyWeeks === 2 ? "Every 2 weeks" : "Every week"}</Badge>
            <span className="ml-auto flex items-center gap-1 tabular-nums text-muted-foreground"><Clock className="h-3.5 w-3.5" />{fmtMinutes(s.minutes)}</span>
          </li>)}</ul>}
      {!readOnly && canUseRoutes(user?.activeRole) && <Link href="/dashboard/routes" className="text-sm underline">Manage Routes</Link>}
    </CardContent>
  </Card>;
}
