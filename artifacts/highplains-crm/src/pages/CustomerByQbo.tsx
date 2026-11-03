import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { errorStatus, errorText, qboJson, reviewHref, viewerScope } from "@/lib/qboReview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Stable IrrigoPro link: /dashboard/customers/by-qb/:qboId -> /dashboard/customers/:id (replace). */
export default function CustomerByQbo() {
  const { qboId = "" } = useParams<{ qboId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const q = useQuery<{ id: string }>({
    queryKey: ["/api/customers/by-qbo", qboId, ...viewerScope(user)],
    queryFn: () => qboJson("GET", `/api/customers/by-qbo/${encodeURIComponent(qboId)}`, user?.activeCompanyId),
    enabled: !!user && !!qboId,
    staleTime: 0,
  });
  useEffect(() => {
    if (q.data?.id) setLocation(`/dashboard/customers/${encodeURIComponent(q.data.id)}`, { replace: true });
  }, [q.data?.id, setLocation]);
  const status = q.isError ? errorStatus(q.error) : undefined;
  if (!q.isError) return <div className="max-w-md mx-auto py-16 space-y-3" data-testid="loading-by-qbo">
    <Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /></div>;
  return <Card className="max-w-lg mx-auto mt-12"><CardContent className="py-10 text-center space-y-3">
    <SearchX className="w-8 h-8 mx-auto text-muted-foreground" />
    {status === 404 ? <>
      <p className="font-medium" data-testid="text-by-qbo-missing">No CRM customer is linked to QuickBooks customer {qboId}</p>
      {/* Shown to every customer viewer; the review route still enforces billing access. */}
      <Link href={reviewHref()} className="text-sm underline" data-testid="link-by-qbo-review">Open the QuickBooks customer review</Link>
    </> : status === 403 ? <p data-testid="text-by-qbo-forbidden">You don't have access to customers.</p> : <>
      <p role="alert" className="text-destructive" data-testid="error-by-qbo">{errorText(q.error, "Couldn't look up that QuickBooks customer.")}</p>
      <Button size="sm" variant="outline" onClick={() => q.refetch()} data-testid="button-retry-by-qbo">Try again</Button>
    </>}
  </CardContent></Card>;
}
