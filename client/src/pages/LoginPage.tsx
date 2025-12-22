import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/TRUCK_DECAL-06_1766432157419.png";

export default function LoginPage() {
  const { user, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [resetCode, setResetCode] = useState("");

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/public/reset-for-setup", { confirmCode: resetCode });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Reset Complete",
        description: "All data deleted. Refreshing page...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/setup/status"] });
      setTimeout(() => {
        window.location.href = "/setup";
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: () => {
          setLocation("/dashboard");
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logoImage} alt="High Plains Logo" className="w-16 h-16 rounded-full" />
          </div>
          <div>
            <CardTitle className="text-2xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to your High Plains account</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-xs text-muted-foreground text-center pt-2">
              <p className="font-medium mb-1">Demo Accounts:</p>
              <p>admin@greenscape.com / admin123 (Admin)</p>
              <p>office@greenscape.com / office123 (Office)</p>
              <p>fieldmanager@greenscape.com / fieldmanager123 (Field Manager)</p>
              <p>field@greenscape.com / field123 (Field)</p>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReset(!showReset)}
              className="w-full text-muted-foreground"
              data-testid="button-show-reset"
            >
              {showReset ? "Hide Reset Option" : "First-Time Setup / Reset Database"}
            </Button>

            {showReset && (
              <div className="mt-4 p-4 border border-destructive rounded-md bg-destructive/5">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium text-sm">Reset Database</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  This will DELETE ALL DATA and redirect to the first-time setup page.
                  Type <span className="font-mono font-bold">RESET-NOW</span> to confirm:
                </p>
                <Input
                  placeholder="Type RESET-NOW"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="mb-2"
                  data-testid="input-reset-code"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => resetMutation.mutate()}
                  disabled={resetCode !== "RESET-NOW" || resetMutation.isPending}
                  data-testid="button-reset-database"
                >
                  {resetMutation.isPending ? "Resetting..." : "Delete All Data & Reset"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
