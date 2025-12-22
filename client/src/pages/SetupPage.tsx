import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/TRUCK_DECAL-06_1766432157419.png";

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [companyName, setCompanyName] = useState("High Plains Property Maintenance");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const setupMutation = useMutation({
    mutationFn: async (data: { companyName: string; adminName: string; adminEmail: string; adminPassword: string }) => {
      const response = await apiRequest("POST", "/api/setup/initialize", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Setup Complete",
        description: "Your account has been created. Welcome to High Plains!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/setup/status"] });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Something went wrong during setup.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (adminPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please ensure both password fields are identical.",
        variant: "destructive",
      });
      return;
    }

    if (adminPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setupMutation.mutate({
      companyName,
      adminName,
      adminEmail,
      adminPassword,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logoImage} alt="High Plains Logo" className="w-16 h-16 rounded-full" />
          </div>
          <div>
            <CardTitle className="text-2xl">Welcome to High Plains</CardTitle>
            <CardDescription>Set up your company and create your first admin account</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Your Company Name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={setupMutation.isPending}
                required
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminName">Your Name</Label>
              <Input
                id="adminName"
                type="text"
                placeholder="John Smith"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                disabled={setupMutation.isPending}
                required
                data-testid="input-admin-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email</Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="you@company.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                disabled={setupMutation.isPending}
                required
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                type="password"
                placeholder="At least 6 characters"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={setupMutation.isPending}
                required
                data-testid="input-admin-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={setupMutation.isPending}
                required
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={setupMutation.isPending}
              data-testid="button-setup"
            >
              {setupMutation.isPending ? "Setting up..." : "Create Account & Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
