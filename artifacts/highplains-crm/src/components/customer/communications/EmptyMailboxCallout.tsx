import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function EmptyMailboxCallout() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Mail className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">You don't have a mailbox connected yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Connect your Gmail to send and receive emails directly from this app.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/settings/my-mailbox">Connect now</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
