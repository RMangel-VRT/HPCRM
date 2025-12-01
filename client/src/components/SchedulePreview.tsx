import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function SchedulePreview() {
  return (
    <Card data-testid="card-schedule-preview">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Calendar className="w-4 h-4" />
          Today's Schedule
        </CardTitle>
        <Link href="/dashboard/schedule">
          <Button variant="ghost" size="sm" data-testid="button-view-schedule">
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Calendar className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">Schedule Coming Soon</p>
          <p className="text-xs">Service visits will appear here</p>
        </div>
      </CardContent>
    </Card>
  );
}
