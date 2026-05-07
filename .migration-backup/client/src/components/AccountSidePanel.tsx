import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LogOut, HelpCircle, Mail, Phone, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ThemeToggle from "./ThemeToggle";
import RoleBadge from "./RoleBadge";
import type { UserWithCompanyContext } from "@/hooks/use-auth";

interface AccountSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithCompanyContext;
  onLogout: () => void;
}

export default function AccountSidePanel({
  open,
  onOpenChange,
  user,
  onLogout,
}: AccountSidePanelProps) {
  const { t, i18n } = useTranslation();

  const toggleLanguage = async () => {
    const newLang = i18n.language === "es" ? "en" : "es";
    try {
      await apiRequest("PATCH", "/api/auth/language", { language: newLang });
      i18n.changeLanguage(newLang);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (e) {
      console.error("Failed to update language", e);
    }
  };

  const initials = user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader className="pb-4">
          <SheetTitle>{t("fieldLayout.account")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base truncate" data-testid="text-account-name">
                {user.name}
              </p>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              <div className="mt-1">
                <RoleBadge role={user.activeRole} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              {t("fieldLayout.preferences")}
            </p>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <span className="text-sm">{t("fieldLayout.theme")}</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <span className="text-sm">{t("fieldLayout.language")}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleLanguage}
                data-testid="button-language-toggle-account"
                className="gap-1 px-2 text-xs font-medium"
              >
                <span className={i18n.language === "en" ? "font-bold" : "text-muted-foreground"}>
                  EN
                </span>
                <span className="text-muted-foreground">/</span>
                <span className={i18n.language === "es" ? "font-bold" : "text-muted-foreground"}>
                  ES
                </span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              {t("fieldLayout.support")}
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3"
                  data-testid="button-help-account"
                >
                  <HelpCircle className="w-4 h-4" />
                  {t("sidebar.helpSupport")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("sidebar.helpSupport")}</DialogTitle>
                  <DialogDescription>
                    {t("sidebar.helpDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">{t("sidebar.contactSupport")}</h4>
                    <div className="space-y-2">
                      <a
                        href="mailto:support@highplainsprop.com"
                        className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate"
                        data-testid="link-support-email"
                      >
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{t("sidebar.emailSupport")}</p>
                          <p className="text-xs text-muted-foreground">support@highplainsprop.com</p>
                        </div>
                      </a>
                      <a
                        href="tel:+18005551234"
                        className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover-elevate"
                        data-testid="link-support-phone"
                      >
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{t("sidebar.phoneSupport")}</p>
                          <p className="text-xs text-muted-foreground">1-800-555-1234</p>
                        </div>
                      </a>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">{t("sidebar.quickTips")}</h4>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>{t("sidebar.tipTickets")}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>{t("sidebar.tipNotifications")}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="pt-2 border-t">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 text-destructive hover:text-destructive"
              onClick={() => {
                onOpenChange(false);
                onLogout();
              }}
              data-testid="button-logout-account"
            >
              <LogOut className="w-4 h-4" />
              {t("nav.logOut")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
