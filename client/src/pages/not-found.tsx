import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileQuestion } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FileQuestion className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl">Page Not Found</CardTitle>
            <CardDescription>
              The page you're looking for doesn't exist
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-6">
            It might have been moved or deleted, or you may have mistyped the URL.
          </p>
          <Button asChild data-testid="button-back-home">
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
