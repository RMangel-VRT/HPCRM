import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Home } from "lucide-react";
import { Link } from "wouter";
import AccountSidePanel from "./AccountSidePanel";
import type { UserWithCompanyContext } from "@/hooks/use-auth";

interface FieldAppLayoutProps {
  user: UserWithCompanyContext;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function FieldAppLayout({ user, onLogout, children }: FieldAppLayoutProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [location] = useLocation();

  const isOnDashboard = location === "/dashboard";

  const initials = user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <header className="flex items-center justify-between px-3 py-2 border-b bg-background z-50 sticky top-0">
        <div />
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAccountOpen(true)}
            data-testid="button-account-panel"
            aria-label="Account"
          >
            <Avatar className="w-7 h-7">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative">
        <div className="p-4 max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      {!isOnDashboard && (
        <Link href="/dashboard">
          <Button
            size="icon"
            className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-full shadow-lg"
            data-testid="button-home-fab"
            aria-label="Home"
          >
            <Home className="w-5 h-5" />
          </Button>
        </Link>
      )}

      <AccountSidePanel
        open={accountOpen}
        onOpenChange={setAccountOpen}
        user={user}
        onLogout={onLogout}
      />
    </div>
  );
}
